import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuotationsPage } from "@/components/billing/QuotationsPage";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listQuotations: vi.fn(),
  nextQuotationSerial: vi.fn(),
  saveQuotation: vi.fn(),
}));

vi.mock("@/lib/billing/quotations-api", () => ({
  listQuotations: api.listQuotations,
  approveQuotation: vi.fn(),
  deleteQuotation: vi.fn(),
  nextQuotationSerial: api.nextQuotationSerial,
  saveQuotation: api.saveQuotation,
  searchCustomersByName: vi.fn().mockResolvedValue([]),
  findCustomerByCnic: vi.fn(),
  QuotationApiError: class QuotationApiError extends Error {},
}));
vi.mock("@/lib/billing/documents-api", () => ({ issueDirectInvoice: vi.fn(), DocumentApiError: class DocumentApiError extends Error {} }));
vi.mock("@/lib/billing/whatsapp-api", () => ({ sendWhatsAppDocument: vi.fn(), WhatsAppApiError: class WhatsAppApiError extends Error {} }));
vi.mock("@/lib/billing/quotation-pdf", () => ({ quotationToPdf: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function quotation(serial: string, customerName: string, approvedAt: string | null): QuotationRecord {
  return {
    id: serial,
    serial,
    serialNumber: Number(serial.slice(3)),
    quotationDate: "2026-10-01",
    customerName,
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "Solar",
    paymentMode: "direct",
    downPayment: 0,
    installmentCount: 0,
    items: [{ description: "Solar", qty: 1, unit: "job", price: 100000, taxPercent: 0 }],
    taxableTotal: 100000,
    taxTotal: 0,
    grandTotal: 100000,
    installments: [],
    approvedAt,
  } as unknown as QuotationRecord;
}

test("approved quotations leave the quotations page", async () => {
  api.listQuotations.mockResolvedValue([
    quotation("QT-001", "Waiting Customer", null),
    quotation("QT-002", "Approved Customer", "2026-10-02"),
  ]);
  render(<QuotationsPage />);
  expect(await screen.findByRole("heading", { name: "Waiting Customer" })).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Approved Customer" })).toBeNull();
  expect(screen.queryByText("QT-002")).toBeNull();
});

test("duplicating a quotation opens a copy form with the customer details", async () => {
  api.listQuotations.mockResolvedValue([quotation("QT-001", "Waiting Customer", null)]);
  api.nextQuotationSerial.mockResolvedValue("QT-010");
  const user = userEvent.setup();
  render(<QuotationsPage />);
  await user.click(await screen.findByRole("button", { name: /duplicate/i }));
  expect(await screen.findByRole("heading", { name: "Copy quotation" })).toBeDefined();
  expect((screen.getByLabelText("Customer name") as HTMLInputElement).value).toBe("Waiting Customer");
  expect((screen.getByLabelText("Address") as HTMLTextAreaElement).value).toBe("Saddar Attock");
  expect(api.saveQuotation).not.toHaveBeenCalled();
});
