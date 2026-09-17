import assert from "node:assert/strict";
import test from "node:test";
import { ARCHITECTURES, buildOptimizationContext, optimizeArchitecture } from "../src/services/optimizer/optimizer.js";
import { calculateSolarRecommendation, isArchitectureApplicable, panelConfiguration, refinedBatteryRange, selectInverterSize } from "../src/services/solar/calculator.js";
import { SOLAR_ASSUMPTIONS } from "../src/services/solar/assumptions.js";
import { getSolarProfile } from "../src/services/solar/profiles.js";
import { verifiedSolarInputSchema, type SolarArchitecture, type VerifiedSolarInput } from "../src/validation/solar-analyzer.js";

const monthly = (kwh: number) => Array.from({ length: 12 }, (_, index) => ({
  year: index < 6 ? 2025 : 2026,
  month: index + 1,
  kwh: kwh + index * 10,
  confidence: "high" as const,
}));

const completeInput: VerifiedSolarInput = {
  provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", connectionType: "Residential",
  consumerCategory: "residential", protectedStatus: "non_protected", phase: "three",
  sanctionedLoadKw: 15, mdiKw: 8, touStatus: "no", peakUnitsKwh: null, offPeakUnitsKwh: null,
  greenMeterStatus: "yes", prosumerStatus: "current", prosumerAgreementDate: null,
  usagePattern: "mostly_daytime", gridReliability: "reliable", existingSolar: { status: "no", pvKwp: null },
  analysisMode: "recommend", selectedArchitecture: null, panelWattage: 585, currentBillAmountPkr: null,
  monthlyConsumption: monthly(1_000),
};

const verified4691Input: VerifiedSolarInput = {
  ...completeInput,
  sanctionedLoadKw: 3,
  mdiKw: null,
  greenMeterStatus: "no",
  prosumerStatus: "none",
  gridReliability: "reliable",
  backupPreference: { level: "none" },
  monthlyConsumption: [350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 370, 371].map((kwh, index) => ({
    year: index < 4 ? 2025 : 2026,
    month: index + 1,
    kwh,
    confidence: "high" as const,
  })),
};

test("calculates consumption arithmetic in application code", () => {
  const result = calculateSolarRecommendation(completeInput);
  assert.equal(result.dataQuality.recommendationData, "Complete");
  assert.equal(result.consumption.annualConsumptionKwh, 12_660);
  assert.equal(result.consumption.annualConsumptionEstimated, false);
  assert.equal(result.consumption.averageMonthlyKwh, 1_055);
  assert.equal(result.consumption.averageDailyKwh, 34.7);
  assert.deepEqual(result.consumption.highestMonth, { label: "December 2026", kwh: 1_110 });
  assert.deepEqual(result.consumption.lowestMonth, { label: "January 2025", kwh: 1_000 });
});

test("On-Grid without an export arrangement requires approval and conservatively curtails surplus", () => {
  for (const greenMeterStatus of ["no", "yes"] as const) {
    const result = calculateSolarRecommendation({ ...verified4691Input, greenMeterStatus, analysisMode: "chosen", selectedArchitecture: "on_grid_only" }).userSelected!;
    assert.equal(result.architectureExportCapable, true);
    assert.equal(result.currentExportArrangement, "not-established");
    assert.equal(result.regulatoryStatusLabel, "DISCO Interconnection / Prosumer Approval Required");
    assert.equal(result.regulatoryValid, false);
    assert.equal(result.prosumerRegime, "none");
    assert.equal(result.gridExportKwh, 0);
    assert.equal(result.postSolarBill?.exportValuePkr, 0);
    assert.ok(result.curtailedGenerationKwh > 0);
    assert.equal(result.unusedSurplusKwh, result.curtailedGenerationKwh);
    assert.ok(result.monthlySimulation.every((month) => month.gridExportKwh === 0));
    assert.doesNotMatch([result.regulatoryStatusLabel, ...result.regulatoryQualifications].join(" "), /Grid-Export Eligible|Prosumer Export Check Not Applicable/i);
  }
});

test("unknown meter or agreement requires verification without export credit", () => {
  const cases = [
    { greenMeterStatus: "not_sure", prosumerStatus: "current" },
    { greenMeterStatus: "yes", prosumerStatus: "unknown" },
    { greenMeterStatus: "no", prosumerStatus: "unknown" },
    { greenMeterStatus: "not_sure", prosumerStatus: "none" },
  ] as const;
  for (const status of cases) {
    const result = calculateSolarRecommendation({ ...completeInput, ...status, analysisMode: "chosen", selectedArchitecture: "on_grid_only" }).userSelected!;
    assert.equal(result.currentExportArrangement, "unverified");
    assert.equal(result.regulatoryStatusLabel, "DISCO Verification Required");
    assert.equal(result.gridExportKwh, 0);
    assert.equal(result.postSolarBill?.exportValuePkr, 0);
    assert.ok(result.curtailedGenerationKwh > 0);
  }
});

test("export-capable architectures report existing arrangements without claiming external approval", () => {
  for (const selectedArchitecture of ["on_grid_only", "hybrid_green_no_battery", "hybrid_green_battery"] as const) {
    const result = calculateSolarRecommendation({ ...completeInput, sanctionedLoadKw: 100, analysisMode: "chosen", selectedArchitecture }).userSelected!;
    assert.equal(result.architectureExportCapable, true);
    assert.equal(result.currentExportArrangement, "confirmed");
    assert.equal(result.regulatoryStatusLabel, "Existing Prosumer / Export Arrangement Confirmed");
    assert.doesNotMatch([result.regulatoryStatusLabel, ...result.regulatoryQualifications].join(" "), /(?:NEPRA|DISCO|Government) Approved/i);
    assert.match(result.regulatoryQualifications.join(" "), /network and transformer feasibility/);
  }
});

test("all zero-export architectures retain inapplicable export checks independently of the existing arrangement", () => {
  for (const selectedArchitecture of ["hybrid_no_green_no_battery", "hybrid_battery_no_green", "off_grid"] as const) {
    for (const greenMeterStatus of ["no", "yes"] as const) {
      const result = calculateSolarRecommendation({ ...completeInput, greenMeterStatus, analysisMode: "chosen", selectedArchitecture }).userSelected!;
      assert.equal(result.architectureExportCapable, false);
      assert.equal(result.currentExportArrangement, greenMeterStatus === "yes" ? "confirmed" : "not-established");
      assert.match(result.regulatoryStatusLabel, /Prosumer Export Check Not Applicable/);
      assert.equal(result.gridExportKwh, 0);
      assert.equal(result.unusedSurplusKwh, result.curtailedGenerationKwh);
    }
  }
});

test("missing-arrangement status preserves captured engineering, energy and score baselines in all analysis modes", () => {
  for (const analysisMode of ["recommend", "chosen", "both"] as const) {
    const result = calculateSolarRecommendation({ ...verified4691Input, analysisMode, selectedArchitecture: analysisMode === "recommend" ? null : "on_grid_only" });
    if (analysisMode !== "chosen") {
      const best = result.bestRecommended!;
      assert.equal(best.architectureKey, "hybrid_battery_no_green");
      assert.deepEqual([best.actualInstalledKwp, best.panelCount, best.inverterKw, best.gridExportKwh, best.curtailedGenerationKwh], [3.51, 6, 3, 0, 597.4]);
      assert.equal(best.score, 139789.33063597785);
    }
    if (analysisMode !== "recommend") {
      const chosen = result.userSelected!;
      assert.deepEqual([chosen.actualInstalledKwp, chosen.panelCount, chosen.inverterKw, chosen.gridExportKwh, chosen.curtailedGenerationKwh], [2.34, 4, 2, 0, 356.9]);
      assert.equal(chosen.score, 98261.6832154048);
      assert.equal(chosen.regulatoryStatus, "interconnection-approval-required");
    }
  }
});

test("missing arrangements retain load, phase and modification qualifications without truncating PV", () => {
  const base = { ...verified4691Input, analysisMode: "chosen" as const, selectedArchitecture: "on_grid_only" as const };
  const reference = calculateSolarRecommendation(base).userSelected!;
  const qualified = calculateSolarRecommendation({ ...base, sanctionedLoadKw: 1, phase: "single", existingSolar: { status: "yes", pvKwp: 1, plannedInverterReplacement: true } }).userSelected!;
  assert.equal(qualified.actualInstalledKwp, reference.actualInstalledKwp);
  assert.equal(qualified.regulatoryStatus, "interconnection-approval-required");
  assert.equal(qualified.loadExtensionRequired, true);
  assert.equal(qualified.phaseStatus, "verification-required");
  assert.equal(qualified.materialModification, true);
  assert.match(qualified.regulatoryQualifications.join(" "), /load extension.*Phase Verification.*Material Modification/i);
});

test("keeps recommendation completeness aligned with conditional metering context", () => {
  assert.equal(calculateSolarRecommendation({ ...completeInput, greenMeterStatus: "yes", prosumerStatus: "unknown" }).dataQuality.recommendationData, "Incomplete");
  assert.equal(calculateSolarRecommendation({ ...completeInput, greenMeterStatus: "yes", prosumerStatus: "legacy", prosumerAgreementDate: null }).dataQuality.recommendationData, "Incomplete");
  assert.equal(calculateSolarRecommendation({ ...completeInput, greenMeterStatus: "no", prosumerStatus: "none" }).dataQuality.recommendationData, "Complete");
});

test("blocks full recommendations instead of annualizing incomplete history", () => {
  assert.throws(
    () => calculateSolarRecommendation({ ...completeInput, monthlyConsumption: completeInput.monthlyConsumption.slice(0, 11) }),
    /Exactly 12 unique monthly consumption readings/,
  );
  assert.throws(
    () => calculateSolarRecommendation({ ...completeInput, monthlyConsumption: completeInput.monthlyConsumption.slice(0, 1) }),
    /Exactly 12 unique monthly consumption readings/,
  );
});

test("blocks duplicate year/month pairs even when twelve rows are supplied", () => {
  const duplicate = [...completeInput.monthlyConsumption.slice(0, 11), completeInput.monthlyConsumption[0]!];
  assert.throws(
    () => calculateSolarRecommendation({ ...completeInput, monthlyConsumption: duplicate }),
    /Exactly 12 unique monthly consumption readings/,
  );
});

test("uses exact city profiles and an identified conservative regional fallback", () => {
  assert.equal(getSolarProfile("Karachi").profile.city, "Karachi");
  assert.equal(getSolarProfile("Karachi").fallbackUsed, false);
  assert.equal(getSolarProfile("Attock").profile.city, "Islamabad");
  assert.equal(getSolarProfile("Attock").fallbackUsed, true);
  const attock = calculateSolarRecommendation({ ...completeInput, city: "Attock" });
  assert.equal(attock.location.requestedCity, "Attock");
  assert.equal(attock.location.profileCity, "Islamabad");
  assert.equal(attock.location.regionalFallbackUsed, true);
  assert.equal(attock.location.assumption?.includes("Islamabad"), true);
});

test("excludes Off-Grid from reliable-grid bill-reduction recommendations", () => {
  const result = calculateSolarRecommendation(verified4691Input);
  assert.equal(result.consumption.annualConsumptionKwh, 4_691);
  assert.notEqual(result.bestRecommended?.architectureKey, "off_grid");
  assert.equal(result.evaluatedArchitectures.includes("off_grid"), false);
  assert.equal(isArchitectureApplicable("off_grid", verified4691Input), false);
});

test("allows Off-Grid to become the recommendation where no grid exists", () => {
  const input = { ...verified4691Input, gridReliability: "no_grid" as const };
  const result = calculateSolarRecommendation(input);
  assert.equal(result.bestRecommended?.architectureKey, "off_grid");
  assert.deepEqual(result.evaluatedArchitectures, ["off_grid"]);
  assert.equal(isArchitectureApplicable("off_grid", input), true);
});

test("preserves explicitly selected Off-Grid analysis on a reliable grid", () => {
  const input: VerifiedSolarInput = { ...verified4691Input, analysisMode: "chosen", selectedArchitecture: "off_grid" };
  const result = calculateSolarRecommendation(input);
  assert.equal(result.bestRecommended, null);
  assert.equal(result.userSelected?.architectureKey, "off_grid");
  assert.deepEqual(result.evaluatedArchitectures, ["off_grid"]);
  assert.equal(isArchitectureApplicable("off_grid", input, "customer_selected"), true);
  assert.ok(result.userSelected?.qualification.some((item) => /load, surge, autonomy and site studies/i.test(item)));
});

test("keeps Hybrid battery options applicable for frequent outages without promoting Off-Grid", () => {
  const input: VerifiedSolarInput = {
    ...verified4691Input,
    gridReliability: "frequent_outages",
    backupPreference: { level: "essential", durationHours: 4, backupLoadKw: 1.5 },
  };
  const result = calculateSolarRecommendation(input);
  assert.equal(result.evaluatedArchitectures.includes("hybrid_battery_no_green"), true);
  assert.equal(result.evaluatedArchitectures.includes("off_grid"), false);
  assert.notEqual(result.bestRecommended?.architectureKey, "off_grid");
});

test("uses integer configurable panels and practical compatible inverters", () => {
  assert.deepEqual(panelConfiguration(10), { panelCount: 18, actualInstalledKwp: 10.53 });
  assert.deepEqual(panelConfiguration(2, 550), { panelCount: 4, actualInstalledKwp: 2.2 });
  const inverter = selectInverterSize(2.34);
  const ratio = 2.34 / inverter;
  assert.ok(ratio >= SOLAR_ASSUMPTIONS.dcAcRatioMin && ratio <= SOLAR_ASSUMPTIONS.dcAcRatioMax);
});

test("removes the former 5 kW floor for a 2,600–2,800 kWh/year customer", () => {
  const small = calculateSolarRecommendation({ ...completeInput, sanctionedLoadKw: 3, mdiKw: null, greenMeterStatus: "no", prosumerStatus: "none", monthlyConsumption: monthly(180) });
  assert.ok(small.bestRecommended);
  assert.ok(small.bestRecommended.actualInstalledKwp < 3);
  assert.ok(small.bestRecommended.panelCount >= 2);
  assert.ok(small.bestRecommended.inverterKw < 5);
});

test("evaluates all six architectures with deterministic dispatch semantics", () => {
  const profile = getSolarProfile(completeInput.city).profile;
  const context = buildOptimizationContext(completeInput);
  const keys = Object.keys(ARCHITECTURES) as SolarArchitecture[];
  const systems = keys.map((architecture) => optimizeArchitecture(completeInput, profile, context, architecture));
  assert.equal(systems.length, 6);
  assert.deepEqual(new Set(systems.map((system) => system.architectureKey)), new Set(keys));
  assert.ok(systems.every((system) => Number.isInteger(system.panelCount)));
  const noGreen = systems.find((system) => system.architectureKey === "hybrid_battery_no_green")!;
  assert.equal(noGreen.gridExportKwh, 0);
  assert.ok(noGreen.batteryDischargeKwh > 0);
  const offGrid = systems.find((system) => system.architectureKey === "off_grid")!;
  assert.equal(offGrid.gridImportKwh, 0);
  assert.equal(offGrid.gridExportKwh, 0);
  assert.equal(offGrid.estimatedBillReductionPercent, null);
  assert.equal(offGrid.estimatedRemainingBillPkr, null);
  assert.equal(offGrid.regulatoryValid, true);
  assert.ok(offGrid.unservedLoadKwh / context.annualConsumptionKwh <= 0.05);
});

test("supports Recommend, Chosen and Both without relabeling a chosen architecture", () => {
  const recommend = calculateSolarRecommendation(completeInput);
  assert.ok(recommend.bestRecommended);
  assert.equal(recommend.userSelected, null);
  assert.ok(recommend.evaluatedArchitectures.length > 1);
  const chosen = calculateSolarRecommendation({ ...completeInput, analysisMode: "chosen", selectedArchitecture: "off_grid" });
  assert.equal(chosen.bestRecommended, null);
  assert.equal(chosen.userSelected?.architectureKey, "off_grid");
  assert.deepEqual(chosen.evaluatedArchitectures, ["off_grid"]);
  const both = calculateSolarRecommendation({ ...completeInput, analysisMode: "both", selectedArchitecture: "hybrid_battery_no_green" });
  assert.ok(both.bestRecommended);
  assert.equal(both.userSelected?.architectureKey, "hybrid_battery_no_green");
  assert.ok(both.comparisonExplanation);
});

test("uses the resolved industrial tariff and exposes current-reference metadata", () => {
  const industrial: VerifiedSolarInput = { ...completeInput, provider: "K-Electric", tariffCategory: "B-2", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: 60, touStatus: "yes", peakUnitsKwh: 180, offPeakUnitsKwh: 270 };
  const result = calculateSolarRecommendation(industrial);
  assert.equal(result.tariffDetails.tariffCode, "B-2");
  assert.equal(result.tariffDetails.utilityGroup, "K-Electric");
  assert.equal(result.tariffDetails.version, "2026.02");
  assert.equal(result.tariffDetails.sourceReference, "S.R.O. 279(I)/2026");
  assert.equal(result.tariffDetails.usage, "Current Reference Tariff");
  assert.equal(result.bestRecommended?.currentBill?.fixedChargesPkr, 60 * 1_250 * 12);
  assert.ok((result.bestRecommended?.estimatedBillReductionPkr ?? 0) > 0);
  assert.ok(result.tariffDetails.notModeledComponents.some((item) => /FCA/.test(item)));
});

test("preserves engineering sizing while exposing phase and sanctioned-load requirements", () => {
  const base = { ...completeInput, analysisMode: "chosen" as const, selectedArchitecture: "hybrid_green_no_battery" as const, sanctionedLoadKw: 100, phase: "three" as const };
  const eligible = calculateSolarRecommendation(base).userSelected!;
  assert.ok(eligible.actualInstalledKwp > 5);
  assert.equal(eligible.regulatoryStatus, "eligible");

  const single = calculateSolarRecommendation({ ...base, phase: "single" }).userSelected!;
  assert.equal(single.actualInstalledKwp, eligible.actualInstalledKwp);
  assert.ok(single.actualInstalledKwp > 5);
  assert.notEqual(single.actualInstalledKwp, 0);
  assert.equal(single.phaseStatus, "verification-required");
  assert.equal(single.regulatoryStatus, "upgrade-required");

  const loadExtension = calculateSolarRecommendation({ ...base, sanctionedLoadKw: 3 }).userSelected!;
  assert.ok(loadExtension.actualInstalledKwp > 3);
  assert.ok(loadExtension.actualInstalledKwp > 5);
  assert.equal(loadExtension.regulatoryStatus, "load-extension-required");
  assert.equal(loadExtension.loadExtensionRequired, true);
  assert.equal(loadExtension.currentGridEligibleCapacityKwp, 3);
  assert.equal(loadExtension.excessCapacityKwp, loadExtension.actualInstalledKwp - 3);
});

test("treats zero-export hybrid and Off-Grid phase checks as not applicable", () => {
  const onGrid = calculateSolarRecommendation({ ...completeInput, phase: "single", greenMeterStatus: "no", prosumerStatus: "none", analysisMode: "chosen", selectedArchitecture: "on_grid_only" }).userSelected!;
  assert.equal(onGrid.regulatoryStatus, "interconnection-approval-required");
  assert.equal(onGrid.phaseStatus, "verification-required");

  const zeroExport = calculateSolarRecommendation({ ...completeInput, phase: "single", greenMeterStatus: "no", prosumerStatus: "none", analysisMode: "chosen", selectedArchitecture: "hybrid_battery_no_green" }).userSelected!;
  assert.equal(zeroExport.regulatoryStatus, "not-applicable");
  assert.equal(zeroExport.phaseStatus, "not-applicable");
  assert.ok(zeroExport.actualInstalledKwp > 0);

  const offGrid = calculateSolarRecommendation({ ...completeInput, phase: "single", analysisMode: "chosen", selectedArchitecture: "off_grid" }).userSelected!;
  assert.equal(offGrid.regulatoryStatus, "not-applicable");
  assert.equal(offGrid.phaseStatus, "not-applicable");
});

test("reports material modification while preserving active legacy treatment", () => {
  const base = { ...completeInput, analysisMode: "chosen" as const, selectedArchitecture: "hybrid_green_no_battery" as const, prosumerStatus: "legacy" as const, prosumerAgreementDate: "2024-01-01" };
  const reference = calculateSolarRecommendation(base).userSelected!;
  const unchanged = calculateSolarRecommendation({ ...base, existingSolar: { status: "yes", pvKwp: reference.actualInstalledKwp, inverterKw: reference.inverterKw } }).userSelected!;
  assert.equal(unchanged.materialModification, false);

  const modifiedOnly = calculateSolarRecommendation({ ...base, existingSolar: { status: "yes", pvKwp: 1, inverterKw: reference.inverterKw } }).userSelected!;
  assert.equal(modifiedOnly.materialModification, true);
  assert.equal(modifiedOnly.regulatoryStatus, "requires-disco-verification");
  assert.equal(modifiedOnly.regulatoryStatusLabel, "DISCO Verification Required");

  const modified = calculateSolarRecommendation({ ...base, phase: "single", sanctionedLoadKw: 3, existingSolar: { status: "yes", pvKwp: 1, inverterKw: reference.inverterKw, plannedInverterReplacement: true } }).userSelected!;
  assert.equal(modified.materialModification, true);
  assert.equal(modified.prosumerRegime, "legacy");
  assert.equal(modified.legacyAgreementStatus, "confirmed");
  assert.equal(modified.agreementLifecycleStatus, "active");
  assert.equal(modified.regulatoryStatus, "load-extension-required");
  assert.match(modified.regulatoryQualifications.join(" "), /Phase Verification \/ Upgrade Required/);
  assert.match(modified.regulatoryQualifications.join(" "), /Material Modification/);
  assert.match(modified.regulatoryQualifications.join(" "), /before relying on legacy settlement terms/);
  assert.doesNotMatch(modified.regulatoryQualifications.join(" "), /legacy status will be cancelled/i);
});

test("refines battery capacity deterministically from a known backup load", () => {
  const input: VerifiedSolarInput = { ...completeInput, backupPreference: { level: "essential", durationHours: 4, backupLoadKw: 5 } };
  const refined = refinedBatteryRange(input, 34.7)!;
  const raw = 5 * 4 / (SOLAR_ASSUMPTIONS.batteryDepthOfDischarge * SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency) * SOLAR_ASSUMPTIONS.batterySafetyMargin;
  assert.ok(refined.minimumKwh >= raw);
  assert.equal(refined.minimumKwh, refined.maximumKwh);
  assert.equal(refined.refined, true);
});

test("normalizes backup none and ignores stale duration and load values", () => {
  const withTwoHours = verifiedSolarInputSchema.parse({ ...completeInput, backupPreference: { level: "none", durationHours: 2, backupLoadKw: 8 } });
  const withEightHours = verifiedSolarInputSchema.parse({ ...completeInput, backupPreference: { level: "none", durationHours: 8, backupLoadKw: 1 } });
  assert.deepEqual(withTwoHours.backupPreference, { level: "none" });
  assert.deepEqual(withEightHours.backupPreference, { level: "none" });
  assert.equal(refinedBatteryRange(withTwoHours, 34.7), null);
  assert.equal(calculateSolarRecommendation(withTwoHours).verifiedContext.backupRequirement, "none");

  const profile = getSolarProfile(completeInput.city).profile;
  const context = buildOptimizationContext(withTwoHours);
  const twoHourSystem = optimizeArchitecture(withTwoHours, profile, context, "hybrid_battery_no_green");
  const eightHourSystem = optimizeArchitecture(withEightHours, profile, context, "hybrid_battery_no_green");
  assert.equal(twoHourSystem.batteryKwh, eightHourSystem.batteryKwh);
  assert.equal(twoHourSystem.estimatedBillReductionPercent, eightHourSystem.estimatedBillReductionPercent);
});

test("preserves a requested four-hour backup duration", () => {
  const parsed = verifiedSolarInputSchema.parse({ ...completeInput, backupPreference: { level: "essential", durationHours: 4, backupLoadKw: 2 } });
  assert.deepEqual(parsed.backupPreference, { level: "essential", durationHours: 4, backupLoadKw: 2 });
  assert.equal(calculateSolarRecommendation(parsed).verifiedContext.backupRequirement, "essential · 4 hours");
  assert.ok(refinedBatteryRange(parsed, 34.7));
});

test("is deterministic and retains fixed charges instead of promising a zero bill", () => {
  const first = calculateSolarRecommendation(completeInput);
  const second = calculateSolarRecommendation(completeInput);
  assert.deepEqual(first, second);
  assert.ok((first.bestRecommended?.estimatedBillReductionPercent ?? 100) < 100);
  assert.ok((first.bestRecommended?.estimatedRemainingBillPkr ?? 0) > 0);
});

test("assigns High recommendation confidence only to fully verified inputs", () => {
  const result = calculateSolarRecommendation(completeInput);
  assert.equal(result.dataQuality.recommendationConfidence, "High");
  assert.match(result.dataQuality.recommendationConfidenceExplanation, /12 verified months.*confirmed tariff.*sanctioned load.*consumption pattern/i);
});

test("uses Medium confidence when the load distribution is estimated", () => {
  const result = calculateSolarRecommendation({ ...completeInput, usagePattern: "not_sure" });
  assert.equal(result.dataQuality.recommendationConfidence, "Medium");
  assert.match(result.dataQuality.recommendationConfidenceExplanation, /daytime and nighttime consumption are estimated/i);
});

test("keeps incomplete and Off-Grid recommendations Preliminary", () => {
  const incomplete = calculateSolarRecommendation({ ...completeInput, prosumerStatus: "unknown" });
  assert.equal(incomplete.dataQuality.recommendationData, "Incomplete");
  assert.equal(incomplete.dataQuality.recommendationConfidence, "Preliminary");

  const offGrid = calculateSolarRecommendation({
    ...completeInput,
    analysisMode: "chosen",
    selectedArchitecture: "off_grid",
    backupPreference: { level: "entire", durationHours: 8, backupLoadKw: 4 },
  });
  assert.equal(offGrid.dataQuality.recommendationConfidence, "Preliminary");
  assert.match(offGrid.dataQuality.recommendationConfidenceExplanation, /load.*surge.*autonomy.*site assessment/i);
});
