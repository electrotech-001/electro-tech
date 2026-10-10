import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AgreementLetter } from "@/components/billing/BillingLetters";
import { AgreementDialog } from "@/components/billing/ProjectFlow";

vi.mock("@/lib/billing/documents-api", () => ({
  DocumentApiError: class DocumentApiError extends Error {},
  saveAgreement: vi.fn(),
  updateAgreementWording: vi.fn(),
  readImageFile: vi.fn(),
  recordPayment: vi.fn(),
}));
import type { AgreementRecord } from "@/lib/billing/documents-api";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const project: QuotationRecord = {
  id: "p1",
  serial: "QT-014",
  serialNumber: 14,
  quotationDate: "2026-10-09",
  customerName: "Sheikh Zain",
  cnic: "37101-1234567-1",
  address: "Saddar Attock",
  contactNo: "0300-5607350",
  whatsappNo: "0300-5607350",
  customerPackage: "12 Kw system",
  paymentMode: "direct",
  downPayment: null,
  installmentCount: null,
  items: [],
  taxableTotal: 1000,
  taxTotal: 0,
  grandTotal: 1000,
  installments: [],
  approvedAt: "2026-10-09T00:00:00.000Z",
  sourceQuotationId: null,
  kind: "project",
};

const agreement: AgreementRecord = {
  id: "a1",
  projectId: "p1",
  serial: "AG-001",
  paymentMode: "direct",
  schedule: [],
  guarantors: [],
  body: "The customer agrees to the revised payment terms.",
  createdAt: "2026-10-09T00:00:00.000Z",
  project,
};

afterEach(() => cleanup());

test("new agreement starts with editable wording", () => {
  render(<AgreementDialog project={project} onClose={() => {}} onSaved={() => {}} />);
  const field = screen.getByRole("textbox", { name: "Agreement wording" });
  expect(field).toBeInstanceOf(HTMLTextAreaElement);
  const value = (field as HTMLTextAreaElement).value;
  expect(value).toContain("Sheikh Zain");
  expect(value).toContain("Direct");
});

test("saved agreement wording is what prints on the letter", () => {
  render(<AgreementLetter agreement={agreement} />);
  expect(screen.getByText("The customer agrees to the revised payment terms.")).toBeTruthy();
  expect(screen.queryByText(/This agreement is made on/)).toBeNull();
});
