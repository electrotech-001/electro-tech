export type PaymentMode = "installments" | "direct";

export type QuotationItemInput = {
  description: string;
  qty: number;
  unit: string;
  price: number;
  taxPercent: number;
};

export type QuotationItem = QuotationItemInput & {
  lineNo: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type InstallmentLine = {
  number: number;
  amount: number;
};

export type QuotationDraft = {
  quotationDate: string;
  customerName: string;
  cnic: string;
  address: string;
  contactNo: string;
  whatsappNo: string;
  customerPackage: string;
  paymentMode: PaymentMode;
  downPayment: number | null;
  installmentCount: number | null;
  items: QuotationItemInput[];
};

export type QuotationTotals = {
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  installments: InstallmentLine[];
};

const CNIC = /^\d{5}-\d{7}-\d$/;
const PHONE = /^\d{4}-\d{7}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatSerial(serialNumber: number): string {
  return `QT-${String(serialNumber).padStart(3, "0")}`;
}

export function computeItem(input: QuotationItemInput, lineNo: number): QuotationItem {
  const taxableAmount = roundMoney(input.qty * input.price);
  const taxAmount = roundMoney((taxableAmount * input.taxPercent) / 100);
  return {
    ...input,
    lineNo,
    taxableAmount,
    taxAmount,
    lineTotal: roundMoney(taxableAmount + taxAmount),
  };
}

export function splitInstallments(remaining: number, count: number): InstallmentLine[] {
  const totalPaisa = Math.round(roundMoney(remaining) * 100);
  const base = Math.floor(totalPaisa / count);
  const leftover = totalPaisa - base * count;
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    amount: (base + (index === count - 1 ? leftover : 0)) / 100,
  }));
}

export function computeTotals(draft: QuotationDraft): QuotationTotals & { items: QuotationItem[] } {
  const items = draft.items.map((item, index) => computeItem(item, index + 1));
  const taxableTotal = roundMoney(items.reduce((sum, item) => sum + item.taxableAmount, 0));
  const taxTotal = roundMoney(items.reduce((sum, item) => sum + item.taxAmount, 0));
  const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const installments = draft.paymentMode === "installments" && draft.installmentCount
    ? splitInstallments(grandTotal - (draft.downPayment ?? 0), draft.installmentCount)
    : [];
  return { items, taxableTotal, taxTotal, grandTotal, installments };
}

export function quotationIssues(draft: QuotationDraft): string[] {
  const issues: string[] = [];
  if (!DATE.test(draft.quotationDate) || Number.isNaN(Date.parse(`${draft.quotationDate}T00:00:00`))) {
    issues.push("Choose a quotation date.");
  }
  if (!draft.customerName.trim()) issues.push("Enter the customer name.");
  if (!CNIC.test(draft.cnic)) issues.push("Enter the CNIC as 00000-0000000-0.");
  if (!draft.address.trim()) issues.push("Enter the address.");
  if (!PHONE.test(draft.contactNo)) issues.push("Enter the contact number as 0300-0000000.");
  if (!PHONE.test(draft.whatsappNo)) issues.push("Enter the WhatsApp number as 0300-0000000.");
  if (!draft.customerPackage.trim()) issues.push("Enter the customer package.");
  if (draft.paymentMode !== "installments" && draft.paymentMode !== "direct") {
    issues.push("Choose installments or direct payment.");
  }
  if (draft.items.length === 0) issues.push("Add at least one item.");
  draft.items.forEach((item, index) => {
    const row = index + 1;
    if (!item.description.trim()) issues.push(`Enter a description for item ${row}.`);
    if (!(item.qty > 0)) issues.push(`Enter a quantity greater than zero for item ${row}.`);
    if (!item.unit.trim()) issues.push(`Enter a unit for item ${row}.`);
    if (!(item.price >= 0)) issues.push(`Enter a price for item ${row}.`);
    if (!(item.taxPercent >= 0) || item.taxPercent > 100) issues.push(`Enter a tax from 0 to 100 for item ${row}.`);
  });
  if (issues.length > 0) return issues;

  const { grandTotal } = computeTotals(draft);
  if (draft.paymentMode === "installments") {
    if (draft.downPayment == null || draft.downPayment < 0) issues.push("Enter the down payment.");
    else if (draft.downPayment > grandTotal) issues.push("Down payment cannot be more than the total amount.");
    if (draft.installmentCount == null || !Number.isInteger(draft.installmentCount) || draft.installmentCount < 1) {
      issues.push("Enter the number of installments.");
    }
  }
  return issues;
}
