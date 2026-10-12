import { installmentBalance, planDiscountOf, roundMoney, splitInstallments } from "./quotation-math.js";
import type { QuotationRecord } from "./quotation-store.js";

export type BankMode = "bank_transfer" | "cash";
export type GuarantorSector = "private" | "government";

export type GuarantorInput = {
  fullName: string;
  designation: string;
  occupation: string;
  sector: GuarantorSector;
  contactNo: string;
  cnic: string;
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
  discountAmount: number;
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
  discountAmount: number;
  paymentDate: string;
  paymentMode: BankMode;
};

export type OpeningReceipt = {
  paidAmount: number;
  paymentDate: string;
  paymentMode: BankMode;
};

export type InvoiceKind = "advance" | "settlement" | "installment";

export type InvoiceRecord = {
  id: string;
  projectId: string;
  serial: string;
  serialNumber: number;
  kind: InvoiceKind;
  status: "partial" | "paid" | "due";
  invoiceDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMode: BankMode | null;
  advancePaid: number;
  balanceDue: number;
  grandTotal: number;
  discountAmount: number;
  installmentNumber: number | null;
  payments: PaymentRecord[];
  openingPayments?: PaymentRecord[];
  schedule?: ScheduleLine[];
  project: QuotationRecord;
};

export type AgreementRecord = {
  id: string;
  projectId: string;
  serial: string;
  paymentMode: QuotationRecord["paymentMode"];
  schedule: ScheduleLine[];
  guarantors: GuarantorRecord[];
  body: string | null;
  createdAt: string;
  project: QuotationRecord;
};

export type Workspace = {
  project: QuotationRecord;
  agreement: AgreementRecord | null;
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const CNIC = /^\d{5}-\d{7}-\d$/;
const PHONE = /^\d{4}-\d{7}$/;

export class DocumentError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "invalid_document") {
    super(message);
    this.name = "DocumentError";
    this.status = status;
    this.code = code;
  }
}

export function agreementSerial(project: QuotationRecord): string {
  return `AG-${String(project.serialNumber).padStart(3, "0")}`;
}

export function invoiceSerial(serialNumber: number): string {
  return `INV-${String(serialNumber).padStart(3, "0")}`;
}

function assertDate(value: string, label: string): void {
  if (!DATE.test(value)) throw new DocumentError(`Choose a valid ${label}.`);
}

function assertImage(value: string, label: string): void {
  if (!IMAGE.test(value)) throw new DocumentError(`${label} must be a PNG or JPEG photo.`);
  if (value.length > 1_800_000) throw new DocumentError(`${label} is too large. Use a photo under 1 MB.`);
}

export function guarantorIsBlank(input: GuarantorInput): boolean {
  return !input.fullName.trim()
    && !input.designation.trim()
    && !input.occupation.trim()
    && !input.contactNo.trim()
    && !input.cnic.trim()
    && !input.cnicFront.trim()
    && !input.cnicBack.trim();
}

export function assertGuarantor(input: GuarantorInput, slot: number): GuarantorInput {
  const clean: GuarantorInput = {
    fullName: input.fullName.trim(),
    designation: input.designation.trim(),
    occupation: input.occupation.trim(),
    sector: input.sector === "government" ? "government" : "private",
    contactNo: input.contactNo.trim(),
    cnic: input.cnic.trim(),
    cnicFront: input.cnicFront.trim(),
    cnicBack: input.cnicBack.trim(),
  };
  if (clean.contactNo && !PHONE.test(clean.contactNo)) {
    throw new DocumentError(`Enter guarantor ${slot} contact number as 0300-0000000.`);
  }
  if (clean.cnic && !CNIC.test(clean.cnic)) {
    throw new DocumentError(`Enter guarantor ${slot} CNIC as 00000-0000000-0.`);
  }
  if (clean.cnicFront) assertImage(clean.cnicFront, `Guarantor ${slot} CNIC front`);
  if (clean.cnicBack) assertImage(clean.cnicBack, `Guarantor ${slot} CNIC back`);
  return clean;
}

export function prepareGuarantors(inputs: GuarantorInput[]): GuarantorInput[] {
  const filled = inputs.filter((input) => !guarantorIsBlank(input));
  if (filled.length > 1) throw new DocumentError("Only one guarantor can be saved.");
  return filled.map((input) => assertGuarantor(input, 1));
}

export function buildSchedule(project: QuotationRecord, dueDates: string[]): ScheduleLine[] {
  const count = project.installmentCount ?? 0;
  if (project.paymentMode !== "installments" || count < 1) {
    throw new DocumentError("Installment dates are only used for an installment plan.");
  }
  if (dueDates.length !== count) throw new DocumentError(`Enter a due date for each of the ${count} installments.`);
  dueDates.forEach((date, index) => assertDate(date, `installment ${index + 1} due date`));
  return project.installments.map((line, index) => ({
    number: line.number,
    dueDate: dueDates[index] ?? "",
    amount: line.amount,
    status: "due" as const,
    paidAmount: 0,
    discountAmount: 0,
    paidDate: null,
    paymentMode: null,
  }));
}

export function normalizeDiscount(value: number | undefined): number {
  const amount = roundMoney(Number(value ?? 0));
  if (!Number.isFinite(amount) || amount < 0) throw new DocumentError("Enter a discount of zero or more.");
  return amount;
}

function assertSettlement(amount: number, discount: number): void {
  if (!(amount > 0) && !(discount > 0)) throw new DocumentError("Enter the paid amount or a discount.");
}

export function discountTotal(payments: PaymentRecord[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + (payment.discountAmount ?? 0), 0));
}

function paymentDiscountFor(payments: PaymentRecord[], installmentNumber: number): number {
  return roundMoney(payments.filter((payment) => payment.installmentNumber === installmentNumber).reduce((sum, payment) => sum + (payment.discountAmount ?? 0), 0));
}

function cashFor(payments: PaymentRecord[], installmentNumber: number): number {
  return roundMoney(payments.filter((payment) => payment.installmentNumber === installmentNumber).reduce((sum, payment) => sum + payment.paidAmount, 0));
}

function installmentPending(line: ScheduleLine, payments: PaymentRecord[]): number {
  return roundMoney(Math.max(0, line.amount - (line.discountAmount ?? 0) - cashFor(payments, line.number) - paymentDiscountFor(payments, line.number)));
}

function refreshInstallment(line: ScheduleLine, payments: PaymentRecord[]): ScheduleLine {
  const cash = cashFor(payments, line.number);
  const paymentDiscount = paymentDiscountFor(payments, line.number);
  const covered = roundMoney(cash + paymentDiscount + (line.discountAmount ?? 0));
  const latest = payments
    .filter((payment) => payment.installmentNumber === line.number)
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id))
    .at(-1);
  return {
    ...line,
    paidAmount: cash,
    status: covered > 0 && roundMoney(line.amount - covered) <= 0 ? "paid" : "due",
    paidDate: latest?.paymentDate ?? null,
    paymentMode: latest?.paymentMode ?? null,
  };
}

export function paidTotal(payments: PaymentRecord[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + payment.paidAmount, 0));
}

export function keepInstallmentAmounts(project: QuotationRecord, schedule: ScheduleLine[], payments: PaymentRecord[]): ScheduleLine[] {
  return schedule.map((line) => {
    const planned = project.installments.find((item) => item.number === line.number)?.amount;
    const amount = planned != null && planned > 0 ? planned : line.amount;
    return refreshInstallment({ ...line, amount }, payments);
  });
}

function blankInvoice(project: QuotationRecord, serialNumber: number, kind: InvoiceKind): InvoiceRecord {
  return {
    id: crypto.randomUUID(),
    projectId: project.id,
    serial: invoiceSerial(serialNumber),
    serialNumber,
    kind,
    status: "due",
    invoiceDate: project.quotationDate,
    dueDate: null,
    paymentDate: null,
    paymentMode: null,
    advancePaid: 0,
    balanceDue: 0,
    grandTotal: project.grandTotal,
    discountAmount: 0,
    installmentNumber: null,
    payments: [],
    project,
  };
}

function nextSerial(invoices: InvoiceRecord[], reserved: number): number {
  return Math.max(reserved, ...invoices.map((invoice) => invoice.serialNumber), 0) + 1;
}

function openingFace(project: QuotationRecord): number {
  return roundMoney(Math.max(0, project.downPayment ?? 0));
}

function openingPayments(payments: PaymentRecord[]): PaymentRecord[] {
  return payments.filter((payment) => payment.installmentNumber == null);
}

function openingSettled(payments: PaymentRecord[]): number {
  return roundMoney(openingPayments(payments).reduce((sum, payment) => sum + payment.paidAmount + (payment.discountAmount ?? 0), 0));
}

function stampOpeningPayments(workspace: Workspace): Workspace {
  const received = openingPayments(workspace.payments).filter((payment) => payment.paidAmount > 0 || (payment.discountAmount ?? 0) > 0);
  return {
    ...workspace,
    invoices: workspace.invoices.map((invoice) => invoice.kind === "installment" ? { ...invoice, openingPayments: received } : invoice),
  };
}

function readOpening(receipt: OpeningReceipt | null | undefined, cap: number, overMessage: string): { amount: number; paymentDate: string; paymentMode: BankMode } | null {
  if (!receipt) return null;
  const amount = roundMoney(Number(receipt.paidAmount));
  if (!Number.isFinite(amount) || amount < 0) throw new DocumentError("Enter a valid amount.");
  if (!(amount > 0)) return null;
  if (amount > cap) throw new DocumentError(overMessage);
  assertDate(receipt.paymentDate, "payment date");
  if (receipt.paymentMode !== "bank_transfer" && receipt.paymentMode !== "cash") throw new DocumentError("Choose bank transfer or cash.");
  return { amount, paymentDate: receipt.paymentDate, paymentMode: receipt.paymentMode };
}

function latestPayment(payments: PaymentRecord[]): PaymentRecord | undefined {
  return [...payments].sort((left, right) => left.paymentDate.localeCompare(right.paymentDate) || left.id.localeCompare(right.id)).at(-1);
}

function paintInvoice(base: InvoiceRecord, face: number, payments: PaymentRecord[], invoiceDiscount: number): InvoiceRecord {
  const paid = paidTotal(payments);
  const relief = roundMoney(discountTotal(payments) + invoiceDiscount);
  const balance = roundMoney(Math.max(0, face - paid - relief));
  const covered = paid > 0 || relief > 0;
  const latest = latestPayment(payments);
  return {
    ...base,
    grandTotal: face,
    advancePaid: paid,
    balanceDue: balance,
    discountAmount: invoiceDiscount,
    status: balance <= 0 && covered ? "paid" : covered ? "partial" : "due",
    paymentDate: latest?.paymentDate ?? null,
    paymentMode: latest?.paymentMode ?? null,
    payments,
  };
}

export function attachOpeningInvoice(workspace: Workspace, _reservedSerial: number): Workspace {
  if (workspace.project.paymentMode !== "installments") return workspace;
  const others = workspace.invoices.filter((invoice) => invoice.kind !== "advance");
  const existing = workspace.invoices.find((invoice) => invoice.kind === "advance");
  if (!existing) return stampOpeningPayments({ ...workspace, invoices: others });
  const face = openingFace(workspace.project);
  const payments = openingPayments(workspace.payments).map((payment) => ({ ...payment, invoiceId: existing.id }));
  const kept = workspace.payments.filter((payment) => payment.installmentNumber != null);
  const invoice = paintInvoice({ ...existing, kind: "advance", installmentNumber: null, project: workspace.project }, face > 0 ? face : existing.grandTotal, payments, existing.discountAmount ?? 0);
  return stampOpeningPayments({ ...workspace, payments: [...kept, ...payments], invoices: [...others, invoice] });
}

function syncWithOpening(workspace: Workspace, schedule: ScheduleLine[], reservedSerial: number): Workspace {
  const installmentInvoices = syncInstallmentInvoices(workspace, schedule, reservedSerial);
  const opening = workspace.invoices.find((invoice) => invoice.kind === "advance");
  return attachOpeningInvoice({
    ...workspace,
    invoices: opening ? [...installmentInvoices, opening] : installmentInvoices,
  }, reservedSerial);
}

export function issueDirectInvoice(workspace: Workspace, reservedSerial: number, invoiceDate: string, receipt?: OpeningReceipt | null): Workspace {
  if (workspace.project.paymentMode !== "direct") {
    throw new DocumentError("Installment invoices are created from the installment details.");
  }
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  if (workspace.invoices.length > 0) throw new DocumentError("An invoice is already created for this project.", 409, "already_invoiced");
  assertDate(invoiceDate, "invoice date");
  const opening = readOpening(receipt, workspace.project.grandTotal, "Advance payment cannot be more than the total amount.");
  const created = { ...blankInvoice(workspace.project, nextSerial([], reservedSerial), "advance"), invoiceDate };
  const payment: PaymentRecord | null = opening ? {
    id: crypto.randomUUID(),
    projectId: workspace.project.id,
    invoiceId: created.id,
    installmentNumber: null,
    expectedAmount: workspace.project.grandTotal,
    paidAmount: opening.amount,
    discountAmount: 0,
    paymentDate: opening.paymentDate,
    paymentMode: opening.paymentMode,
  } : null;
  return rebuildDirectInvoices({
    ...workspace,
    invoices: [created],
    payments: payment ? [...workspace.payments, payment] : workspace.payments,
  }, reservedSerial);
}

export function rebuildDirectInvoices(workspace: Workspace, reservedSerial: number): Workspace {
  const payments = [...workspace.payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
  const total = paidTotal(payments);
  const directInvoices = workspace.invoices.filter((invoice) => invoice.kind !== "installment");
  const existing = directInvoices.find((invoice) => invoice.kind === "advance") ?? directInvoices[0];
  const invoiceDiscount = roundMoney(directInvoices.reduce((sum, invoice) => sum + (invoice.discountAmount ?? 0), 0));
  const relief = roundMoney(invoiceDiscount + discountTotal(payments));
  const balance = roundMoney(Math.max(0, workspace.project.grandTotal - total - relief));
  const paymentDiscount = discountTotal(payments);
  if (!existing && total <= 0 && invoiceDiscount <= 0 && paymentDiscount <= 0) return { ...workspace, invoices: [], payments };
  const invoice = existing ?? blankInvoice(workspace.project, nextSerial([], reservedSerial), "advance");
  const latest = payments[payments.length - 1];
  const linked = payments.map((payment) => ({ ...payment, invoiceId: invoice.id, installmentNumber: null }));
  const covered = total > 0 || invoiceDiscount > 0 || paymentDiscount > 0;
  return {
    ...workspace,
    payments: linked,
    invoices: [{
      ...invoice,
      project: workspace.project,
      kind: "advance",
      status: balance <= 0 && covered ? "paid" : (total > 0 || paymentDiscount > 0) ? "partial" : "due",
      advancePaid: total,
      balanceDue: balance,
      grandTotal: workspace.project.grandTotal,
      discountAmount: invoiceDiscount,
      paymentDate: latest?.paymentDate ?? null,
      paymentMode: latest?.paymentMode ?? null,
      payments: linked,
    }],
  };
}

export function deleteInvoice(workspace: Workspace, invoiceId: string): Workspace {
  const invoice = workspace.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) throw new DocumentError("Invoice was not found.", 404, "not_found");
  if (invoice.kind === "installment" && workspace.agreement && invoice.installmentNumber != null) {
    const number = invoice.installmentNumber;
    const payments = workspace.payments.filter((payment) => payment.installmentNumber !== number && payment.invoiceId !== invoiceId);
    const schedule = keepInstallmentAmounts(workspace.project, workspace.agreement.schedule.filter((line) => line.number !== number), payments);
    const next: Workspace = {
      ...workspace,
      payments,
      agreement: { ...workspace.agreement, schedule },
    };
    return syncWithOpening(next, schedule, 0);
  }
  if (invoice.kind === "advance" && workspace.project.paymentMode === "installments") {
    return {
      ...workspace,
      invoices: workspace.invoices.filter((entry) => entry.id !== invoiceId),
      payments: workspace.payments.filter((payment) => payment.installmentNumber != null && payment.invoiceId !== invoiceId),
    };
  }
  const opening = openingFace(workspace.project);
  if (workspace.project.paymentMode === "direct" && opening > 0 && opening < workspace.project.grandTotal) {
    return {
      ...workspace,
      invoices: workspace.invoices.filter((entry) => entry.id !== invoiceId),
      payments: workspace.payments.filter((payment) => payment.invoiceId !== invoiceId),
    };
  }
  return {
    ...workspace,
    invoices: workspace.invoices.filter((entry) => entry.id !== invoiceId),
    payments: invoice.kind === "installment"
      ? workspace.payments.filter((payment) => payment.invoiceId !== invoiceId && payment.installmentNumber !== invoice.installmentNumber)
      : [],
  };
}

export function recordDirectPayment(
  workspace: Workspace,
  input: { paidAmount: number; discountAmount?: number; paymentDate: string; paymentMode: BankMode },
  reservedSerial: number,
): Workspace {
  if (workspace.project.paymentMode !== "direct") throw new DocumentError("This project uses installments. Receive the installment instead.");
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  assertDate(input.paymentDate, "payment date");
  if (input.paymentMode !== "bank_transfer" && input.paymentMode !== "cash") throw new DocumentError("Choose bank transfer or cash.");
  const amount = roundMoney(input.paidAmount);
  const discount = normalizeDiscount(input.discountAmount);
  const invoiceDiscount = workspace.invoices.find((invoice) => invoice.kind !== "installment")?.discountAmount ?? 0;
  const already = roundMoney(paidTotal(workspace.payments) + invoiceDiscount + discountTotal(workspace.payments));
  const due = roundMoney(workspace.project.grandTotal - already);
  assertSettlement(amount, discount);
  if (roundMoney(amount + discount) > due) {
    throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
  }
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    projectId: workspace.project.id,
    invoiceId: null,
    installmentNumber: null,
    expectedAmount: due,
    paidAmount: amount,
    discountAmount: discount,
    paymentDate: input.paymentDate,
    paymentMode: input.paymentMode,
  };
  return rebuildDirectInvoices({ ...workspace, payments: [...workspace.payments, payment] }, reservedSerial);
}

function applyInstallmentOpening(workspace: Workspace, receipt: OpeningReceipt | null | undefined): Workspace {
  const face = openingFace(workspace.project);
  const opening = readOpening(receipt, Math.max(0, roundMoney(face - openingSettled(workspace.payments))), "Down payment cannot be more than the remaining down payment.");
  if (!opening) return workspace;
  if (!(face > 0)) throw new DocumentError("This project has no down payment.");
  const pending = roundMoney(face - openingSettled(workspace.payments));
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    projectId: workspace.project.id,
    invoiceId: null,
    installmentNumber: null,
    expectedAmount: pending,
    paidAmount: opening.amount,
    discountAmount: 0,
    paymentDate: opening.paymentDate,
    paymentMode: opening.paymentMode,
  };
  return { ...workspace, payments: [...workspace.payments, payment] };
}

export function receiveOpening(
  workspace: Workspace,
  input: { paidAmount: number; discountAmount?: number; paymentDate: string; paymentMode: BankMode },
  reservedSerial: number,
): Workspace {
  if (workspace.project.paymentMode === "direct") return recordDirectPayment(workspace, input, reservedSerial);
  const face = openingFace(workspace.project);
  if (!(face > 0)) throw new DocumentError("This project has no down payment.");
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  assertDate(input.paymentDate, "payment date");
  if (input.paymentMode !== "bank_transfer" && input.paymentMode !== "cash") throw new DocumentError("Choose bank transfer or cash.");
  const amount = roundMoney(input.paidAmount);
  const discount = normalizeDiscount(input.discountAmount);
  assertSettlement(amount, discount);
  const pending = roundMoney(face - openingSettled(workspace.payments));
  if (!(pending > 0)) throw new DocumentError("This down payment is already received.", 409, "already_paid");
  if (roundMoney(amount + discount) > pending) {
    throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
  }
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    projectId: workspace.project.id,
    invoiceId: null,
    installmentNumber: null,
    expectedAmount: pending,
    paidAmount: amount,
    discountAmount: discount,
    paymentDate: input.paymentDate,
    paymentMode: input.paymentMode,
  };
  return attachOpeningInvoice({ ...workspace, payments: [...workspace.payments, payment] }, reservedSerial);
}

export function syncInstallmentInvoices(workspace: Workspace, schedule: ScheduleLine[], reservedSerial: number): InvoiceRecord[] {
  let serialCursor = reservedSerial;
  return schedule.map((line) => {
    const existing = workspace.invoices.find((invoice) => invoice.installmentNumber === line.number);
    const base = existing ?? blankInvoice(workspace.project, nextSerial([], serialCursor), "installment");
    if (!existing) serialCursor = base.serialNumber;
    const linePayments = workspace.payments.filter((payment) => payment.installmentNumber === line.number);
    const receivedOpening = openingPayments(workspace.payments).filter((payment) => payment.paidAmount > 0 || (payment.discountAmount ?? 0) > 0);
    const invoiceDiscount = line.discountAmount ?? 0;
    const paymentDiscount = paymentDiscountFor(workspace.payments, line.number);
    const balance = roundMoney(Math.max(0, line.amount - invoiceDiscount - line.paidAmount - paymentDiscount));
    const received = line.paidAmount > 0 || paymentDiscount > 0;
    return {
      ...base,
      project: workspace.project,
      kind: "installment" as const,
      status: balance <= 0 && (received || invoiceDiscount > 0) ? "paid" as const : received ? "partial" as const : "due" as const,
      dueDate: line.dueDate,
      paymentDate: line.paidDate,
      paymentMode: line.paymentMode,
      advancePaid: line.paidAmount,
      balanceDue: balance,
      grandTotal: line.amount,
      discountAmount: invoiceDiscount,
      installmentNumber: line.number,
      payments: linePayments,
      openingPayments: receivedOpening,
      schedule,
    };
  });
}

export function receiveInstallment(
  workspace: Workspace,
  input: { installmentNumber: number; paidAmount: number; discountAmount?: number; paymentDate: string; paymentMode: BankMode },
  reservedSerial: number,
): Workspace {
  if (!workspace.agreement || workspace.project.paymentMode !== "installments") {
    throw new DocumentError("Generate the installment agreement before receiving a payment.");
  }
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  assertDate(input.paymentDate, "payment date");
  if (input.paymentMode !== "bank_transfer" && input.paymentMode !== "cash") throw new DocumentError("Choose bank transfer or cash.");
  const current = workspace.agreement.schedule.find((line) => line.number === input.installmentNumber);
  if (!current) throw new DocumentError("That installment was not found.", 404, "not_found");
  if (current.status === "paid") throw new DocumentError("This installment is already paid.", 409, "already_paid");
  const amount = roundMoney(input.paidAmount);
  const discount = normalizeDiscount(input.discountAmount);
  const due = installmentPending(current, workspace.payments);
  if (!(due > 0)) throw new DocumentError("This installment is already paid.", 409, "already_paid");
  assertSettlement(amount, discount);
  if (roundMoney(amount + discount) > due) {
    throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
  }
  const payment: PaymentRecord = {
    id: crypto.randomUUID(),
    projectId: workspace.project.id,
    invoiceId: null,
    installmentNumber: current.number,
    expectedAmount: due,
    paidAmount: amount,
    discountAmount: discount,
    paymentDate: input.paymentDate,
    paymentMode: input.paymentMode,
  };
  const payments = [...workspace.payments, payment];
  const schedule = workspace.agreement.schedule.map((line) => line.number === current.number ? refreshInstallment(line, payments) : line);
  const next: Workspace = {
    ...workspace,
    agreement: { ...workspace.agreement, schedule },
    payments,
  };
  return syncWithOpening(next, schedule, reservedSerial);
}

export function editPayment(
  workspace: Workspace,
  paymentId: string,
  input: { paidAmount: number; discountAmount?: number; paymentDate: string; paymentMode: BankMode },
  reservedSerial: number,
): Workspace {
  assertDate(input.paymentDate, "payment date");
  if (input.paymentMode !== "bank_transfer" && input.paymentMode !== "cash") throw new DocumentError("Choose bank transfer or cash.");
  const amount = roundMoney(input.paidAmount);
  const discount = normalizeDiscount(input.discountAmount);
  assertSettlement(amount, discount);
  const payment = workspace.payments.find((entry) => entry.id === paymentId);
  if (!payment) throw new DocumentError("Payment was not found.", 404, "not_found");
  const payments = workspace.payments.map((entry) => entry.id === paymentId
    ? { ...entry, paidAmount: amount, discountAmount: discount, paymentDate: input.paymentDate, paymentMode: input.paymentMode }
    : entry);
  if (workspace.project.paymentMode === "direct") {
    const invoiceDiscount = workspace.invoices.find((invoice) => invoice.kind !== "installment")?.discountAmount ?? 0;
    const others = roundMoney(paidTotal(payments.filter((entry) => entry.id !== paymentId)) + discountTotal(payments.filter((entry) => entry.id !== paymentId)) + invoiceDiscount);
    if (roundMoney(amount + discount) > roundMoney(workspace.project.grandTotal - others)) {
      throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
    }
    return rebuildDirectInvoices({ ...workspace, payments }, reservedSerial);
  }
  if (workspace.project.paymentMode === "installments" && payment.installmentNumber == null) {
    const face = openingFace(workspace.project);
    const others = roundMoney(paidTotal(payments.filter((entry) => entry.id !== paymentId && entry.installmentNumber == null)) + discountTotal(payments.filter((entry) => entry.id !== paymentId && entry.installmentNumber == null)));
    if (roundMoney(amount + discount) > roundMoney(face - others)) {
      throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
    }
    return attachOpeningInvoice({ ...workspace, payments }, reservedSerial);
  }
  if (!workspace.agreement || payment.installmentNumber == null) throw new DocumentError("Payment was not found.", 404, "not_found");
  const line = workspace.agreement.schedule.find((entry) => entry.number === payment.installmentNumber);
  if (!line) throw new DocumentError("Payment was not found.", 404, "not_found");
  const room = installmentPending(line, workspace.payments.filter((entry) => entry.id !== paymentId));
  if (roundMoney(amount + discount) > room) {
    throw new DocumentError(discount > 0 ? "Paid amount and discount cannot be more than the remaining balance." : "Paid amount cannot be more than the remaining balance.");
  }
  const schedule = workspace.agreement.schedule.map((entry) => entry.number === payment.installmentNumber ? refreshInstallment(entry, payments) : entry);
  const next = { ...workspace, payments, agreement: { ...workspace.agreement, schedule } };
  return syncWithOpening(next, schedule, reservedSerial);
}

export function setInvoiceDiscount(workspace: Workspace, invoiceId: string, discountAmount: number, reservedSerial: number): Workspace {
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  const discount = normalizeDiscount(discountAmount);
  const invoice = workspace.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) throw new DocumentError("Invoice was not found.", 404, "not_found");
  if (workspace.project.paymentMode === "direct") {
    const settled = roundMoney(paidTotal(workspace.payments) + discountTotal(workspace.payments));
    if (discount > roundMoney(workspace.project.grandTotal - settled)) throw new DocumentError("Discount cannot be more than the remaining balance.");
    const invoices = workspace.invoices.map((entry) => entry.id === invoiceId ? { ...entry, discountAmount: discount } : entry);
    return rebuildDirectInvoices({ ...workspace, invoices }, reservedSerial);
  }
  if (invoice.kind === "advance" && workspace.project.paymentMode === "installments") {
    const face = openingFace(workspace.project);
    const pays = workspace.payments.filter((entry) => entry.installmentNumber == null);
    if (discount > roundMoney(face - paidTotal(pays) - discountTotal(pays))) throw new DocumentError("Discount cannot be more than the remaining balance.");
    const invoices = workspace.invoices.map((entry) => entry.id === invoiceId ? { ...entry, discountAmount: discount } : entry);
    return attachOpeningInvoice({ ...workspace, invoices }, reservedSerial);
  }
  if (!workspace.agreement || invoice.installmentNumber == null) throw new DocumentError("Invoice was not found.", 404, "not_found");
  const number = invoice.installmentNumber;
  const line = workspace.agreement.schedule.find((entry) => entry.number === number);
  if (!line) throw new DocumentError("Invoice was not found.", 404, "not_found");
  const paymentDiscount = paymentDiscountFor(workspace.payments, number);
  const cash = cashFor(workspace.payments, number);
  const room = roundMoney(line.amount - cash - paymentDiscount);
  if (discount > room) throw new DocumentError("Discount cannot be more than the remaining balance.");
  const marked = workspace.agreement.schedule.map((entry) => entry.number === number ? refreshInstallment({ ...entry, discountAmount: discount }, workspace.payments) : entry);
  const next = { ...workspace, agreement: { ...workspace.agreement, schedule: marked } };
  return syncWithOpening(next, marked, reservedSerial);
}

export function agreementBody(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (text.length > 8000) throw new DocumentError("Agreement wording must be 8000 characters or fewer.");
  return text;
}

export function setAgreementBody(workspace: Workspace, body: string): Workspace {
  if (!workspace.agreement) throw new DocumentError("Agreement was not found.", 404, "not_found");
  const text = agreementBody(body);
  if (!text) throw new DocumentError("Enter the agreement wording.");
  return { ...workspace, agreement: { ...workspace.agreement, body: text } };
}

function projectWithPlanDiscount(project: QuotationRecord, planDiscount: number | undefined): QuotationRecord {
  if (project.paymentMode !== "installments") return project;
  const discount = roundMoney(Math.max(0, planDiscount ?? planDiscountOf(project)));
  const room = installmentBalance(project.grandTotal, project.downPayment, 0);
  if (discount > room) throw new DocumentError("Down payment and discount cannot be more than the total amount.");
  const count = project.installmentCount ?? 0;
  return {
    ...project,
    planDiscount: discount,
    installments: count > 0 ? splitInstallments(installmentBalance(project.grandTotal, project.downPayment, discount), count) : [],
  };
}

export function createAgreement(
  workspace: Workspace,
  input: { dueDates: string[]; guarantors: GuarantorInput[]; body?: string; opening?: OpeningReceipt | null; planDiscount?: number },
  reservedSerial: number,
): Workspace {
  if (workspace.agreement) throw new DocumentError("An agreement is already saved for this project.", 409, "agreement_exists");
  if (workspace.project.status === "completed") throw new DocumentError("This project is already completed.", 409, "completed");
  const agreementId = crypto.randomUUID();
  const people = prepareGuarantors(input.guarantors);
  if (workspace.project.paymentMode === "direct") {
    if (input.dueDates.length > 0 || people.length > 0) {
      throw new DocumentError("A direct payment agreement does not use guarantors.");
    }
    return {
      ...workspace,
      agreement: {
        id: agreementId,
        projectId: workspace.project.id,
        serial: agreementSerial(workspace.project),
        paymentMode: "direct",
        schedule: [],
        guarantors: [],
        body: agreementBody(input.body),
        createdAt: new Date().toISOString(),
        project: workspace.project,
      },
    };
  }
  const project = projectWithPlanDiscount(workspace.project, input.planDiscount);
  const schedule = buildSchedule(project, input.dueDates);
  const guarantors: GuarantorRecord[] = people.map((guarantor) => ({
    ...guarantor,
    id: crypto.randomUUID(),
    agreementId,
    projectId: project.id,
    customerName: project.customerName,
    slot: 1 as const,
  }));
  const next: Workspace = {
    ...workspace,
    project,
    agreement: {
      id: agreementId,
      projectId: project.id,
      serial: agreementSerial(project),
      paymentMode: "installments",
      schedule,
      guarantors,
      body: agreementBody(input.body),
      createdAt: new Date().toISOString(),
      project,
    },
  };
  return syncWithOpening(applyInstallmentOpening(next, input.opening), schedule, reservedSerial);
}

export function changeDueDate(workspace: Workspace, installmentNumber: number, dueDate: string, reservedSerial: number): Workspace {
  if (!workspace.agreement) throw new DocumentError("Generate the agreement before editing a due date.");
  assertDate(dueDate, "due date");
  const schedule = workspace.agreement.schedule.map((line) => line.number === installmentNumber ? { ...line, dueDate } : line);
  if (!schedule.some((line) => line.number === installmentNumber)) throw new DocumentError("That installment was not found.", 404, "not_found");
  const next = { ...workspace, agreement: { ...workspace.agreement, schedule } };
  return syncWithOpening(next, schedule, reservedSerial);
}
