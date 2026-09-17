import type { SolarArchitecture, VerifiedSolarInput } from "../../validation/solar-analyzer.js";
import { assessDataConfidence, hasCompleteRecommendationContext } from "../../validation/solar-analyzer.js";
import { ARCHITECTURES, buildOptimizationContext, optimizeArchitecture, type OptimizedSystem } from "../optimizer/optimizer.js";
import { POLICY_LAST_VERIFIED } from "../policies/electricity-2026.js";
import { LOAD_PROFILE_ASSUMPTIONS, PRACTICAL_INVERTER_CAPACITIES_KW, SOLAR_ASSUMPTIONS } from "./assumptions.js";
import { getSolarProfile, SOLAR_PROFILE_SOURCE } from "./profiles.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const ALL_ARCHITECTURES = Object.keys(ARCHITECTURES) as SolarArchitecture[];

function round(value: number, precision = 1) { const factor = 10 ** precision; return Math.round(value * factor) / factor; }

export type SolarRecommendationResult = {
  modelVersion: string;
  analysisMode: VerifiedSolarInput["analysisMode"];
  location: { requestedCity: string; profileCity: string; regionalFallbackUsed: boolean; assumption: string | null };
  dataQuality: {
    billExtractionConfidence: "High" | "Medium" | "Low";
    tariffPolicyConfidence: "High" | "Medium" | "Preliminary";
    recommendationConfidence: "High" | "Medium" | "Preliminary";
    recommendationConfidenceExplanation: string;
    recommendationData: "Complete" | "Incomplete";
    readableMonths: number;
  };
  consumption: { annualConsumptionKwh: number; annualConsumptionEstimated: boolean; averageMonthlyKwh: number; averageDailyKwh: number; highestMonth: { label: string; kwh: number }; lowestMonth: { label: string; kwh: number } };
  assumptions: { panelWattage: number; performanceRatio: number; solarProfileSource: typeof SOLAR_PROFILE_SOURCE; policyLastVerified: string; dynamicChargesConfigured: false; loadProfile: string; daytimeLoadShare: number; loadProfileMethodology: string; touMethodology: string; batteryRoundTripEfficiency: number };
  verifiedContext: { utility: string | null; tariff: string | null; greenMeterStatus: VerifiedSolarInput["greenMeterStatus"]; backupRequirement: string; selectedArchitecture: SolarArchitecture | null };
  tariffDetails: {
    usage: "Current Reference Tariff";
    tariffCode: string;
    tariffName: string;
    version: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    utility: string | null;
    utilityGroup: "XWDISCO" | "K-Electric";
    source: string;
    sourceReference: string;
    modeledComponents: readonly string[];
    notModeledComponents: readonly string[];
  };
  bestRecommended: OptimizedSystem | null;
  meaningfulAlternative: OptimizedSystem | null;
  userSelected: OptimizedSystem | null;
  comparisonExplanation: string | null;
  evaluatedArchitectures: SolarArchitecture[];
};

export function panelConfiguration(nominalPvKwp: number, panelWattage: number = SOLAR_ASSUMPTIONS.panelWattage) {
  const panelCount = Math.max(2, Math.ceil(nominalPvKwp * 1000 / panelWattage));
  return { panelCount, actualInstalledKwp: round(panelCount * panelWattage / 1000, 3) };
}

export function selectInverterSize(actualInstalledKwp: number): number {
  const compatible = PRACTICAL_INVERTER_CAPACITIES_KW.filter((inverter) => {
    const ratio = actualInstalledKwp / inverter;
    return ratio >= SOLAR_ASSUMPTIONS.dcAcRatioMin && ratio <= SOLAR_ASSUMPTIONS.dcAcRatioMax;
  });
  const pool = compatible.length ? compatible : PRACTICAL_INVERTER_CAPACITIES_KW;
  return [...pool].sort((a, b) => Math.abs(actualInstalledKwp / a - 1.2) - Math.abs(actualInstalledKwp / b - 1.2) || a - b)[0]!;
}

export function refinedBatteryRange(input: VerifiedSolarInput, averageDailyKwh: number) {
  if (!input.backupPreference || input.backupPreference.level === "none") return null;
  const factor = { essential: 0.3, most: 0.6, entire: 0.95 }[input.backupPreference.level];
  const load = input.backupPreference.backupLoadKw ?? averageDailyKwh / 24 * factor;
  const raw = load * input.backupPreference.durationHours / (SOLAR_ASSUMPTIONS.batteryDepthOfDischarge * SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency) * SOLAR_ASSUMPTIONS.batterySafetyMargin;
  const nominal = round(Math.ceil(raw / SOLAR_ASSUMPTIONS.batteryModuleKwh) * SOLAR_ASSUMPTIONS.batteryModuleKwh, 2);
  return { minimumKwh: nominal, maximumKwh: nominal, refined: true };
}

export function isArchitectureApplicable(
  architecture: SolarArchitecture,
  input: VerifiedSolarInput,
  purpose: "recommendation" | "customer_selected" = "recommendation",
): boolean {
  if (purpose === "customer_selected") return true;
  if (input.gridReliability === "no_grid") return architecture === "off_grid";
  if (architecture === "off_grid") return false;
  return !(ARCHITECTURES[architecture].green && input.greenMeterStatus === "no");
}

function recommendationArchitectures(input: VerifiedSolarInput): SolarArchitecture[] {
  return ALL_ARCHITECTURES.filter((architecture) => isArchitectureApplicable(architecture, input));
}

function confidence(
  input: VerifiedSolarInput,
  fallback: boolean,
  tariffConfidence: "High" | "Medium" | "Preliminary",
  billConfidence: "High" | "Medium" | "Low",
  recommendationData: "Complete" | "Incomplete",
  offGrid: boolean,
) {
  const critical: string[] = [];
  const assumptions: string[] = [];
  if (recommendationData !== "Complete") critical.push("the recommendation context is incomplete");
  if (input.sanctionedLoadKw == null) critical.push("sanctioned load is unverified");
  if (input.touStatus === "not_sure") critical.push("billing type is unverified");
  if (input.greenMeterStatus === "not_sure") critical.push("Green Meter status is unverified");
  if (input.greenMeterStatus === "yes" && input.prosumerStatus === "unknown") critical.push("the prosumer agreement requires verification");
  if (tariffConfidence === "Preliminary") critical.push("the tariff or policy match is preliminary");
  if (billConfidence === "Low") critical.push("monthly consumption contains material uncertainty");
  if (offGrid) critical.push("Off-Grid sizing still requires measured loads, surge demand, autonomy and site assessment");

  if (fallback) assumptions.push(`${input.city} uses the ${getSolarProfile(input.city).profile.city} regional solar profile`);
  if (input.usagePattern === "not_sure") assumptions.push("daytime and nighttime consumption are estimated");
  if (input.touStatus === "yes" && (input.peakUnitsKwh ?? 0) + (input.offPeakUnitsKwh ?? 0) <= 0) assumptions.push("the peak/off-peak split is estimated");
  if (tariffConfidence === "Medium") assumptions.push("the tariff or policy match needs confirmation");
  if (billConfidence === "Medium") assumptions.push("some monthly readings are less certain");
  if (input.existingSolar.status !== "no") assumptions.push("the existing solar system needs site verification");
  if (input.backupPreference?.level !== undefined && input.backupPreference.level !== "none" && input.backupPreference.backupLoadKw == null) assumptions.push("backup load is estimated");

  if (critical.length) return {
    level: "Preliminary" as const,
    explanation: `Preliminary confidence — ${critical[0]}.`,
  };
  if (assumptions.length) return {
    level: "Medium" as const,
    explanation: `Medium confidence — annual consumption and tariff inputs are usable, but ${assumptions.slice(0, 2).join(" and ")}.`,
  };
  return {
    level: "High" as const,
    explanation: "High confidence — based on 12 verified months, confirmed tariff, location, sanctioned load and consumption pattern.",
  };
}

export function calculateSolarRecommendation(input: VerifiedSolarInput): SolarRecommendationResult {
  const context = buildOptimizationContext(input);
  const loadProfile = LOAD_PROFILE_ASSUMPTIONS[input.usagePattern];
  const suppliedTouUnits = (input.peakUnitsKwh ?? 0) + (input.offPeakUnitsKwh ?? 0);
  const touMethodology = input.touStatus !== "yes"
    ? "Not applicable to non-TOU billing."
    : suppliedTouUnits > 0
      ? "The verified monthly peak/off-peak unit ratio is applied to each representative month; stored solar serves remaining peak demand first."
      : `No monthly peak/off-peak unit split was supplied; the configured ${Math.round(loadProfile.defaultTouPeakShare * 100)}% peak-load approximation is used and stored solar serves peak demand first.`;
  const usable = input.monthlyConsumption.filter((reading) => reading.kwh !== null);
  const highest = [...usable].sort((a, b) => b.kwh! - a.kwh!)[0]!;
  const lowest = [...usable].sort((a, b) => a.kwh! - b.kwh!)[0]!;
  const { profile, fallbackUsed } = getSolarProfile(input.city);
  const applicable = recommendationArchitectures(input);
  const optimized = new Map<SolarArchitecture, OptimizedSystem>();
  const get = (architecture: SolarArchitecture) => {
    const cached = optimized.get(architecture);
    if (cached) return cached;
    const result = optimizeArchitecture(input, profile, context, architecture);
    optimized.set(architecture, result);
    return result;
  };
  const ranked = input.analysisMode === "chosen"
    ? []
    : applicable.map(get).sort((a, b) => b.score - a.score || a.actualInstalledKwp - b.actualInstalledKwp);
  const best = input.analysisMode === "chosen" ? null : ranked[0] ?? null;
  const next = ranked[1] ?? null;
  const meaningfulDifference = best && next && (
    Math.abs((best.estimatedBillReductionPercent ?? 0) - (next.estimatedBillReductionPercent ?? 0)) >= 1 ||
    Math.abs((best.estimatedRemainingBillPkr ?? 0) - (next.estimatedRemainingBillPkr ?? 0)) >= Math.max(1_000, context.currentBill.estimatedAnnualBillPkr * 0.02) ||
    Math.abs(best.actualInstalledKwp - next.actualInstalledKwp) >= input.panelWattage / 1_000 ||
    (best.batteryKwh ?? 0) !== (next.batteryKwh ?? 0) ||
    (best.gridExportKwh ?? 0) !== (next.gridExportKwh ?? 0) ||
    best.regulatoryValid !== next.regulatoryValid
  );
  const alternative = input.analysisMode === "recommend" && meaningfulDifference ? next : null;
  const selected = input.analysisMode === "recommend" || !input.selectedArchitecture ? null : get(input.selectedArchitecture);
  const extraction = assessDataConfidence(input.monthlyConsumption, [], hasCompleteRecommendationContext(input));
  const confidenceAssessment = confidence(
    input,
    fallbackUsed,
    context.tariff.confidence,
    extraction.billAnalysisConfidence,
    extraction.recommendationData,
    best?.architectureKey === "off_grid" || selected?.architectureKey === "off_grid",
  );
  const comparison = best && selected
    ? best.architectureKey === selected.architectureKey
      ? "Your selected architecture is also the strongest deterministic bill-reduction option for the verified inputs."
      : `${best.architecture} estimates ${best.estimatedBillReductionPercent ?? 0}% bill reduction and PKR ${Math.round(best.estimatedRemainingBillPkr ?? 0).toLocaleString("en-PK")} remaining annual bill, versus ${selected.estimatedBillReductionPercent ?? "not applicable"}% and ${selected.estimatedRemainingBillPkr == null ? "a utility bill that is not applicable if disconnected" : `PKR ${Math.round(selected.estimatedRemainingBillPkr).toLocaleString("en-PK")}`} for ${selected.architecture}. Modeled grid imports are ${best.gridImportKwh ?? "not applicable"} versus ${selected.gridImportKwh ?? "not applicable"} kWh; exports are ${best.gridExportKwh ?? "not applicable"} versus ${selected.gridExportKwh ?? "not applicable"} kWh; battery capacity is ${best.batteryKwh ?? 0} versus ${selected.batteryKwh ?? 0} kWh. ${selected.regulatoryValid ? "Both are evaluated under their applicable prosumer treatment." : "The selected architecture requires regulatory or site qualification before it can be treated as applicable."}`
    : null;
  return {
    modelVersion: SOLAR_PROFILE_SOURCE.modelVersion,
    analysisMode: input.analysisMode,
    location: { requestedCity: input.city, profileCity: profile.city, regionalFallbackUsed: fallbackUsed, assumption: fallbackUsed ? `${input.city} uses the conservative ${profile.city} regional solar profile.` : null },
    dataQuality: { billExtractionConfidence: extraction.billAnalysisConfidence, tariffPolicyConfidence: context.tariff.confidence, recommendationConfidence: confidenceAssessment.level, recommendationConfidenceExplanation: confidenceAssessment.explanation, recommendationData: extraction.recommendationData, readableMonths: usable.length },
    consumption: { annualConsumptionKwh: round(context.annualConsumptionKwh), annualConsumptionEstimated: usable.length !== 12, averageMonthlyKwh: round(context.averageMonthlyKwh), averageDailyKwh: round(context.averageDailyKwh), highestMonth: { label: `${MONTH_NAMES[highest.month - 1]} ${highest.year}`, kwh: highest.kwh! }, lowestMonth: { label: `${MONTH_NAMES[lowest.month - 1]} ${lowest.year}`, kwh: lowest.kwh! } },
    assumptions: { panelWattage: input.panelWattage, performanceRatio: SOLAR_ASSUMPTIONS.performanceRatio, solarProfileSource: SOLAR_PROFILE_SOURCE, policyLastVerified: POLICY_LAST_VERIFIED, dynamicChargesConfigured: false, loadProfile: input.usagePattern, daytimeLoadShare: loadProfile.daytimeLoadShare, loadProfileMethodology: `Monthly representative-day simulation using ${loadProfile.description}.`, touMethodology, batteryRoundTripEfficiency: SOLAR_ASSUMPTIONS.batteryRoundTripEfficiency },
    verifiedContext: { utility: input.provider ?? null, tariff: input.tariffCategory ?? null, greenMeterStatus: input.greenMeterStatus, backupRequirement: !input.backupPreference || input.backupPreference.level === "none" ? "none" : `${input.backupPreference.level} · ${input.backupPreference.durationHours} hours`, selectedArchitecture: input.selectedArchitecture ?? null },
    tariffDetails: { usage: context.tariff.referenceMode, tariffCode: context.tariff.tariffCode, tariffName: context.tariff.tariffName, version: context.tariff.scheduleVersion, effectiveFrom: context.tariff.effectiveFrom, effectiveTo: context.tariff.effectiveTo, utility: input.provider ?? null, utilityGroup: context.tariff.applicableUtilityGroup, source: context.tariff.source, sourceReference: context.tariff.sourceReference, modeledComponents: context.tariff.modeledComponents, notModeledComponents: context.tariff.notModeledComponents },
    bestRecommended: best,
    meaningfulAlternative: alternative,
    userSelected: selected,
    comparisonExplanation: comparison,
    evaluatedArchitectures: input.analysisMode === "chosen" && input.selectedArchitecture ? [input.selectedArchitecture] : applicable,
  };
}
