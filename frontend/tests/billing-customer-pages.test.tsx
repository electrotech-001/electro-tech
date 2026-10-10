import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CustomerDirectoryPage } from "@/components/billing/CustomerDirectoryPage";
import { CustomerProfilePage } from "@/components/billing/CustomerProfilePage";
import { PaymentLedgerPage } from "@/components/billing/PaymentLedgerPage";
import { billingNav } from "@/lib/billing/navigation";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listQuotations: vi.fn(),
  listProjects: vi.fn(),
  listInvoices: vi.fn(),
  listLedger: vi.fn(),
  listAgreements: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

vi.mock("@/lib/billing/quotations-api", () => ({
  listQuotations: api.listQuotations,
  listProjects: api.listProjects,
  QuotationApiError: class QuotationApiError extends Error {},
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listInvoices: api.listInvoices,
  listLedger: api.listLedger,
  listAgreements: api.listAgreements,
  updateCustomerProfile: api.updateCustomerProfile,
  DocumentApiError: class DocumentApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function record(overrides: Partial<QuotationRecord> & Pick<QuotationRecord, "id" | "kind" | "customerName" | "cnic">): QuotationRecord {
  return {
    serial: "QT-001",
    serialNumber: 1,
    quotationDate: "2026-10-01",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw hybrid",
    paymentMode: "direct",
    downPayment: null,
    installmentCount: null,
    items: [],
    taxableTotal: 1000,
    taxTotal: 0,
    grandTotal: 1000,
    installments: [],
    approvedAt: null,
    sourceQuotationId: null,
    ...overrides,
  };
}

const quotation = record({ id: "q1", kind: "quotation", customerName: "Sheikh Zain", cnic: "37101-1234567-1", serial: "QT-001" });
const project = record({
  id: "p1",
  kind: "project",
  customerName: "Ayesha Khan",
  cnic: "37101-9999999-1",
  serial: "QT-002",
  status: "in_process",
  grandTotal: 5000,
});
const finished = record({
  id: "p2",
  kind: "project",
  customerName: "Closed Account",
  cnic: "37101-0000000-1",
  serial: "QT-003",
  status: "completed",
  approvedAt: "2026-10-02T00:00:00.000Z",
});

test("sidebar customers group lists the three new pages", () => {
  const customers = billingNav.find((group) => group.label === "Customers");
  expect(customers?.items.map((item) => [item.label, item.href])).toEqual([
    ["Quoted & In Process", "/billing/customers"],
    ["Customer Profiles", "/billing/profiles"],
    ["Payment Ledger", "/billing/ledger"],
  ]);
});

test("quoted and in-process list hides customers whose work is finished", async () => {
  api.listQuotations.mockResolvedValue([quotation]);
  api.listProjects.mockResolvedValue([project, finished]);
  render(<CustomerDirectoryPage mode="active" />);
  expect(await screen.findByRole("heading", { name: "Sheikh Zain" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ayesha Khan" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Closed Account" })).toBeNull();
  const links = screen.getAllByRole("link", { name: "Open profile" }).map((link) => link.getAttribute("href"));
  expect(links.sort()).toEqual(["/billing/profiles/3710112345671", "/billing/profiles/3710199999991"]);
});

test("customer profile shows editable details, invoices, and payments", async () => {
  api.listQuotations.mockResolvedValue([quotation]);
  api.listProjects.mockResolvedValue([project]);
  api.listInvoices.mockResolvedValue([{
    id: "inv-1",
    projectId: "p1",
    serial: "INV-001",
    serialNumber: 1,
    kind: "advance",
    status: "partial",
    invoiceDate: "2026-10-09",
    dueDate: null,
    paymentDate: "2026-10-09",
    paymentMode: "cash",
    advancePaid: 1000,
    balanceDue: 4000,
    grandTotal: 5000,
    installmentNumber: null,
    payments: [],
    project,
  }]);
  api.listLedger.mockResolvedValue([{
    id: "pay-1",
    paymentDate: "2026-10-09",
    paidAmount: 1000,
    paymentMode: "cash",
    installmentNumber: null,
    customerName: "Ayesha Khan",
    cnic: "37101-9999999-1",
    projectId: "p1",
    projectSerial: "QT-002",
    invoiceSerial: "INV-001",
  }]);
  api.listAgreements.mockResolvedValue([]);
  render(<CustomerProfilePage cnicKey="3710199999991" />);
  expect(await screen.findByDisplayValue("Ayesha Khan")).toBeTruthy();
  expect(screen.getByDisplayValue("37101-9999999-1")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save profile" })).toBeTruthy();
  expect(screen.getByText("INV-001")).toBeTruthy();
  expect(screen.getByText("Direct payment · INV-001")).toBeTruthy();
  expect(screen.queryByText("Sheikh Zain")).toBeNull();
});

test("payment ledger lists receipts with a running total", async () => {
  api.listLedger.mockResolvedValue([
    {
      id: "pay-1",
      paymentDate: "2026-10-01",
      paidAmount: 100,
      paymentMode: "cash",
      installmentNumber: null,
      customerName: "Sheikh Zain",
      cnic: "37101-1234567-1",
      projectId: "p1",
      projectSerial: "QT-001",
      invoiceSerial: null,
    },
    {
      id: "pay-2",
      paymentDate: "2026-10-02",
      paidAmount: 50,
      paymentMode: "bank_transfer",
      installmentNumber: 1,
      customerName: "Sheikh Zain",
      cnic: "37101-1234567-1",
      projectId: "p1",
      projectSerial: "QT-001",
      invoiceSerial: "INV-002",
    },
  ]);
  render(<PaymentLedgerPage />);
  expect(await screen.findByRole("heading", { name: "Payment Ledger" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "This month" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  expect(screen.getAllByText("Rs 150.00").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Rs 100.00").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Total received").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByRole("link", { name: "Sheikh Zain" }).map((link) => link.getAttribute("href"))).toEqual([
    "/billing/profiles/3710112345671",
    "/billing/profiles/3710112345671",
  ]);
});
