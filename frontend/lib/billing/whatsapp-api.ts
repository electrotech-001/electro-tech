import { apiUrl } from "../api-origin";
import { billingSupabase } from "./supabase";

export type WhatsAppLinkStatus = "disconnected" | "connecting" | "qr" | "connected";

export type WhatsAppStatus = {
  status: WhatsAppLinkStatus;
  phone: string | null;
  phoneDisplay: string | null;
  pushName: string | null;
  qrDataUrl: string | null;
  savedSession: boolean;
  error: string | null;
};

export type WhatsAppDocumentKind = "quotation" | "invoice" | "agreement";

export class WhatsAppApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

async function billingFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await billingSupabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new WhatsAppApiError("The billing API is not running. Start it, then try connecting again.");
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

function failureMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function readStatus(response: Response): Promise<WhatsAppStatus> {
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new WhatsAppApiError(failureMessage(payload, "WhatsApp could not be reached."));
  }
  return payload as WhatsAppStatus;
}

export function fetchWhatsAppStatus(): Promise<WhatsAppStatus> {
  return billingFetch("/api/billing/whatsapp").then(readStatus);
}

export function connectWhatsApp(): Promise<WhatsAppStatus> {
  return billingFetch("/api/billing/whatsapp/connect", { method: "POST" }).then(readStatus);
}

export function disconnectWhatsApp(): Promise<WhatsAppStatus> {
  return billingFetch("/api/billing/whatsapp/disconnect", { method: "POST" }).then(readStatus);
}

export async function sendWhatsAppDocument(input: {
  phone: string;
  kind: WhatsAppDocumentKind;
  message: string;
  file: File;
}): Promise<void> {
  const body = new FormData();
  body.set("phone", input.phone);
  body.set("kind", input.kind);
  body.set("message", input.message);
  body.set("document", input.file);
  const response = await billingFetch("/api/billing/whatsapp/send", {
    method: "POST",
    body,
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new WhatsAppApiError(failureMessage(payload, "The document was not sent."));
  }
}
