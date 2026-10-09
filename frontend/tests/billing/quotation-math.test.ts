import { describe, expect, it } from "vitest";
import { computeTotals, maskCnic, maskPhone, quotationIssues, blankDraft } from "../../lib/billing/quotation-math";

describe("quotation field masks", () => {
  it("inserts CNIC and phone dashes", () => {
    expect(maskCnic("3710112345671")).toBe("37101-1234567-1");
    expect(maskPhone("03005607350")).toBe("0300-5607350");
  });

  it("keeps tax at zero and splits the balance after down payment", () => {
    const draft = blankDraft();
    draft.customerName = "Sheikh Zain";
    draft.cnic = "37101-1234567-1";
    draft.address = "Saddar Attock";
    draft.contactNo = "0300-5607350";
    draft.whatsappNo = "0300-5607350";
    draft.customerPackage = "12 Kw system";
    draft.paymentMode = "installments";
    draft.downPayment = 250000;
    draft.installmentCount = 3;
    draft.items = [{ description: "Inverter", qty: 1, unit: "Set", price: 673000, taxPercent: 0 }];
    const totals = computeTotals(draft);
    expect(totals.taxableTotal).toBe(673000);
    expect(totals.taxTotal).toBe(0);
    expect(totals.installments.map((line) => line.amount).reduce((sum, amount) => sum + amount, 0)).toBe(423000);
    expect(quotationIssues(draft)).toEqual([]);
  });
});
