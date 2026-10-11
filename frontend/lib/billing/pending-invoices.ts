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
  input: { id: string; serial: string; kind: InvoiceRecord["kind"]; amount: number; installmentNumber: number | null },
): InvoiceRecord {
  return {
    id: input.id,
    projectId: project.id,
    serial: input.serial,
    serialNumber: 0,
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

export function outstandingBalances(projects: QuotationRecord[], invoices: InvoiceRecord[]): InvoiceRecord[] {
  const extras: InvoiceRecord[] = [];
  for (const project of projects) {
    if (project.status === "completed") continue;
    const mine = invoices.filter((invoice) => invoice.projectId === project.id);
    if (project.paymentMode === "installments") {
      for (const line of project.installments) {
        if (mine.some((invoice) => invoice.installmentNumber === line.number)) continue;
        extras.push(balanceInvoice(project, {
          id: `plan-${project.id}-${line.number}`,
          serial: `${project.serial} installment ${line.number}`,
          kind: "installment",
          amount: line.amount,
          installmentNumber: line.number,
        }));
      }
    } else if (mine.length === 0 && project.grandTotal > 0) {
      extras.push(balanceInvoice(project, {
        id: `plan-${project.id}-balance`,
        serial: `${project.serial} invoice`,
        kind: "advance",
        amount: project.grandTotal,
        installmentNumber: null,
      }));
    }
  }
  return extras;
}
