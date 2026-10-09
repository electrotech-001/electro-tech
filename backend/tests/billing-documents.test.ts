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
    cnicFront: image,
    cnicBack: image,
  };
}

test("direct agreement has no guarantors and the balance invoice closes at zero", async () => {
  const repository = createMemoryDocumentsRepository([project("direct")]);
  const agreement = await repository.saveAgreement("project-1", { dueDates: [], guarantors: [] });
  assert.equal(agreement.serial, "AG-001");
  assert.equal(agreement.guarantors.length, 0);

  const partial = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 250000,
    paymentDate: "2026-10-09",
    paymentMode: "cash",
  });
  assert.equal(partial.balance, 423000);
  assert.equal(partial.invoices[0]?.status, "partial");

  const settled = await repository.recordPayment("project-1", {
    kind: "direct",
    paidAmount: 423000,
    paymentDate: "2026-11-01",
    paymentMode: "bank_transfer",
  });
  const closing = settled.invoices.find((invoice) => invoice.kind === "settlement");
  assert.equal(closing?.balanceDue, 0);
  assert.equal(closing?.status, "paid");
  assert.equal(closing?.payments.length, 2);
  assert.equal(settled.invoices.some((invoice) => invoice.status === "partial"), true);
});

test("installment agreement stores two guarantors and a received card updates the rest", async () => {
  const repository = createMemoryDocumentsRepository([project("installments")]);
  await assert.rejects(
    () => repository.saveAgreement("project-1", { dueDates: ["2026-11-01"], guarantors: [] }),
    /both guarantors/,
  );
  const agreement = await repository.saveAgreement("project-1", {
    dueDates: ["2026-11-01", "2026-12-01", "2027-01-01"],
    guarantors: [guarantor("Ali Raza"), guarantor("Sara Khan")],
  });
  assert.equal(agreement.guarantors.length, 2);
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
  const unpaid = received.agreement?.schedule.filter((line) => line.status === "due") ?? [];
  assert.equal(unpaid.reduce((sum, line) => sum + line.amount, 0), 282000);

  const edited = await repository.updateDueDate("project-1", 2, "2026-12-15");
  assert.equal(edited.agreement?.schedule.find((line) => line.number === 2)?.dueDate, "2026-12-15");
  await repository.completeProject("project-1");
  assert.equal((await repository.listReceiveProjects()).length, 0);
});
