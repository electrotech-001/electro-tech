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

vi.mock("@/lib/billing/quotations-api", () => ({
  findCustomerByCnic: vi.fn(),
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

test("a direct installment invoice can use a custom amount for each installment", async () => {
  vi.mocked(createDirectSale).mockClear();
  vi.mocked(createDirectSale).mockResolvedValue({
    project: { id: "sale-2", customerName: "Walk-in Customer" },
    invoices: [],
    payments: [],
    agreement: null,
    paidTotal: 0,
    balance: 0,
  } as unknown as Awaited<ReturnType<typeof createDirectSale>>);
  const user = userEvent.setup();
  render(<DirectSaleForm serial="DS-001" onCancel={() => undefined} onCreated={() => undefined} />);
  await user.type(screen.getByLabelText("Customer name"), "Walk-in Customer");
  await user.type(screen.getByLabelText("Address"), "Attock City");
  await user.type(screen.getByLabelText("Customer package"), "Solar");
  await user.type(screen.getByLabelText("Description 1"), "Solar");
  await user.clear(screen.getByLabelText("Price 1"));
  await user.type(screen.getByLabelText("Price 1"), "100000");
  await user.click(screen.getByRole("button", { name: "Payment mode" }));
  await user.click(screen.getByRole("option", { name: "Installments" }));
  await user.clear(screen.getByLabelText("Total number of installments"));
  await user.type(screen.getByLabelText("Total number of installments"), "2");
  await user.click(screen.getByRole("button", { name: "Installment amounts" }));
  await user.click(screen.getByRole("option", { name: "Custom amount for each installment" }));
  await user.clear(screen.getByLabelText("Installment 1 amount"));
  await user.type(screen.getByLabelText("Installment 1 amount"), "70000");
  expect(screen.getByText(/must add up to the remaining/)).toBeDefined();
  await user.clear(screen.getByLabelText("Installment 2 amount"));
  await user.type(screen.getByLabelText("Installment 2 amount"), "30000");
  fireEvent.change(screen.getByLabelText("Installment 1 due date"), { target: { value: "2026-11-15" } });
  fireEvent.change(screen.getByLabelText("Installment 2 due date"), { target: { value: "2027-01-10" } });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create invoice" }));
  await waitFor(() => expect(createDirectSale).toHaveBeenCalledWith(
    expect.objectContaining({ installmentCount: 2, installmentAmounts: [70000, 30000] }),
    expect.objectContaining({ paidAmount: 0 }),
    ["2026-11-15", "2027-01-10"],
  ));
});

test("a direct invoice form has no advance payment field", () => {
  render(<DirectSaleForm serial="DS-001" onCancel={() => undefined} onCreated={() => undefined} />);
  expect(screen.queryByText("Advance payment")).toBeNull();
  expect(screen.getByText(/Total after discount/)).toBeDefined();
});
