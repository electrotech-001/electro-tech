import assert from "node:assert/strict";
import test from "node:test";
import { ARCHITECTURES, buildOptimizationContext, optimizeArchitecture, simulateRepresentativeDay, type RepresentativeDayInput } from "../src/services/optimizer/optimizer.js";
import { calculateSolarRecommendation } from "../src/services/solar/calculator.js";
import { SOLAR_ASSUMPTIONS } from "../src/services/solar/assumptions.js";
import { getSolarProfile } from "../src/services/solar/profiles.js";
import type { SolarArchitecture, VerifiedSolarInput } from "../src/validation/solar-analyzer.js";

const tolerance = 1e-9;
const approximately = (actual: number, expected: number, allowed = tolerance) => assert.ok(Math.abs(actual - expected) <= allowed, `${actual} is not within ${allowed} of ${expected}`);

function representativeDay(overrides: Partial<RepresentativeDayInput> = {}) {
  return simulateRepresentativeDay({
    dailyLoadKwh: 10,
    dailySolarKwh: 10,
    daytimeLoadShare: 0.6,
    batteryCapacityKwh: null,
    batteryDepthOfDischarge: 0.8,
    batteryRoundTripEfficiency: 0.92,
    gridConnected: true,
    exportPermitted: false,
    tou: false,
    peakLoadShare: 0,
    ...overrides,
  });
}

function assertConservation(flow: ReturnType<typeof representativeDay>, load: number, solar: number) {
  approximately(solar, flow.directSolarKwh + flow.batteryChargeInputKwh + flow.gridExportKwh + flow.curtailedGenerationKwh);
  approximately(load, flow.directSolarKwh + flow.batteryDeliveredKwh + flow.gridImportKwh + flow.unservedLoadKwh);
  approximately(flow.batteryChargeInputKwh, flow.batteryDeliveredKwh + flow.batteryLossKwh);
}

test("zero solar leaves direct use and battery flow at zero while the grid serves connected load", () => {
  const flow = representativeDay({ dailySolarKwh: 0, batteryCapacityKwh: 10, exportPermitted: true });
  assert.equal(flow.directSolarKwh, 0);
  assert.equal(flow.batteryChargeInputKwh, 0);
  assert.equal(flow.batteryDeliveredKwh, 0);
  assert.equal(flow.gridImportKwh, 10);
  assert.equal(flow.unservedLoadKwh, 0);
  assertConservation(flow, 10, 0);
});

test("solar equal to daytime load creates no surplus", () => {
  const flow = representativeDay({ dailySolarKwh: 6, exportPermitted: true });
  assert.equal(flow.daytimeLoadKwh, 6);
  assert.equal(flow.nighttimeLoadKwh, 4);
  assert.equal(flow.directSolarKwh, 6);
  assert.equal(flow.gridExportKwh, 0);
  assert.equal(flow.curtailedGenerationKwh, 0);
  assert.equal(flow.gridImportKwh, 4);
  assertConservation(flow, 10, 6);
});

test("no-battery export and zero-export architectures allocate genuine surplus correctly", () => {
  const exporting = representativeDay({ dailySolarKwh: 10, exportPermitted: true });
  assert.equal(exporting.directSolarKwh, 6);
  assert.equal(exporting.batteryChargeInputKwh, 0);
  assert.equal(exporting.batteryDeliveredKwh, 0);
  assert.equal(exporting.gridExportKwh, 4);
  assert.equal(exporting.curtailedGenerationKwh, 0);
  assertConservation(exporting, 10, 10);

  const zeroExport = representativeDay({ dailySolarKwh: 10, exportPermitted: false });
  assert.equal(zeroExport.gridExportKwh, 0);
  assert.equal(zeroExport.curtailedGenerationKwh, 4);
  assertConservation(zeroExport, 10, 10);
});

test("battery charging is solar-only, daily constrained and applies round-trip efficiency once", () => {
  const flow = representativeDay({
    dailySolarKwh: 14,
    daytimeLoadShare: 0.4,
    batteryCapacityKwh: 5,
    batteryDepthOfDischarge: 0.8,
    batteryRoundTripEfficiency: 0.8,
  });
  assert.equal(flow.usableBatteryCapacityKwh, 4);
  assert.equal(flow.batteryChargeInputKwh, 5);
  assert.equal(flow.batteryDeliveredKwh, 4);
  assert.equal(flow.batteryLossKwh, 1);
  assert.ok(flow.batteryDeliveredKwh <= flow.usableBatteryCapacityKwh);
  assert.equal(flow.gridImportKwh, 2);
  assertConservation(flow, 10, 14);

  const noSurplus = representativeDay({ dailySolarKwh: 4, daytimeLoadShare: 0.4, batteryCapacityKwh: 5 });
  assert.equal(noSurplus.batteryChargeInputKwh, 0);
  assert.equal(noSurplus.batteryDeliveredKwh, 0);
  assert.equal(noSurplus.gridImportKwh, 6);
  assertConservation(noSurplus, 10, 4);
});

test("non-TOU battery dispatch serves later demand and charges before export", () => {
  const flow = representativeDay({
    dailySolarKwh: 14,
    daytimeLoadShare: 0.4,
    batteryCapacityKwh: 5,
    batteryDepthOfDischarge: 0.8,
    batteryRoundTripEfficiency: 0.8,
    exportPermitted: true,
  });
  assert.equal(flow.peakBatteryDischargeKwh, 0);
  assert.equal(flow.offPeakBatteryDischargeKwh, 4);
  assert.equal(flow.batteryChargeInputKwh, 5);
  assert.equal(flow.gridExportKwh, 5);
  assert.equal(flow.gridImportKwh, 2);
  assertConservation(flow, 10, 14);
});

test("TOU dispatch preserves period imports and sends battery energy to peak demand first", () => {
  const flow = representativeDay({
    dailySolarKwh: 14,
    daytimeLoadShare: 0.4,
    batteryCapacityKwh: 5,
    batteryDepthOfDischarge: 1,
    batteryRoundTripEfficiency: 1,
    tou: true,
    peakLoadShare: 0.5,
  });
  assert.equal(flow.directSolarKwh, 4);
  assert.equal(flow.peakBatteryDischargeKwh, 5);
  assert.equal(flow.offPeakBatteryDischargeKwh, 0);
  assert.equal(flow.peakGridImportKwh, 0);
  assert.equal(flow.offPeakGridImportKwh, 1);
  assert.equal(flow.gridImportKwh, 1);
  assertConservation(flow, 10, 14);
});

test("Off-Grid never imports or exports and records every unmet kWh as unserved", () => {
  const flow = representativeDay({ dailySolarKwh: 3, daytimeLoadShare: 0.5, batteryCapacityKwh: 5, gridConnected: false, exportPermitted: false });
  assert.equal(flow.gridImportKwh, 0);
  assert.equal(flow.gridExportKwh, 0);
  assert.equal(flow.batteryChargeInputKwh, 0);
  assert.equal(flow.unservedLoadKwh, 7);
  assertConservation(flow, 10, 3);
});

const monthlyConsumption = [820, 790, 850, 900, 960, 1_020, 1_050, 1_010, 940, 880, 830, 800].map((kwh, index) => ({
  year: 2026,
  month: index + 1,
  kwh,
  confidence: "high" as const,
}));

const representativeCustomer: VerifiedSolarInput = {
  provider: "IESCO",
  city: "Islamabad",
  tariffCategory: "A-1",
  connectionType: "Residential",
  consumerCategory: "residential",
  protectedStatus: "non_protected",
  phase: "three",
  sanctionedLoadKw: 15,
  mdiKw: 8,
  touStatus: "no",
  peakUnitsKwh: null,
  offPeakUnitsKwh: null,
  greenMeterStatus: "yes",
  prosumerStatus: "current",
  prosumerAgreementDate: null,
  usagePattern: "mostly_daytime",
  gridReliability: "reliable",
  existingSolar: { status: "no", pvKwp: null },
  analysisMode: "recommend",
  selectedArchitecture: null,
  panelWattage: 585,
  currentBillAmountPkr: null,
  monthlyConsumption,
  backupPreference: { level: "essential", durationHours: 4, backupLoadKw: 2 },
};

test("all six architectures conserve annual energy and retain their import/export semantics", () => {
  const context = buildOptimizationContext(representativeCustomer);
  const profile = getSolarProfile(representativeCustomer.city).profile;
  const architectures = Object.keys(ARCHITECTURES) as SolarArchitecture[];
  const systems = architectures.map((architecture) => optimizeArchitecture(representativeCustomer, profile, context, architecture));
  assert.equal(systems.length, 6);

  for (const system of systems) {
    approximately(system.annualGenerationKwh, system.directSolarConsumptionKwh + system.batteryChargeInputKwh + system.gridExportKwh! + system.curtailedGenerationKwh, 0.3);
    approximately(context.annualConsumptionKwh, system.directSolarConsumptionKwh + system.batteryDischargeKwh + system.gridImportKwh! + system.unservedLoadKwh, 0.3);
    approximately(system.batteryChargeInputKwh, system.batteryDischargeKwh + system.batteryLossKwh, 0.3);
    assert.ok(system.directSolarConsumptionKwh + system.batteryDischargeKwh <= system.annualGenerationKwh + 0.2);
    assert.ok(system.selfConsumptionPercent >= 0 && system.selfConsumptionPercent <= 100);
    assert.ok(system.consumptionCoveragePercent >= 0 && system.consumptionCoveragePercent <= 100);
    assert.equal(system.unusedSurplusKwh, system.curtailedGenerationKwh);
    for (const month of system.monthlySimulation) {
      approximately(month.gridImportKwh!, month.peakGridImportKwh + month.offPeakGridImportKwh, 0.2);
    }
  }

  for (const architecture of ["on_grid_only", "hybrid_green_no_battery", "hybrid_no_green_no_battery"] as const) {
    const system = systems.find((item) => item.architectureKey === architecture)!;
    assert.equal(system.batteryChargeInputKwh, 0);
    assert.equal(system.batteryDischargeKwh, 0);
    assert.equal(system.batteryLossKwh, 0);
  }
  for (const architecture of ["hybrid_no_green_no_battery", "hybrid_battery_no_green"] as const) {
    assert.equal(systems.find((item) => item.architectureKey === architecture)!.gridExportKwh, 0);
  }
  const batteryExporter = systems.find((item) => item.architectureKey === "hybrid_green_battery")!;
  assert.ok(batteryExporter.batteryChargeInputKwh > 0);
  assert.ok(batteryExporter.gridExportKwh! >= 0);
  const offGrid = systems.find((item) => item.architectureKey === "off_grid")!;
  assert.equal(offGrid.gridImportKwh, 0);
  assert.equal(offGrid.gridExportKwh, 0);
  assert.ok(offGrid.unservedLoadKwh >= 0);
  assert.equal(offGrid.postSolarBill, null);
});

test("representative customer remains deterministic and exposes the simulation methodology", () => {
  const first = calculateSolarRecommendation(representativeCustomer);
  const second = calculateSolarRecommendation(representativeCustomer);
  assert.deepEqual(first, second);
  assert.ok(first.bestRecommended);
  assert.equal(first.assumptions.daytimeLoadShare, 0.7);
  assert.equal(first.assumptions.batteryRoundTripEfficiency, 0.92);
  assert.match(first.assumptions.loadProfileMethodology, /representative-day/);
});

test("verified TOU monthly shares remain separated through the annual optimizer flow", () => {
  const touCustomer: VerifiedSolarInput = {
    ...representativeCustomer,
    tariffCategory: "A-2",
    connectionType: "Commercial",
    consumerCategory: "commercial",
    protectedStatus: "unknown",
    touStatus: "yes",
    peakUnitsKwh: 400,
    offPeakUnitsKwh: 600,
    usagePattern: "mostly_evening",
    greenMeterStatus: "no",
    prosumerStatus: "none",
  };
  const context = buildOptimizationContext(touCustomer);
  const system = optimizeArchitecture(touCustomer, getSolarProfile(touCustomer.city).profile, context, "hybrid_battery_no_green");
  const peakImport = system.monthlySimulation.reduce((sum, month) => sum + month.peakGridImportKwh, 0);
  const offPeakImport = system.monthlySimulation.reduce((sum, month) => sum + month.offPeakGridImportKwh, 0);
  approximately(system.gridImportKwh!, peakImport + offPeakImport, 1.2);
  assert.ok(peakImport < context.annualConsumptionKwh * 0.4);
  assert.equal(system.gridExportKwh, 0);
});
