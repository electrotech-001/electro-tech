import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { InvoiceLetter } from "@/components/billing/BillingLetters";
import { ProjectsPage } from "@/components/billing/ProjectsPage";
import type { InvoiceRecord } from "@/lib/billing/documents-api";
import { letterhead, type QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listAgreements: vi.fn(),
  listInvoices: vi.fn(),
  issueDirectInvoice: vi.fn(),
  completeProject: vi.fn(),
  disapproveProject: vi.fn(),
}));

vi.mock("@/lib/billing/quotations-api", () => ({
  listProjects: api.listProjects,
  disapproveProject: api.disapproveProject,
  QuotationApiError: class QuotationApiError extends Error {},
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listAgreements: api.listAgreements,
  listInvoices: api.listInvoices,
  issueDirectInvoice: api.issueDirectInvoice,
  completeProject: api.completeProject,
  DocumentApiError: class DocumentApiError extends Error {},
}));

vi.mock("@/lib/billing/whatsapp-api", () => ({
  sendWhatsAppDocument: vi.fn(),
  WhatsAppApiError: class WhatsAppApiError extends Error {},
}));

vi.mock("@/lib/billing/quotation-pdf", () => ({
  quotationToPdf: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function project(overrides: Partial<QuotationRecord> & Pick<QuotationRecord, "id" | "paymentMode">): QuotationRecord {
  return {
    serial: "QT-010",
    serialNumber: 10,
    quotationDate: "2026-10-01",
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw hybrid",
    downPayment: null,
    installmentCount: null,
    items: [{ lineNo: 1, description: "Hybrid inverter", qty: 1, unit: "Set", price: 673000, taxPercent: 0, taxableAmount: 673000, taxAmount: 0, lineTotal: 673000 }],
    taxableTotal: 673000,
    taxTotal: 0,
    grandTotal: 673000,
    installments: [],
    approvedAt: "2026-10-02",
    sourceQuotationId: "q1",
    kind: "project",
    status: "in_process",
    ...overrides,
  };
}

function invoice(record: QuotationRecord, overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1",
    projectId: record.id,
    serial: "INV-001",
    serialNumber: 1,
    kind: "advance",
    status: "due",
    invoiceDate: "2026-10-10",
    dueDate: null,
    paymentDate: null,
    paymentMode: null,
    advancePaid: 0,
    balanceDue: record.grandTotal,
    grandTotal: record.grandTotal,
    installmentNumber: null,
    payments: [],
    project: record,
    ...overrides,
  };
}

test("a direct invoice is created without a popup and the button is then disabled", async () => {
  const direct = project({ id: "direct-1", serial: "QT-010" });
  const created = invoice(direct);
  api.listProjects.mockResolvedValue([direct]);
  api.listAgreements.mockResolvedValue([]);
  api.listInvoices.mockResolvedValueOnce([]).mockResolvedValue([created]);
  api.issueDirectInvoice.mockResolvedValue({ project: direct, invoices: [created], payments: [], agreement: null, paidTotal: 0, balance: 673000 });
  const user = userEvent.setup();
  render(<ProjectsPage />);
  const button = await screen.findByRole("button", { name: /create invoice/i });
  await user.click(button);
  await waitFor(() => expect(api.issueDirectInvoice).toHaveBeenCalledWith("direct-1"));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect((screen.getByRole("button", { name: /create invoice/i }) as HTMLButtonElement).disabled).toBe(true));
});

test("an installment invoice opens the dates and guarantor form", async () => {
  const installment = project({
    id: "inst-1",
    serial: "QT-011",
    paymentMode: "installments",
    downPayment: 250000,
    installmentCount: 2,
    installments: [{ number: 1, amount: 211500 }, { number: 2, amount: 211500 }],
  });
  api.listProjects.mockResolvedValue([installment]);
  api.listAgreements.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProjectsPage />);
  await user.click(await screen.findByRole("button", { name: /create invoice/i }));
  expect(await screen.findByRole("dialog")).toBeDefined();
  expect(screen.getByText(/installment 1 due date/i)).toBeDefined();
  expect(screen.getByText(/guarantor 1/i)).toBeDefined();
  expect(api.issueDirectInvoice).not.toHaveBeenCalled();
});

test("every invoice shows the bank instructions and the company email", () => {
  const record = project({ id: "direct-1" });
  render(<InvoiceLetter invoice={invoice(record, {
    status: "partial",
    advancePaid: 250000,
    balanceDue: 423000,
    payments: [{
      id: "pay-1",
      projectId: record.id,
      invoiceId: "inv-1",
      installmentNumber: null,
      expectedAmount: 673000,
      paidAmount: 250000,
      paymentDate: "2026-10-09",
      paymentMode: "cash",
    }],
  })} />);
  expect(screen.getByText(letterhead.email).textContent).toBe("aqeel@electrotech-attock.com");
  expect(screen.getByText("Payment Instructions")).toBeDefined();
  expect(screen.getByText("Account Title : Electro Tech")).toBeDefined();
  expect(screen.getByText("Account Number : 57365002120531")).toBeDefined();
  expect(screen.getByText("Bank Name: Bank Alfalah.")).toBeDefined();
  expect(screen.getByText("Cash")).toBeDefined();
});
