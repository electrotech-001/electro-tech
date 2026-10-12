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
  planDiscount?: number | null;
  installmentCount: number | null;
  items: QuotationItemInput[];
};

export function planDiscountOf(draft: { paymentMode: PaymentMode; planDiscount?: number | null }): number {
  if (draft.paymentMode !== "installments") return 0;
  const value = draft.planDiscount ?? 0;
  return Number.isFinite(value) ? roundMoney(Math.max(0, value)) : 0;
}

export function installmentBalance(grandTotal: number, downPayment: number | null, planDiscount: number): number {
  return roundMoney(Math.max(0, grandTotal - (downPayment ?? 0) - planDiscount));
}

export type CustomerProfileInput = {
  customerName: string;
  cnic: string;
  address: string;
  contactNo: string;
  whatsappNo: string;
};

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

export const letterhead = {
  company: "Electro Tech",
  person: "Muhammad Aqeel",
  address: "Near Camel poor floor Mil Fateh jang Road Dhoke Fateh Attock City",
  phone: "+92 310 5056394",
  email: "aqeel@electrotech-attock.com",
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function maskCnic(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}-${month}-${year}`;
}

export function formatRupees(value: number): string {
  return `Rs ${roundMoney(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDirectSaleSerial(serialNumber: number): string {
  return `DS-${String(serialNumber).padStart(3, "0")}`;
}

export function isDirectSale(record: { origin?: string | null }): boolean {
  return record.origin === "direct_sale";
}

export function computeItem(input: QuotationItemInput, lineNo: number): QuotationItem {
  const taxableAmount = roundMoney(input.qty * input.price);
  const taxAmount = roundMoney((taxableAmount * input.taxPercent) / 100);
  return { ...input, lineNo, taxableAmount, taxAmount, lineTotal: roundMoney(taxableAmount + taxAmount) };
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

export function computeTotals(draft: QuotationDraft) {
  const items = draft.items.map((item, index) => computeItem(item, index + 1));
  const taxableTotal = roundMoney(items.reduce((sum, item) => sum + item.taxableAmount, 0));
  const taxTotal = roundMoney(items.reduce((sum, item) => sum + item.taxAmount, 0));
  const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discount = planDiscountOf(draft);
  const installments = draft.paymentMode === "installments" && draft.installmentCount
    ? splitInstallments(installmentBalance(grandTotal, draft.downPayment, discount), draft.installmentCount)
    : [];
  return { items, taxableTotal, taxTotal, grandTotal, installments };
}

const CNIC = /^\d{5}-\d{7}-\d$/;
const PHONE = /^\d{4}-\d{7}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function quotationIssues(draft: QuotationDraft): string[] {
  const issues: string[] = [];
  if (!DATE.test(draft.quotationDate)) issues.push("Choose a quotation date.");
  if (!draft.customerName.trim()) issues.push("Enter the customer name.");
  if (draft.cnic.trim() && !CNIC.test(draft.cnic.trim())) issues.push("Enter the CNIC as 00000-0000000-0.");
  if (!draft.address.trim()) issues.push("Enter the address.");
  if (draft.contactNo.trim() && !PHONE.test(draft.contactNo.trim())) issues.push("Enter the contact number as 0300-0000000.");
  if (draft.whatsappNo.trim() && !PHONE.test(draft.whatsappNo.trim())) issues.push("Enter the WhatsApp number as 0300-0000000.");
  if (!draft.customerPackage.trim()) issues.push("Enter the customer package.");
  if (draft.items.length === 0) issues.push("Add at least one item.");
  draft.items.forEach((item, index) => {
    const row = index + 1;
    if (!item.description.trim()) issues.push(`Enter a description for item ${row}.`);
    if (!(item.qty > 0)) issues.push(`Enter a quantity greater than zero for item ${row}.`);
    if (!item.unit.trim()) issues.push(`Enter a unit for item ${row}.`);
    if (!(item.price >= 0) || Number.isNaN(item.price)) issues.push(`Enter a price for item ${row}.`);
    if (!(item.taxPercent >= 0) || item.taxPercent > 100 || Number.isNaN(item.taxPercent)) {
      issues.push(`Enter a tax from 0 to 100 for item ${row}.`);
    }
  });
  if (issues.length > 0) return issues;
  const { grandTotal } = computeTotals(draft);
  if (draft.paymentMode === "installments") {
    const discount = planDiscountOf(draft);
    if (draft.planDiscount != null && (draft.planDiscount < 0 || Number.isNaN(draft.planDiscount))) issues.push("Enter a discount of zero or more.");
    if (draft.downPayment == null || draft.downPayment < 0 || Number.isNaN(draft.downPayment)) issues.push("Enter the down payment.");
    else if (draft.downPayment > grandTotal) issues.push("Down payment cannot be more than the total amount.");
    else if (draft.downPayment + discount > grandTotal) issues.push("Down payment and discount cannot be more than the total amount.");
    if (draft.installmentCount == null || !Number.isInteger(draft.installmentCount) || draft.installmentCount < 1) {
      issues.push("Enter the number of installments.");
    }
  }
  if (draft.paymentMode === "direct" && draft.downPayment != null) {
    if (draft.downPayment < 0 || Number.isNaN(draft.downPayment)) issues.push("Enter the advance payment.");
    else if (draft.downPayment > grandTotal) issues.push("Advance payment cannot be more than the total amount.");
  }
  return issues;
}

export function customerProfileIssues(profile: CustomerProfileInput): string[] {
  const issues: string[] = [];
  const name = profile.customerName.trim();
  const address = profile.address.trim();
  if (!name) issues.push("Enter the customer name.");
  else if (name.length > 120) issues.push("Customer name must be 120 characters or fewer.");
  if (!CNIC.test(profile.cnic.trim())) issues.push("Enter the CNIC as 00000-0000000-0.");
  if (!address) issues.push("Enter the address.");
  else if (address.length > 400) issues.push("Address must be 400 characters or fewer.");
  if (!PHONE.test(profile.contactNo.trim())) issues.push("Enter the contact number as 0300-0000000.");
  if (profile.whatsappNo.trim() && !PHONE.test(profile.whatsappNo.trim())) issues.push("Enter the WhatsApp number as 0300-0000000.");
  return issues;
}

export function blankDraft(serialPreview = "QT-001"): QuotationDraft & { serial: string } {
  return {
    serial: serialPreview,
    quotationDate: todayIsoDate(),
    customerName: "",
    cnic: "",
    address: "",
    contactNo: "",
    whatsappNo: "",
    customerPackage: "",
    paymentMode: "direct",
    downPayment: null,
    planDiscount: 0,
    installmentCount: null,
    items: [{ description: "", qty: 1, unit: "Nos", price: 0, taxPercent: 0 }],
  };
}
