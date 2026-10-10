import { expect, test } from "vitest";
import { activeCustomers, customerKey, groupCustomers } from "@/lib/billing/customers";
import type { QuotationRecord } from "@/lib/billing/quotation-math";

function record(overrides: Partial<QuotationRecord> & Pick<QuotationRecord, "id" | "kind">): QuotationRecord {
  return {
    id: overrides.id,
    serial: overrides.serial ?? "QT-001",
    serialNumber: 1,
    quotationDate: overrides.quotationDate ?? "2026-10-01",
    customerName: overrides.customerName ?? "Sheikh Zain",
    cnic: overrides.cnic ?? "37101-1234567-1",
    address: "Saddar Attock",
    contactNo: "0300-5607350",
    whatsappNo: "0300-5607350",
    customerPackage: "12 Kw hybrid",
    paymentMode: "direct",
    downPayment: null,
    installmentCount: null,
    items: [],
    taxableTotal: 1000,
    taxTotal: 0,
    grandTotal: 1000,
    installments: [],
    approvedAt: overrides.approvedAt ?? null,
    sourceQuotationId: null,
    kind: overrides.kind,
    status: overrides.status,
  };
}

test("customers group by CNIC and the active list keeps quotations being sent or projects in process", () => {
  expect(customerKey("37101-1234567-1")).toBe("3710112345671");
  const cards = groupCustomers(
    [
      record({ id: "q1", kind: "quotation", serial: "QT-001", approvedAt: null }),
      record({ id: "q2", kind: "quotation", serial: "QT-002", customerName: "Ayesha Khan", cnic: "37101-9999999-1", approvedAt: "2026-10-02T00:00:00.000Z" }),
      record({ id: "q3", kind: "quotation", serial: "QT-003", customerName: "Old Name", quotationDate: "2026-09-01", approvedAt: "2026-09-02T00:00:00.000Z" }),
    ],
    [
      record({ id: "p2", kind: "project", serial: "QT-002", customerName: "Ayesha Khan", cnic: "37101-9999999-1", status: "completed" }),
      record({ id: "p3", kind: "project", serial: "QT-003", customerName: "Updated Name", quotationDate: "2026-10-08", status: "in_process" }),
    ],
  );
  expect(cards.map((card) => card.customerName)).toEqual(["Ayesha Khan", "Updated Name"]);
  const updated = cards.find((card) => card.key === "3710112345671");
  expect(updated?.customerName).toBe("Updated Name");
  expect(updated?.jobs.map((job) => job.stage)).toEqual(["in_process", "sending", "approved"]);
  expect(activeCustomers(cards).map((card) => card.customerName)).toEqual(["Updated Name"]);
});
