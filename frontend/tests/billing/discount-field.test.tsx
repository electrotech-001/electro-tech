import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { DirectSaleForm } from "@/components/billing/DirectSaleForm";
import { QuotationForm } from "@/components/billing/QuotationForm";
import { createDirectSale } from "@/lib/billing/documents-api";
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

test("a direct installment invoice asks for each due date instead of filling one in", async () => {
  vi.mocked(createDirectSale).mockResolvedValue({
    project: { id: "sale-1", customerName: "Walk-in Customer" },
    invoices: [],
    payments: [],
    agreement: null,
    paidTotal: 0,
    balance: 0,
  } as Awaited<ReturnType<typeof createDirectSale>>);
  const user = userEvent.setup();
  render(<DirectSaleForm serial="DS-001" onCancel={() => undefined} onCreated={() => undefined} />);
  await user.type(screen.getByLabelText("Customer name"), "Walk-in Customer");
  await user.type(screen.getByLabelText("Address"), "Attock City");
  await user.type(screen.getByLabelText("Customer package"), "MCB 63A");
  await user.type(screen.getByLabelText("Description 1"), "MCB 63A");
  await user.click(screen.getByRole("button", { name: "Payment mode" }));
  await user.click(screen.getByRole("option", { name: "Installments" }));
  const dueDate = screen.getByLabelText("Installment 1 due date");
  expect((dueDate as HTMLInputElement).value).toBe("");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Choose a due date for each installment.")).toBeDefined();
  fireEvent.change(dueDate, { target: { value: "2026-11-15" } });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create invoice" }));
  await waitFor(() => expect(createDirectSale).toHaveBeenCalledWith(
    expect.objectContaining({ paymentMode: "installments", installmentCount: 1 }),
    expect.objectContaining({ paidAmount: 0 }),
    ["2026-11-15"],
  ));
});
