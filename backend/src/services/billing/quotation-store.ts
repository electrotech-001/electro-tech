import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase.js";
import {
  computeTotals,
  customerProfileIssues,
  customInstallments,
  formatDirectSaleSerial,
  formatSerial,
  installmentBalance,
  planDiscountOf,
  quotationIssues,
  roundMoney,
  type CustomerProfileInput,
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
  origin?: "project" | "direct_sale";
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

export type SavedCustomer = {
  customerName: string;
  cnic: string;
  address: string;
  contactNo: string;
  whatsappNo: string;
};

export function matchCustomer(rows: QuotationRow[], cnic: string): SavedCustomer | null {
  const digits = cnic.replace(/\D/g, "");
  if (digits.length !== 13) return null;
  const matches = rows.filter((row) => row.cnic.replace(/\D/g, "") === digits);
  matches.sort((left, right) => right.quotation_date.localeCompare(left.quotation_date));
  const row = matches[0];
  if (!row) return null;
  return {
    customerName: row.customer_name,
    cnic: row.cnic,
    address: row.address,
    contactNo: row.contact_no,
    whatsappNo: row.whatsapp_no,
  };
}

export type QuotationRepository = {
  listQuotations(): Promise<QuotationRecord[]>;
  countQuotations(): Promise<number>;
  listProjects(): Promise<QuotationRecord[]>;
  findCustomerByCnic(cnic: string): Promise<SavedCustomer | null>;
  nextSerial(): Promise<string>;
  nextDirectSaleSerial(): Promise<string>;
  create(draft: QuotationDraft): Promise<QuotationRecord>;
  createDirectSale(draft: QuotationDraft): Promise<QuotationRecord>;
  update(id: string, draft: QuotationDraft): Promise<QuotationRecord>;
  updateProject(id: string, draft: QuotationDraft): Promise<QuotationRecord>;
  approve(id: string): Promise<QuotationRecord>;
  disapprove(id: string): Promise<QuotationRecord>;
  disapproveProject(projectId: string): Promise<QuotationRecord>;
  setPlanDiscount(projectId: string, planDiscount: number): Promise<QuotationRecord>;
  remove(id: string): Promise<void>;
  updateCustomer(currentCnic: string, profile: CustomerProfileInput): Promise<{ cnic: string; projectIds: string[] }>;
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
  plan_discount?: number | string | null;
  installment_count: number | null;
  installment_amounts?: (number | string)[] | null;
  approved_at: string | null;
  source_quotation_id?: string | null;
  status?: string | null;
  origin?: string | null;
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
    planDiscount: asNumber(row.plan_discount),
    installmentCount: row.installment_count,
    installmentAmounts: Array.isArray(row.installment_amounts) ? row.installment_amounts.map((amount) => asNumber(amount)) : null,
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
    ...(kind === "project"
      ? {
        status: row.status === "completed" ? "completed" as const : "in_process" as const,
        origin: row.origin === "direct_sale" ? "direct_sale" as const : "project" as const,
      }
      : {}),
  };
}

function assertProfile(profile: CustomerProfileInput): CustomerProfileInput {
  const clean: CustomerProfileInput = {
    customerName: profile.customerName.trim(),
    cnic: profile.cnic.trim(),
    address: profile.address.trim(),
    contactNo: profile.contactNo.trim(),
    whatsappNo: profile.whatsappNo.trim(),
  };
  const issues = customerProfileIssues(clean);
  if (issues.length > 0) {
    throw new QuotationServiceError(issues[0] ?? "Check the customer profile and try again.", 400, "invalid_customer");
  }
  return clean;
}

function applyProfile(row: QuotationRow, profile: CustomerProfileInput): void {
  row.customer_name = profile.customerName;
  row.cnic = profile.cnic;
  row.address = profile.address;
  row.contact_no = profile.contactNo;
  row.whatsapp_no = profile.whatsappNo;
}

function projectDate(incoming: string, stored?: string | null): string {
  const candidate = String(incoming ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00`))) return candidate;
  return String(stored ?? "").slice(0, 10);
}

function assertDraft(draft: QuotationDraft): QuotationDraft {
  const normalized: QuotationDraft = {
    ...draft,
    customerName: draft.customerName.trim(),
    cnic: draft.cnic.trim(),
    address: draft.address.trim(),
    contactNo: draft.contactNo.trim(),
    whatsappNo: draft.whatsappNo.trim(),
    customerPackage: draft.customerPackage.trim(),
    paymentMode: draft.paymentMode,
    downPayment: draft.paymentMode === "installments" || (draft.paymentMode === "direct" && draft.downPayment != null)
      ? draft.downPayment
      : null,
    planDiscount: planDiscountOf(draft),
    installmentCount: draft.paymentMode === "installments" ? draft.installmentCount : null,
    installmentAmounts: draft.paymentMode === "installments" && Array.isArray(draft.installmentAmounts) && draft.installmentAmounts.length > 0
      ? draft.installmentAmounts.map((amount) => roundMoney(Number(amount)))
      : null,
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
    plan_discount: planDiscountOf(draft),
    installment_count: draft.installmentCount,
    installment_amounts: draft.installmentAmounts ?? null,
  };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function maxDirectSaleNumber(rows: QuotationRow[]): number {
  return rows.reduce((highest, row) => (row.origin === "direct_sale" ? Math.max(highest, row.serial_number) : highest), 0);
}

export function buildDirectSaleRecord(draft: QuotationDraft, serialNumber: number, id = crypto.randomUUID()): QuotationRecord {
  const clean = assertDraft(draft);
  const totals = computeTotals(clean);
  return {
    ...clean,
    ...totals,
    id,
    serial: formatDirectSaleSerial(serialNumber),
    serialNumber,
    approvedAt: new Date().toISOString(),
    sourceQuotationId: null,
    kind: "project",
    status: "in_process",
    origin: "direct_sale",
  };
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
    async countQuotations() {
      return quotations.length;
    },
    async listProjects() {
      return projects.filter((row) => row.origin !== "direct_sale").map((row) => materialize(row, "project")).reverse();
    },
    async findCustomerByCnic(cnic) {
      return matchCustomer([...quotations, ...projects], cnic);
    },
    async nextSerial() {
      const max = quotations.reduce((highest, row) => Math.max(highest, row.serial_number), 0);
      return formatSerial(max + 1);
    },
    async nextDirectSaleSerial() {
      return formatDirectSaleSerial(maxDirectSaleNumber(projects) + 1);
    },
    async createDirectSale(draft) {
      const record = buildDirectSaleRecord(draft, maxDirectSaleNumber(projects) + 1);
      const totals = computeTotals(record);
      projects.push({
        id: record.id,
        serial: record.serial,
        serial_number: record.serialNumber,
        quotation_date: record.quotationDate,
        customer_name: record.customerName,
        cnic: record.cnic,
        address: record.address,
        contact_no: record.contactNo,
        whatsapp_no: record.whatsappNo,
        customer_package: record.customerPackage,
        payment_mode: record.paymentMode,
        down_payment: record.downPayment,
        plan_discount: record.planDiscount ?? 0,
        installment_count: record.installmentCount,
        installment_amounts: record.installmentAmounts ?? null,
        approved_at: record.approvedAt,
        source_quotation_id: null,
        status: "in_process",
        origin: "direct_sale",
        billing_project_items: totals.items.map((item) => ({
          line_no: item.lineNo,
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          tax_percent: item.taxPercent,
        })),
      });
      return record;
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
        plan_discount: clean.planDiscount ?? 0,
        installment_count: clean.installmentCount,
        installment_amounts: clean.installmentAmounts ?? null,
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
    async updateProject(id, draft) {
      const row = projects.find((entry) => entry.id === id);
      if (!row) throw new QuotationServiceError("Invoice was not found.", 404, "not_found");
      const clean = assertDraft({ ...draft, quotationDate: projectDate(draft.quotationDate, row.quotation_date) });
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
        plan_discount: clean.planDiscount ?? 0,
        installment_count: clean.installmentCount,
        installment_amounts: clean.installmentAmounts ?? null,
        billing_project_items: totals.items.map((item) => ({
          line_no: item.lineNo,
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          tax_percent: item.taxPercent,
        })),
      });
      return materialize(row, "project");
    },
    async approve(id) {
      const row = quotations.find((entry) => entry.id === id);
      if (!row) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      if (row.approved_at) {
        throw new QuotationServiceError("This quotation is already approved.", 409, "already_approved");
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
        throw new QuotationServiceError("This quotation is not approved.", 409, "not_approved");
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
    async setPlanDiscount(projectId, planDiscount) {
      const project = projects.find((entry) => entry.id === projectId);
      if (!project) throw new QuotationServiceError("Project was not found.", 404, "not_found");
      const discount = roundMoney(planDiscount);
      if (!Number.isFinite(discount) || discount < 0) {
        throw new QuotationServiceError("Enter a discount of zero or more.", 400, "invalid_discount");
      }
      const current = materialize(project, "project");
      if (current.paymentMode !== "installments") {
        throw new QuotationServiceError("A plan discount is only used for installments.", 400, "invalid_discount");
      }
      if (customInstallments(current) && discount !== planDiscountOf(current)) {
        throw new QuotationServiceError("This plan has custom installment amounts. Edit the invoice and change the installment amounts instead.", 400, "custom_installments");
      }
      if (discount > installmentBalance(current.grandTotal, current.downPayment, 0)) {
        throw new QuotationServiceError("Down payment and discount cannot be more than the total amount.", 400, "invalid_discount");
      }
      project.plan_discount = discount;
      const source = quotations.find((entry) => entry.id === project.source_quotation_id);
      if (source) source.plan_discount = discount;
      return materialize(project, "project");
    },
    async remove(id) {
      const index = quotations.findIndex((entry) => entry.id === id);
      if (index < 0) throw new QuotationServiceError("Quotation was not found.", 404, "not_found");
      for (let projectIndex = projects.length - 1; projectIndex >= 0; projectIndex -= 1) {
        if (projects[projectIndex]?.source_quotation_id === id) projects.splice(projectIndex, 1);
      }
      quotations.splice(index, 1);
    },
    async updateCustomer(currentCnic, profile) {
      if (!/^\d{5}-\d{7}-\d$/.test(currentCnic.trim())) {
        throw new QuotationServiceError("Add a CNIC on the quotation before updating this customer from the profile.", 400, "invalid_customer");
      }
      const clean = assertProfile(profile);
      const quotationHits = quotations.filter((row) => row.cnic === currentCnic);
      const projectHits = projects.filter((row) => row.cnic === currentCnic);
      if (quotationHits.length + projectHits.length === 0) {
        throw new QuotationServiceError("Customer was not found.", 404, "not_found");
      }
      for (const row of [...quotationHits, ...projectHits]) applyProfile(row, clean);
      return { cnic: clean.cnic, projectIds: projectHits.map((row) => row.id) };
    },
  };
}

const QUOTATION_SELECT = "id, serial, serial_number, quotation_date, customer_name, cnic, address, contact_no, whatsapp_no, customer_package, payment_mode, down_payment, plan_discount, installment_count, installment_amounts, approved_at, billing_quotation_items(line_no, description, qty, unit, price, tax_percent)";
const PROJECT_SELECT = "id, serial, serial_number, quotation_date, customer_name, cnic, address, contact_no, whatsapp_no, customer_package, payment_mode, down_payment, plan_discount, installment_count, installment_amounts, approved_at, source_quotation_id, status, origin, billing_project_items(line_no, description, qty, unit, price, tax_percent)";

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
    async countQuotations() {
      const { count, error } = await client.from("billing_quotations").select("id", { count: "exact", head: true });
      if (error) throw storageFailure(error, "listed");
      return count ?? 0;
    },
    async listProjects() {
      const { data, error } = await client
        .from("billing_projects")
        .select(PROJECT_SELECT)
        .eq("origin", "project")
        .order("created_at", { ascending: false });
      if (error) throw storageFailure(error, "listed");
      return ((data ?? []) as QuotationRow[]).map((row) => toQuotationRecord(row, "project"));
    },
    async findCustomerByCnic(cnic) {
      const digits = cnic.replace(/\D/g, "");
      if (digits.length !== 13) return null;
      const keys = [...new Set([cnic.trim(), digits])];
      const columns = "customer_name, cnic, address, contact_no, whatsapp_no, quotation_date";
      const [quotationsResult, projectsResult] = await Promise.all([
        client.from("billing_quotations").select(columns).in("cnic", keys),
        client.from("billing_projects").select(columns).in("cnic", keys),
      ]);
      if (quotationsResult.error) throw storageFailure(quotationsResult.error, "listed");
      if (projectsResult.error) throw storageFailure(projectsResult.error, "listed");
      return matchCustomer([...(quotationsResult.data ?? []), ...(projectsResult.data ?? [])] as QuotationRow[], cnic);
    },
    async nextSerial() {
      return formatSerial((await maxSerial()) + 1);
    },
    async nextDirectSaleSerial() {
      const { data, error } = await client
        .from("billing_projects")
        .select("serial_number")
        .eq("origin", "direct_sale")
        .order("serial_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw storageFailure(error, "listed");
      return formatDirectSaleSerial((typeof data?.serial_number === "number" ? data.serial_number : Number(data?.serial_number ?? 0)) + 1);
    },
    async createDirectSale(draft) {
      const clean = assertDraft(draft);
      const totals = computeTotals(clean);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const latest = await client
          .from("billing_projects")
          .select("serial_number")
          .eq("origin", "direct_sale")
          .order("serial_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest.error) throw storageFailure(latest.error, "listed");
        const serialNumber = (typeof latest.data?.serial_number === "number" ? latest.data.serial_number : Number(latest.data?.serial_number ?? 0)) + 1;
        const inserted = await client
          .from("billing_projects")
          .insert({
            ...parentPayload(clean, serialNumber),
            serial: formatDirectSaleSerial(serialNumber),
            source_quotation_id: null,
            origin: "direct_sale",
            approved_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (inserted.error) {
          if (isUniqueViolation(inserted.error) && attempt < 3) continue;
          throw storageFailure(inserted.error, "saved");
        }
        const items = await client
          .from("billing_project_items")
          .insert(itemPayload(inserted.data.id, totals.items, "project_id"));
        if (items.error) {
          await client.from("billing_projects").delete().eq("id", inserted.data.id);
          throw storageFailure(items.error, "saved");
        }
        const { data, error } = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", inserted.data.id).single();
        if (error || !data) throw storageFailure(error ?? { message: "Missing sale." }, "saved");
        return toQuotationRecord(data as QuotationRow, "project");
      }
      throw new QuotationServiceError("The sale number could not be reserved. Try again.", 409, "serial_conflict");
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
          plan_discount: clean.planDiscount ?? 0,
          installment_count: clean.installmentCount,
          installment_amounts: clean.installmentAmounts ?? null,
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
    async updateProject(id, draft) {
      const found = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
      if (found.error) throw storageFailure(found.error, "read");
      if (!found.data) throw new QuotationServiceError("Invoice was not found.", 404, "not_found");
      const clean = assertDraft({
        ...draft,
        quotationDate: projectDate(draft.quotationDate, (found.data as QuotationRow).quotation_date),
      });
      const totals = computeTotals(clean);
      const updated = await client
        .from("billing_projects")
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
          plan_discount: clean.planDiscount ?? 0,
          installment_count: clean.installmentCount,
          installment_amounts: clean.installmentAmounts ?? null,
        })
        .eq("id", id);
      if (updated.error) throw storageFailure(updated.error, "updated");
      const removed = await client.from("billing_project_items").delete().eq("project_id", id);
      if (removed.error) throw storageFailure(removed.error, "updated");
      const items = await client.from("billing_project_items").insert(itemPayload(id, totals.items, "project_id"));
      if (items.error) throw storageFailure(items.error, "updated");
      const saved = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", id).single();
      if (saved.error || !saved.data) throw storageFailure(saved.error ?? { message: "Missing invoice." }, "updated");
      return toQuotationRecord(saved.data as QuotationRow, "project");
    },
    async approve(id) {
      const existing = await readQuotation(id);
      if (existing.approvedAt) {
        throw new QuotationServiceError("This quotation is already approved.", 409, "already_approved");
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
          throw new QuotationServiceError("This quotation is already approved.", 409, "already_approved");
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
        throw new QuotationServiceError("This quotation is not approved.", 409, "not_approved");
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
    async setPlanDiscount(projectId, planDiscount) {
      const discount = roundMoney(planDiscount);
      if (!Number.isFinite(discount) || discount < 0) {
        throw new QuotationServiceError("Enter a discount of zero or more.", 400, "invalid_discount");
      }
      const { data, error } = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle();
      if (error) throw storageFailure(error, "read");
      if (!data) throw new QuotationServiceError("Project was not found.", 404, "not_found");
      const current = toQuotationRecord(data as QuotationRow, "project");
      if (current.paymentMode !== "installments") {
        throw new QuotationServiceError("A plan discount is only used for installments.", 400, "invalid_discount");
      }
      if (customInstallments(current) && discount !== planDiscountOf(current)) {
        throw new QuotationServiceError("This plan has custom installment amounts. Edit the invoice and change the installment amounts instead.", 400, "custom_installments");
      }
      if (discount > installmentBalance(current.grandTotal, current.downPayment, 0)) {
        throw new QuotationServiceError("Down payment and discount cannot be more than the total amount.", 400, "invalid_discount");
      }
      const updated = await client.from("billing_projects").update({ plan_discount: discount }).eq("id", projectId);
      if (updated.error) throw storageFailure(updated.error, "updated");
      if (current.sourceQuotationId) {
        const source = await client.from("billing_quotations").update({ plan_discount: discount, updated_at: new Date().toISOString() }).eq("id", current.sourceQuotationId);
        if (source.error) throw storageFailure(source.error, "updated");
      }
      const { data: saved, error: readError } = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", projectId).single();
      if (readError || !saved) throw storageFailure(readError ?? { message: "Missing project." }, "read");
      return toQuotationRecord(saved as QuotationRow, "project");
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
    async updateCustomer(currentCnic, profile) {
      if (!/^\d{5}-\d{7}-\d$/.test(currentCnic.trim())) {
        throw new QuotationServiceError("Add a CNIC on the quotation before updating this customer from the profile.", 400, "invalid_customer");
      }
      const clean = assertProfile(profile);
      const patch = {
        customer_name: clean.customerName,
        cnic: clean.cnic,
        address: clean.address,
        contact_no: clean.contactNo,
        whatsapp_no: clean.whatsappNo,
      };
      const quotationUpdate = await client
        .from("billing_quotations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("cnic", currentCnic)
        .select("id");
      if (quotationUpdate.error) throw storageFailure(quotationUpdate.error, "updated");
      const projectUpdate = await client.from("billing_projects").update(patch).eq("cnic", currentCnic).select("id");
      if (projectUpdate.error) throw storageFailure(projectUpdate.error, "updated");
      const projectRows = (projectUpdate.data ?? []) as { id: string }[];
      if ((quotationUpdate.data?.length ?? 0) + projectRows.length === 0) {
        throw new QuotationServiceError("Customer was not found.", 404, "not_found");
      }
      return { cnic: clean.cnic, projectIds: projectRows.map((row) => row.id) };
    },
  };
}

let cached: QuotationRepository | null = null;

export function getQuotationRepository(): QuotationRepository {
  if (!cached) cached = createSupabaseQuotationRepository(getSupabaseClient());
  return cached;
}
