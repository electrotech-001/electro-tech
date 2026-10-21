import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { QuotationForm } from "@/components/billing/QuotationForm";
import { findCustomerByCnic, searchCustomersByName } from "@/lib/billing/quotations-api";
import { blankDraft, type QuotationDraft } from "@/lib/billing/quotation-math";

vi.mock("@/lib/billing/quotations-api", () => ({
  findCustomerByCnic: vi.fn(),
  searchCustomersByName: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial }: { initial?: QuotationDraft } = {}) {
  const [draft, setDraft] = useState<QuotationDraft>(initial ?? blankDraft());
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

test("typing a customer name shows matches and fills the details when one is chosen", async () => {
  vi.mocked(searchCustomersByName).mockResolvedValue([
    {
      customerName: "Sheikh Zain",
      cnic: "37101-1234567-1",
      address: "Saddar Attock",
      contactNo: "0300-5607350",
      whatsappNo: "0300-5607350",
    },
    {
      customerName: "Sheikh Ali",
      cnic: "37101-9999999-1",
      address: "Kamra",
      contactNo: "0300-1111111",
      whatsappNo: "0300-1111111",
    },
  ]);
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText("Customer name"), "Sheikh");
  await waitFor(() => expect(searchCustomersByName).toHaveBeenCalledWith("Sheikh"));
  expect(await screen.findByRole("option", { name: /Sheikh Zain/i })).toBeDefined();
  await user.click(screen.getByRole("option", { name: /Sheikh Zain/i }));
  expect((screen.getByLabelText("Customer name") as HTMLInputElement).value).toBe("Sheikh Zain");
  expect((screen.getByLabelText("Address") as HTMLTextAreaElement).value).toBe("Saddar Attock");
  expect((screen.getByLabelText(/CNIC number/i) as HTMLInputElement).value).toBe("37101-1234567-1");
  expect(screen.getByText("Saved customer: Sheikh Zain")).toBeDefined();
});

test("a duplicated draft can keep a new customer name typed by hand", async () => {
  vi.mocked(searchCustomersByName).mockResolvedValue([]);
  const user = userEvent.setup();
  render(<Harness initial={{ ...blankDraft(), customerName: "Old Customer", address: "Old Road" }} />);
  const name = screen.getByLabelText("Customer name") as HTMLInputElement;
  await user.clear(name);
  await user.type(name, "Brand New Customer");
  expect(name.value).toBe("Brand New Customer");
  expect((screen.getByLabelText("Address") as HTMLTextAreaElement).value).toBe("Old Road");
});
