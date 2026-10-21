import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { QuotationsPage } from "@/components/billing/QuotationsPage";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({ listQuotations: vi.fn() }));

vi.mock("@/lib/billing/quotations-api", () => ({
  listQuotations: api.listQuotations,
  approveQuotation: vi.fn(),
  deleteQuotation: vi.fn(),
  nextQuotationSerial: vi.fn(),
  saveQuotation: vi.fn(),
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
    cnic: "",
    address: "",
    contactNo: "",
    whatsappNo: "",
    customerPackage: "Solar",
    paymentMode: "direct",
    downPayment: 0,
    installmentCount: 0,
    items: [],
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
