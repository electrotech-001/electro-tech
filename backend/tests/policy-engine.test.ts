import assert from "node:assert/strict";
import test from "node:test";
import { estimateAnnualBill } from "../src/services/billing/engine.js";
import { optimizeArchitecture, buildOptimizationContext } from "../src/services/optimizer/optimizer.js";
import { PROSUMER_POLICY_2026 } from "../src/services/policies/electricity-2026.js";
import { assessMaterialModification, REGULATORY_STATUS_LABELS, resolveProsumer, checkInterconnection } from "../src/services/prosumer/policy.js";
import { getSolarProfile } from "../src/services/solar/profiles.js";
import { resolveTariff } from "../src/services/tariffs/resolver.js";
import { buildRollingTwelveMonths, verifiedSolarInputSchema, type VerifiedSolarInput } from "../src/validation/solar-analyzer.js";

function input(overrides: Partial<VerifiedSolarInput> = {}): VerifiedSolarInput {
  return {
    provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", connectionType: "Residential",
    consumerCategory: "residential", protectedStatus: "non_protected", phase: "three",
    sanctionedLoadKw: 10, mdiKw: 6, touStatus: "no", peakUnitsKwh: null, offPeakUnitsKwh: null,
    greenMeterStatus: "yes", prosumerStatus: "current", prosumerAgreementDate: null,
    usagePattern: "mostly_daytime", gridReliability: "reliable", existingSolar: { status: "no", pvKwp: null },
    analysisMode: "recommend", selectedArchitecture: null, panelWattage: 585, currentBillAmountPkr: null,
    monthlyConsumption: Array.from({ length: 12 }, (_, month) => ({ year: 2026, month: month + 1, kwh: 350, confidence: "high" as const })),
    ...overrides,
  };
}

test("constructs the latest rolling 12 months and retains the current billing month", () => {
  const readings = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(2016, 3 + index, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, kwh: 100 + index, confidence: "high" as const };
  });
  const rolling = buildRollingTwelveMonths({
    provider: "IESCO", city: null, tariffCategory: null, connectionType: null, phase: null,
    sanctionedLoadKw: null, mdiKw: null, consumerCategory: null, currentBillYear: 2017, currentBillMonth: 4,
    currentMonthConsumptionKwh: 999, currentBillAmountPkr: null, touStatus: "not_sure", peakUnitsKwh: null,
    offPeakUnitsKwh: null, importUnitsKwh: null, exportUnitsKwh: null, greenMeterStatus: "not_sure",
    existingProsumerStatus: "not_sure", prosumerAgreementDate: null, monthlyConsumption: readings, uncertainFields: [],
  });
  assert.equal(rolling.length, 12);
  assert.deepEqual(rolling[0], { year: 2016, month: 5, kwh: 101, confidence: "high" });
  assert.deepEqual(rolling[11], { year: 2017, month: 4, kwh: 999, confidence: "high" });
  assert.equal(rolling.reduce((sum, reading) => sum + (reading.kwh ?? 0), 0), 2_165);
});

test("resolves supplied residential, protected, lifeline, commercial and TOU tariffs", () => {
  assert.equal(resolveTariff(input({ protectedStatus: "lifeline" }), 600).variableRate, 3.95);
  assert.equal(resolveTariff(input({ protectedStatus: "protected" }), 1_800).variableRate, 13.01);
  assert.equal(resolveTariff(input(), 3_000).variableRate, 33.10);
  assert.equal(resolveTariff(input({ tariffCategory: "A-2", connectionType: "Commercial", consumerCategory: "commercial", sanctionedLoadKw: 4 }), 4_200).variableRate, 37.44);
  assert.equal(resolveTariff(input({ tariffCategory: "A-2", connectionType: "Commercial", consumerCategory: "commercial", sanctionedLoadKw: 5 }), 4_200).variableRate, 39.76);
  const residentialTou = resolveTariff(input({ touStatus: "yes", mdiKw: 7, sanctionedLoadKw: 10 }), 4_200);
  assert.equal(residentialTou.peakRate, 46.85);
  assert.equal(residentialTou.offPeakRate, 34.53);
  assert.equal(residentialTou.annualFixedCharge, 7 * 675 * 12);
  const commercialTou = resolveTariff(input({ tariffCategory: "A-2", connectionType: "Commercial", consumerCategory: "commercial", touStatus: "yes", mdiKw: 1, sanctionedLoadKw: 8 }), 4_200);
  assert.equal(commercialTou.annualFixedCharge, 2 * 1_250 * 12);
});

test("resolves every supported industrial B tariff from the exact verified code", () => {
  const industrial = (tariffCategory: string, tou: boolean, overrides: Partial<VerifiedSolarInput> = {}) => resolveTariff(input({
    provider: "IESCO", tariffCategory, connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown",
    sanctionedLoadKw: 100, mdiKw: tariffCategory === "B-1" ? null : 60, touStatus: tou ? "yes" : "no",
    peakUnitsKwh: tou ? 400 : null, offPeakUnitsKwh: tou ? 600 : null, ...overrides,
  }), 12_000);

  const expected = {
    "B-1": { nonTou: 26.23, peak: 35.74, offPeak: 25.48, fixed: 12_000 },
    "B-2": { nonTou: 26.16, peak: 35.68, offPeak: 22.83, fixed: 900_000 },
    "B-3": { nonTou: 27.00, peak: 35.68, offPeak: 23.67, fixed: 900_000 },
    "B-4": { nonTou: 26.43, peak: 35.68, offPeak: 23.38, fixed: 900_000 },
  } as const;
  for (const [code, values] of Object.entries(expected)) {
    const nonTou = industrial(code, false);
    assert.equal(nonTou.tariffCode, code);
    assert.equal(nonTou.variableRate, values.nonTou);
    assert.equal(nonTou.annualFixedCharge, values.fixed);
    const tou = industrial(code, true);
    assert.equal(tou.peakRate, values.peak);
    assert.equal(tou.offPeakRate, values.offPeak);
    assert.equal(tou.annualFixedCharge, values.fixed);
  }
  const b5 = industrial("B-5", true);
  assert.equal(b5.peakRate, 35.68);
  assert.equal(b5.offPeakRate, 23.13);
  assert.equal(b5.annualFixedCharge, 900_000);
  assert.equal(industrial("B-2", false, { mdiKw: 10 }).annualFixedCharge, 25 * 1_250 * 12);
  assert.throws(() => industrial("B-5", false), /Unresolved billing inputs|TOU-only/);
});

test("uses the official 25% sanctioned-load minimum for B-2 through B-5 demand billing", () => {
  for (const tariffCategory of ["B-2", "B-3", "B-4", "B-5"] as const) {
    const tou = tariffCategory === "B-5";
    const industrial = (mdiKw: number) => resolveTariff(input({
      tariffCategory,
      connectionType: "Industrial",
      consumerCategory: "industrial",
      protectedStatus: "unknown",
      sanctionedLoadKw: 100,
      mdiKw,
      touStatus: tou ? "yes" : "no",
      peakUnitsKwh: tou ? 400 : null,
      offPeakUnitsKwh: tou ? 600 : null,
    }), 12_000);

    const aboveMinimum = industrial(30);
    assert.equal(aboveMinimum.annualFixedCharge, 30 * 1_250 * 12, `${tariffCategory} must use actual MDI above 25%`);
    assert.notEqual(aboveMinimum.annualFixedCharge, 35 * 1_250 * 12, `${tariffCategory} must not use a 35% minimum`);
    assert.equal(industrial(20).annualFixedCharge, 25 * 1_250 * 12, `${tariffCategory} must floor demand at 25%`);
    assert.equal(industrial(25).annualFixedCharge, 25 * 1_250 * 12, `${tariffCategory} must handle equality at 25%`);
    assert.equal(aboveMinimum.fixedChargeBasis, "max_25_percent_sanctioned_load_or_mdi");
  }
});

test("keeps B-1 connection charging and A-1/A-2 fixed-charge rules unchanged", () => {
  const b1 = resolveTariff(input({ tariffCategory: "B-1", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: null }), 12_000);
  assert.equal(b1.annualFixedCharge, 1_000 * 12);
  assert.equal(b1.fixedChargeBasis, "connection");

  const a1 = resolveTariff(input({ sanctionedLoadKw: 10 }), 4_200);
  assert.equal(a1.annualFixedCharge, 400 * 10 * 12);
  assert.equal(a1.fixedChargeBasis, "sanctioned_load");

  const a2 = resolveTariff(input({ tariffCategory: "A-2", connectionType: "Commercial", consumerCategory: "commercial", sanctionedLoadKw: 5 }), 4_200);
  assert.equal(a2.annualFixedCharge, 1_250 * 5 * 12);
  assert.equal(a2.fixedChargeBasis, "sanctioned_load");
});

test("industrial TOU billing keeps peak and off-peak units separate with the corrected fixed charge", () => {
  const verified = input({ provider: "IESCO", tariffCategory: "B-2", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: 20, touStatus: "yes", peakUnitsKwh: 400, offPeakUnitsKwh: 600 });
  const tariff = resolveTariff(verified, 12_000);
  const prosumer = resolveProsumer({ ...verified, greenMeterStatus: "no", prosumerStatus: "none" }, tariff, false);
  const estimate = estimateAnnualBill({ totalImportKwh: 1_000, peakImportKwh: 400, offPeakImportKwh: 600, exportKwh: 0 }, tariff, prosumer);
  assert.equal(estimate.energyChargesPkr, Math.round(400 * 35.68 + 600 * 22.83));
  assert.equal(estimate.fixedChargesPkr, 25 * 1_250 * 12);
});

test("propagates the corrected industrial charge through current bill, post-solar bill, reduction and optimizer scoring", () => {
  const industrial = input({
    tariffCategory: "B-2",
    connectionType: "Industrial",
    consumerCategory: "industrial",
    protectedStatus: "unknown",
    sanctionedLoadKw: 100,
    mdiKw: 20,
    greenMeterStatus: "no",
    prosumerStatus: "none",
  });
  const context = buildOptimizationContext(industrial);
  assert.equal(context.currentBill.fixedChargesPkr, 25 * 1_250 * 12);
  assert.equal(context.currentBill.estimatedAnnualBillPkr, Math.round(context.annualConsumptionKwh * 26.16 + 25 * 1_250 * 12));

  const profile = getSolarProfile(industrial.city).profile;
  const optimized = optimizeArchitecture(industrial, profile, context, "on_grid_only");
  const repeated = optimizeArchitecture(industrial, profile, context, "on_grid_only");
  assert.deepEqual(optimized, repeated);
  assert.equal(optimized.currentBill?.fixedChargesPkr, 25 * 1_250 * 12);
  assert.equal(optimized.postSolarBill?.fixedChargesPkr, 25 * 1_250 * 12);
  assert.equal(optimized.estimatedRemainingBillPkr, optimized.postSolarBill?.estimatedAnnualBillPkr);
  assert.equal(optimized.estimatedBillReductionPkr, context.currentBill.estimatedAnnualBillPkr - optimized.postSolarBill!.estimatedAnnualBillPkr);
  const expectedPercent = Math.round((optimized.estimatedBillReductionPkr! / context.currentBill.estimatedAnnualBillPkr * 100) * 10) / 10;
  assert.equal(optimized.estimatedBillReductionPercent, expectedPercent);
  assert.ok(Number.isFinite(optimized.score));
});

test("uses one versioned uniform schedule for XWDISCO and K-Electric without fabricating adjustments", () => {
  const base = { tariffCategory: "B-3", connectionType: "Industrial", consumerCategory: "industrial" as const, protectedStatus: "unknown" as const, sanctionedLoadKw: 100, mdiKw: 50, touStatus: "no" as const };
  const xwdisco = resolveTariff(input({ ...base, provider: "IESCO" }), 12_000);
  const ke = resolveTariff(input({ ...base, provider: "K-Electric" }), 12_000);
  assert.equal(xwdisco.variableRate, ke.variableRate);
  assert.equal(xwdisco.applicableUtilityGroup, "XWDISCO");
  assert.equal(ke.applicableUtilityGroup, "K-Electric");
  assert.equal(ke.scheduleId, "gop-applicable-consumer-tariff-2026-02");
  assert.equal(ke.scheduleVersion, "2026.02");
  assert.equal(ke.effectiveFrom, "2026-02-12");
  assert.equal(ke.sourceReference, "S.R.O. 279(I)/2026");
  assert.deepEqual(ke.applicableUtilities, ["XWDISCO", "K-Electric"]);
  assert.match(ke.referenceMode, /Current Reference Tariff/);
  assert.ok(ke.notModeledComponents.some((item) => /FCA/.test(item)));
  assert.ok(ke.notModeledComponents.some((item) => /QTA/.test(item)));
  assert.ok(ke.notModeledComponents.some((item) => /Taxes/.test(item)));
});

test("blocks unresolved industrial codes, mandatory demand data and unsupported tariff dates", () => {
  const base = input({ tariffCategory: "Industrial", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: null, touStatus: "no" });
  assert.throws(() => resolveTariff(base, 12_000), /Consumer tariff/);
  assert.throws(() => resolveTariff({ ...base, tariffCategory: "B-2" }, 12_000), /Maximum demand \/ MDI/);
  assert.throws(() => resolveTariff({ ...base, tariffCategory: "B-1", tariffEffectiveDate: "2026-02-11" }, 12_000), /Supported tariff effective date/);
});

test("does not invent missing MDI for a TOU tariff", () => {
  assert.throws(
    () => resolveTariff(input({ touStatus: "yes", mdiKw: null, sanctionedLoadKw: 10 }), 4_200),
    /Maximum demand \/ MDI/,
  );
});

test("applies current, legacy, uncertain and expired prosumer regimes", () => {
  const tariff = resolveTariff(input(), 4_200);
  const current = resolveProsumer(input({ prosumerStatus: "current" }), tariff, true);
  assert.equal(current.exportRate, 8.13);
  assert.equal(current.settlement, "purchase");
  assert.equal(current.legacyAgreementStatus, "not-applicable");
  assert.equal(current.agreementLifecycleStatus, "active");
  const legacy = resolveProsumer(input({ prosumerStatus: "legacy", prosumerAgreementDate: "2024-01-01" }), tariff, true);
  assert.equal(legacy.regime, "legacy");
  assert.equal(legacy.settlement, "legacy_netting");
  assert.equal(legacy.excessExportRate, 25.32);
  assert.equal(legacy.legacyAgreementStatus, "confirmed");
  assert.equal(legacy.agreementLifecycleStatus, "active");
  const uncertain = resolveProsumer(input({ prosumerStatus: "legacy", prosumerAgreementDate: null }), tariff, true);
  assert.equal(uncertain.confidence, "Preliminary");
  assert.equal(uncertain.legacyAgreementStatus, "unverified");
  assert.equal(uncertain.agreementLifecycleStatus, "unknown");
  const expired = resolveProsumer(input({ prosumerStatus: "legacy", prosumerAgreementDate: "2020-01-01" }), tariff, true);
  assert.equal(expired.regime, "current");
  assert.equal(expired.exportRate, PROSUMER_POLICY_2026.current.exportRate);
  assert.equal(expired.legacyAgreementStatus, "confirmed");
  assert.equal(expired.agreementLifecycleStatus, "expired");
});

test("legacy billing nets matching TOU periods and values only excess at NAPPP", () => {
  const tariff = resolveTariff(input({ touStatus: "yes" }), 4_200);
  const prosumer = resolveProsumer(input({ touStatus: "yes", prosumerStatus: "legacy", prosumerAgreementDate: "2024-01-01" }), tariff, true);
  const estimate = estimateAnnualBill({ totalImportKwh: 1_500, peakImportKwh: 500, offPeakImportKwh: 1_000, exportKwh: 1_200, peakExportKwh: 100, offPeakExportKwh: 1_100 }, tariff, prosumer);
  assert.equal(estimate.energyChargesPkr, Math.round(400 * 46.85));
  assert.equal(estimate.exportValuePkr, Math.round(100 * 25.32));
});

test("enforces sanctioned-load and configured interconnection thresholds", () => {
  const current = resolveProsumer(input(), resolveTariff(input(), 4_200), true);
  const loadExtension = checkInterconnection(5, input({ sanctionedLoadKw: 3 }), current.exportPermitted);
  assert.equal(loadExtension.valid, false);
  assert.equal(loadExtension.withinPolicyScope, true);
  assert.equal(loadExtension.regulatoryStatus, "load-extension-required");
  assert.equal(loadExtension.currentGridEligibleCapacityKwp, 3);
  assert.equal(loadExtension.excessCapacityKwp, 2);
  assert.match(checkInterconnection(25, input({ sanctionedLoadKw: 30 }), true).qualifications.join(" "), /concurrence is not required.*utility interconnection approval/i);
  assert.match(checkInterconnection(250, input({ sanctionedLoadKw: 300 }), true).qualifications.join(" "), /load-flow study/i);
});

test("models phase verification without a single-phase capacity cap", () => {
  const single = checkInterconnection(8.19, input({ phase: "single", sanctionedLoadKw: 10 }), true);
  assert.equal(single.regulatoryStatus, "upgrade-required");
  assert.equal(single.phaseStatus, "verification-required");
  assert.equal(single.currentGridEligibleCapacityKwp, 8.19);
  assert.equal(single.withinPolicyScope, true);
  assert.match(single.qualifications.join(" "), /phase upgrade/i);

  const three = checkInterconnection(8.19, input({ phase: "three", sanctionedLoadKw: 10 }), true);
  assert.equal(three.regulatoryStatus, "eligible");
  assert.equal(three.phaseStatus, "eligible");

  const zeroExport = checkInterconnection(20, input({ phase: "single", sanctionedLoadKw: 3 }), false);
  assert.equal(zeroExport.regulatoryStatus, "not-applicable");
  assert.equal(zeroExport.phaseStatus, "not-applicable");
  assert.doesNotMatch(zeroExport.regulatoryStatusLabel, /approved/i);
});

test("detects output and interconnection-equipment material modifications without assuming them", () => {
  assert.equal(assessMaterialModification(8, 8, input()).materialModification, false);
  assert.equal(assessMaterialModification(8, 8, input({ existingSolar: { status: "yes", pvKwp: 8, inverterKw: 8 } })).materialModification, false);
  assert.equal(assessMaterialModification(9, 8, input({ existingSolar: { status: "yes", pvKwp: 8, inverterKw: 8 } })).materialModification, true);
  assert.equal(assessMaterialModification(8, 10, input({ existingSolar: { status: "yes", pvKwp: 8, inverterKw: 8 } })).materialModification, true);
  assert.equal(assessMaterialModification(8, 8, input({ existingSolar: { status: "yes", pvKwp: 8, inverterKw: 8, plannedInterconnectionEquipmentChange: true } })).materialModification, true);
  assert.equal(Object.values(REGULATORY_STATUS_LABELS).some((label) => /approved/i.test(label)), false);
});

test("battery dispatch reduces TOU grid imports without granting no-meter export value", () => {
  const base = input({ touStatus: "yes", peakUnitsKwh: 180, offPeakUnitsKwh: 170, greenMeterStatus: "no", prosumerStatus: "none", usagePattern: "mostly_evening" });
  const context = buildOptimizationContext(base);
  const profile = getSolarProfile(base.city).profile;
  const noBattery = optimizeArchitecture(base, profile, context, "hybrid_no_green_no_battery");
  const battery = optimizeArchitecture({ ...base, backupPreference: { level: "essential", durationHours: 4, backupLoadKw: 1 } }, profile, context, "hybrid_battery_no_green");
  assert.equal(battery.gridExportKwh, 0);
  assert.ok((battery.gridImportKwh ?? Infinity) < (noBattery.gridImportKwh ?? 0));
  assert.ok(battery.batteryDischargeKwh > 0);
});

test("requires explicit analysis mode and selected architecture where applicable", () => {
  assert.equal(verifiedSolarInputSchema.safeParse({ ...input(), analysisMode: undefined }).success, false);
  assert.equal(verifiedSolarInputSchema.safeParse({ ...input(), analysisMode: "chosen", selectedArchitecture: null }).success, false);
});
