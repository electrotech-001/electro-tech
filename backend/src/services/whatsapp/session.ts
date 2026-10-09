import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { SupabaseConfigError } from "../../config.js";
import { getSupabaseClient } from "../supabase.js";
import { loadAuthState, type LoadedAuthState } from "./auth-state.js";
import { WhatsAppServiceError } from "./errors.js";
import { customerJid, documentCaption, documentFileName, normalizeCustomerPhone, type WhatsAppDocumentKind } from "./phone.js";
import {
  createSupabaseAuthRepository,
  createSupabaseConnectionStore,
  type WhatsAppAuthRepository,
  type WhatsAppConnectionStore,
  type WhatsAppLinkStatus,
} from "./repository.js";

const MAX_RECONNECTS = 5;

export type WhatsAppSnapshot = {
  status: WhatsAppLinkStatus;
  phone: string | null;
  pushName: string | null;
  qrDataUrl: string | null;
  savedSession: boolean;
  error: string | null;
};

export type WhatsAppOutgoingDocument = {
  phone: string;
  kind: WhatsAppDocumentKind;
  message: string;
  fileName: string;
  mimeType: string;
  file: Buffer;
};

export type WhatsAppSocket = {
  ev: {
    on(event: "creds.update", listener: () => void): void;
    on(event: "connection.update", listener: (update: Partial<ConnectionState>) => void): void;
  };
  logout(msg?: string): Promise<void>;
  end(error: Error | undefined): Promise<void>;
  onWhatsApp(...phones: string[]): Promise<Array<{ jid: string; exists: boolean }> | undefined>;
  sendMessage(
    jid: string,
    content: { document: Buffer; mimetype: string; fileName?: string; caption?: string },
  ): Promise<{ key?: { id?: string | null } } | undefined>;
};

export type WhatsAppSessionDependencies = {
  repository: WhatsAppAuthRepository;
  connections: WhatsAppConnectionStore;
  createSocket?: (auth: LoadedAuthState["state"]) => Promise<WhatsAppSocket>;
  renderQr?: (value: string) => Promise<string>;
};

function disconnectCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("output" in error)) return undefined;
  const statusCode = (error as { output?: { statusCode?: number } }).output?.statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
}

function readIdentity(creds: AuthenticationCreds): { phone: string | null; pushName: string | null } {
  const source = creds.me?.phoneNumber || creds.me?.id || "";
  const digits = source.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  const pushName = creds.me?.name || creds.me?.notify || creds.me?.verifiedName || null;
  return {
    phone: /^\d{8,15}$/.test(digits) ? digits : null,
    pushName,
  };
}

async function renderWhatsAppQr(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#101410", light: "#ffffff" },
  });
}

async function createBaileysSocket(auth: LoadedAuthState["state"]): Promise<WhatsAppSocket> {
  const logger = pino({ level: "silent" });
  let version: [number, number, number] | undefined;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch {
    version = undefined;
  }
  return makeWASocket({
    auth: {
      creds: auth.creds,
      keys: makeCacheableSignalKeyStore(auth.keys, logger),
    },
    ...(version ? { version } : {}),
    logger,
    browser: Browsers.macOS("Electro Tech"),
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: false,
    countryCode: "PK",
  });
}

export class WhatsAppSession {
  private readonly repository: WhatsAppAuthRepository;
  private readonly connections: WhatsAppConnectionStore;
  private readonly createSocket: (auth: LoadedAuthState["state"]) => Promise<WhatsAppSocket>;
  private readonly renderQr: (value: string) => Promise<string>;
  private queue: Promise<void> = Promise.resolve();
  private socket: WhatsAppSocket | null = null;
  private auth: LoadedAuthState | null = null;
  private socketToken = 0;
  private saveGeneration = 0;
  private reconnects = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private status: WhatsAppLinkStatus = "disconnected";
  private phone: string | null = null;
  private pushName: string | null = null;
  private qrDataUrl: string | null = null;
  private savedSession = false;
  private error: string | null = null;

  constructor(dependencies: WhatsAppSessionDependencies) {
    this.repository = dependencies.repository;
    this.connections = dependencies.connections;
    this.createSocket = dependencies.createSocket ?? createBaileysSocket;
    this.renderQr = dependencies.renderQr ?? renderWhatsAppQr;
  }

  snapshot(): WhatsAppSnapshot {
    return {
      status: this.status,
      phone: this.phone,
      pushName: this.pushName,
      qrDataUrl: this.qrDataUrl,
      savedSession: this.savedSession,
      error: this.error,
    };
  }

  /** Resolves after the current connect, disconnect, or send finishes. */
  idle(): Promise<void> {
    return this.queue;
  }

  connect(): Promise<WhatsAppSnapshot> {
    return this.enqueue(async () => {
      if (this.status === "connected" || this.status === "qr" || this.status === "connecting") {
        return this.snapshot();
      }
      this.stopping = false;
      this.error = null;
      await this.openSocket();
      return this.snapshot();
    });
  }

  async restore(): Promise<void> {
    const saved = await this.repository.read("creds");
    const registered = Boolean(
      saved && typeof saved === "object" && (saved as { registered?: boolean }).registered,
    );
    this.savedSession = registered;
    if (!registered) return;
    await this.connect();
  }

  disconnect(): Promise<WhatsAppSnapshot> {
    return this.enqueue(async () => {
      await this.clearSession();
      return this.snapshot();
    });
  }

  shutdown(): Promise<void> {
    return this.enqueue(async () => {
      this.stopping = true;
      this.clearRetry();
      const current = this.socket;
      this.socket = null;
      this.socketToken += 1;
      if (current) await current.end(undefined).catch(() => undefined);
      this.status = "disconnected";
      this.qrDataUrl = null;
      this.stopping = false;
    });
  }

  send(input: WhatsAppOutgoingDocument): Promise<{ id: string }> {
    return this.enqueue(async () => {
      if (this.status !== "connected" || !this.socket) {
        throw new WhatsAppServiceError(
          "Connect the official WhatsApp before sending a document.",
          409,
          "not_connected",
        );
      }
      const phone = normalizeCustomerPhone(input.phone);
      const jid = customerJid(phone);
      const matches = await this.socket.onWhatsApp(jid);
      const match = matches?.find((item) => item.exists);
      if (!match) {
        throw new WhatsAppServiceError(
          "That number is not registered on WhatsApp.",
          422,
          "not_on_whatsapp",
        );
      }
      const sent = await this.socket.sendMessage(match.jid, {
        document: input.file,
        mimetype: input.mimeType,
        fileName: documentFileName(input.kind, input.fileName, input.mimeType),
        caption: documentCaption(input.kind, input.message),
      });
      const id = sent?.key?.id;
      if (!id) {
        throw new WhatsAppServiceError(
          "WhatsApp did not accept the document. Try again in a moment.",
          502,
          "send_failed",
        );
      }
      return { id };
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private clearRetry(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async openSocket(): Promise<void> {
    if (this.stopping) return;
    this.clearRetry();
    const token = ++this.socketToken;
    const previous = this.socket;
    this.socket = null;
    if (previous) await previous.end(undefined).catch(() => undefined);
    if (this.stopping || token !== this.socketToken) return;

    this.status = "connecting";
    this.qrDataUrl = null;
    await this.persist();

    const auth = await loadAuthState(this.repository);
    this.auth = auth;
    this.savedSession = auth.state.creds.registered;
    const socket = await this.createSocket(auth.state);
    if (this.stopping || token !== this.socketToken) {
      await socket.end(undefined).catch(() => undefined);
      return;
    }
    this.socket = socket;
    socket.ev.on("creds.update", () => {
      const generation = this.saveGeneration;
      void this.enqueue(async () => {
        if (generation !== this.saveGeneration) return;
        await auth.saveCreds();
        if (generation !== this.saveGeneration) return;
        this.savedSession = auth.state.creds.registered;
      }).catch((error: unknown) => {
        console.error("WhatsApp credentials were not saved.", error instanceof Error ? error.message : error);
      });
    });
    socket.ev.on("connection.update", (update) => {
      if (token !== this.socketToken) return;
      void this.enqueue(() => this.applyUpdate(token, update)).catch((updateError: unknown) => {
        console.error(
          "WhatsApp connection update failed.",
          updateError instanceof Error ? updateError.message : updateError,
        );
      });
    });
  }

  private async applyUpdate(token: number, update: Partial<ConnectionState>): Promise<void> {
    if (token !== this.socketToken || this.stopping) return;
    if (update.qr) {
      this.qrDataUrl = await this.renderQr(update.qr);
      this.status = "qr";
      this.reconnects = 0;
      this.error = null;
      await this.persist();
    }
    if (update.connection === "open" && this.auth) {
      const identity = readIdentity(this.auth.state.creds);
      this.status = "connected";
      this.qrDataUrl = null;
      this.reconnects = 0;
      this.savedSession = true;
      this.error = null;
      this.phone = identity.phone;
      this.pushName = identity.pushName;
      await this.persist();
    }
    if (update.connection === "close") {
      await this.onClose(update.lastDisconnect?.error);
    }
  }

  private async onClose(error: unknown): Promise<void> {
    if (this.stopping) return;
    this.socket = null;
    const code = disconnectCode(error);
    const loggedOut = code === DisconnectReason.loggedOut
      || code === DisconnectReason.badSession
      || code === DisconnectReason.multideviceMismatch
      || code === DisconnectReason.forbidden
      || code === DisconnectReason.connectionReplaced;
    if (loggedOut) {
      await this.forgetSavedSession();
      this.phone = null;
      this.pushName = null;
      this.qrDataUrl = null;
      this.status = "disconnected";
      this.reconnects = 0;
      this.error = "WhatsApp logged this device out. Scan the QR code to connect a number.";
      await this.persist();
      return;
    }
    const keepTrying = this.savedSession || this.status === "qr" || this.status === "connecting";
    if (keepTrying && this.reconnects < MAX_RECONNECTS) {
      this.reconnects += 1;
      this.status = "connecting";
      if (this.savedSession) this.qrDataUrl = null;
      this.error = null;
      await this.persist();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.enqueue(() => this.openSocket());
      }, Math.min(15_000, 1_000 * this.reconnects));
      return;
    }
    this.status = "disconnected";
    this.qrDataUrl = null;
    this.error = this.savedSession
      ? "WhatsApp disconnected. Connect again to resume the saved session."
      : "The QR connection stopped. Start it again and scan the code.";
    await this.persist();
  }

  private async clearSession(): Promise<void> {
    this.stopping = true;
    this.clearRetry();
    const current = this.socket;
    this.socket = null;
    this.socketToken += 1;
    if (current) {
      try {
        await current.logout("Electro Tech Billing disconnected this number.");
      } catch {
        await current.end(undefined).catch(() => undefined);
      }
    }
    await this.forgetSavedSession();
    this.phone = null;
    this.pushName = null;
    this.qrDataUrl = null;
    this.reconnects = 0;
    this.status = "disconnected";
    this.error = null;
    this.stopping = false;
    await this.persist();
  }

  private async forgetSavedSession(): Promise<void> {
    this.saveGeneration += 1;
    this.auth = null;
    this.savedSession = false;
    await this.repository.clear();
  }

  private async persist(): Promise<void> {
    try {
      await this.connections.write({
        status: this.status,
        phone: this.phone,
        pushName: this.pushName,
      });
    } catch (error) {
      console.error("WhatsApp status was not saved.", error instanceof Error ? error.message : error);
    }
  }
}

let activeSession: WhatsAppSession | null = null;

export function getWhatsAppSession(): WhatsAppSession {
  if (!activeSession) {
    let client;
    try {
      client = getSupabaseClient();
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        throw new WhatsAppServiceError(
          "WhatsApp session storage is not configured.",
          503,
          "storage_unconfigured",
        );
      }
      throw error;
    }
    activeSession = new WhatsAppSession({
      repository: createSupabaseAuthRepository(client),
      connections: createSupabaseConnectionStore(client),
    });
  }
  return activeSession;
}

export async function restoreWhatsAppSession(): Promise<void> {
  try {
    await getWhatsAppSession().restore();
  } catch (error) {
    console.error("WhatsApp session was not restored.", error instanceof Error ? error.message : error);
  }
}

export async function shutdownWhatsAppSession(): Promise<void> {
  if (!activeSession) return;
  await activeSession.shutdown();
}
