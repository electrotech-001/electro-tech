import { apiUrl } from "../api-origin";
import { billingSupabase } from "./supabase";
import type { QuotationDraft, QuotationRecord } from "./quotation-math";

export class QuotationApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotationApiError";
  }
}

async function billingFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await billingSupabase.auth.getSession();
  const headers = new Headers(options.headers);
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new QuotationApiError("The billing API is not running. Start it, then try again.");
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return response.json();
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function expectOk(response: Response, fallback: string): Promise<unknown> {
  const payload = await readJson(response);
  if (!response.ok) throw new QuotationApiError(messageFrom(payload, fallback));
  return payload;
}

export async function listQuotations(): Promise<QuotationRecord[]> {
  const payload = await expectOk(await billingFetch("/api/billing/quotations"), "Quotations could not be loaded.");
  return (payload as { quotations: QuotationRecord[] }).quotations;
}

export async function nextQuotationSerial(): Promise<string> {
  const payload = await expectOk(await billingFetch("/api/billing/quotations/next-serial"), "The next quotation number could not be reserved.");
  return (payload as { serial: string }).serial;
}

export async function saveQuotation(draft: QuotationDraft, id?: string): Promise<QuotationRecord> {
  const payload = await expectOk(await billingFetch(id ? `/api/billing/quotations/${id}` : "/api/billing/quotations", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(draft),
  }), "The quotation could not be saved.");
  return (payload as { quotation: QuotationRecord }).quotation;
}

export async function approveQuotation(id: string): Promise<QuotationRecord> {
  const payload = await expectOk(await billingFetch(`/api/billing/quotations/${id}/approve`, { method: "POST" }), "The quotation could not be approved.");
  return (payload as { project: QuotationRecord }).project;
}

export async function disapproveQuotation(id: string): Promise<QuotationRecord> {
  const payload = await expectOk(await billingFetch(`/api/billing/quotations/${id}/disapprove`, { method: "POST" }), "The quotation could not be disapproved.");
  return (payload as { quotation: QuotationRecord }).quotation;
}

export async function disapproveProject(id: string): Promise<QuotationRecord> {
  const payload = await expectOk(await billingFetch(`/api/billing/projects/${id}/disapprove`, { method: "POST" }), "The project could not be moved back.");
  return (payload as { quotation: QuotationRecord }).quotation;
}

export async function deleteQuotation(id: string): Promise<void> {
  await expectOk(await billingFetch(`/api/billing/quotations/${id}`, { method: "DELETE" }), "The quotation could not be deleted.");
}

export async function listProjects(): Promise<QuotationRecord[]> {
  const payload = await expectOk(await billingFetch("/api/billing/projects"), "Projects could not be loaded.");
  return (payload as { projects: QuotationRecord[] }).projects;
}
