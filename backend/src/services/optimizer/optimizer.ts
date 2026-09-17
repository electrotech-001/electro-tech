import type { SolarArchitecture, VerifiedSolarInput } from "../../validation/solar-analyzer.js";
import { estimateAnnualBill, type BillEstimate } from "../billing/engine.js";
import { LOAD_PROFILE_ASSUMPTIONS, PRACTICAL_INVERTER_CAPACITIES_KW, SOLAR_ASSUMPTIONS } from "../solar/assumptions.js";
import type { SolarProfile } from "../solar/profiles.js";
import { assessMaterialModification, checkInterconnection, currentExportArrangement, REGULATORY_STATUS_LABELS, resolveProsumer, type CurrentExportArrangement, type PhaseStatus, type ProsumerResolution, type RegulatoryStatus } from "../prosumer/policy.js";
import { resolveTariff, type ResolvedTariff } from "../tariffs/resolver.js";

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const ECONOMIC_SHIFTING_WINDOW_HOURS = 4;

export const ARCHITECTURES = Object.freeze({
  on_grid_only: { label: "On-Grid Only", battery: false, green: false, gridConnected: true, hybrid: false },
  hybrid_green_no_battery: { label: "Hybrid + Green Meter — No Battery", battery: false, green: true, gridConnected: true, hybrid: true },
  hybrid_green_battery: { label: "Hybrid + Green Meter + Battery", battery: true, green: true, gridConnected: true, hybrid: true },
  hybrid_no_green_no_battery: { label: "Hybrid Only — No Green Meter / No Battery", battery: false, green: false, gridConnected: true, hybrid: true },
  hybrid_battery_no_green: { label: "Hybrid + Battery — No Green Meter", battery: true, green: false, gridConnected: true, hybrid: true },
  off_grid: { label: "Off-Grid", battery: true, green: false, gridConnected: false, hybrid: false },
} satisfies Record<SolarArchitecture, { label: string; battery: boolean; green: boolean; gridConnected: boolean; hybrid: boolean }>);

export type MonthlyScenario = {
  month: number;
  monthName: string;
  consumptionKwh: number | null;
  generationKwh: number;
  daytimeLoadKwh: number;
  nighttimeLoadKwh: number;
  directSolarKwh: number;
  batteryChargeInputKwh: number;
  batteryDischargeKwh: number;
  batteryLossKwh: number;
  usableBatteryCapacityKwh: number;
  peakGridImportKwh: number;
  offPeakGridImportKwh: number;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
  curtailedGenerationKwh: number;
  unusedSurplusKwh: number;
  unservedLoadKwh: number;
};

export type OptimizedSystem = {
  architectureKey: SolarArchitecture;
  architecture: string;
  actualInstalledKwp: number;
  inverterKw: number;
  panelCount: number;
  panelWattage: number;
  batteryKwh: number | null;
  annualGenerationKwh: number;
  directSolarConsumptionKwh: number;
  batteryChargeInputKwh: number;
  batteryDischargeKwh: number;
  batteryLossKwh: number;
  usableBatteryCapacityKwh: number;
  gridImportKwh: number | null;
  gridExportKwh: number | null;
  curtailedGenerationKwh: number;
  unusedSurplusKwh: number;
  unservedLoadKwh: number;
  selfConsumptionPercent: number;
  consumptionCoveragePercent: number;
  currentBill: BillEstimate | null;
  postSolarBill: BillEstimate | null;
  estimatedBillReductionPkr: number | null;
  estimatedBillReductionPercent: number | null;
  estimatedRemainingBillPkr: number | null;
  regulatoryValid: boolean;
  architectureExportCapable: boolean;
  currentExportArrangement: CurrentExportArrangement;
  regulatoryStatus: RegulatoryStatus;
  regulatoryStatusLabel: string;
  phaseStatus: PhaseStatus;
  currentGridEligibleCapacityKwp: number | null;
  exceedsSanctionedLoad: boolean;
  excessCapacityKwp: number;
  loadExtensionRequired: boolean;
  materialModification: boolean;
  legacyAgreementStatus: ProsumerResolution["legacyAgreementStatus"];
  agreementLifecycleStatus: ProsumerResolution["agreementLifecycleStatus"];
  regulatoryQualifications: string[];
  prosumerRegime: ProsumerResolution["regime"];
  monthlySimulation: MonthlyScenario[];
  qualification: string[];
  whyThisSystem: string[];
  score: number;
};

export type OptimizationContext = {
  annualConsumptionKwh: number;
  averageMonthlyKwh: number;
  averageDailyKwh: number;
  consumptionByMonth: Map<number, number | null>;
  tariff: ResolvedTariff;
  currentBill: BillEstimate;
};

function round(value: number, precision = 1) { const factor = 10 ** precision; return Math.round(value * factor) / factor; }

function touPeakShare(input: VerifiedSolarInput): number {
  if (input.touStatus !== "yes") return 0;
  const supplied = (input.peakUnitsKwh ?? 0) + (input.offPeakUnitsKwh ?? 0);
  return supplied > 0
    ? (input.peakUnitsKwh ?? 0) / supplied
    : LOAD_PROFILE_ASSUMPTIONS[input.usagePattern].defaultTouPeakShare;
}

export type RepresentativeDayInput = {
  dailyLoadKwh: number;
  dailySolarKwh: number;
  daytimeLoadShare: number;
  batteryCapacityKwh: number | null;
  batteryDepthOfDischarge: number;
  batteryRoundTripEfficiency: number;
  gridConnected: boolean;
  exportPermitted: boolean;
  tou: boolean;
  peakLoadShare: number;
};

export type RepresentativeDayFlow = {
  daytimeLoadKwh: number;
  nighttimeLoadKwh: number;
  directSolarKwh: number;
  batteryChargeInputKwh: number;
  batteryDeliveredKwh: number;
  batteryLossKwh: number;
  usableBatteryCapacityKwh: number;
  peakBatteryDischargeKwh: number;
  offPeakBatteryDischargeKwh: number;
  peakGridImportKwh: number;
  offPeakGridImportKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  curtailedGenerationKwh: number;
  unservedLoadKwh: number;
};

function clampShare(value: number): number { return Math.min(1, Math.max(0, value)); }

export function simulateRepresentativeDay(input: RepresentativeDayInput): RepresentativeDayFlow {
  const dailyLoad = Math.max(0, input.dailyLoadKwh);
  const dailySolar = Math.max(0, input.dailySolarKwh);
  const daytimeLoad = dailyLoad * clampShare(input.daytimeLoadShare);
  const nighttimeLoad = dailyLoad - daytimeLoad;
  const peakLoad = input.tou ? dailyLoad * clampShare(input.peakLoadShare) : 0;
  const offPeakLoad = dailyLoad - peakLoad;

  // In the monthly TOU approximation, daytime demand is assigned to off-peak
  // first. Any verified peak share that exceeds later demand overlaps daytime.
  const daytimeOffPeakLoad = Math.min(daytimeLoad, offPeakLoad);
  const daytimePeakLoad = daytimeLoad - daytimeOffPeakLoad;
  const directSolar = Math.min(dailySolar, daytimeLoad);
  const directOffPeak = Math.min(directSolar, daytimeOffPeakLoad);
  const directPeak = Math.min(directSolar - directOffPeak, daytimePeakLoad);
  const remainingPeakLoad = Math.max(0, peakLoad - directPeak);
  const remainingOffPeakLoad = Math.max(0, offPeakLoad - directOffPeak);
  const remainingLoad = remainingPeakLoad + remainingOffPeakLoad;
  const solarSurplus = Math.max(0, dailySolar - directSolar);

  const usableBatteryCapacity = Math.max(0, input.batteryCapacityKwh ?? 0) * clampShare(input.batteryDepthOfDischarge);
  const roundTripEfficiency = clampShare(input.batteryRoundTripEfficiency);
  const canUseBattery = usableBatteryCapacity > 0 && roundTripEfficiency > 0;
  // Solar is the only charge source. Efficiency is applied once from charge
  // input to delivered load, and charging is limited to one representative-day
  // cycle, that day's surplus, and that day's remaining demand.
  const batteryChargeInput = canUseBattery
    ? Math.min(solarSurplus, usableBatteryCapacity / roundTripEfficiency, remainingLoad / roundTripEfficiency)
    : 0;
  const batteryDeliverable = batteryChargeInput * roundTripEfficiency;
  const peakBatteryDischarge = Math.min(remainingPeakLoad, batteryDeliverable);
  const offPeakBatteryDischarge = Math.min(remainingOffPeakLoad, Math.max(0, batteryDeliverable - peakBatteryDischarge));
  const batteryDelivered = peakBatteryDischarge + offPeakBatteryDischarge;
  const batteryLoss = Math.max(0, batteryChargeInput - batteryDelivered);

  const remainingPeakAfterBattery = Math.max(0, remainingPeakLoad - peakBatteryDischarge);
  const remainingOffPeakAfterBattery = Math.max(0, remainingOffPeakLoad - offPeakBatteryDischarge);
  const remainingDemand = remainingPeakAfterBattery + remainingOffPeakAfterBattery;
  const peakGridImport = input.gridConnected ? remainingPeakAfterBattery : 0;
  const offPeakGridImport = input.gridConnected ? remainingOffPeakAfterBattery : 0;
  const gridImport = peakGridImport + offPeakGridImport;
  const unservedLoad = input.gridConnected ? 0 : remainingDemand;
  const surplusAfterBattery = Math.max(0, solarSurplus - batteryChargeInput);
  const gridExport = input.gridConnected && input.exportPermitted ? surplusAfterBattery : 0;
  const curtailedGeneration = Math.max(0, surplusAfterBattery - gridExport);

  return {
    daytimeLoadKwh: daytimeLoad,
    nighttimeLoadKwh: nighttimeLoad,
    directSolarKwh: directSolar,
    batteryChargeInputKwh: batteryChargeInput,
    batteryDeliveredKwh: batteryDelivered,
    batteryLossKwh: batteryLoss,
    usableBatteryCapacityKwh: usableBatteryCapacity,
    peakBatteryDischargeKwh: peakBatteryDischarge,
    offPeakBatteryDischargeKwh: offPeakBatteryDischarge,
    peakGridImportKwh: peakGridImport,
    offPeakGridImportKwh: offPeakGridImport,
    gridImportKwh: gridImport,
    gridExportKwh: gridExport,
    curtailedGenerationKwh: curtailedGeneration,
    unservedLoadKwh: unservedLoad,
  };
}

function compatibleInverters(pvKwp: number): number[] {
  const exact = PRACTICAL_INVERTER_CAPACITIES_KW.filter((kw) => {
    const ratio = pvKwp / kw;
    return ratio >= SOLAR_ASSUMPTIONS.dcAcRatioMin && ratio <= SOLAR_ASSUMPTIONS.dcAcRatioMax;
  });
  if (exact.length) return exact;
  return [[...PRACTICAL_INVERTER_CAPACITIES_KW].sort((a, b) => Math.abs(pvKwp / a - 1.2) - Math.abs(pvKwp / b - 1.2))[0]!];
}

function batteryOptions(input: VerifiedSolarInput, averageDaily: number, architecture: SolarArchitecture): Array<number | null> {
  if (!ARCHITECTURES[architecture].battery) return [null];
  if (architecture === "off_grid") {
    const rawAutonomy = averageDaily / (SOLAR_ASSUMPTIONS.batteryDepthOfDischarge * SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency) * SOLAR_ASSUMPTIONS.batterySafetyMargin;
    const baseAutonomy = Math.max(SOLAR_ASSUMPTIONS.batteryModuleKwh, Math.ceil(rawAutonomy / SOLAR_ASSUMPTIONS.batteryModuleKwh) * SOLAR_ASSUMPTIONS.batteryModuleKwh);
    return [round(baseAutonomy, 2), round(baseAutonomy * 1.5, 2)];
  }
  const preference = input.backupPreference;
  const backupRequested = preference?.level !== undefined && preference.level !== "none";
  const level = backupRequested ? preference.level : "none";
  // With no backup requested, retain the existing small economic-shifting candidate
  // without consuming a hidden/default backup-duration input.
  const factor = { none: 0.15, essential: 0.3, most: 0.6, entire: 0.95 }[level];
  const load = backupRequested ? (preference.backupLoadKw ?? (averageDaily / 24) * factor) : (averageDaily / 24) * factor;
  const hours = backupRequested ? preference.durationHours : ECONOMIC_SHIFTING_WINDOW_HOURS;
  const raw = load * hours / (SOLAR_ASSUMPTIONS.batteryDepthOfDischarge * SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency) * SOLAR_ASSUMPTIONS.batterySafetyMargin;
  const base = Math.max(SOLAR_ASSUMPTIONS.batteryModuleKwh, Math.ceil(raw / SOLAR_ASSUMPTIONS.batteryModuleKwh) * SOLAR_ASSUMPTIONS.batteryModuleKwh);
  return [round(base, 2), round(base + SOLAR_ASSUMPTIONS.batteryModuleKwh, 2)];
}

function candidatePanelCounts(input: VerifiedSolarInput, profile: SolarProfile, annualConsumption: number, architecture: SolarArchitecture): number[] {
  const panelKw = input.panelWattage / 1000;
  const annualPerKwp = profile.monthlyPeakSunHours.reduce((sum, psh, index) => sum + psh * DAYS[index]! * SOLAR_ASSUMPTIONS.performanceRatio, 0);
  const annualBaseline = annualConsumption / annualPerKwp;
  const worstSeasonBaseline = architecture === "off_grid"
    ? Math.max(...profile.monthlyPeakSunHours.map((psh, index) => {
        const reading = input.monthlyConsumption.find((item) => item.month === index + 1)?.kwh;
        const monthlyConsumption = reading ?? annualConsumption / 12;
        return (monthlyConsumption / DAYS[index]!) * SOLAR_ASSUMPTIONS.offGridReserveFactor / (psh * SOLAR_ASSUMPTIONS.offGridPerformanceRatio);
      }))
    : 0;
  const baselinePanels = Math.max(2, Math.ceil(Math.max(annualBaseline, worstSeasonBaseline) / panelKw));
  const multiplier = architecture === "off_grid" ? 1.35 : ARCHITECTURES[architecture].green ? 1.35 : ARCHITECTURES[architecture].battery ? 1.3 : 1.15;
  const maximum = Math.max(4, Math.ceil(baselinePanels * multiplier));
  return Array.from({ length: maximum - 1 }, (_, index) => index + 2);
}

function annualTouSplit(input: VerifiedSolarInput, annualConsumption: number) {
  const peak = annualConsumption * touPeakShare(input);
  return { peak, offPeak: annualConsumption - peak };
}

export function buildOptimizationContext(input: VerifiedSolarInput): OptimizationContext {
  const readable = input.monthlyConsumption.filter((reading) => reading.kwh !== null);
  const uniqueMonths = new Set(readable.map((reading) => `${reading.year}-${reading.month}`));
  if (readable.length !== 12 || uniqueMonths.size !== 12) {
    throw new Error("Exactly 12 unique monthly consumption readings are required.");
  }
  const observed = readable.reduce((sum, reading) => sum + reading.kwh!, 0);
  const averageMonthlyKwh = observed / 12;
  const annualConsumptionKwh = observed;
  const consumptionByMonth = new Map<number, number | null>();
  for (const reading of input.monthlyConsumption) consumptionByMonth.set(reading.month, reading.kwh);
  const tariff = resolveTariff(input, annualConsumptionKwh);
  const split = annualTouSplit(input, annualConsumptionKwh);
  const currentBill = estimateAnnualBill({ totalImportKwh: annualConsumptionKwh, peakImportKwh: split.peak, offPeakImportKwh: split.offPeak, exportKwh: 0 }, tariff, { regime: "none", settlement: "none", exportPermitted: false, exportRate: 0, excessExportRate: 0, confidence: "High", legacyAgreementStatus: "not-applicable", agreementLifecycleStatus: "none", qualifications: [] });
  return { annualConsumptionKwh, averageMonthlyKwh, averageDailyKwh: annualConsumptionKwh / 365, consumptionByMonth, tariff, currentBill };
}

function simulateCandidate(input: VerifiedSolarInput, profile: SolarProfile, context: OptimizationContext, architecture: SolarArchitecture, panelCount: number, inverterKw: number, batteryKwh: number | null): OptimizedSystem {
  const meta = ARCHITECTURES[architecture];
  const pvKwp = round(panelCount * input.panelWattage / 1000, 3);
  const architectureExportCapable = meta.green || architecture === "on_grid_only";
  const exportArrangement = currentExportArrangement(input);
  const prosumer = resolveProsumer(input, context.tariff, architectureExportCapable);
  const interconnection = checkInterconnection(pvKwp, input, architectureExportCapable);
  const modification = assessMaterialModification(pvKwp, inverterKw, input);
  const regulatoryStatus: RegulatoryStatus = modification.materialModification && interconnection.regulatoryStatus === "eligible"
    ? "requires-disco-verification"
    : interconnection.regulatoryStatus;
  let annualGeneration = 0, direct = 0, batteryChargeInput = 0, batteryDischarge = 0, batteryLoss = 0, gridImport = 0, peakGridImport = 0, offPeakGridImport = 0, gridExport = 0, unused = 0, unserved = 0;
  const loadProfile = LOAD_PROFILE_ASSUMPTIONS[input.usagePattern];
  const peakLoadShare = touPeakShare(input);
  const months = profile.monthlyPeakSunHours.map((psh, index): MonthlyScenario => {
    const consumptionValue = context.consumptionByMonth.get(index + 1);
    const consumption = consumptionValue ?? context.averageMonthlyKwh;
    const days = DAYS[index]!;
    const performanceRatio = architecture === "off_grid" ? SOLAR_ASSUMPTIONS.offGridPerformanceRatio : SOLAR_ASSUMPTIONS.performanceRatio;
    const generation = pvKwp * psh * days * performanceRatio;
    const day = simulateRepresentativeDay({
      dailyLoadKwh: consumption / days,
      dailySolarKwh: generation / days,
      daytimeLoadShare: loadProfile.daytimeLoadShare,
      batteryCapacityKwh: batteryKwh,
      batteryDepthOfDischarge: SOLAR_ASSUMPTIONS.batteryDepthOfDischarge,
      batteryRoundTripEfficiency: SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency,
      gridConnected: meta.gridConnected,
      exportPermitted: prosumer.exportPermitted,
      tou: context.tariff.tou,
      peakLoadShare,
    });
    const directUse = day.directSolarKwh * days;
    const charged = day.batteryChargeInputKwh * days;
    const discharged = day.batteryDeliveredKwh * days;
    const losses = day.batteryLossKwh * days;
    const imported = day.gridImportKwh * days;
    const peakImported = day.peakGridImportKwh * days;
    const offPeakImported = day.offPeakGridImportKwh * days;
    const exported = day.gridExportKwh * days;
    const wasted = day.curtailedGenerationKwh * days;
    const unmet = day.unservedLoadKwh * days;
    annualGeneration += generation; direct += directUse; batteryChargeInput += charged; batteryDischarge += discharged; batteryLoss += losses; gridImport += imported; peakGridImport += peakImported; offPeakGridImport += offPeakImported; gridExport += exported; unused += wasted; unserved += unmet;
    return { month: index + 1, monthName: MONTHS[index]!, consumptionKwh: consumptionValue ?? null, generationKwh: round(generation), daytimeLoadKwh: round(day.daytimeLoadKwh * days), nighttimeLoadKwh: round(day.nighttimeLoadKwh * days), directSolarKwh: round(directUse), batteryChargeInputKwh: round(charged), batteryDischargeKwh: round(discharged), batteryLossKwh: round(losses), usableBatteryCapacityKwh: round(day.usableBatteryCapacityKwh), peakGridImportKwh: round(peakImported), offPeakGridImportKwh: round(offPeakImported), gridImportKwh: round(imported), gridExportKwh: round(exported), curtailedGenerationKwh: round(wasted), unusedSurplusKwh: round(wasted), unservedLoadKwh: round(unmet) };
  });

  const postBill = meta.gridConnected ? estimateAnnualBill({ totalImportKwh: gridImport, peakImportKwh: peakGridImport, offPeakImportKwh: offPeakGridImport, exportKwh: gridExport, peakExportKwh: 0, offPeakExportKwh: gridExport }, context.tariff, prosumer) : null;
  const reduction = postBill ? Math.max(0, context.currentBill.estimatedAnnualBillPkr - postBill.estimatedAnnualBillPkr) : null;
  const reductionPercent = reduction == null || context.currentBill.estimatedAnnualBillPkr <= 0 ? null : Math.min(99, reduction / context.currentBill.estimatedAnnualBillPkr * 100);
  const coverage = Math.min(100, (direct + batteryDischarge) / context.annualConsumptionKwh * 100);
  const selfConsumption = annualGeneration > 0 ? Math.min(100, (direct + batteryDischarge) / annualGeneration * 100) : 0;
  const regulatoryQualifications = [...interconnection.qualifications];
  if (modification.materialModification) {
    regulatoryQualifications.push(
      "Material Modification — DISCO / Regulatory Review Required",
      "The proposed change may constitute a material modification to the existing distributed generation facility. Revised utility/regulatory approval may be required before implementation.",
      ...modification.reasons,
    );
    if (input.prosumerStatus === "legacy") {
      regulatoryQualifications.push("Modification may affect the regulatory or settlement treatment of the existing agreement. Verify the proposed change with the relevant DISCO before relying on legacy settlement terms.");
    }
  }
  const qualifications = [...context.tariff.qualifications, ...prosumer.qualifications, ...regulatoryQualifications];
  if (input.usagePattern === "not_sure") qualifications.push(`Unknown usage pattern uses the ${loadProfile.description} in the monthly representative-day simulation.`);
  if (!meta.gridConnected) qualifications.push("Grid electricity bill and import/export are not applicable only if the property is fully disconnected from the utility.", "Final Off-Grid design requires load, surge, autonomy and site studies.", "Off-Grid PV uses the configured worst-season profile and reserve factor; modeled unserved load must still be confirmed against hourly loads.");
  if (!prosumer.exportPermitted && unused > 0) qualifications.push("No export value is assumed; unused solar surplus is penalized in optimization.");
  if (prosumer.settlement === "legacy_netting" && context.tariff.tou) qualifications.push("Without interval export data, modeled solar exports are conservatively assigned to off-peak legacy netting.");
  if (input.existingSolar.status === "yes") qualifications.push("Existing PV is flagged, but expansion sizing remains preliminary until gross load and existing-system production are measured separately.");
  const offGridEnergyValid = meta.gridConnected || unserved / context.annualConsumptionKwh <= 0.05;
  const engineeringValid = interconnection.withinPolicyScope && offGridEnergyValid && !(meta.green && input.greenMeterStatus === "no") && !(meta.gridConnected && input.gridReliability === "no_grid");
  const regulatoryValid = engineeringValid && interconnection.valid && !modification.materialModification;
  if (meta.green && input.greenMeterStatus === "no") qualifications.push("This architecture requires a green/bidirectional meter and utility interconnection approval.");
  if (meta.gridConnected && input.gridReliability === "no_grid") qualifications.push("This architecture requires an available utility grid connection.");
  const complexityPenalty = (batteryKwh ?? 0) * 90 + (meta.hybrid ? 500 : 0);
  const unverifiedGreenMeterPenalty = meta.green && input.greenMeterStatus !== "yes" ? 1_000 : 0;
  const unusedPenalty = unused * context.tariff.variableRate * 0.6;
  const score = engineeringValid ? (reduction ?? (input.gridReliability === "no_grid" ? context.currentBill.estimatedAnnualBillPkr : 0)) - complexityPenalty - unverifiedGreenMeterPenalty - unusedPenalty - unserved * context.tariff.variableRate * 5 : -Infinity;
  const loadReason = input.usagePattern === "mostly_daytime"
    ? `Your daytime-heavy consumption profile supports direct use of the modeled solar generation.`
    : input.usagePattern === "mostly_evening"
      ? meta.battery
        ? "Your evening-heavy consumption profile makes stored daytime solar useful for later demand."
        : "Your evening-heavy consumption limits direct daytime solar use, which is reflected in the modeled imports and exports."
      : input.usagePattern === "roughly_equal"
        ? "Your balanced daytime and evening consumption profile supports a mix of direct solar use and later grid or battery supply."
        : `Because your consumption pattern is uncertain, the model uses the documented ${Math.round(loadProfile.daytimeLoadShare * 100)}% daytime-load assumption.`;
  const architectureReason = !meta.gridConnected
    ? `This preliminary Off-Grid size targets independence and reports ${round(unserved)} kWh/year of modeled unserved energy for site verification.`
    : meta.battery && input.backupPreference && input.backupPreference.level !== "none"
      ? `Battery storage supports your ${input.backupPreference.level}-load backup objective while using solar surplus before any export or curtailment.`
      : meta.battery
        ? "Battery storage shifts available solar surplus to later demand before remaining surplus is exported or curtailed."
        : meta.green
          ? "This configuration favors direct solar use and permits genuine remaining surplus to use the applicable export settlement treatment."
          : "This zero-export configuration values direct solar use and records remaining surplus as curtailment rather than export income.";
  const outcomeReason = postBill
    ? `The deterministic tariff model estimates ${round(reductionPercent ?? 0)}% annual bill reduction while retaining modeled fixed charges.`
    : "Utility billing is not applicable only if the property is fully disconnected; load, surge, autonomy and site studies remain required.";
  const why = [loadReason, architectureReason, outcomeReason];
  return { architectureKey: architecture, architecture: meta.label, actualInstalledKwp: pvKwp, inverterKw, panelCount, panelWattage: input.panelWattage, batteryKwh, annualGenerationKwh: round(annualGeneration), directSolarConsumptionKwh: round(direct), batteryChargeInputKwh: round(batteryChargeInput), batteryDischargeKwh: round(batteryDischarge), batteryLossKwh: round(batteryLoss), usableBatteryCapacityKwh: round((batteryKwh ?? 0) * SOLAR_ASSUMPTIONS.batteryDepthOfDischarge), gridImportKwh: round(gridImport), gridExportKwh: round(gridExport), curtailedGenerationKwh: round(unused), unusedSurplusKwh: round(unused), unservedLoadKwh: round(unserved), selfConsumptionPercent: round(selfConsumption), consumptionCoveragePercent: round(coverage), currentBill: meta.gridConnected ? context.currentBill : null, postSolarBill: postBill, estimatedBillReductionPkr: reduction == null ? null : round(reduction), estimatedBillReductionPercent: reductionPercent == null ? null : round(reductionPercent), estimatedRemainingBillPkr: postBill?.estimatedAnnualBillPkr ?? null, regulatoryValid, architectureExportCapable, currentExportArrangement: exportArrangement, regulatoryStatus, regulatoryStatusLabel: REGULATORY_STATUS_LABELS[regulatoryStatus], phaseStatus: interconnection.phaseStatus, currentGridEligibleCapacityKwp: interconnection.currentGridEligibleCapacityKwp, exceedsSanctionedLoad: interconnection.exceedsSanctionedLoad, excessCapacityKwp: round(interconnection.excessCapacityKwp, 3), loadExtensionRequired: interconnection.loadExtensionRequired, materialModification: modification.materialModification, legacyAgreementStatus: prosumer.legacyAgreementStatus, agreementLifecycleStatus: prosumer.agreementLifecycleStatus, regulatoryQualifications: [...new Set(regulatoryQualifications)], prosumerRegime: prosumer.regime, monthlySimulation: months, qualification: [...new Set(qualifications)], whyThisSystem: why, score };
}

export function optimizeArchitecture(input: VerifiedSolarInput, profile: SolarProfile, context: OptimizationContext, architecture: SolarArchitecture): OptimizedSystem {
  const candidates: OptimizedSystem[] = [];
  for (const panels of candidatePanelCounts(input, profile, context.annualConsumptionKwh, architecture)) {
    const pvKwp = panels * input.panelWattage / 1000;
    for (const inverter of compatibleInverters(pvKwp)) {
      for (const battery of batteryOptions(input, context.averageDailyKwh, architecture)) candidates.push(simulateCandidate(input, profile, context, architecture, panels, inverter, battery));
    }
  }
  const engineeringCandidates = candidates.filter((candidate) => Number.isFinite(candidate.score));
  const pool = engineeringCandidates.length ? engineeringCandidates : candidates;
  return [...pool].sort((a, b) => {
    const scoreDifference = b.score - a.score;
    const tolerance = Math.max(500, context.currentBill.estimatedAnnualBillPkr * 0.01);
    if (Math.abs(scoreDifference) > tolerance) return scoreDifference;
    if (a.actualInstalledKwp !== b.actualInstalledKwp) return a.actualInstalledKwp - b.actualInstalledKwp;
    if ((a.batteryKwh ?? 0) !== (b.batteryKwh ?? 0)) return (a.batteryKwh ?? 0) - (b.batteryKwh ?? 0);
    return a.inverterKw - b.inverterKw;
  })[0]!;
}
