import { billingFetch as requestBilling } from "./billing-fetch";
import type { QuotationDraft, QuotationRecord } from "./quotation-math";

export class QuotationApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotationApiError";
  }
}

async function billingFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await requestBilling(path, options);
  } catch (error) {
    throw new QuotationApiError(error instanceof Error ? error.message : "The billing API is not running. Start it, then try again.");
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

export type SavedCustomer = {
  customerName: string;
  cnic: string;
  address: string;
  contactNo: string;
  whatsappNo: string;
};

export async function findCustomerByCnic(cnic: string): Promise<SavedCustomer | null> {
  const payload = await expectOk(
    await billingFetch(`/api/billing/quotations/lookup?cnic=${encodeURIComponent(cnic)}`),
    "The customer could not be looked up.",
  );
  return (payload as { customer: SavedCustomer | null }).customer;
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

export async function setPlanDiscount(projectId: string, planDiscount: number): Promise<QuotationRecord> {
  const payload = await expectOk(await billingFetch(`/api/billing/projects/${projectId}/plan-discount`, {
    method: "PATCH",
    body: JSON.stringify({ planDiscount }),
  }), "The discount could not be saved.");
  return (payload as { project: QuotationRecord }).project;
}

export async function listProjects(): Promise<QuotationRecord[]> {
  const payload = await expectOk(await billingFetch("/api/billing/projects"), "Projects could not be loaded.");
  return (payload as { projects: QuotationRecord[] }).projects;
}
