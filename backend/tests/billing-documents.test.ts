import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryDocumentsRepository } from "../src/services/billing/documents-store.js";
import type { QuotationRecord } from "../src/services/billing/quotation-store.js";

const image = "data:image/png;base64,aaaa";

function project(mode: "direct" | "installments"): QuotationRecord {
  const installment = mode === "installments";
  return {
    id: "project-1",
    serial: "QT-001",
    serialNumber: 1,
    quotationDate: "2026-10-09",
    customerName: "Sheikh Zain",
    cnic: "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw Goodwe Hybrid Inverter",
    paymentMode: mode,
    downPayment: installment ? 250000 : null,
    installmentCount: installment ? 3 : null,
    items: [{
      lineNo: 1,
      description: "Hybrid inverter",
      qty: 1,
      unit: "Set",
      price: 673000,
      taxPercent: 0,
      taxableAmount: 673000,
      taxAmount: 0,
      lineTotal: 673000,
    }],
    taxableTotal: 673000,
    taxTotal: 0,
    grandTotal: 673000,
    installments: installment
      ? [{ number: 1, amount: 141000 }, { number: 2, amount: 141000 }, { number: 3, amount: 141000 }]
      : [],
    approvedAt: null,
    sourceQuotationId: "quote-1",
    kind: "project",
    status: "in_process",
  };
}

function guarantor(name: string) {
  return {
    fullName: name,
    designation: "Officer",
    occupation: "Teacher",
    sector: "government" as const,
    contactNo: "0300-5607350",
    cnic: "37101-1234567-1",
    cnicFront: image,
    cnicBack: image,
  };
}

test("direct agreement has no guarantors and the balance invoice closes at zero", async () => {
  const repository = createMemoryDocumentsRepository([project("direct")]);
  const agreement = await repository.saveAgreement("project-1", { dueDates: [], guarantors: [] });
  assert.equal(agreement.serial, "AG-001");
  assert.equal(agreement.guarantors.length, 0);
  assert.equal(agreement.body, null);
  const revised = await repository.updateAgreementWording(agreement.id, "The customer will pay the agreed amount in one transfer.");
  assert.equal(revised.body, "The customer will pay the agreed amount in one transfer.");

  const issued = await repository.issueInvoice("project-1");
  assert.equal(issued.invoices.length, 1);
  assert.equal(issued.invoices[0]?.status, "due");
  assert.equal(issued.invoices[0]?.balanceDue, 673000);
  await assert.rejects(() => repository.issueInvoice("project-1"), /already created/);

  const partial = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 250000,
    paymentDate: "2026-10-09",
    paymentMode: "cash",
  });
  assert.equal(partial.balance, 423000);
  assert.equal(partial.invoices.length, 1);
  assert.equal(partial.invoices[0]?.status, "partial");
  assert.equal(partial.invoices[0]?.balanceDue, 423000);
  assert.equal(partial.invoices[0]?.payments.length, 1);

  const settled = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 423000,
    paymentDate: "2026-11-01",
    paymentMode: "bank_transfer",
  });
  assert.equal(settled.invoices.length, 1);
  const closing = settled.invoices[0];
  assert.equal(closing?.balanceDue, 0);
  assert.equal(closing?.status, "paid");
  assert.equal(closing?.payments.length, 2);
  assert.equal(closing?.payments[0]?.paymentMode, "cash");
  assert.equal(closing?.payments[1]?.paymentDate, "2026-11-01");

  const removed = await repository.deleteInvoice(closing?.id ?? "");
  assert.equal(removed.invoices.length, 0);
  assert.equal(removed.payments.length, 0);
  const reissued = await repository.issueInvoice("project-1");
  assert.equal(reissued.invoices.length, 1);
  assert.equal(reissued.invoices[0]?.status, "due");
});

test("a discount after the down payment is divided across the installment invoices", async () => {
  const repository = createMemoryDocumentsRepository([project("installments")]);
  const agreement = await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [],
    planDiscount: 45000,
  });
  assert.equal(agreement.schedule.reduce((sum, line) => sum + line.amount, 0), 378000);
  assert.equal(agreement.schedule.every((line) => line.amount === 126000), true);
  assert.equal(agreement.project.planDiscount, 45000);
  const invoices = await repository.listInvoices();
  assert.equal(invoices.every((invoice) => invoice.serial.startsWith("INV-")), true);
  assert.equal(invoices.some((invoice) => invoice.serial.startsWith("QT-")), false);
});

test("installment agreement stores one optional guarantor and a received card updates the rest", async () => {
  const emptyRepo = createMemoryDocumentsRepository([project("installments")]);
  const withoutGuarantor = await emptyRepo.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [],
  });
  assert.equal(withoutGuarantor.guarantors.length, 0);

  const repository = createMemoryDocumentsRepository([project("installments")]);
  await assert.rejects(
    () => repository.saveAgreement("project-1", {
      dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
      guarantors: [guarantor("Ali Raza"), guarantor("Sara Khan")],
    }),
    /only one guarantor/i,
  );
  const namedOnly = { ...guarantor("Ali Raza"), designation: "", occupation: "", contactNo: "", cnic: "", cnicFront: "", cnicBack: "" };
  const agreement = await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [namedOnly],
  });
  assert.equal(agreement.guarantors.length, 1);
  assert.equal(agreement.guarantors[0]?.fullName, "Ali Raza");
  assert.equal(agreement.guarantors[0]?.cnicFront, "");
  assert.equal(agreement.schedule.length, 3);
  const guarantors = await repository.listGuarantors();
  assert.equal(guarantors[0]?.customerName, "Sheikh Zain");

  const received = await repository.recordPayment("project-1", {
    kind: "installment",
    installmentNumber: 1,
    paidAmount: 141000,
    paymentDate: "2026-11-01",
    paymentMode: "cash",
  });
  const first = received.agreement?.schedule.find((line) => line.number === 1);
  assert.equal(first?.status, "paid");
  assert.equal(received.invoices.find((invoice) => invoice.installmentNumber === 1)?.status, "paid");
  const installmentInvoices = received.invoices.filter((invoice) => invoice.kind === "installment");
  assert.equal(installmentInvoices.every((invoice) => invoice.schedule?.find((line) => line.number === 1)?.status === "paid"), true);
  assert.equal(installmentInvoices.every((invoice) => invoice.schedule?.find((line) => line.number === 1)?.paidDate === "2026-11-01"), true);
  const unpaid = received.agreement?.schedule.filter((line) => line.status === "due") ?? [];
  assert.equal(unpaid.reduce((sum, line) => sum + line.amount, 0), 282000);

  const third = received.invoices.find((invoice) => invoice.installmentNumber === 3);
  const afterDelete = await repository.deleteInvoice(third?.id ?? "");
  assert.equal(afterDelete.invoices.some((invoice) => invoice.installmentNumber === 3), false);
  assert.equal(afterDelete.invoices.find((invoice) => invoice.installmentNumber === 1)?.status, "paid");
  assert.equal(afterDelete.agreement?.schedule.length, 2);

  const edited = await repository.updateDueDate("project-1", 2, "2026-12-15");
  assert.equal(edited.agreement?.schedule.find((line) => line.number === 2)?.dueDate, "2026-12-15");
  await repository.completeProject("project-1");
  assert.equal((await repository.listReceiveProjects()).length, 0);
  const ledger = await repository.listLedger();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.customerName, "Sheikh Zain");
  assert.equal(ledger[0]?.paidAmount, 141000);
  assert.equal(ledger[0]?.projectSerial, "QT-001");
  await repository.renameCustomer(["project-1"], "Sheikh Zain Ali");
  const people = await repository.listGuarantors();
  assert.equal(people.every((person) => person.customerName === "Sheikh Zain Ali"), true);
  assert.equal((await repository.listLedger())[0]?.customerName, "Sheikh Zain Ali");
  const summary = await repository.summary();
  assert.equal(summary.paymentCount, 1);
  assert.equal(summary.receivedTotal, 141000);
  assert.equal(summary.projectsInProcess, 0);
  assert.equal(summary.projectsCompleted, 1);
  assert.equal(summary.recent[0]?.customerName, "Sheikh Zain Ali");
});

test("a discount on the invoice and on the payment both reduce the balance", async () => {
  const repository = createMemoryDocumentsRepository([project("direct")]);
  const issued = await repository.issueInvoice("project-1");
  const invoiceId = issued.invoices[0]?.id ?? "";
  const discounted = await repository.setInvoiceDiscount(invoiceId, 10000);
  assert.equal(discounted.invoices[0]?.discountAmount, 10000);
  assert.equal(discounted.invoices[0]?.balanceDue, 663000);
  assert.equal(discounted.balance, 663000);

  const paid = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 250000,
    discountAmount: 5000,
    paymentDate: "2026-10-09",
    paymentMode: "cash",
  });
  assert.equal(paid.payments[0]?.discountAmount, 5000);
  assert.equal(paid.invoices[0]?.discountAmount, 10000);
  assert.equal(paid.invoices[0]?.balanceDue, 408000);
  assert.equal(paid.balance, 408000);
  await assert.rejects(
    () => repository.setInvoiceDiscount(invoiceId, 500000),
    /remaining balance/,
  );
});

test("an installment invoice discount lowers that invoice without relabeling the quotation", async () => {
  const repository = createMemoryDocumentsRepository([project("installments")]);
  await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [guarantor("Ali Raza")],
  });
  const invoiceId = (await repository.listInvoices()).find((invoice) => invoice.installmentNumber === 1)?.id ?? "";
  const discounted = await repository.setInvoiceDiscount(invoiceId, 10000);
  assert.equal(discounted.agreement?.schedule.find((line) => line.number === 1)?.discountAmount, 10000);
  assert.equal(discounted.agreement?.schedule.find((line) => line.number === 2)?.amount, 141000);
  assert.equal(discounted.invoices.find((invoice) => invoice.installmentNumber === 1)?.balanceDue, 131000);
  assert.equal(discounted.balance, 663000);

  const received = await repository.recordPayment("project-1", {
    kind: "installment",
    installmentNumber: 1,
    paidAmount: 131000,
    discountAmount: 0,
    paymentDate: "2026-11-01",
    paymentMode: "cash",
  });
  assert.equal(received.agreement?.schedule.find((line) => line.number === 1)?.status, "paid");
  assert.equal(received.balance, 532000);
  const unpaid = received.agreement?.schedule.filter((line) => line.status === "due") ?? [];
  assert.equal(unpaid.reduce((sum, line) => sum + line.amount, 0), 282000);
});

test("a partial installment payment stays on that installment", async () => {
  const base = project("installments");
  const quoted: QuotationRecord = {
    ...base,
    downPayment: 0,
    installmentCount: 2,
    items: [{
      lineNo: 1,
      description: "Battery",
      qty: 1,
      unit: "Set",
      price: 100000,
      taxPercent: 0,
      taxableAmount: 100000,
      taxAmount: 0,
      lineTotal: 100000,
    }],
    taxableTotal: 100000,
    taxTotal: 0,
    grandTotal: 100000,
    installments: [{ number: 1, amount: 50000 }, { number: 2, amount: 50000 }],
  };
  const repository = createMemoryDocumentsRepository([quoted]);
  await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01"],
    guarantors: [guarantor("Ali Raza")],
  });
  const received = await repository.recordPayment("project-1", {
    kind: "installment",
    installmentNumber: 1,
    paidAmount: 25000,
    paymentDate: "2026-11-01",
    paymentMode: "cash",
  });
  const first = received.agreement?.schedule.find((line) => line.number === 1);
  const second = received.agreement?.schedule.find((line) => line.number === 2);
  assert.equal(first?.amount, 50000);
  assert.equal(first?.paidAmount, 25000);
  assert.equal(first?.status, "due");
  assert.equal(second?.amount, 50000);
  assert.equal(second?.paidAmount, 0);
  assert.equal(second?.status, "due");
  const firstInvoice = received.invoices.find((invoice) => invoice.installmentNumber === 1);
  const secondInvoice = received.invoices.find((invoice) => invoice.installmentNumber === 2);
  assert.equal(firstInvoice?.grandTotal, 50000);
  assert.equal(firstInvoice?.balanceDue, 25000);
  assert.equal(firstInvoice?.status, "partial");
  assert.equal(secondInvoice?.grandTotal, 50000);
  assert.equal(secondInvoice?.balanceDue, 50000);
  assert.equal(secondInvoice?.status, "due");
  assert.equal(received.balance, 75000);

  const closed = await repository.recordPayment("project-1", {
    kind: "installment",
    installmentNumber: 1,
    paidAmount: 25000,
    paymentDate: "2026-11-15",
    paymentMode: "cash",
  });
  assert.equal(closed.agreement?.schedule.find((line) => line.number === 1)?.status, "paid");
  assert.equal(closed.agreement?.schedule.find((line) => line.number === 2)?.amount, 50000);
  assert.equal(closed.invoices.find((invoice) => invoice.installmentNumber === 2)?.grandTotal, 50000);
  assert.equal(closed.balance, 50000);
});

test("a direct receipt can close the balance with cash plus a discount, and a full discount can close it with no cash", async () => {
  const base = project("direct");
  const quoted: QuotationRecord = {
    ...base,
    items: [{
      lineNo: 1,
      description: "Hybrid inverter",
      qty: 1,
      unit: "Set",
      price: 200000,
      taxPercent: 0,
      taxableAmount: 200000,
      taxAmount: 0,
      lineTotal: 200000,
    }],
    taxableTotal: 200000,
    taxTotal: 0,
    grandTotal: 200000,
  };
  const repository = createMemoryDocumentsRepository([quoted]);
  await repository.issueInvoice("project-1");
  await repository.recordPayment("project-1", { kind: "direct", paidAmount: 50000, paymentDate: "2026-10-01", paymentMode: "cash" });
  await repository.recordPayment("project-1", { kind: "direct", paidAmount: 100000, paymentDate: "2026-10-05", paymentMode: "cash" });
  const closed = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 45000,
    discountAmount: 5000,
    paymentDate: "2026-10-09",
    paymentMode: "cash",
  });
  const last = closed.payments.find((payment) => payment.paidAmount === 45000);
  assert.equal(last?.expectedAmount, 50000);
  assert.equal(last?.discountAmount, 5000);
  assert.equal(last?.paidAmount, 45000);
  assert.equal(closed.invoices[0]?.status, "paid");
  assert.equal(closed.invoices[0]?.balanceDue, 0);
  assert.equal(closed.invoices[0]?.advancePaid, 195000);
  assert.equal(closed.balance, 0);
  assert.equal(closed.invoices[0]?.payments.length, 3);

  const forgiven = createMemoryDocumentsRepository([quoted]);
  await forgiven.issueInvoice("project-1");
  await forgiven.recordPayment("project-1", { kind: "direct", paidAmount: 195000, paymentDate: "2026-10-08", paymentMode: "cash" });
  const writtenOff = await forgiven.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 0,
    discountAmount: 5000,
    paymentDate: "2026-10-11",
    paymentMode: "cash",
  });
  const waiver = writtenOff.payments.find((payment) => payment.paidAmount === 0);
  assert.equal(waiver?.expectedAmount, 5000);
  assert.equal(waiver?.discountAmount, 5000);
  assert.equal(writtenOff.invoices[0]?.status, "paid");
  assert.equal(writtenOff.invoices[0]?.balanceDue, 0);
  assert.equal(writtenOff.balance, 0);
  assert.equal((await forgiven.listLedger()).length, 1);
  const discounts = await forgiven.listDiscounts();
  assert.equal(discounts.length, 1);
  assert.equal(discounts[0]?.customerName, "Sheikh Zain");
  assert.equal(discounts[0]?.discountAmount, 5000);
  assert.equal(discounts[0]?.balanceAmount, 5000);
  assert.equal(discounts[0]?.paidAmount, 0);
  await assert.rejects(
    () => forgiven.recordPayment("project-1", { kind: "direct", paidAmount: 0, discountAmount: 0, paymentDate: "2026-10-12", paymentMode: "cash" }),
    /paid amount or a discount/,
  );
});

test("installment invoices record the down payment in the ledger and keep the quotation installments", async () => {
  const repository = createMemoryDocumentsRepository([project("installments")]);
  await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [],
    opening: { paidAmount: 250000, paymentDate: "2026-10-10", paymentMode: "cash" },
  });
  const created = await repository.listInvoices();
  assert.equal(created.some((invoice) => invoice.kind === "advance"), false);
  assert.equal(created.filter((invoice) => invoice.kind === "installment").length, 3);
  assert.equal(created.every((invoice) => invoice.openingPayments?.[0]?.paidAmount === 250000), true);
  const workspace = await repository.workspace("project-1");
  assert.equal(workspace.balance, 423000);
  assert.equal(workspace.payments.length, 1);
  const ledger = await repository.listLedger();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.paidAmount, 250000);
  assert.equal(ledger[0]?.paymentKind, "down");
  assert.equal(ledger[0]?.paymentMode, "cash");
  assert.equal(ledger[0]?.installmentNumber, null);
});

test("a direct invoice records the advance on the same invoice and in the ledger", async () => {
  const quoted = { ...project("direct"), downPayment: 200000 };
  const repository = createMemoryDocumentsRepository([quoted]);
  const issued = await repository.issueInvoice("project-1", {
    paidAmount: 200000,
    paymentDate: "2026-10-10",
    paymentMode: "bank_transfer",
  });
  assert.equal(issued.invoices.length, 1);
  assert.equal(issued.invoices[0]?.grandTotal, 673000);
  assert.equal(issued.invoices[0]?.advancePaid, 200000);
  assert.equal(issued.invoices[0]?.balanceDue, 473000);
  assert.equal(issued.invoices[0]?.status, "partial");
  assert.equal(issued.balance, 473000);
  assert.equal(issued.invoices.some((invoice) => invoice.kind === "settlement"), false);
  const ledger = await repository.listLedger();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.paidAmount, 200000);
  assert.equal(ledger[0]?.paymentKind, "direct");
  assert.equal(ledger[0]?.paymentMode, "bank_transfer");
  assert.equal(ledger[0]?.invoiceSerial, issued.invoices[0]?.serial);

  const rest = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 473000,
    paymentDate: "2026-10-11",
    paymentMode: "cash",
  });
  assert.equal(rest.balance, 0);
  assert.equal(rest.invoices.length, 1);
  assert.equal(rest.invoices[0]?.status, "paid");
  assert.equal((await repository.listLedger()).length, 2);
});

test("a direct invoice can be created when no advance was received", async () => {
  const quoted = { ...project("direct"), downPayment: 200000 };
  const repository = createMemoryDocumentsRepository([quoted]);
  const issued = await repository.issueInvoice("project-1", { paidAmount: 0, paymentDate: "", paymentMode: "cash" });
  assert.equal(issued.invoices.length, 1);
  assert.equal(issued.invoices[0]?.grandTotal, 673000);
  assert.equal(issued.invoices[0]?.advancePaid, 0);
  assert.equal(issued.invoices[0]?.balanceDue, 673000);
  assert.equal(issued.payments.length, 0);
  assert.equal((await repository.listLedger()).length, 0);
});

test("a down payment received before the invoices stays in the ledger and is not its own invoice", async () => {
  const repository = createMemoryDocumentsRepository([project("installments")]);
  const received = await repository.recordPayment("project-1", {
    kind: "opening",
    paidAmount: 100000,
    paymentDate: "2026-10-10",
    paymentMode: "cash",
  });
  assert.equal(received.invoices.length, 0);
  assert.equal(received.balance, 573000);
  assert.equal(received.payments[0]?.installmentNumber, null);
  await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [],
    opening: { paidAmount: 0, paymentDate: "2026-10-10", paymentMode: "cash" },
  });
  const invoices = await repository.listInvoices();
  assert.equal(invoices.some((invoice) => invoice.kind === "advance"), false);
  assert.equal(invoices.filter((invoice) => invoice.kind === "installment").length, 3);
  assert.equal(invoices[0]?.openingPayments?.[0]?.paidAmount, 100000);
  const ledger = await repository.listLedger();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.paymentKind, "down");
});

test("a daily sale invoice is created without a quotation and payments go to the ledger", async () => {
  const repository = createMemoryDocumentsRepository([]);
  const saved = await repository.createDirectSale({
    quotationDate: "2026-10-12",
    customerName: "Walk-in Customer",
    cnic: "",
    address: "Attock City",
    contactNo: "0300-5607350",
    whatsappNo: "",
    customerPackage: "MCB 63A",
    paymentMode: "direct",
    downPayment: null,
    installmentCount: null,
    items: [{ description: "MCB 63A", qty: 2, unit: "Nos", price: 1500, taxPercent: 0 }],
  }, { paidAmount: 1000, paymentDate: "2026-10-12", paymentMode: "cash" });
  assert.equal(saved.project.origin, "direct_sale");
  assert.match(saved.project.serial, /^DS-/);
  assert.equal(saved.invoices.length, 1);
  assert.match(saved.invoices[0]?.serial ?? "", /^INV-/);
  assert.equal(saved.payments.length, 1);
  assert.equal(saved.balance, 2000);
  const invoices = await repository.listInvoices();
  assert.equal(invoices.length, 1);
  const receivable = await repository.listReceiveProjects();
  assert.equal(receivable.some((row) => row.project.id === saved.project.id), true);
  const ledger = await repository.listLedger();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.paidAmount, 1000);
  assert.equal(ledger[0]?.paymentKind, "direct");
  assert.equal(ledger[0]?.invoiceSerial, saved.invoices[0]?.serial);
});

test("a daily sale discount lowers the invoice balance", async () => {
  const repository = createMemoryDocumentsRepository([]);
  const saved = await repository.createDirectSale({
    quotationDate: "2026-10-12",
    customerName: "Walk-in Customer",
    cnic: "",
    address: "Attock City",
    contactNo: "",
    whatsappNo: "",
    customerPackage: "MCB 63A",
    paymentMode: "direct",
    downPayment: null,
    planDiscount: 500,
    installmentCount: null,
    items: [{ description: "MCB 63A", qty: 2, unit: "Nos", price: 1500, taxPercent: 0 }],
  }, { paidAmount: 1000, paymentDate: "2026-10-12", paymentMode: "cash" });
  assert.equal(saved.project.planDiscount, 500);
  assert.equal(saved.invoices[0]?.discountAmount, 500);
  assert.equal(saved.balance, 1500);
  const discounts = await repository.listDiscounts();
  assert.equal(discounts.some((entry) => entry.discountAmount === 500), true);
});
