import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase.js";
import {
  computeTotals,
  formatSerial,
  quotationIssues,
  type InstallmentLine,
  type PaymentMode,
  type QuotationDraft,
  type QuotationItem,
} from "./quotation-math.js";

export type QuotationRecord = Omit<QuotationDraft, "items"> & {
  id: string;
  serial: string;
  serialNumber: number;
  approvedAt: string | null;
  sourceQuotationId: string | null;
  items: QuotationItem[];
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  installments: InstallmentLine[];
  kind: "quotation" | "project";
  status?: "in_process" | "completed";
};

export class QuotationServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "QuotationServiceError";
    this.status = status;
    this.code = code;
  }
}

export type QuotationRepository = {
  listQuotations(): Promise<QuotationRecord[]>;
  listProjects(): Promise<QuotationRecord[]>;
  nextSerial(): Promise<string>;
  create(draft: QuotationDraft): Promise<QuotationRecord>;
  update(id: string, draft: QuotationDraft): Promise<QuotationRecord>;
  approve(id: string): Promise<QuotationRecord>;
  disapprove(id: string): Promise<QuotationRecord>;
  disapproveProject(projectId: string): Promise<QuotationRecord>;
  remove(id: string): Promise<void>;
};

type ItemRow = {
  line_no: number;
  description: string;
  qty: number | string;
  unit: string;
  price: number | string;
  tax_percent: number | string;
};

type QuotationRow = {
  id: string;
  serial: string;
  serial_number: number;
  quotation_date: string;
  customer_name: string;
  cnic: string;
  address: string;
  contact_no: string;
  whatsapp_no: string;
  customer_package: string;
  payment_mode: PaymentMode;
  down_payment: number | string | null;
  installment_count: number | null;
  approved_at: string | null;
  source_quotation_id?: string | null;
  status?: string | null;
  billing_quotation_items?: ItemRow[];
  billing_project_items?: ItemRow[];
};

function asNumber(value: number | string | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function draftFromRow(row: QuotationRow, items: ItemRow[]): QuotationDraft {
  return {
    quotationDate: row.quotation_date,
    customerName: row.customer_name,
    cnic: row.cnic,
    address: row.address,
    contactNo: row.contact_no,
    whatsappNo: row.whatsapp_no,
    customerPackage: row.customer_package,
    paymentMode: row.payment_mode,
    downPayment: row.down_payment == null ? null : asNumber(row.down_payment),
    installmentCount: row.installment_count,
    items: [...items]
      .sort((a, b) => a.line_no - b.line_no)
      .map((item) => ({
        description: item.description,
        qty: asNumber(item.qty),
        unit: item.unit,
        price: asNumber(item.price),
        taxPercent: asNumber(item.tax_percent),
      })),
  };
}

export function toQuotationRecord(
  row: QuotationRow,
  kind: "quotation" | "project",
): QuotationRecord {
  const itemRows = kind === "quotation" ? row.billing_quotation_items ?? [] : row.billing_project_items ?? [];
  const draft = draftFromRow(row, itemRows);
  const totals = computeTotals(draft);
  return {
    ...draft,
    ...totals,
    id: row.id,
    serial: row.serial,
    serialNumber: row.serial_number,
    approvedAt: row.approved_at,
    sourceQuotationId: row.source_quotation_id ?? null,
    kind,
    ...(kind === "project" ? { status: row.status === "completed" ? "completed" as const : "in_process" as const } : {}),
  };
}

function assertDraft(draft: QuotationDraft): QuotationDraft {
  const normalized: QuotationDraft = {
    ...draft,
    customerName: draft.customerName.trim(),
    address: draft.address.trim(),
    customerPackage: draft.customerPackage.trim(),
    paymentMode: draft.paymentMode,
    downPayment: draft.paymentMode === "installments" ? draft.downPayment : null,
    installmentCount: draft.paymentMode === "installments" ? draft.installmentCount : null,
    items: draft.items.map((item) => ({
      description: item.description.trim(),
      qty: item.qty,
      unit: item.unit.trim(),
      price: item.price,
      taxPercent: item.taxPercent,
    })),
  };
  const issues = quotationIssues(normalized);
  if (issues.length > 0) {
    throw new QuotationServiceError(issues[0] ?? "Check the quotation and try again.", 400, "invalid_quotation");
  }
  return normalized;
}

function itemPayload(quotationId: string, items: QuotationItem[], foreignKey: "quotation_id" | "project_id") {
  return items.map((item) => ({
    [foreignKey]: quotationId,
    line_no: item.lineNo,
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    price: item.price,
    tax_percent: item.taxPercent,
  }));
}

function parentPayload(draft: QuotationDraft, serialNumber: number) {
  return {
    serial: formatSerial(serialNumber),
    serial_number: serialNumber,
    quotation_date: draft.quotationDate,
    customer_name: draft.customerName,
    cnic: draft.cnic,
    address: draft.address,
    contact_no: draft.contactNo,
    whatsapp_no: draft.whatsappNo,
    customer_package: draft.customerPackage,
    payment_mode: draft.paymentMode,
    down_payment: draft.downPayment,
    installment_count: draft.installmentCount,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export function createMemoryQuotationRepository(): QuotationRepository {
  const quotations: QuotationRow[] = [];
  const projects: QuotationRow[] = [];

  function materialize(row: QuotationRow, kind: "quotation" | "project"): QuotationRecord {
    return toQuotationRecord(row, kind);
  }

  return {
    async listQuotations() {
      return quotations.map((row) => materialize(row, "quotation")).reverse();
    },
    async listProjects() {
      return projects.map((row) => materialize(row, "project")).reverse();
    },
    async nextSerial() {
      const max = quotations.reduce((highest, row) => Math.max(highest, row.serial_number), 0);
      return formatSerial(max + 1);
    },
    async create(draft) {
      const clean = assertDraft(draft);
      const serialNumber = quotations.reduce((highest, row) => Math.max(highest, row.serial_number), 0) + 1;
      const totals = computeTotals(clean);
      const row: QuotationRow = {
        id: crypto.randomUUID(),
        ...parentPayload(clean, serialNumber),
        approved_at: null,
        billing_quotation_items: totals.items.map((item) => ({
          line_no: item.lineNo,
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          tax_percent: item.taxPercent,
        })),
      };
      quotations.push(row);
      return materialize(row, "quotation");
    },
    async update(id, draft) {
      const clean = assertDraft(draft);
      const row = quotations.find((entry) => entry.id === id);
      if (!row) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      const totals = computeTotals(clean);
      Object.assign(row, {
        quotation_date: clean.quotationDate,
        customer_name: clean.customerName,
        cnic: clean.cnic,
        address: clean.address,
        contact_no: clean.contactNo,
        whatsapp_no: clean.whatsappNo,
        customer_package: clean.customerPackage,
        payment_mode: clean.paymentMode,
        down_payment: clean.downPayment,
        installment_count: clean.installmentCount,
        billing_quotation_items: totals.items.map((item) => ({
          line_no: item.lineNo,
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          tax_percent: item.taxPercent,
        })),
      });
      return materialize(row, "quotation");
    },
    async approve(id) {
      const row = quotations.find((entry) => entry.id === id);
      if (!row) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      if (row.approved_at) {
        throw new QuotationServiceError("This quotation is already in Projects in Process.", 409, "already_approved");
      }
      const { billing_quotation_items: sourceItems, ...rest } = row;
      const copy: QuotationRow = {
        ...rest,
        id: crypto.randomUUID(),
        approved_at: null,
        source_quotation_id: row.id,
        billing_project_items: (sourceItems ?? []).map((item) => ({ ...item })),
      };
      projects.push(copy);
      row.approved_at = new Date().toISOString();
      return materialize(copy, "project");
    },
    async disapprove(id) {
      const row = quotations.find((entry) => entry.id === id);
      if (!row) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      if (!row.approved_at) {
        throw new QuotationServiceError("This quotation is not in Projects in Process.", 409, "not_approved");
      }
      const projectIndex = projects.findIndex((entry) => entry.source_quotation_id === id);
      if (projectIndex >= 0) projects.splice(projectIndex, 1);
      row.approved_at = null;
      return materialize(row, "quotation");
    },
    async disapproveProject(projectId) {
      const project = projects.find((entry) => entry.id === projectId);
      if (!project?.source_quotation_id) throw new QuotationServiceError("Project was not found.", 404, "not_found");
      const row = quotations.find((entry) => entry.id === project.source_quotation_id);
      if (!row) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      projects.splice(projects.indexOf(project), 1);
      row.approved_at = null;
      return materialize(row, "quotation");
    },
    async remove(id) {
      const index = quotations.findIndex((entry) => entry.id === id);
      if (index < 0) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      for (let projectIndex = projects.length - 1; projectIndex >= 0; projectIndex -= 1) {
        if (projects[projectIndex]?.source_quotation_id === id) projects.splice(projectIndex, 1);
      }
      quotations.splice(index, 1);
    },
  };
}

const QUOTATION_SELECT = "id, serial, serial_number, quotation_date, customer_name, cnic, address, contact_no, whatsapp_no, customer_package, payment_mode, down_payment, installment_count, approved_at, billing_quotation_items(line_no, description, qty, unit, price, tax_percent)";
const PROJECT_SELECT = "id, serial, serial_number, quotation_date, customer_name, cnic, address, contact_no, whatsapp_no, customer_package, payment_mode, down_payment, installment_count, approved_at, source_quotation_id, status, billing_project_items(line_no, description, qty, unit, price, tax_percent)";

function storageFailure(error: { message: string }, action: string): QuotationServiceError {
  console.error(`Quotation could not be ${action}.`, error.message);
  return new QuotationServiceError("Quotation storage is unavailable.", 503, "storage_unavailable");
}

export function createSupabaseQuotationRepository(client: SupabaseClient): QuotationRepository {
  async function maxSerial(): Promise<number> {
    const { data, error } = await client
      .from("billing_quotations")
      .select("serial_number")
      .order("serial_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw storageFailure(error, "numbered");
    return data?.serial_number ?? 0;
  }

  async function readQuotation(id: string): Promise<QuotationRecord> {
    const { data, error } = await client
      .from("billing_quotations")
      .select(QUOTATION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw storageFailure(error, "read");
    if (!data) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
    return toQuotationRecord(data as QuotationRow, "quotation");
  }

  return {
    async listQuotations() {
      const { data, error } = await client
        .from("billing_quotations")
        .select(QUOTATION_SELECT)
        .order("serial_number", { ascending: false });
      if (error) throw storageFailure(error, "listed");
      return ((data ?? []) as QuotationRow[]).map((row) => toQuotationRecord(row, "quotation"));
    },
    async listProjects() {
      const { data, error } = await client
        .from("billing_projects")
        .select(PROJECT_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw storageFailure(error, "listed");
      return ((data ?? []) as QuotationRow[]).map((row) => toQuotationRecord(row, "project"));
    },
    async nextSerial() {
      return formatSerial((await maxSerial()) + 1);
    },
    async create(draft) {
      const clean = assertDraft(draft);
      const totals = computeTotals(clean);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const serialNumber = (await maxSerial()) + 1;
        const inserted = await client
          .from("billing_quotations")
          .insert(parentPayload(clean, serialNumber))
          .select("id")
          .single();
        if (inserted.error) {
          if (isUniqueViolation(inserted.error) && attempt < 3) continue;
          throw storageFailure(inserted.error, "saved");
        }
        const items = await client
          .from("billing_quotation_items")
          .insert(itemPayload(inserted.data.id, totals.items, "quotation_id"));
        if (items.error) {
          await client.from("billing_quotations").delete().eq("id", inserted.data.id);
          throw storageFailure(items.error, "saved");
        }
        return readQuotation(inserted.data.id);
      }
      throw new QuotationServiceError("The quotation number could not be reserved. Try again.", 409, "serial_conflict");
    },
    async update(id, draft) {
      const clean = assertDraft(draft);
      const existing = await readQuotation(id);
      const totals = computeTotals(clean);
      const updated = await client
        .from("billing_quotations")
        .update({
          quotation_date: clean.quotationDate,
          customer_name: clean.customerName,
          cnic: clean.cnic,
          address: clean.address,
          contact_no: clean.contactNo,
          whatsapp_no: clean.whatsappNo,
          customer_package: clean.customerPackage,
          payment_mode: clean.paymentMode,
          down_payment: clean.downPayment,
          installment_count: clean.installmentCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updated.error) throw storageFailure(updated.error, "updated");
      const removed = await client.from("billing_quotation_items").delete().eq("quotation_id", existing.id);
      if (removed.error) throw storageFailure(removed.error, "updated");
      const items = await client
        .from("billing_quotation_items")
        .insert(itemPayload(existing.id, totals.items, "quotation_id"));
      if (items.error) throw storageFailure(items.error, "updated");
      return readQuotation(existing.id);
    },
    async approve(id) {
      const existing = await readQuotation(id);
      if (existing.approvedAt) {
        throw new QuotationServiceError("This quotation is already in Projects in Process.", 409, "already_approved");
      }
      const inserted = await client
        .from("billing_projects")
        .insert({
          ...parentPayload(existing, existing.serialNumber),
          source_quotation_id: existing.id,
        })
        .select("id")
        .single();
      if (inserted.error) {
        if (isUniqueViolation(inserted.error)) {
          throw new QuotationServiceError("This quotation is already in Projects in Process.", 409, "already_approved");
        }
        throw storageFailure(inserted.error, "approved");
      }
      const items = await client
        .from("billing_project_items")
        .insert(itemPayload(inserted.data.id, existing.items, "project_id"));
      if (items.error) {
        await client.from("billing_projects").delete().eq("id", inserted.data.id);
        throw storageFailure(items.error, "approved");
      }
      const stamped = await client
        .from("billing_quotations")
        .update({ approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .is("approved_at", null);
      if (stamped.error) throw storageFailure(stamped.error, "approved");
      const { data, error } = await client
        .from("billing_projects")
        .select(PROJECT_SELECT)
        .eq("id", inserted.data.id)
        .single();
      if (error || !data) throw storageFailure(error ?? { message: "Missing project." }, "approved");
      return toQuotationRecord(data as QuotationRow, "project");
    },
    async disapprove(id) {
      const existing = await readQuotation(id);
      if (!existing.approvedAt) {
        throw new QuotationServiceError("This quotation is not in Projects in Process.", 409, "not_approved");
      }
      const removed = await client.from("billing_projects").delete().eq("source_quotation_id", existing.id);
      if (removed.error) throw storageFailure(removed.error, "disapproved");
      const stamped = await client
        .from("billing_quotations")
        .update({ approved_at: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (stamped.error) throw storageFailure(stamped.error, "disapproved");
      return readQuotation(existing.id);
    },
    async disapproveProject(projectId) {
      const found = await client
        .from("billing_projects")
        .select("source_quotation_id")
        .eq("id", projectId)
        .maybeSingle();
      if (found.error) throw storageFailure(found.error, "disapproved");
      const sourceId = found.data?.source_quotation_id;
      if (typeof sourceId !== "string" || !sourceId) {
        throw new QuotationServiceError("Project was not found.", 404, "not_found");
      }
      return this.disapprove(sourceId);
    },
    async remove(id) {
      await readQuotation(id);
      const removedProject = await client.from("billing_projects").delete().eq("source_quotation_id", id);
      if (removedProject.error) throw storageFailure(removedProject.error, "deleted");
      const removed = await client.from("billing_quotations").delete().eq("id", id);
      if (removed.error) throw storageFailure(removed.error, "deleted");
    },
  };
}

let cached: QuotationRepository | null = null;

export function getQuotationRepository(): QuotationRepository {
  if (!cached) cached = createSupabaseQuotationRepository(getSupabaseClient());
  return cached;
}
