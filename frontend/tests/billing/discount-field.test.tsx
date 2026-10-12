import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DirectSaleForm } from "@/components/billing/DirectSaleForm";
import { QuotationForm } from "@/components/billing/QuotationForm";
import { blankDraft } from "@/lib/billing/quotation-math";

vi.mock("@/lib/billing/documents-api", () => ({
  createDirectSale: vi.fn(),
  DocumentApiError: class DocumentApiError extends Error {},
}));

afterEach(() => {
  cleanup();
});

test("quotation form includes a discount for a direct payment", () => {
  const draft = blankDraft();
  render(
    <QuotationForm
      serial="QT-001"
      draft={draft}
      saving={false}
      error={null}
      onChange={() => undefined}
      onCancel={() => undefined}
      onSubmit={() => undefined}
    />,
  );
  expect(screen.getByText("Discount")).toBeDefined();
  expect(screen.getByText(/Remaining after advance payment and discount/)).toBeDefined();
});

test("direct invoice form includes a discount", () => {
  render(<DirectSaleForm serial="DS-001" onCancel={() => undefined} onCreated={() => undefined} />);
  expect(screen.getByText("Discount")).toBeDefined();
});
