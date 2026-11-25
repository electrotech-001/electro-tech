import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { CustomerBalancesPage } from "@/components/billing/CustomerBalancesPage";
import type { CustomerBalance } from "@/lib/billing/documents-api";
import { formatRupees } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listCustomerBalances: vi.fn(),
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listCustomerBalances: api.listCustomerBalances,
  DocumentApiError: class DocumentApiError extends Error {},
}));

vi.mock("@/lib/billing/quotation-pdf", () => ({
  quotationToPdf: vi.fn(),
}));

vi.mock("@/lib/billing/print-letter", () => ({
  printBillingLetter: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const rows: CustomerBalance[] = [
  {
    serial: 1,
    key: "3710199999991",
    customerName: "Ayesha Khan",
    cnic: "37101-9999999-1",
    contactNo: "0300-1111111",
    whatsappNo: "0300-1111111",
    pending: 100000,
    paid: 0,
    remaining: 100000,
    projects: [{ projectId: "p-3", serial: "QT-003", pending: 100000, paid: 0, remaining: 100000 }],
  },
  {
    serial: 2,
    key: "3710112345671",
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    pending: 673000,
    paid: 250000,
    remaining: 423000,
    projects: [{ projectId: "p-1", serial: "QT-001", pending: 673000, paid: 250000, remaining: 423000 }],
  },
];

function screenTable() {
  return screen.getByRole("table", { name: "Customer balances" });
}

test("lists customers in serial order with pending, paid, and remaining balance", async () => {
  api.listCustomerBalances.mockResolvedValue(rows);
  render(<CustomerBalancesPage />);

  expect(await screen.findByRole("heading", { name: "Pending Balances" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  const table = within(screenTable());
  const body = table.getAllByRole("row").filter((row) => row.parentElement?.tagName === "TBODY");
  expect(body).toHaveLength(2);
  expect(body[0]?.textContent).toContain("1");
  expect(body[0]?.textContent).toContain("Ayesha Khan");
  expect(body[0]?.textContent).toContain("QT-003");
  expect(body[0]?.textContent).toContain(formatRupees(100000));
  expect(body[1]?.textContent).toContain("Sheikh Zain");
  expect(body[1]?.textContent).toContain(formatRupees(250000));
  expect(body[1]?.textContent).toContain(formatRupees(423000));
  expect(table.getByRole("link", { name: "Sheikh Zain" }).getAttribute("href")).toBe("/billing/profiles/3710112345671");
  expect(screen.getAllByText(formatRupees(523000)).length).toBeGreaterThan(0);
});

test("pending only hides cleared customers and renumbers serials from 1", async () => {
  api.listCustomerBalances.mockResolvedValue([
    rows[0] as CustomerBalance,
    { ...rows[1], serial: 2, paid: 673000, remaining: 0, pending: 673000, projects: [{ projectId: "p-1", serial: "QT-001", pending: 673000, paid: 673000, remaining: 0 }] },
    {
      serial: 3,
      key: "3710188888881",
      customerName: "Bilal Ahmed",
      cnic: "37101-8888888-1",
      contactNo: "0300-2222222",
      whatsappNo: "0300-2222222",
      pending: 50000,
      paid: 10000,
      remaining: 40000,
      projects: [{ projectId: "p-4", serial: "QT-004", pending: 50000, paid: 10000, remaining: 40000 }],
    },
  ]);
  const user = userEvent.setup();
  render(<CustomerBalancesPage />);
  expect(await screen.findByRole("heading", { name: "Pending Balances" })).toBeTruthy();
  expect(within(screenTable()).getByText("Sheikh Zain")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Pending only" }));
  const table = within(screenTable());
  expect(table.getByText("Ayesha Khan")).toBeTruthy();
  expect(table.getByText("Bilal Ahmed")).toBeTruthy();
  expect(table.queryByText("Sheikh Zain")).toBeNull();
  const body = table.getAllByRole("row").filter((row) => row.parentElement?.tagName === "TBODY");
  expect(body).toHaveLength(2);
  expect(body[0]?.textContent).toMatch(/^1/);
  expect(body[0]?.textContent).toContain("Ayesha Khan");
  expect(body[1]?.textContent).toMatch(/^2/);
  expect(body[1]?.textContent).toContain("Bilal Ahmed");
});
