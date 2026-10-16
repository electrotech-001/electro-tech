import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DashboardView } from "@/components/billing/DashboardView";
import { formatRupees } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listSummary: vi.fn(),
  listProjects: vi.fn(),
  listInvoices: vi.fn(),
  listDiscounts: vi.fn(),
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listSummary: api.listSummary,
  listInvoices: api.listInvoices,
  listDiscounts: api.listDiscounts,
  DocumentApiError: class DocumentApiError extends Error {},
}));

vi.mock("@/lib/billing/quotations-api", () => ({
  listProjects: api.listProjects,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("dashboard shows live pending, received, and discount amounts", async () => {
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([{ id: "inv-1", balanceDue: 408000, status: "due", project: { id: "p1", origin: "project", status: "in_process", paymentMode: "direct", installments: [] } }]);
  api.listDiscounts.mockResolvedValue([{ discountAmount: 10000 }, { discountAmount: 5000 }]);
  api.listSummary.mockResolvedValue({
    quotations: 4,
    projectsInProcess: 2,
    projectsCompleted: 1,
    openInvoices: 3,
    overdueInstallments: 0,
    receivedTotal: 250000,
    paymentCount: 2,
    recent: [],
  });
  render(<DashboardView />);
  expect(await screen.findByText("Pending amount")).toBeDefined();
  expect(screen.getByText("Received amount")).toBeDefined();
  expect(screen.getByText("Discount amount")).toBeDefined();
  expect(screen.getByText(formatRupees(408000))).toBeDefined();
  expect(screen.getByText(formatRupees(250000))).toBeDefined();
  expect(screen.getByText(formatRupees(15000))).toBeDefined();
  expect(screen.queryByText(/NaN/)).toBeNull();
  expect(screen.getByRole("link", { name: /Pending amount/ }).getAttribute("href")).toBe("/billing/invoices");
  expect(screen.getByRole("link", { name: /Received amount/ }).getAttribute("href")).toBe("/billing/ledger");
  expect(screen.getByRole("link", { name: /Discount amount/ }).getAttribute("href")).toBe("/billing/discounts");
});
