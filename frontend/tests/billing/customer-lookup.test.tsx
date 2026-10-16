import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { QuotationForm } from "@/components/billing/QuotationForm";
import { findCustomerByCnic } from "@/lib/billing/quotations-api";
import { blankDraft, type QuotationDraft } from "@/lib/billing/quotation-math";

vi.mock("@/lib/billing/quotations-api", () => ({
  findCustomerByCnic: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness() {
  const [draft, setDraft] = useState<QuotationDraft>(blankDraft());
  return (
    <QuotationForm
      serial="QT-009"
      draft={draft}
      saving={false}
      error={null}
      onChange={setDraft}
      onCancel={() => undefined}
      onSubmit={() => undefined}
    />
  );
}

test("a complete cnic fills the saved customer details", async () => {
  vi.mocked(findCustomerByCnic).mockResolvedValue({
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
  });
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText(/CNIC number/i), "3710112345671");
  await waitFor(() => expect((screen.getByLabelText("Customer name") as HTMLInputElement).value).toBe("Sheikh Zain"));
  expect((screen.getByLabelText("Address") as HTMLTextAreaElement).value).toBe("Saddar Attock");
  expect(screen.getByText("Saved customer: Sheikh Zain")).toBeDefined();
});
