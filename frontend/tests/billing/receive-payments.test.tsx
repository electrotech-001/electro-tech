import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReceivePaymentsPage } from "@/components/billing/ReceivePaymentsPage";
import type { PaymentRecord, ReceiveProject } from "@/lib/billing/documents-api";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listReceiveProjects: vi.fn(),
  deletePayment: vi.fn(),
  deleteDirectSale: vi.fn(),
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listReceiveProjects: api.listReceiveProjects,
  deletePayment: api.deletePayment,
  deleteDirectSale: api.deleteDirectSale,
  nextDirectSaleSerial: vi.fn(),
  recordPayment: vi.fn(),
  saveAgreement: vi.fn(),
  updateDueDate: vi.fn(),
  updatePayment: vi.fn(),
  DocumentApiError: class DocumentApiError extends Error {},
}));

vi.mock("@/lib/billing/quotations-api", () => ({ findCustomerByCnic: vi.fn() }));
vi.mock("@/lib/billing/whatsapp-api", () => ({ sendWhatsAppDocument: vi.fn(), WhatsAppApiError: class WhatsAppApiError extends Error {} }));
vi.mock("@/lib/billing/quotation-pdf", () => ({ quotationToPdf: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const project = {
  id: "p-1",
  serial: "QT-010",
  serialNumber: 10,
  quotationDate: "2026-10-01",
  customerName: "Sheikh Zain",
  cnic: "",
  address: "Attock",
  contactNo: "",
  whatsappNo: "",
  customerPackage: "Solar",
  paymentMode: "installments",
  downPayment: 20000,
  installmentCount: 2,
  items: [],
  taxableTotal: 100000,
  taxTotal: 0,
  grandTotal: 100000,
  installments: [{ number: 1, amount: 40000 }, { number: 2, amount: 40000 }],
  approvedAt: "2026-10-02",
  sourceQuotationId: "q-1",
  kind: "project",
  status: "in_process",
} as QuotationRecord;

const downPayment: PaymentRecord = {
  id: "pay-1",
  projectId: "p-1",
  invoiceId: null,
  installmentNumber: null,
  expectedAmount: 20000,
  paidAmount: 20000,
  paymentDate: "2026-10-05",
  paymentMode: "cash",
};

function row(payments: PaymentRecord[]): ReceiveProject {
  const paid = payments.reduce((sum, payment) => sum + payment.paidAmount, 0);
  return { project, agreement: null, invoices: [], payments, paidTotal: paid, balance: 100000 - paid };
}

test("a payment in the history can be deleted after confirming", async () => {
  api.listReceiveProjects.mockResolvedValueOnce([row([downPayment])]).mockResolvedValue([row([])]);
  api.deletePayment.mockResolvedValue(row([]));
  const user = userEvent.setup();
  render(<ReceivePaymentsPage />);
  expect(await screen.findByText(/Down payment/, { selector: "p" })).toBeDefined();
  expect(screen.getByRole("button", { name: /view/i })).toBeDefined();
  expect(screen.getByRole("button", { name: /print/i })).toBeDefined();
  await user.click(screen.getByRole("button", { name: /delete/i }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("removed from the payment history, the invoice balance, and the payment ledger");
  await user.click(within(dialog).getByRole("button", { name: "Delete payment" }));
  await waitFor(() => expect(api.deletePayment).toHaveBeenCalledWith("pay-1"));
  expect(await screen.findByText("No payments received yet.")).toBeDefined();
  expect(screen.getByText(/was deleted and removed from the payment ledger/)).toBeDefined();
});

test("a daily sale with no payments can be deleted from receive payments", async () => {
  const sale = { ...project, id: "sale-20", serial: "DS-020", origin: "direct_sale" as const, downPayment: 650000 };
  api.listReceiveProjects.mockResolvedValueOnce([{ ...row([]), project: sale }]).mockResolvedValue([]);
  api.deleteDirectSale.mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ReceivePaymentsPage />);
  await user.click(await screen.findByRole("button", { name: /Delete sale DS-020/ }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Rs 650,000.00 down payment plan");
  await user.click(within(dialog).getByRole("button", { name: "Delete sale" }));
  await waitFor(() => expect(api.deleteDirectSale).toHaveBeenCalledWith("sale-20"));
  expect(await screen.findByText("Sale DS-020 was deleted.")).toBeDefined();
});
