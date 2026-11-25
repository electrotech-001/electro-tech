import { cleanup, render, screen } from "@testing-library/react";
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

test("lists customers in serial order with pending, paid, and remaining balance", async () => {
  api.listCustomerBalances.mockResolvedValue(rows);
  render(<CustomerBalancesPage />);

  expect(await screen.findByRole("heading", { name: "Pending Balances" })).toBeTruthy();
  const table = screen.getByRole("table");
  const body = table.querySelectorAll("tbody tr");
  expect(body).toHaveLength(2);
  expect(body[0]?.textContent).toContain("1");
  expect(body[0]?.textContent).toContain("Ayesha Khan");
  expect(body[0]?.textContent).toContain("QT-003");
  expect(body[0]?.textContent).toContain(formatRupees(100000));
  expect(body[1]?.textContent).toContain("Sheikh Zain");
  expect(body[1]?.textContent).toContain(formatRupees(250000));
  expect(body[1]?.textContent).toContain(formatRupees(423000));
  expect(screen.getByRole("link", { name: "Sheikh Zain" }).getAttribute("href")).toBe("/billing/profiles/3710112345671");
  expect(screen.getAllByText(formatRupees(523000)).length).toBeGreaterThan(0);
});

test("pending only hides customers whose balance is clear", async () => {
  api.listCustomerBalances.mockResolvedValue([
    rows[0] as CustomerBalance,
    { ...rows[1], paid: 673000, remaining: 0, pending: 673000, projects: [{ projectId: "p-1", serial: "QT-001", pending: 673000, paid: 673000, remaining: 0 }] },
  ]);
  const user = userEvent.setup();
  render(<CustomerBalancesPage />);
  expect(await screen.findByText("Sheikh Zain")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Pending only" }));
  expect(screen.getByText("Ayesha Khan")).toBeTruthy();
  expect(screen.queryByText("Sheikh Zain")).toBeNull();
});
