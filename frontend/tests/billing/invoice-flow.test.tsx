import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { InvoiceLetter } from "@/components/billing/BillingLetters";
import { InvoicesPage } from "@/components/billing/InvoicesPage";
import { ProjectsPage } from "@/components/billing/ProjectsPage";
import type { InvoiceRecord } from "@/lib/billing/documents-api";
import { formatDisplayDate, letterhead, type QuotationRecord } from "@/lib/billing/quotation-math";

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listAgreements: vi.fn(),
  listInvoices: vi.fn(),
  issueDirectInvoice: vi.fn(),
  completeProject: vi.fn(),
  disapproveProject: vi.fn(),
  nextDirectSaleSerial: vi.fn(),
  createDirectSale: vi.fn(),
  updateInvoiceDiscount: vi.fn(),
  updateDueDate: vi.fn(),
  deleteInvoice: vi.fn(),
  setPlanDiscount: vi.fn(),
  recordPayment: vi.fn(),
  saveAgreement: vi.fn(),
}));

vi.mock("@/lib/billing/quotations-api", () => ({
  listProjects: api.listProjects,
  disapproveProject: api.disapproveProject,
  setPlanDiscount: api.setPlanDiscount,
  searchCustomersByName: vi.fn().mockResolvedValue([]),
  findCustomerByCnic: vi.fn(),
  QuotationApiError: class QuotationApiError extends Error {},
}));

vi.mock("@/lib/billing/documents-api", () => ({
  listAgreements: api.listAgreements,
  listInvoices: api.listInvoices,
  issueDirectInvoice: api.issueDirectInvoice,
  completeProject: api.completeProject,
  nextDirectSaleSerial: api.nextDirectSaleSerial,
  createDirectSale: api.createDirectSale,
  updateInvoiceDiscount: api.updateInvoiceDiscount,
  updateDueDate: api.updateDueDate,
  deleteInvoice: api.deleteInvoice,
  recordPayment: api.recordPayment,
  saveAgreement: api.saveAgreement,
  DocumentApiError: class DocumentApiError extends Error {},
}));

vi.mock("@/lib/billing/whatsapp-api", () => ({
  sendWhatsAppDocument: vi.fn(),
  WhatsAppApiError: class WhatsAppApiError extends Error {},
}));

vi.mock("@/lib/billing/quotation-pdf", () => ({
  quotationToPdf: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function project(overrides: Partial<QuotationRecord> & Pick<QuotationRecord, "id" | "paymentMode">): QuotationRecord {
  return {
    serial: "QT-010",
    serialNumber: 10,
    quotationDate: "2026-10-01",
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw hybrid",
    downPayment: null,
    installmentCount: null,
    items: [{ lineNo: 1, description: "Hybrid inverter", qty: 1, unit: "Set", price: 673000, taxPercent: 0, taxableAmount: 673000, taxAmount: 0, lineTotal: 673000 }],
    taxableTotal: 673000,
    taxTotal: 0,
    grandTotal: 673000,
    installments: [],
    approvedAt: "2026-10-02",
    sourceQuotationId: "q1",
    kind: "project",
    status: "in_process",
    ...overrides,
  };
}

function invoice(record: QuotationRecord, overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv-1",
    projectId: record.id,
    serial: "INV-001",
    serialNumber: 1,
    kind: "advance",
    status: "due",
    invoiceDate: "2026-10-10",
    dueDate: null,
    paymentDate: null,
    paymentMode: null,
    advancePaid: 0,
    balanceDue: record.grandTotal,
    grandTotal: record.grandTotal,
    installmentNumber: null,
    payments: [],
    project: record,
    ...overrides,
  };
}

test("completed projects are listed and projects still in progress are not", async () => {
  const active = project({ id: "direct-1", serial: "QT-010", paymentMode: "direct", status: "in_process" });
  const done = project({ id: "done-1", serial: "QT-009", paymentMode: "direct", status: "completed" });
  api.listProjects.mockResolvedValue([active, done]);
  api.listAgreements.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([]);
  render(<ProjectsPage />);
  expect(await screen.findByRole("heading", { name: "Completed Projects" })).toBeDefined();
  expect(screen.getByText("QT-009")).toBeDefined();
  expect(screen.queryByText("QT-010")).toBeNull();
  expect(screen.queryByRole("button", { name: /create invoice/i })).toBeNull();
});

test("an installment pending invoice opens the dates and guarantor form", async () => {
  const installment = project({
    id: "inst-1",
    serial: "QT-011",
    paymentMode: "installments",
    downPayment: 250000,
    installmentCount: 2,
    installments: [{ number: 1, amount: 211500 }, { number: 2, amount: 211500 }],
  });
  const pending = invoice(installment, {
    id: "plan-inst-1-1",
    kind: "installment",
    installmentNumber: 1,
    grandTotal: 211500,
    balanceDue: 211500,
  });
  api.listProjects.mockResolvedValue([installment]);
  api.listInvoices.mockResolvedValue([pending]);
  const user = userEvent.setup();
  render(<InvoicesPage />);
  expect((await screen.findAllByRole("button", { name: /edit/i })).length).toBeGreaterThan(0);
  await user.click(screen.getAllByRole("button", { name: /agreement/i })[0]!);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(/down payment received/i);
  expect(dialog.textContent).toMatch(/balance after down payment/i);
  expect(screen.getByText(/installment 1 due date/i)).toBeDefined();
  expect(screen.getByText(/guarantor 1/i)).toBeDefined();
  expect(api.issueDirectInvoice).not.toHaveBeenCalled();
});

test("every invoice shows the bank instructions and the company email", () => {
  const record = project({ id: "direct-1" });
  render(<InvoiceLetter invoice={invoice(record, {
    status: "partial",
    advancePaid: 250000,
    balanceDue: 423000,
    payments: [{
      id: "pay-1",
      projectId: record.id,
      invoiceId: "inv-1",
      installmentNumber: null,
      expectedAmount: 673000,
      paidAmount: 250000,
      paymentDate: "2026-10-09",
      paymentMode: "cash",
    }],
  })} />);
  expect(screen.getByText(letterhead.phone)).toBeDefined();
  expect(screen.getByText(letterhead.email)).toBeDefined();
  expect(screen.getByText(letterhead.address).textContent).toContain("Attock");
  expect(screen.getByText(letterhead.address).textContent).not.toContain("Attack");
  expect(screen.getByText("Payment Instructions")).toBeDefined();
  expect(screen.getByText("Account Title : Electro Tech")).toBeDefined();
  expect(screen.getByText("Account Number : 57365002120531")).toBeDefined();
  expect(screen.getByText("Bank Name: Bank Alfalah.")).toBeDefined();
  expect(screen.getByText("Cash")).toBeDefined();
});

test("an installment invoice lists the installments that are still unpaid", () => {
  const record = project({
    id: "inst-1",
    paymentMode: "installments",
    downPayment: 250000,
    installmentCount: 3,
    installments: [
      { number: 1, amount: 141000 },
      { number: 2, amount: 141000 },
      { number: 3, amount: 141000 },
    ],
  });
  render(<InvoiceLetter invoice={invoice(record, {
    kind: "installment",
    installmentNumber: 1,
    grandTotal: 141000,
    balanceDue: 141000,
    schedule: [
      { number: 1, dueDate: "2026-11-01", amount: 141000, status: "due", paidAmount: 0, paidDate: null, paymentMode: null },
      { number: 2, dueDate: "2026-12-01", amount: 141000, status: "due", paidAmount: 0, paidDate: null, paymentMode: null },
      { number: 3, dueDate: "2027-01-01", amount: 141000, status: "paid", paidAmount: 141000, paidDate: "2026-10-01", paymentMode: "cash" },
    ],
  })} />);
  expect(screen.getByText("Down payment")).toBeDefined();
  expect(screen.getByText("Discount")).toBeDefined();
  expect(screen.getByText("Remaining balance")).toBeDefined();
  expect(screen.getByText("Installment breakdown")).toBeDefined();
  expect(screen.getByText(/Installment 2/)).toBeDefined();
  expect(screen.getByText(/Installment 3/)).toBeDefined();
  expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
});

test("a direct installment invoice can change its due date after it is created", async () => {
  const sale = project({
    id: "sale-1",
    serial: "DS-001",
    origin: "direct_sale",
    paymentMode: "installments",
    downPayment: 1000,
    installmentCount: 2,
    installments: [{ number: 1, amount: 1000 }, { number: 2, amount: 1000 }],
  });
  const created = invoice(sale, {
    serial: "INV-041",
    kind: "installment",
    installmentNumber: 1,
    dueDate: "2026-11-15",
    grandTotal: 1000,
    balanceDue: 1000,
    schedule: [
      { number: 1, dueDate: "2026-11-15", amount: 1000, status: "due", paidAmount: 0, paidDate: null, paymentMode: null },
      { number: 2, dueDate: "2027-02-01", amount: 1000, status: "due", paidAmount: 0, paidDate: null, paymentMode: null },
    ],
  });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([created]);
  api.updateDueDate.mockImplementation(async (_projectId: string, number: number, dueDate: string) => ({
    project: sale,
    invoices: [{
      ...created,
      dueDate: number === 1 ? dueDate : created.dueDate,
      schedule: created.schedule?.map((line) => line.number === number ? { ...line, dueDate } : line),
    }],
    payments: [],
    agreement: null,
    paidTotal: 0,
    balance: 2000,
  }));
  const user = userEvent.setup();
  render(<InvoicesPage />);
  await user.click(await screen.findByRole("button", { name: /view/i }));
  const first = screen.getByLabelText("Installment 1 due date");
  const second = screen.getByLabelText("Installment 2 due date");
  expect((first as HTMLInputElement).value).toBe("2026-11-15");
  expect((first as HTMLInputElement).disabled).toBe(false);
  expect((second as HTMLInputElement).value).toBe("2027-02-01");
  fireEvent.change(first, { target: { value: "2026-12-20" } });
  await waitFor(() => expect(api.updateDueDate).toHaveBeenCalledWith("sale-1", 1, "2026-12-20"));
  await waitFor(() => expect((screen.getByLabelText("Installment 1 due date") as HTMLInputElement).value).toBe("2026-12-20"));
});

test("duplicating an invoice opens a copy form so the customer can be changed", async () => {
  const sale = project({ id: "sale-1", serial: "DS-001", origin: "direct_sale", paymentMode: "direct" });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([invoice(sale, { serial: "INV-040", balanceDue: 673000 })]);
  api.nextDirectSaleSerial.mockResolvedValue("DS-002");
  const user = userEvent.setup();
  render(<InvoicesPage />);
  await user.click(await screen.findByRole("button", { name: /duplicate/i }));
  expect(await screen.findByRole("heading", { name: "Copy invoice" })).toBeDefined();
  expect((screen.getByLabelText("Customer name") as HTMLInputElement).value).toBe("Sheikh Zain");
  expect(api.createDirectSale).not.toHaveBeenCalled();
});

function mixedInvoices(): InvoiceRecord[] {
  const sale = project({ id: "sale-1", serial: "DS-001", origin: "direct_sale", paymentMode: "direct" });
  const work = project({ id: "p-1", paymentMode: "direct", customerName: "Ali Raza" });
  return [
    invoice(sale, { serial: "INV-040" }),
    invoice(work, { id: "inv-41", serial: "INV-041" }),
  ];
}

test("invoices page lists direct and project invoices together", async () => {
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue(mixedInvoices());
  render(<InvoicesPage />);
  expect(await screen.findByRole("heading", { level: 1, name: "Invoices" })).toBeDefined();
  expect(await screen.findByText("INV-040")).toBeDefined();
  expect(screen.getByText("INV-041")).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Direct Invoices" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Project invoices" })).toBeNull();
  expect(screen.getByRole("button", { name: /direct invoice/i })).toBeDefined();
});

test("invoices page searches by customer name", async () => {
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue(mixedInvoices());
  const user = userEvent.setup();
  render(<InvoicesPage />);
  expect(await screen.findByText("INV-040")).toBeDefined();
  const search = screen.getByLabelText("Search invoices by customer name");
  await user.type(search, "ali");
  expect(screen.queryByText("INV-040")).toBeNull();
  expect(screen.getByText("INV-041")).toBeDefined();
  await user.clear(search);
  await user.type(search, "nobody");
  expect(screen.getByRole("heading", { name: "No matching invoices" })).toBeDefined();
});

test("receive payment on an installment invoice records that installment", async () => {
  const work = project({ id: "p-2", paymentMode: "installments" });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([invoice(work, { id: "inv-7", serial: "INV-007", kind: "installment", installmentNumber: 2, grandTotal: 50000, balanceDue: 50000 })]);
  api.recordPayment.mockResolvedValue({ project: work, invoices: [], payments: [], agreement: null, paidTotal: 20000, balance: 30000 });
  const user = userEvent.setup();
  render(<InvoicesPage />);
  await user.click(await screen.findByRole("button", { name: /receive payment/i }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("INV-007");
  await user.type(within(dialog).getByLabelText("Paid amount"), "20000");
  await user.click(within(dialog).getByRole("button", { name: "Receive payment" }));
  await waitFor(() => expect(api.recordPayment).toHaveBeenCalledWith("p-2", expect.objectContaining({ kind: "installment", installmentNumber: 2, paidAmount: 20000 })));
  expect(api.saveAgreement).not.toHaveBeenCalled();
});

test("receive payment on a direct invoice records a direct payment", async () => {
  const sale = project({ id: "sale-9", serial: "DS-009", origin: "direct_sale", paymentMode: "direct" });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([invoice(sale, { serial: "INV-050", kind: "advance", advancePaid: 0 })]);
  api.recordPayment.mockResolvedValue({ project: sale, invoices: [], payments: [], agreement: null, paidTotal: 2000, balance: 0 });
  const user = userEvent.setup();
  render(<InvoicesPage />);
  await user.click(await screen.findByRole("button", { name: /receive payment/i }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Paid amount"), "1000");
  await user.click(within(dialog).getByRole("button", { name: "Receive payment" }));
  await waitFor(() => expect(api.recordPayment).toHaveBeenCalledWith("sale-9", expect.objectContaining({ kind: "direct", paidAmount: 1000 })));
});

test("an installment invoice shows its due date instead of the invoice date", () => {
  const work = project({ id: "p-3", paymentMode: "installments" });
  render(<InvoiceLetter invoice={invoice(work, { kind: "installment", installmentNumber: 3, invoiceDate: "2026-10-10", dueDate: "2027-01-15", grandTotal: 50000, balanceDue: 50000 })} />);
  const dueTerm = screen.getByText("Due date", { selector: "dt" });
  expect(dueTerm.nextElementSibling?.textContent).toBe(formatDisplayDate("2027-01-15"));
  expect(screen.queryByText("Invoice date", { selector: "dt" })).toBeNull();
});

test("installment invoices stay on the invoices page until every installment is paid, then move as one combined invoice", async () => {
  const plan = project({ id: "p-9", paymentMode: "installments", customerName: "Plan Customer", installmentCount: 2, installments: [{ number: 1, amount: 40000 }, { number: 2, amount: 40000 }] });
  const paidOne = invoice(plan, { id: "inv-a", serial: "INV-020", kind: "installment", installmentNumber: 1, grandTotal: 40000, balanceDue: 0, advancePaid: 40000, status: "paid" });
  const dueTwo = invoice(plan, { id: "inv-b", serial: "INV-021", kind: "installment", installmentNumber: 2, grandTotal: 40000, balanceDue: 40000 });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices.mockResolvedValue([paidOne, dueTwo]);
  const first = render(<InvoicesPage />);
  const paidCard = (await screen.findByText("INV-020")).closest("article") as HTMLElement;
  expect(within(paidCard).getByText("Paid", { selector: "div > span" })).toBeDefined();
  const dueCard = screen.getByText("INV-021").closest("article") as HTMLElement;
  expect(within(dueCard).getByText("Due", { selector: "div > span" })).toBeDefined();
  first.unmount();

  const done = render(<InvoicesPage completed />);
  await waitFor(() => expect(screen.queryByText("Loading invoices�")).toBeNull());
  expect(screen.queryByText("INV-020")).toBeNull();
  done.unmount();

  const paidTwo = { ...dueTwo, balanceDue: 0, advancePaid: 40000, status: "paid" as const };
  api.listInvoices.mockResolvedValue([paidOne, paidTwo]);
  const open = render(<InvoicesPage />);
  await waitFor(() => expect(screen.queryByText("Loading invoices�")).toBeNull());
  expect(screen.queryByText("INV-020")).toBeNull();
  open.unmount();

  render(<InvoicesPage completed />);
  expect(await screen.findByText(/^INV-020 . INV-021$/)).toBeDefined();
  expect(screen.getByText(/^Paid . 2 installments$/)).toBeDefined();
  expect(screen.getAllByRole("heading", { name: "Plan Customer" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: /edit/i })).toBeDefined();
  expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
});

test("an approved quotation's invoice can be undone back to quotations until a payment is recorded", async () => {
  const work = project({ id: "p-20", serial: "QT-020", paymentMode: "direct" });
  const paid = project({ id: "p-21", serial: "QT-021", paymentMode: "direct", customerName: "Paid Customer", sourceQuotationId: "q2" });
  api.listProjects.mockResolvedValue([]);
  api.listInvoices
    .mockResolvedValueOnce([
      invoice(work, { id: "inv-60", serial: "INV-060" }),
      invoice(paid, { id: "inv-61", serial: "INV-061", payments: [{ id: "pay-1", projectId: "p-21", invoiceId: "inv-61", installmentNumber: null, expectedAmount: 1000, paidAmount: 1000, paymentDate: "2026-10-11", paymentMode: "cash" }] }),
    ])
    .mockResolvedValue([invoice(paid, { id: "inv-61", serial: "INV-061" })]);
  api.disapproveProject.mockResolvedValue({ ...work, kind: "quotation", serial: "QT-020", approvedAt: null });
  const user = userEvent.setup();
  render(<InvoicesPage />);
  const paidCard = (await screen.findByText("INV-061")).closest("article") as HTMLElement;
  expect(within(paidCard).queryByRole("button", { name: /undo approval/i })).toBeNull();
  const card = screen.getByText("INV-060").closest("article") as HTMLElement;
  await user.click(within(card).getByRole("button", { name: /undo approval/i }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /undo approval/i }));
  await waitFor(() => expect(api.disapproveProject).toHaveBeenCalledWith("p-20"));
  expect(await screen.findByText("QT-020 is back in Quotations and its invoice was removed.")).toBeDefined();
  expect(screen.queryByText("INV-060")).toBeNull();
});