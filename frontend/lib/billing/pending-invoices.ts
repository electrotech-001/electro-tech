import type { InvoiceRecord, PaymentRecord } from "./documents-api";
import type { QuotationRecord } from "./quotation-math";

export function stillOpen(invoice: InvoiceRecord): boolean {
  return invoice.balanceDue > 0 || invoice.status !== "paid";
}

export function installmentDueDate(invoice: InvoiceRecord): string | null {
  if (invoice.installmentNumber == null) return null;
  const line = invoice.schedule?.find((entry) => entry.number === invoice.installmentNumber);
  return invoice.dueDate || line?.dueDate || null;
}

export function plannedInvoice(invoice: InvoiceRecord): boolean {
  return invoice.id.startsWith("plan-");
}

export function consolidatedInvoice(invoice: InvoiceRecord): boolean {
  return invoice.id.startsWith("done-");
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniquePayments(payments: PaymentRecord[]): PaymentRecord[] {
  return [...new Map(payments.map((payment) => [payment.id, payment])).values()]
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id));
}

function consolidate(group: InvoiceRecord[]): InvoiceRecord {
  const ordered = [...group].sort((left, right) => (left.installmentNumber ?? 0) - (right.installmentNumber ?? 0) || left.serialNumber - right.serialNumber);
  const first = ordered[0] as InvoiceRecord;
  const last = ordered[ordered.length - 1] as InvoiceRecord;
  const project = first.project;
  const installments = ordered.filter((invoice) => invoice.installmentNumber != null);
  const opening = ordered.filter((invoice) => invoice.installmentNumber == null);
  const payments = uniquePayments(installments.flatMap((invoice) => invoice.payments));
  const openingPayments = uniquePayments([...opening.flatMap((invoice) => invoice.payments), ...installments.flatMap((invoice) => invoice.openingPayments ?? [])]);
  const received = [...payments, ...openingPayments];
  const latest = received.at(-1);
  return {
    ...first,
    id: `done-${project.id}`,
    serial: first.serial === last.serial ? first.serial : `${first.serial} – ${last.serial}`,
    kind: "settlement",
    status: "paid",
    dueDate: null,
    paymentDate: latest?.paymentDate ?? null,
    paymentMode: latest?.paymentMode ?? null,
    advancePaid: money(received.reduce((sum, payment) => sum + payment.paidAmount, 0)),
    balanceDue: 0,
    grandTotal: project.grandTotal,
    discountAmount: money((project.planDiscount ?? 0) + ordered.reduce((sum, invoice) => sum + (invoice.discountAmount ?? 0), 0)),
    installmentNumber: null,
    payments,
    openingPayments,
    schedule: installments.find((invoice) => invoice.schedule && invoice.schedule.length > 0)?.schedule,
  };
}

export function groupInvoices(invoices: InvoiceRecord[]): { open: InvoiceRecord[]; completed: InvoiceRecord[] } {
  const open: InvoiceRecord[] = [];
  const completed: InvoiceRecord[] = [];
  const plans = new Map<string, InvoiceRecord[]>();
  for (const invoice of invoices) {
    if (invoice.project.paymentMode === "installments") {
      plans.set(invoice.projectId, [...(plans.get(invoice.projectId) ?? []), invoice]);
    } else if (stillOpen(invoice)) open.push(invoice);
    else completed.push(invoice);
  }
  for (const group of plans.values()) {
    const project = group[0]?.project;
    const expected = project?.installments.length ?? 0;
    const invoiced = new Set(group.map((invoice) => invoice.installmentNumber).filter((number) => number != null)).size;
    if (group.some(stillOpen) || invoiced < expected) open.push(...group);
    else completed.push(consolidate(group));
  }
  return { open, completed };
}

function balanceInvoice(
  project: QuotationRecord,
  input: { id: string; serial: string; serialNumber: number; kind: InvoiceRecord["kind"]; amount: number; installmentNumber: number | null },
): InvoiceRecord {
  return {
    id: input.id,
    projectId: project.id,
    serial: input.serial,
    serialNumber: input.serialNumber,
    kind: input.kind,
    status: "due",
    invoiceDate: project.quotationDate,
    dueDate: input.installmentNumber == null ? null : project.installmentDueDates?.[input.installmentNumber - 1] || null,
    paymentDate: null,
    paymentMode: null,
    advancePaid: 0,
    balanceDue: input.amount,
    grandTotal: input.amount,
    discountAmount: 0,
    installmentNumber: input.installmentNumber,
    payments: [],
    project,
  };
}

function invoiceSerial(serialNumber: number): string {
  return `INV-${String(serialNumber).padStart(3, "0")}`;
}

export function outstandingBalances(projects: QuotationRecord[], invoices: InvoiceRecord[]): InvoiceRecord[] {
  let serialNumber = invoices.reduce((highest, invoice) => Math.max(highest, invoice.serialNumber), 0);
  const extras: InvoiceRecord[] = [];
  for (const project of projects) {
    if (project.status === "completed" || project.origin === "direct_sale") continue;
    const mine = invoices.filter((invoice) => invoice.projectId === project.id);
    const saved = mine.filter((invoice) => !invoice.id.startsWith("plan-"));
    if (project.paymentMode === "installments" && saved.length === 0 && (project.installmentCount ?? 0) > 0) {
      for (const line of project.installments) {
        if (mine.some((invoice) => invoice.installmentNumber === line.number)) continue;
        serialNumber += 1;
        extras.push(balanceInvoice(project, {
          id: `plan-${project.id}-${line.number}`,
          serial: invoiceSerial(serialNumber),
          serialNumber,
          kind: "installment",
          amount: line.amount,
          installmentNumber: line.number,
        }));
      }
    }
  }
  return extras;
}
