import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase.js";
import {
  DocumentError,
  changeDueDate,
  createAgreement,
  editPayment,
  paidTotal,
  receiveInstallment,
  recordDirectPayment,
  type AgreementRecord,
  type BankMode,
  type GuarantorInput,
  type GuarantorRecord,
  type InvoiceRecord,
  type PaymentRecord,
  type ScheduleLine,
  type Workspace,
} from "./documents-math.js";
import { toQuotationRecord, type QuotationRecord } from "./quotation-store.js";

export type ReceiveProject = Workspace & {
  paidTotal: number;
  balance: number;
};

export type DocumentsRepository = {
  listAgreements(includeImages?: boolean): Promise<AgreementRecord[]>;
  listGuarantors(): Promise<GuarantorRecord[]>;
  listInvoices(): Promise<InvoiceRecord[]>;
  listReceiveProjects(): Promise<ReceiveProject[]>;
  workspace(projectId: string): Promise<ReceiveProject>;
  saveAgreement(projectId: string, input: { dueDates: string[]; guarantors: GuarantorInput[] }): Promise<AgreementRecord>;
  recordPayment(projectId: string, input: DirectPayment | InstallmentPayment): Promise<ReceiveProject>;
  updatePayment(paymentId: string, input: { paidAmount: number; paymentDate: string; paymentMode: BankMode }): Promise<ReceiveProject>;
  updateDueDate(projectId: string, installmentNumber: number, dueDate: string): Promise<ReceiveProject>;
  completeProject(projectId: string): Promise<void>;
  projectHasDocuments(projectId: string): Promise<boolean>;
  listLedger(): Promise<LedgerEntry[]>;
  summary(): Promise<BillingSummary>;
  renameCustomer(projectIds: string[], customerName: string): Promise<void>;
};

export type BillingSummary = {
  projectsInProcess: number;
  openInvoices: number;
  overdueInstallments: number;
  receivedTotal: number;
  paymentCount: number;
  recent: LedgerEntry[];
};

export type LedgerEntry = {
  id: string;
  paymentDate: string;
  paidAmount: number;
  paymentMode: BankMode;
  installmentNumber: number | null;
  customerName: string;
  cnic: string;
  projectId: string;
  projectSerial: string;
  invoiceSerial: string | null;
};

export function toLedger(workspaces: Workspace[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const workspace of workspaces) {
    for (const payment of workspace.payments) {
      const invoice = workspace.invoices.find((entry) => (
        payment.invoiceId
          ? entry.id === payment.invoiceId
          : payment.installmentNumber != null && entry.installmentNumber === payment.installmentNumber
      ));
      entries.push({
        id: payment.id,
        paymentDate: payment.paymentDate,
        paidAmount: payment.paidAmount,
        paymentMode: payment.paymentMode,
        installmentNumber: payment.installmentNumber,
        customerName: workspace.project.customerName,
        cnic: workspace.project.cnic,
        projectId: workspace.project.id,
        projectSerial: workspace.project.serial,
        invoiceSerial: invoice?.serial ?? null,
      });
    }
  }
  return entries.sort((left, right) => left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id));
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function summarizeDocuments(workspaces: Workspace[], today = todayIso()): BillingSummary {
  const entries = toLedger(workspaces);
  let projectsInProcess = 0;
  let openInvoices = 0;
  let overdueInstallments = 0;
  for (const workspace of workspaces) {
    if (workspace.project.status !== "completed") projectsInProcess += 1;
    openInvoices += workspace.invoices.filter((invoice) => invoice.status !== "paid").length;
    for (const line of workspace.agreement?.schedule ?? []) {
      if (line.status === "due" && line.dueDate < today) overdueInstallments += 1;
    }
  }
  const receivedTotal = Math.round(entries.reduce((sum, entry) => sum + entry.paidAmount, 0) * 100) / 100;
  return {
    projectsInProcess,
    openInvoices,
    overdueInstallments,
    receivedTotal,
    paymentCount: entries.length,
    recent: entries.slice(-5).reverse(),
  };
}

type DirectPayment = { kind: "direct"; paidAmount: number; paymentDate: string; paymentMode: BankMode };
type InstallmentPayment = { kind: "installment"; installmentNumber: number; paidAmount: number; paymentDate: string; paymentMode: BankMode };

const PROJECT_SELECT = "id, serial, serial_number, quotation_date, customer_name, cnic, address, contact_no, whatsapp_no, customer_package, payment_mode, down_payment, installment_count, approved_at, source_quotation_id, status, billing_project_items(line_no, description, qty, unit, price, tax_percent)";

function present(workspace: Workspace): ReceiveProject {
  const collected = paidTotal(workspace.payments);
  const balanceBase = workspace.project.paymentMode === "installments"
    ? workspace.project.grandTotal - (workspace.project.downPayment ?? 0)
    : workspace.project.grandTotal;
  return { ...workspace, paidTotal: collected, balance: Math.max(0, Math.round((balanceBase - collected) * 100) / 100) };
}

function maxSerial(workspaces: Workspace[]): number {
  return workspaces.reduce((highest, workspace) => Math.max(highest, ...workspace.invoices.map((invoice) => invoice.serialNumber), 0), 0);
}

export function createMemoryDocumentsRepository(projects: QuotationRecord[]): DocumentsRepository {
  const workspaces = new Map<string, Workspace>(projects.map((project) => [project.id, { project, agreement: null, invoices: [], payments: [] }]));

  function requireWorkspace(projectId: string): Workspace {
    const workspace = workspaces.get(projectId);
    if (!workspace) throw new DocumentError("Project was not found.", 404, "not_found");
    return workspace;
  }

  function remember(workspace: Workspace): ReceiveProject {
    workspaces.set(workspace.project.id, workspace);
    return present(workspace);
  }

  return {
    async listAgreements() {
      return [...workspaces.values()].flatMap((workspace) => workspace.agreement ? [workspace.agreement] : []);
    },
    async listGuarantors() {
      return [...workspaces.values()].flatMap((workspace) => workspace.agreement?.guarantors ?? []);
    },
    async listInvoices() {
      return [...workspaces.values()].flatMap((workspace) => workspace.invoices);
    },
    async listReceiveProjects() {
      return [...workspaces.values()].filter((workspace) => workspace.project.status !== "completed").map(present);
    },
    async workspace(projectId) {
      return present(requireWorkspace(projectId));
    },
    async saveAgreement(projectId, input) {
      const saved = remember(createAgreement(requireWorkspace(projectId), input, maxSerial([...workspaces.values()])));
      if (!saved.agreement) throw new DocumentError("The agreement could not be saved.");
      return saved.agreement;
    },
    async recordPayment(projectId, input) {
      const current = requireWorkspace(projectId);
      const reserved = maxSerial([...workspaces.values()]);
      const next = input.kind === "direct"
        ? recordDirectPayment(current, input, reserved)
        : receiveInstallment(current, input, reserved);
      return remember(next);
    },
    async updatePayment(paymentId, input) {
      const current = [...workspaces.values()].find((workspace) => workspace.payments.some((payment) => payment.id === paymentId));
      if (!current) throw new DocumentError("Payment was not found.", 404, "not_found");
      return remember(editPayment(current, paymentId, input, maxSerial([...workspaces.values()])));
    },
    async updateDueDate(projectId, installmentNumber, dueDate) {
      return remember(changeDueDate(requireWorkspace(projectId), installmentNumber, dueDate, maxSerial([...workspaces.values()])));
    },
    async completeProject(projectId) {
      const workspace = requireWorkspace(projectId);
      workspace.project.status = "completed";
      remember(workspace);
    },
    async projectHasDocuments(projectId) {
      const workspace = workspaces.get(projectId);
      return Boolean(workspace && (workspace.agreement || workspace.payments.length > 0 || workspace.invoices.length > 0));
    },
    async listLedger() {
      return toLedger([...workspaces.values()]);
    },
    async summary() {
      return summarizeDocuments([...workspaces.values()]);
    },
    async renameCustomer(projectIds, customerName) {
      const name = customerName.trim();
      if (!name) return;
      const ids = new Set(projectIds);
      for (const workspace of workspaces.values()) {
        if (!ids.has(workspace.project.id)) continue;
        workspace.project = { ...workspace.project, customerName: name };
        if (workspace.agreement) {
          workspace.agreement = {
            ...workspace.agreement,
            project: { ...workspace.agreement.project, customerName: name },
            guarantors: workspace.agreement.guarantors.map((guarantor) => ({ ...guarantor, customerName: name })),
          };
        }
        workspace.invoices = workspace.invoices.map((invoice) => ({
          ...invoice,
          project: { ...invoice.project, customerName: name },
        }));
      }
    },
  };
}

type AgreementRow = {
  id: string;
  project_id: string;
  serial: string;
  payment_mode: "installments" | "direct";
  schedule: ScheduleLine[] | null;
  created_at: string;
};

type GuarantorRow = {
  id: string;
  agreement_id: string;
  project_id: string;
  customer_name: string;
  slot: number;
  full_name: string;
  designation: string;
  occupation: string;
  sector: "private" | "government";
  cnic_front?: string | null;
  cnic_back?: string | null;
};

type InvoiceRow = {
  id: string;
  project_id: string;
  serial: string;
  serial_number: number;
  kind: InvoiceRecord["kind"];
  status: InvoiceRecord["status"];
  invoice_date: string;
  due_date: string | null;
  payment_date: string | null;
  payment_mode: BankMode | null;
  advance_paid: number | string;
  balance_due: number | string;
  grand_total: number | string;
  installment_number: number | null;
};

type PaymentRow = {
  id: string;
  project_id: string;
  invoice_id: string | null;
  installment_number: number | null;
  expected_amount: number | string;
  paid_amount: number | string;
  payment_date: string;
  payment_mode: BankMode;
};

function asNumber(value: number | string | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function guarantorFrom(row: GuarantorRow): GuarantorRecord {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    projectId: row.project_id,
    customerName: row.customer_name,
    slot: row.slot === 1 ? 1 : 2,
    fullName: row.full_name,
    designation: row.designation,
    occupation: row.occupation,
    sector: row.sector,
    cnicFront: row.cnic_front ?? "",
    cnicBack: row.cnic_back ?? "",
  };
}

function paymentFrom(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    invoiceId: row.invoice_id,
    installmentNumber: row.installment_number,
    expectedAmount: asNumber(row.expected_amount),
    paidAmount: asNumber(row.paid_amount),
    paymentDate: row.payment_date,
    paymentMode: row.payment_mode,
  };
}

export function createSupabaseDocumentsRepository(client: SupabaseClient): DocumentsRepository {
  function storageFailure(error: { message: string }, action: string): DocumentError {
    console.error(`Billing document could not be ${action}.`, error.message);
    return new DocumentError("Billing storage is unavailable.", 503, "storage_unavailable");
  }

  async function loadProject(projectId: string): Promise<QuotationRecord> {
    const { data, error } = await client.from("billing_projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle();
    if (error) throw storageFailure(error, "read");
    if (!data) throw new DocumentError("Project was not found.", 404, "not_found");
    return toQuotationRecord(data as Parameters<typeof toQuotationRecord>[0], "project");
  }

  function assembleWorkspace(
    project: QuotationRecord,
    agreementRow: AgreementRow | null,
    guarantorRows: GuarantorRow[],
    invoiceRows: InvoiceRow[],
    paymentRows: PaymentRow[],
  ): Workspace {
    const payments = paymentRows.map(paymentFrom);
    const invoices = invoiceRows.map((row): InvoiceRecord => ({
      id: row.id,
      projectId: row.project_id,
      serial: row.serial,
      serialNumber: row.serial_number,
      kind: row.kind,
      status: row.status,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      paymentDate: row.payment_date,
      paymentMode: row.payment_mode,
      advancePaid: asNumber(row.advance_paid),
      balanceDue: asNumber(row.balance_due),
      grandTotal: asNumber(row.grand_total),
      installmentNumber: row.installment_number,
      payments: payments.filter((payment) => payment.installmentNumber != null
        ? payment.installmentNumber === row.installment_number
        : payment.invoiceId === row.id),
      project,
    }));
    const guarantors = guarantorRows.map(guarantorFrom);
    const agreement: AgreementRecord | null = agreementRow ? {
      id: agreementRow.id,
      projectId: agreementRow.project_id,
      serial: agreementRow.serial,
      paymentMode: agreementRow.payment_mode,
      schedule: Array.isArray(agreementRow.schedule) ? agreementRow.schedule : [],
      guarantors,
      createdAt: agreementRow.created_at,
      project,
    } : null;
    return { project, agreement, invoices, payments };
  }

  async function loadWorkspace(projectId: string): Promise<Workspace> {
    const project = await loadProject(projectId);
    const [agreementResult, guarantorResult, invoiceResult, paymentResult] = await Promise.all([
      client.from("billing_agreements").select("id, project_id, serial, payment_mode, schedule, created_at").eq("project_id", projectId).maybeSingle(),
      client.from("billing_guarantors").select("id, agreement_id, project_id, customer_name, slot, full_name, designation, occupation, sector, cnic_front, cnic_back").eq("project_id", projectId).order("slot"),
      client.from("billing_invoices").select("id, project_id, serial, serial_number, kind, status, invoice_date, due_date, payment_date, payment_mode, advance_paid, balance_due, grand_total, installment_number").eq("project_id", projectId),
      client.from("billing_payments").select("id, project_id, invoice_id, installment_number, expected_amount, paid_amount, payment_date, payment_mode").eq("project_id", projectId),
    ]);
    if (agreementResult.error) throw storageFailure(agreementResult.error, "read");
    if (guarantorResult.error) throw storageFailure(guarantorResult.error, "read");
    if (invoiceResult.error) throw storageFailure(invoiceResult.error, "read");
    if (paymentResult.error) throw storageFailure(paymentResult.error, "read");
    return assembleWorkspace(
      project,
      agreementResult.data as AgreementRow | null,
      (guarantorResult.data ?? []) as GuarantorRow[],
      (invoiceResult.data ?? []) as InvoiceRow[],
      (paymentResult.data ?? []) as PaymentRow[],
    );
  }

  async function reservedSerial(): Promise<number> {
    const { data, error } = await client.from("billing_invoices").select("serial_number").order("serial_number", { ascending: false }).limit(1).maybeSingle();
    if (error) throw storageFailure(error, "numbered");
    return data?.serial_number ?? 0;
  }

  async function persist(previous: Workspace, next: Workspace, includeAgreement: boolean): Promise<void> {
    if (includeAgreement && next.agreement) {
      const saved = await client.from("billing_agreements").upsert({
        id: next.agreement.id,
        project_id: next.project.id,
        serial: next.agreement.serial,
        payment_mode: next.agreement.paymentMode,
        schedule: next.agreement.schedule,
        created_at: next.agreement.createdAt,
      });
      if (saved.error) throw storageFailure(saved.error, "saved");
      if (next.agreement.guarantors.length > 0) {
        const people = await client.from("billing_guarantors").upsert(next.agreement.guarantors.map((guarantor) => ({
          id: guarantor.id,
          agreement_id: guarantor.agreementId,
          project_id: guarantor.projectId,
          customer_name: guarantor.customerName,
          slot: guarantor.slot,
          full_name: guarantor.fullName,
          designation: guarantor.designation,
          occupation: guarantor.occupation,
          sector: guarantor.sector,
          cnic_front: guarantor.cnicFront,
          cnic_back: guarantor.cnicBack,
        })));
        if (people.error) throw storageFailure(people.error, "saved");
      }
    } else if (next.agreement) {
      const schedule = await client.from("billing_agreements").update({ schedule: next.agreement.schedule }).eq("id", next.agreement.id);
      if (schedule.error) throw storageFailure(schedule.error, "updated");
    }

    const projectId = next.project.id;
    const invoiceIds = next.invoices.map((invoice) => invoice.id);
    const paymentIds = next.payments.map((payment) => payment.id);
    const removedPayments = paymentIds.length === 0
      ? await client.from("billing_payments").delete().eq("project_id", projectId)
      : await client.from("billing_payments").delete().eq("project_id", projectId).not("id", "in", `(${paymentIds.join(",")})`);
    if (removedPayments.error) throw storageFailure(removedPayments.error, "updated");
    const removedInvoices = invoiceIds.length === 0
      ? await client.from("billing_invoices").delete().eq("project_id", projectId)
      : await client.from("billing_invoices").delete().eq("project_id", projectId).not("id", "in", `(${invoiceIds.join(",")})`);
    if (removedInvoices.error) throw storageFailure(removedInvoices.error, "updated");
    if (next.invoices.length > 0) {
      const invoices = await client.from("billing_invoices").upsert(next.invoices.map((invoice) => ({
        id: invoice.id,
        project_id: invoice.projectId,
        serial: invoice.serial,
        serial_number: invoice.serialNumber,
        kind: invoice.kind,
        status: invoice.status,
        invoice_date: invoice.invoiceDate,
        due_date: invoice.dueDate,
        payment_date: invoice.paymentDate,
        payment_mode: invoice.paymentMode,
        advance_paid: invoice.advancePaid,
        balance_due: invoice.balanceDue,
        grand_total: invoice.grandTotal,
        installment_number: invoice.installmentNumber,
        updated_at: new Date().toISOString(),
      })));
      if (invoices.error) throw storageFailure(invoices.error, "saved");
    }
    if (next.payments.length > 0) {
      const payments = await client.from("billing_payments").upsert(next.payments.map((payment) => ({
        id: payment.id,
        project_id: payment.projectId,
        invoice_id: payment.invoiceId,
        installment_number: payment.installmentNumber,
        expected_amount: payment.expectedAmount,
        paid_amount: payment.paidAmount,
        payment_date: payment.paymentDate,
        payment_mode: payment.paymentMode,
        updated_at: new Date().toISOString(),
      })));
      if (payments.error) throw storageFailure(payments.error, "saved");
    }
    void previous;
  }

  function groupByProject<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const list = grouped.get(row.project_id) ?? [];
      list.push(row);
      grouped.set(row.project_id, list);
    }
    return grouped;
  }

  async function listedWorkspaces(guarantorsMode: "full" | "names" | "none"): Promise<Workspace[]> {
    const { data, error } = await client.from("billing_projects").select(PROJECT_SELECT).order("created_at", { ascending: false });
    if (error) throw storageFailure(error, "listed");
    const projects = ((data ?? []) as Parameters<typeof toQuotationRecord>[0][]).map((row) => toQuotationRecord(row, "project"));
    if (projects.length === 0) return [];
    const ids = projects.map((project) => project.id);
    const [agreementResult, guarantorResult, invoiceResult, paymentResult] = await Promise.all([
      client.from("billing_agreements").select("id, project_id, serial, payment_mode, schedule, created_at").in("project_id", ids),
      guarantorsMode === "none"
        ? Promise.resolve({ data: [] as GuarantorRow[], error: null })
        : client.from("billing_guarantors").select(guarantorsMode === "full"
          ? "id, agreement_id, project_id, customer_name, slot, full_name, designation, occupation, sector, cnic_front, cnic_back"
          : "id, agreement_id, project_id, customer_name, slot, full_name, designation, occupation, sector").in("project_id", ids).order("slot"),
      client.from("billing_invoices").select("id, project_id, serial, serial_number, kind, status, invoice_date, due_date, payment_date, payment_mode, advance_paid, balance_due, grand_total, installment_number").in("project_id", ids),
      client.from("billing_payments").select("id, project_id, invoice_id, installment_number, expected_amount, paid_amount, payment_date, payment_mode").in("project_id", ids),
    ]);
    if (agreementResult.error) throw storageFailure(agreementResult.error, "listed");
    if (guarantorResult.error) throw storageFailure(guarantorResult.error, "listed");
    if (invoiceResult.error) throw storageFailure(invoiceResult.error, "listed");
    if (paymentResult.error) throw storageFailure(paymentResult.error, "listed");
    const agreements = new Map(((agreementResult.data ?? []) as AgreementRow[]).map((row) => [row.project_id, row]));
    const guarantors = groupByProject((guarantorResult.data ?? []) as GuarantorRow[]);
    const invoices = groupByProject((invoiceResult.data ?? []) as InvoiceRow[]);
    const payments = groupByProject((paymentResult.data ?? []) as PaymentRow[]);
    return projects.map((project) => assembleWorkspace(
      project,
      agreements.get(project.id) ?? null,
      guarantors.get(project.id) ?? [],
      invoices.get(project.id) ?? [],
      payments.get(project.id) ?? [],
    ));
  }

  async function listLedgerRows(): Promise<LedgerEntry[]> {
    const { data, error } = await client
      .from("billing_payments")
      .select("id, project_id, invoice_id, installment_number, paid_amount, payment_date, payment_mode")
      .order("payment_date", { ascending: true });
    if (error) throw storageFailure(error, "listed");
    const payments = (data ?? []) as Array<{
      id: string;
      project_id: string;
      invoice_id: string | null;
      installment_number: number | null;
      paid_amount: number | string;
      payment_date: string;
      payment_mode: BankMode;
    }>;
    if (payments.length === 0) return [];
    const projectIds = [...new Set(payments.map((row) => row.project_id))];
    const [projectResult, invoiceResult] = await Promise.all([
      client.from("billing_projects").select("id, customer_name, cnic, serial").in("id", projectIds),
      client.from("billing_invoices").select("id, project_id, serial, installment_number").in("project_id", projectIds),
    ]);
    if (projectResult.error) throw storageFailure(projectResult.error, "listed");
    if (invoiceResult.error) throw storageFailure(invoiceResult.error, "listed");
    const projects = new Map(((projectResult.data ?? []) as Array<{ id: string; customer_name: string; cnic: string; serial: string }>).map((row) => [row.id, row]));
    const invoices = groupByProject((invoiceResult.data ?? []) as Array<{ id: string; project_id: string; serial: string; installment_number: number | null }>);
    const entries = payments.map((payment): LedgerEntry => {
      const project = projects.get(payment.project_id);
      const invoice = (invoices.get(payment.project_id) ?? []).find((entry) => (
        payment.invoice_id
          ? entry.id === payment.invoice_id
          : payment.installment_number != null && entry.installment_number === payment.installment_number
      ));
      return {
        id: payment.id,
        paymentDate: payment.payment_date,
        paidAmount: asNumber(payment.paid_amount),
        paymentMode: payment.payment_mode,
        installmentNumber: payment.installment_number,
        customerName: project?.customer_name ?? "",
        cnic: project?.cnic ?? "",
        projectId: payment.project_id,
        projectSerial: project?.serial ?? "",
        invoiceSerial: invoice?.serial ?? null,
      };
    });
    return entries.sort((left, right) => left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id));
  }

  return {
    async listAgreements(includeImages = true) {
      return (await listedWorkspaces(includeImages ? "full" : "names")).flatMap((workspace) => workspace.agreement ? [workspace.agreement] : []);
    },
    async listGuarantors() {
      return (await listedWorkspaces("full")).flatMap((workspace) => workspace.agreement?.guarantors ?? []);
    },
    async listInvoices() {
      return (await listedWorkspaces("none")).flatMap((workspace) => workspace.invoices);
    },
    async listReceiveProjects() {
      return (await listedWorkspaces("none")).filter((workspace) => workspace.project.status !== "completed").map(present);
    },
    async workspace(projectId) {
      return present(await loadWorkspace(projectId));
    },
    async saveAgreement(projectId, input) {
      const current = await loadWorkspace(projectId);
      const next = createAgreement(current, input, await reservedSerial());
      await persist(current, next, true);
      if (!next.agreement) throw new DocumentError("The agreement could not be saved.");
      return next.agreement;
    },
    async recordPayment(projectId, input) {
      const current = await loadWorkspace(projectId);
      const reserved = await reservedSerial();
      const next = input.kind === "direct" ? recordDirectPayment(current, input, reserved) : receiveInstallment(current, input, reserved);
      await persist(current, next, false);
      return present(next);
    },
    async updatePayment(paymentId, input) {
      const found = await client.from("billing_payments").select("project_id").eq("id", paymentId).maybeSingle();
      if (found.error) throw storageFailure(found.error, "read");
      const projectId = found.data?.project_id;
      if (typeof projectId !== "string") throw new DocumentError("Payment was not found.", 404, "not_found");
      const current = await loadWorkspace(projectId);
      const next = editPayment(current, paymentId, input, await reservedSerial());
      await persist(current, next, false);
      return present(next);
    },
    async updateDueDate(projectId, installmentNumber, dueDate) {
      const current = await loadWorkspace(projectId);
      const next = changeDueDate(current, installmentNumber, dueDate, await reservedSerial());
      await persist(current, next, false);
      return present(next);
    },
    async completeProject(projectId) {
      await loadProject(projectId);
      const updated = await client.from("billing_projects").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", projectId);
      if (updated.error) throw storageFailure(updated.error, "completed");
    },
    async projectHasDocuments(projectId) {
      const [agreements, payments] = await Promise.all([
        client.from("billing_agreements").select("id").eq("project_id", projectId).limit(1),
        client.from("billing_payments").select("id").eq("project_id", projectId).limit(1),
      ]);
      if (agreements.error) throw storageFailure(agreements.error, "read");
      if (payments.error) throw storageFailure(payments.error, "read");
      return (agreements.data?.length ?? 0) > 0 || (payments.data?.length ?? 0) > 0;
    },
    async listLedger() {
      return listLedgerRows();
    },
    async summary() {
      const today = todayIso();
      const [projectResult, invoiceResult, agreementResult, entries] = await Promise.all([
        client.from("billing_projects").select("status"),
        client.from("billing_invoices").select("status"),
        client.from("billing_agreements").select("schedule"),
        listLedgerRows(),
      ]);
      if (projectResult.error) throw storageFailure(projectResult.error, "listed");
      if (invoiceResult.error) throw storageFailure(invoiceResult.error, "listed");
      if (agreementResult.error) throw storageFailure(agreementResult.error, "listed");
      const projects = (projectResult.data ?? []) as Array<{ status: string | null }>;
      const invoices = (invoiceResult.data ?? []) as Array<{ status: string | null }>;
      const agreements = (agreementResult.data ?? []) as Array<{ schedule: ScheduleLine[] | null }>;
      let overdueInstallments = 0;
      for (const agreement of agreements) {
        for (const line of Array.isArray(agreement.schedule) ? agreement.schedule : []) {
          if (line.status === "due" && line.dueDate < today) overdueInstallments += 1;
        }
      }
      const receivedTotal = Math.round(entries.reduce((sum, entry) => sum + entry.paidAmount, 0) * 100) / 100;
      return {
        projectsInProcess: projects.filter((project) => project.status !== "completed").length,
        openInvoices: invoices.filter((invoice) => invoice.status !== "paid").length,
        overdueInstallments,
        receivedTotal,
        paymentCount: entries.length,
        recent: entries.slice(-5).reverse(),
      };
    },
    async renameCustomer(projectIds, customerName) {
      const name = customerName.trim();
      if (!name || projectIds.length === 0) return;
      const updated = await client.from("billing_guarantors").update({ customer_name: name }).in("project_id", projectIds);
      if (updated.error) throw storageFailure(updated.error, "updated");
    },
  };
}

let cached: DocumentsRepository | null = null;

export function getDocumentsRepository(): DocumentsRepository {
  if (!cached) cached = createSupabaseDocumentsRepository(getSupabaseClient());
  return cached;
}
