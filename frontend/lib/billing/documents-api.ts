import { apiUrl } from "../api-origin";
import type { QuotationRecord } from "./quotation-math";
import { billingSupabase } from "./supabase";

export type BankMode = "bank_transfer" | "cash";
export type GuarantorSector = "private" | "government";

export type GuarantorInput = {
  fullName: string;
  designation: string;
  occupation: string;
  sector: GuarantorSector;
  cnicFront: string;
  cnicBack: string;
};

export type GuarantorRecord = GuarantorInput & {
  id: string;
  agreementId: string;
  projectId: string;
  customerName: string;
  slot: 1 | 2;
};

export type ScheduleLine = {
  number: number;
  dueDate: string;
  amount: number;
  status: "due" | "paid";
  paidAmount: number;
  paidDate: string | null;
  paymentMode: BankMode | null;
};

export type PaymentRecord = {
  id: string;
  projectId: string;
  invoiceId: string | null;
  installmentNumber: number | null;
  expectedAmount: number;
  paidAmount: number;
  paymentDate: string;
  paymentMode: BankMode;
};

export type InvoiceRecord = {
  id: string;
  projectId: string;
  serial: string;
  serialNumber: number;
  kind: "advance" | "settlement" | "installment";
  status: "partial" | "paid" | "due";
  invoiceDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMode: BankMode | null;
  advancePaid: number;
  balanceDue: number;
  grandTotal: number;
  installmentNumber: number | null;
  payments: PaymentRecord[];
  project: QuotationRecord;
};

export type AgreementRecord = {
  id: string;
  projectId: string;
  serial: string;
  paymentMode: QuotationRecord["paymentMode"];
  schedule: ScheduleLine[];
  guarantors: GuarantorRecord[];
  createdAt: string;
  project: QuotationRecord;
};

export type ReceiveProject = {
  project: QuotationRecord;
  agreement: AgreementRecord | null;
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  paidTotal: number;
  balance: number;
};

export class DocumentApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentApiError";
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
    throw new DocumentApiError("The billing API is not running. Start it, then try again.");
  }
}

async function expectOk(response: Response, fallback: string): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload ? (payload as { message?: unknown }).message : null;
    throw new DocumentApiError(typeof message === "string" && message.trim() ? message : fallback);
  }
  return payload;
}

export function listAgreements(): Promise<AgreementRecord[]> {
  return billingFetch("/api/billing/agreements").then((response) => expectOk(response, "Agreements could not be loaded.")).then((payload) => (payload as { agreements: AgreementRecord[] }).agreements);
}

export function listGuarantors(): Promise<GuarantorRecord[]> {
  return billingFetch("/api/billing/guarantors").then((response) => expectOk(response, "Guarantors could not be loaded.")).then((payload) => (payload as { guarantors: GuarantorRecord[] }).guarantors);
}

export function listInvoices(): Promise<InvoiceRecord[]> {
  return billingFetch("/api/billing/invoices").then((response) => expectOk(response, "Invoices could not be loaded.")).then((payload) => (payload as { invoices: InvoiceRecord[] }).invoices);
}

export function listReceiveProjects(): Promise<ReceiveProject[]> {
  return billingFetch("/api/billing/receive-payments").then((response) => expectOk(response, "Projects could not be loaded.")).then((payload) => (payload as { projects: ReceiveProject[] }).projects);
}

export function saveAgreement(projectId: string, input: { dueDates: string[]; guarantors: GuarantorInput[] }): Promise<AgreementRecord> {
  return billingFetch(`/api/billing/projects/${projectId}/agreement`, { method: "POST", body: JSON.stringify(input) })
    .then((response) => expectOk(response, "The agreement could not be saved."))
    .then((payload) => (payload as { agreement: AgreementRecord }).agreement);
}

export function recordPayment(projectId: string, input: { kind: "direct"; paidAmount: number; paymentDate: string; paymentMode: BankMode } | { kind: "installment"; installmentNumber: number; paidAmount: number; paymentDate: string; paymentMode: BankMode }): Promise<ReceiveProject> {
  return billingFetch(`/api/billing/projects/${projectId}/payments`, { method: "POST", body: JSON.stringify(input) })
    .then((response) => expectOk(response, "The payment could not be saved."))
    .then((payload) => (payload as { project: ReceiveProject }).project);
}

export function updatePayment(paymentId: string, input: { paidAmount: number; paymentDate: string; paymentMode: BankMode }): Promise<ReceiveProject> {
  return billingFetch(`/api/billing/payments/${paymentId}`, { method: "PUT", body: JSON.stringify(input) })
    .then((response) => expectOk(response, "The payment could not be updated."))
    .then((payload) => (payload as { project: ReceiveProject }).project);
}

export function updateDueDate(projectId: string, installmentNumber: number, dueDate: string): Promise<ReceiveProject> {
  return billingFetch(`/api/billing/projects/${projectId}/installments/${installmentNumber}`, { method: "PATCH", body: JSON.stringify({ dueDate }) })
    .then((response) => expectOk(response, "The due date could not be saved."))
    .then((payload) => (payload as { project: ReceiveProject }).project);
}

export function completeProject(projectId: string): Promise<void> {
  return billingFetch(`/api/billing/projects/${projectId}/complete`, { method: "POST" }).then((response) => expectOk(response, "The project could not be completed.")).then(() => undefined);
}

export function readImageFile(file: File): Promise<string> {
  if (file.size > 1_000_000) return Promise.reject(new DocumentApiError("Use a CNIC photo under 1 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new DocumentApiError("The CNIC photo could not be read."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}
