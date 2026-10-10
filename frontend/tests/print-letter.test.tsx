import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuotationDialog } from "@/components/billing/QuotationLetter";
import { printBillingLetter } from "@/lib/billing/print-letter";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

const quotation: QuotationRecord = {
  id: "q1",
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
  items: [{ lineNo: 1, description: "Inverter", qty: 1, unit: "Set", price: 1000, taxPercent: 0, taxableAmount: 1000, taxAmount: 0, lineTotal: 1000 }],
  taxableTotal: 1000,
  taxTotal: 0,
  grandTotal: 1000,
  installments: [],
  approvedAt: null,
  sourceQuotationId: null,
  kind: "quotation",
};

afterEach(() => {
  cleanup();
  document.querySelector(".print-host")?.remove();
  vi.restoreAllMocks();
});

test("print uses the open letter and leaves the off-screen copy out", () => {
  document.body.innerHTML = `
    <div style="position:fixed;left:-12000px"><article class="quotation-letter">Hidden capture</article></div>
    <div role="dialog"><article class="quotation-letter">QT-014 letter</article></div>
  `;
  vi.spyOn(window, "print").mockImplementation(() => {});
  const dialog = document.querySelector("[role='dialog']");
  printBillingLetter(dialog instanceof HTMLElement ? dialog : null);
  const host = document.querySelector(".print-host");
  expect(host?.textContent).toContain("QT-014 letter");
  expect(host?.textContent).not.toContain("Hidden capture");
  expect(window.print).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event("afterprint"));
  expect(document.querySelector(".print-host")).toBeNull();
});

test("quotation print button prepares only that quotation", async () => {
  vi.spyOn(window, "print").mockImplementation(() => {});
  render(<QuotationDialog quotation={quotation} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Print" }));
  const host = document.querySelector(".print-host");
  expect(host?.textContent).toContain("QT-014");
  expect(host?.textContent).toContain("Sheikh Zain");
  expect(host?.querySelector(".quotation-letter")).not.toBeNull();
});
