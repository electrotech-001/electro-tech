import type { InvoiceRecord } from "./documents-api";
import type { QuotationRecord } from "./quotation-math";

export function stillOpen(invoice: InvoiceRecord): boolean {
  return invoice.balanceDue > 0 || invoice.status !== "paid";
}

export function plannedInvoice(invoice: InvoiceRecord): boolean {
  return invoice.id.startsWith("plan-");
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
    dueDate: null,
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
