import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { ConnectionState } from "@whiskeysockets/baileys";
import express from "express";
import { createBillingWhatsAppRouter } from "../src/routes/billing-whatsapp.js";
import { loadAuthState } from "../src/services/whatsapp/auth-state.js";
import { documentCaption, documentFileName, normalizeCustomerPhone } from "../src/services/whatsapp/phone.js";
import { createMemoryAuthRepository, createMemoryConnectionStore } from "../src/services/whatsapp/repository.js";
import { WhatsAppSession, type WhatsAppOutgoingDocument, type WhatsAppSnapshot, type WhatsAppSocket } from "../src/services/whatsapp/session.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

test("customer numbers accept local, international, and 00 prefixes", () => {
  assert.equal(normalizeCustomerPhone("0300 1234567"), "923001234567");
  assert.equal(normalizeCustomerPhone("+92 300 1234567"), "923001234567");
  assert.equal(normalizeCustomerPhone("00923001234567"), "923001234567");
  assert.throws(() => normalizeCustomerPhone("123"), /valid customer WhatsApp number/);
});

test("document captions and file names stay readable", () => {
  assert.equal(documentCaption("invoice", "Balance is due Friday."), "Invoice\nBalance is due Friday.");
  assert.equal(documentCaption("invoice", "Invoice already titled"), "Invoice already titled");
  assert.equal(documentCaption("slip", "The paid slip is attached."), "Paid slip\nThe paid slip is attached.");
  assert.equal(documentFileName("agreement", "Site Agreement!.pdf", "application/pdf"), "Site Agreement.pdf");
});

type FakeSocket = {
  emit(update: Partial<ConnectionState>): void;
  emitCreds(): void;
  logout: () => Promise<void>;
  end: () => Promise<void>;
  onWhatsApp: (jid: string) => Promise<Array<{ jid: string; exists: boolean }>>;
  sendMessage: (jid: string, content: { caption?: string; fileName?: string }) => Promise<{ key: { id: string } }>;
  sent: Array<{ jid: string; caption?: string; fileName?: string }>;
  loggedOut: boolean;
};

function createFakeSocket(exists = true): FakeSocket {
  const credsListeners: Array<() => void> = [];
  const connectionListeners: Array<(update: Partial<ConnectionState>) => void> = [];
  const sent: FakeSocket["sent"] = [];
  const socket: FakeSocket = {
    sent,
    loggedOut: false,
    emit(update) {
      for (const listener of connectionListeners) listener(update);
    },
    emitCreds() {
      for (const listener of credsListeners) listener();
    },
    async logout() {
      socket.loggedOut = true;
    },
    async end() {
      socket.loggedOut = true;
    },
    async onWhatsApp(jid) {
      return exists ? [{ jid, exists: true }] : [{ jid, exists: false }];
    },
    async sendMessage(jid, content) {
      socket.sent.push({ jid, ...(content.caption ? { caption: content.caption } : {}), ...(content.fileName ? { fileName: content.fileName } : {}) });
      return { key: { id: "MSG1" } };
    },
  };
  Object.assign(socket, {
    ev: {
      on(event: "creds.update" | "connection.update", listener: (() => void) | ((update: Partial<ConnectionState>) => void)) {
        if (event === "creds.update") credsListeners.push(listener as () => void);
        else connectionListeners.push(listener as (update: Partial<ConnectionState>) => void);
      },
    },
  });
  return socket;
}

test("a scanned session is saved and can send without another QR", async () => {
  const repository = createMemoryAuthRepository();
  const connections = createMemoryConnectionStore();
  const sent: FakeSocket["sent"] = [];
  const session = new WhatsAppSession({
    repository,
    connections,
    renderQr: async () => "data:image/png;base64,qr",
    createSocket: async (auth) => {
      const created = createFakeSocket();
      created.sent = sent;
      setTimeout(() => {
        auth.creds.registered = true;
        auth.creds.me = { id: "923001234567:1@s.whatsapp.net", name: "Electro Tech" };
        created.emitCreds();
        created.emit({ qr: "fresh-qr" });
        created.emit({ connection: "open" });
      }, 0);
      return created as unknown as WhatsAppSocket;
    },
  });

  const started = await session.connect();
  assert.equal(started.status, "connecting");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await session.idle();
  const linked = session.snapshot();
  assert.equal(linked.status, "connected");
  assert.equal(linked.phone, "923001234567");
  assert.equal(linked.pushName, "Electro Tech");
  assert.equal(linked.savedSession, true);
  assert.equal(linked.qrDataUrl, null);
  assert.ok(await repository.read("creds"));

  const sentMessage = await session.send({
    phone: "03007654321",
    kind: "quotation",
    message: "The solar quotation is attached.",
    fileName: "Quotation 14.pdf",
    mimeType: "application/pdf",
    file: Buffer.from("%PDF-1.4"),
  });
  assert.equal(sentMessage.id, "MSG1");
  assert.equal(sent[0]?.jid, "923007654321@s.whatsapp.net");
  assert.match(sent[0]?.caption || "", /^Quotation/);
  assert.equal(connections.record.status, "connected");
  assert.equal(connections.record.phone, "923001234567");
});

test("disconnect clears the saved session so another number can scan", async () => {
  const repository = createMemoryAuthRepository();
  const session = new WhatsAppSession({
    repository,
    connections: createMemoryConnectionStore(),
    renderQr: async () => "data:image/png;base64,qr",
    createSocket: async (auth) => {
      const socket = createFakeSocket();
      setTimeout(() => {
        auth.creds.registered = true;
        auth.creds.me = { id: "923001234567@s.whatsapp.net" };
        socket.emitCreds();
        socket.emit({ connection: "open" });
      }, 0);
      return socket as unknown as WhatsAppSocket;
    },
  });

  await session.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await session.idle();
  const disconnected = await session.disconnect();
  assert.equal(disconnected.status, "disconnected");
  assert.equal(disconnected.savedSession, false);
  assert.equal(disconnected.phone, null);
  assert.equal(await repository.read("creds"), null);
});

test("a logged-out socket removes the saved session", async () => {
  const repository = createMemoryAuthRepository();
  let socket: FakeSocket | null = null;
  const session = new WhatsAppSession({
    repository,
    connections: createMemoryConnectionStore(),
    createSocket: async (auth) => {
      socket = createFakeSocket();
      setTimeout(() => {
        auth.creds.registered = true;
        socket?.emitCreds();
        socket?.emit({ connection: "open" });
        socket?.emit({
          connection: "close",
          lastDisconnect: {
            error: Object.assign(new Error("logged out"), { output: { statusCode: 401 } }),
            date: new Date(),
          },
        });
      }, 0);
      return socket as unknown as WhatsAppSocket;
    },
  });

  await session.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await session.idle();
  const snapshot = session.snapshot();
  assert.equal(snapshot.status, "disconnected");
  assert.equal(snapshot.savedSession, false);
  assert.match(snapshot.error || "", /Scan the QR code/);
  assert.equal(await repository.read("creds"), null);
});

test("sending before connect is rejected", async () => {
  const session = new WhatsAppSession({
    repository: createMemoryAuthRepository(),
    connections: createMemoryConnectionStore(),
  });
  await assert.rejects(
    () => session.send({
      phone: "923001234567",
      kind: "agreement",
      message: "Signed agreement",
      fileName: "agreement.pdf",
      mimeType: "application/pdf",
      file: Buffer.from("pdf"),
    }),
    /Connect the official WhatsApp/,
  );
});

test("auth state round-trips credential buffers", async () => {
  const repository = createMemoryAuthRepository();
  const first = await loadAuthState(repository);
  first.state.creds.registered = true;
  await first.saveCreds();
  const second = await loadAuthState(repository);
  assert.equal(second.state.creds.registered, true);
  assert.equal(Buffer.isBuffer(second.state.creds.noiseKey.public) || second.state.creds.noiseKey.public instanceof Uint8Array, true);
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      servers.add(server);
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function appWith(
  snapshot: WhatsAppSnapshot,
  send: (input: WhatsAppOutgoingDocument) => Promise<{ id: string }> = async () => ({ id: "MSG1" }),
) {
  const app = express();
  app.use("/api/billing/whatsapp", createBillingWhatsAppRouter({
    authMiddleware: (request, response, next) => {
      if (!request.headers.authorization) {
        response.status(401).json({ error: "Unauthorized", message: "Missing authorization header." });
        return;
      }
      request.billingUser = { userId: "staff-1", email: "billing@electrotech.test" };
      next();
    },
    sendRateLimitMax: 20,
    session: {
      snapshot: () => snapshot,
      connect: async () => ({ ...snapshot, status: "qr", qrDataUrl: "data:image/png;base64,qr" }),
      disconnect: async () => ({ ...snapshot, status: "disconnected", phone: null, pushName: null, qrDataUrl: null, savedSession: false, error: null }),
      send,
      sendText: async () => ({ id: "MSG1" }),
    },
  }));
  return app;
}

const linked: WhatsAppSnapshot = {
  status: "connected",
  phone: "923001234567",
  pushName: "Electro Tech",
  qrDataUrl: null,
  savedSession: true,
  error: null,
};

test("WhatsApp routes require a billing session and hide credentials", async () => {
  const baseUrl = await listen(appWith(linked));
  const missing = await fetch(`${baseUrl}/api/billing/whatsapp`);
  assert.equal(missing.status, 401);

  const status = await fetch(`${baseUrl}/api/billing/whatsapp`, {
    headers: { Authorization: "Bearer staff" },
  });
  assert.equal(status.status, 200);
  const body = await status.json() as { phoneDisplay: string; qrDataUrl: null };
  assert.equal(body.phoneDisplay, "+92 300 1234567");
  assert.equal(body.qrDataUrl, null);
  assert.equal("creds" in body, false);
});

test("disconnect and document upload use the official session", async () => {
  let received = "";
  const baseUrl = await listen(appWith(linked, async (input) => {
    received = `${input.kind}:${input.phone}:${input.mimeType}`;
    return { id: "DOC1" };
  }));
  const disconnected = await fetch(`${baseUrl}/api/billing/whatsapp/disconnect`, {
    method: "POST",
    headers: { Authorization: "Bearer staff" },
  });
  assert.equal(disconnected.status, 200);
  const after = await disconnected.json() as { status: string; savedSession: boolean };
  assert.equal(after.status, "disconnected");
  assert.equal(after.savedSession, false);

  const form = new FormData();
  form.set("phone", "03001234567");
  form.set("kind", "agreement");
  form.set("message", "Please sign and return.");
  form.set("document", new File([Buffer.from("%PDF-1.4")], "agreement.pdf", { type: "application/pdf" }));
  const sent = await fetch(`${baseUrl}/api/billing/whatsapp/send`, {
    method: "POST",
    headers: { Authorization: "Bearer staff" },
    body: form,
  });
  assert.equal(sent.status, 200);
  assert.equal(received, "agreement:03001234567:application/pdf");
});
