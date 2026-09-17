import { apiUrl, getApiOrigin } from "@/lib/api-origin";

function positivePublicNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SOLAR_ANALYZER_MAX_FILE_MB = positivePublicNumber(process.env.NEXT_PUBLIC_SOLAR_ANALYZER_MAX_FILE_MB, 10);
export const MAX_BILL_FILE_BYTES = SOLAR_ANALYZER_MAX_FILE_MB * 1024 * 1024;
const PUBLIC_GEMINI_TIMEOUT_MS = positivePublicNumber(process.env.NEXT_PUBLIC_GEMINI_TIMEOUT_MS, 45_000);
// Allows two bounded provider attempts plus transport/response overhead.
export const ANALYZER_EXTRACTION_REQUEST_TIMEOUT_MS = PUBLIC_GEMINI_TIMEOUT_MS * 2 + 10_000;
export const ANALYZER_LEAD_STORAGE_KEY = "electrotech-solar-analyzer-lead";
export const PAKISTAN_UTILITIES = ["FESCO", "GEPCO", "HAZECO", "HESCO", "IESCO", "LESCO", "MEPCO", "PESCO", "QESCO", "SEPCO", "TESCO", "K-Electric"] as const;
export const CONSUMER_TARIFF_OPTIONS = [
  ["unknown", "Not sure"],
  ["residential_a1", "Residential A-1"],
  ["commercial_a2", "Commercial A-2"],
  ["industrial_b1", "Industrial B-1 · 400/230 V"],
  ["industrial_b2", "Industrial B-2 · 400 V"],
  ["industrial_b3", "Industrial B-3 · 11/33 kV"],
  ["industrial_b4", "Industrial B-4 · 66/132 kV and above"],
  ["industrial_b5", "Industrial B-5 · 220 kV and above · TOU"],
] as const;
export const PAKISTAN_CITIES = ["Abbottabad", "Attock", "Bahawalpur", "Dera Ghazi Khan", "Faisalabad", "Gujranwala", "Gujrat", "Gwadar", "Hyderabad", "Islamabad", "Jhang", "Karachi", "Kasur", "Lahore", "Larkana", "Mardan", "Multan", "Murree", "Narowal", "Nawabshah", "Okara", "Peshawar", "Rahim Yar Khan", "Rawalpindi", "Sargodha", "Sheikhupura", "Sialkot", "Sukkur", "Swat", "Taxila", "Turbat", "Wah"] as const;
export const ARCHITECTURE_OPTIONS = [
  ["on_grid_only", "On-Grid Only"],
  ["hybrid_green_no_battery", "Hybrid + Green Meter — No Battery"],
  ["hybrid_green_battery", "Hybrid + Green Meter + Battery"],
  ["hybrid_no_green_no_battery", "Hybrid Only — No Green Meter / No Battery"],
  ["hybrid_battery_no_green", "Hybrid + Battery — No Green Meter"],
  ["off_grid", "Off-Grid"],
] as const;

export type ReadingConfidence = "high" | "medium" | "low";
export type TriState = "yes" | "no" | "not_sure";
export type ConsumerTariff = typeof CONSUMER_TARIFF_OPTIONS[number][0];
export type ProsumerRegime = "current" | "legacy" | "unknown";
export type SolarArchitecture = typeof ARCHITECTURE_OPTIONS[number][0];
export type AnalysisMode = "recommend" | "chosen" | "both";
export type MonthlyReading = { year: number; month: number; kwh: number | null; confidence: ReadingConfidence };
export type BillExtraction = {
  provider: string | null; city: string | null; tariffCategory: string | null; connectionType: string | null;
  phase: "single" | "three" | null; sanctionedLoadKw: number | null; mdiKw: number | null; consumerCategory: string | null;
  currentBillYear: number | null; currentBillMonth: number | null; currentMonthConsumptionKwh: number | null; currentBillAmountPkr: number | null;
  touStatus: TriState; peakUnitsKwh: number | null; offPeakUnitsKwh: number | null; importUnitsKwh: number | null; exportUnitsKwh: number | null;
  greenMeterStatus: TriState; existingProsumerStatus: TriState; prosumerAgreementDate: string | null;
  monthlyConsumption: MonthlyReading[]; uncertainFields: string[];
};
export type EditableMonth = { year: number; month: number; kwh: string; confidence: ReadingConfidence };
export type VerifiedSolarInput = {
  provider?: string | null; city: string; tariffCategory?: string | null; connectionType?: string | null;
  consumerCategory: "residential" | "commercial" | "industrial" | "other" | "unknown"; protectedStatus: "lifeline" | "protected" | "non_protected" | "unknown";
  phase?: "single" | "three" | null; sanctionedLoadKw?: number | null; mdiKw?: number | null; touStatus: TriState;
  peakUnitsKwh?: number | null; offPeakUnitsKwh?: number | null; greenMeterStatus: TriState; prosumerStatus: "none" | "current" | "legacy" | "unknown";
  prosumerAgreementDate?: string | null; usagePattern: "mostly_daytime" | "mostly_evening" | "roughly_equal" | "not_sure";
  gridReliability: "reliable" | "frequent_outages" | "no_grid"; existingSolar: { status: TriState; pvKwp?: number | null; inverterKw?: number | null; plannedOutputIncrease?: boolean; plannedInverterReplacement?: boolean; plannedInterconnectionEquipmentChange?: boolean };
  analysisMode: AnalysisMode; selectedArchitecture?: SolarArchitecture | null; panelWattage: 550 | 580 | 585 | 600;
  currentBillAmountPkr?: number | null; tariffEffectiveDate?: string | null; monthlyConsumption: MonthlyReading[];
  backupPreference?: { level: "none" } | { level: "essential" | "most" | "entire"; durationHours: 2 | 4 | 6 | 8; backupLoadKw?: number | null };
};
export type MonthlyScenario = { month: number; monthName: string; consumptionKwh: number | null; generationKwh: number; daytimeLoadKwh: number; nighttimeLoadKwh: number; directSolarKwh: number; batteryChargeInputKwh: number; batteryDischargeKwh: number; batteryLossKwh: number; usableBatteryCapacityKwh: number; peakGridImportKwh: number; offPeakGridImportKwh: number; gridImportKwh: number | null; gridExportKwh: number | null; curtailedGenerationKwh: number; unusedSurplusKwh: number; unservedLoadKwh: number };
export type OptimizedSystem = {
  architectureKey: SolarArchitecture; architecture: string; actualInstalledKwp: number; inverterKw: number; panelCount: number; panelWattage: number; batteryKwh: number | null;
  annualGenerationKwh: number; directSolarConsumptionKwh: number; batteryChargeInputKwh: number; batteryDischargeKwh: number; batteryLossKwh: number; usableBatteryCapacityKwh: number; gridImportKwh: number | null; gridExportKwh: number | null; curtailedGenerationKwh: number; unusedSurplusKwh: number; unservedLoadKwh: number;
  selfConsumptionPercent: number; consumptionCoveragePercent: number; estimatedBillReductionPkr: number | null; estimatedBillReductionPercent: number | null; estimatedRemainingBillPkr: number | null;
  currentBill: BillEstimate | null; postSolarBill: BillEstimate | null;
  architectureExportCapable: boolean; currentExportArrangement: "confirmed" | "not-established" | "unverified";
  regulatoryValid: boolean; regulatoryStatus: "eligible" | "interconnection-approval-required" | "upgrade-required" | "load-extension-required" | "requires-disco-verification" | "not-applicable"; regulatoryStatusLabel: string;
  phaseStatus: "eligible" | "verification-required" | "not-applicable"; currentGridEligibleCapacityKwp: number | null; exceedsSanctionedLoad: boolean; excessCapacityKwp: number; loadExtensionRequired: boolean;
  materialModification: boolean; legacyAgreementStatus: "confirmed" | "likely" | "unverified" | "not-applicable"; agreementLifecycleStatus: "active" | "expired" | "none" | "unknown"; regulatoryQualifications: string[];
  prosumerRegime: "none" | "current" | "legacy" | "uncertain"; monthlySimulation: MonthlyScenario[]; qualification: string[]; whyThisSystem: string[];
};
export type BillEstimate = { energyChargesPkr: number; fixedChargesPkr: number; exportValuePkr: number; estimatedAnnualBillPkr: number; notice: string };
export type SolarRecommendationResult = {
  modelVersion: string; analysisMode: AnalysisMode;
  location: { requestedCity: string; profileCity: string; regionalFallbackUsed: boolean; assumption: string | null };
  dataQuality: { billExtractionConfidence: "High" | "Medium" | "Low"; tariffPolicyConfidence: "High" | "Medium" | "Preliminary"; recommendationConfidence: "High" | "Medium" | "Preliminary"; recommendationConfidenceExplanation: string; recommendationData: "Complete" | "Incomplete"; readableMonths: number };
  consumption: { annualConsumptionKwh: number; annualConsumptionEstimated: boolean; averageMonthlyKwh: number; averageDailyKwh: number; highestMonth: { label: string; kwh: number }; lowestMonth: { label: string; kwh: number } };
  assumptions: { panelWattage: number; performanceRatio: number; policyLastVerified: string; dynamicChargesConfigured: false; loadProfile: string; daytimeLoadShare: number; loadProfileMethodology: string; touMethodology: string; batteryRoundTripEfficiency: number; solarProfileSource: { modelVersion: string; provider: string; climatologyPeriod: string } };
  verifiedContext: { utility: string | null; tariff: string | null; greenMeterStatus: TriState; backupRequirement: string; selectedArchitecture: SolarArchitecture | null };
  tariffDetails: { usage: "Current Reference Tariff"; tariffCode: string; tariffName: string; version: string; effectiveFrom: string; effectiveTo: string | null; utility: string | null; utilityGroup: "XWDISCO" | "K-Electric"; source: string; sourceReference: string; modeledComponents: readonly string[]; notModeledComponents: readonly string[] };
  bestRecommended: OptimizedSystem | null; meaningfulAlternative: OptimizedSystem | null; userSelected: OptimizedSystem | null; comparisonExplanation: string | null; evaluatedArchitectures: SolarArchitecture[];
};
export type AnalyzerLeadContext = {
  source: "solar_bill_analyzer"; utility: string | null; tariff: string | null; city: string; annualConsumptionKwh: number; analysisMode: AnalysisMode;
  selectedArchitecture: string | null; recommendedArchitecture: string; pvCapacityKwp: number; panels: number; inverterKw: number; battery: string | null;
  estimatedBillReductionPercent: number | null; estimatedRemainingBillPkr: number | null; greenMeterStatus: TriState; backupRequirement: string;
  confidence: { billExtraction: "High" | "Medium" | "Low"; tariffPolicy: "High" | "Medium" | "Preliminary"; recommendation: "High" | "Medium" | "Preliminary" };
};

export function normalizeUtility(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (/K[ -]?ELECTRIC|\bKESC\b/.test(normalized)) return "K-Electric";
  return PAKISTAN_UTILITIES.find((utility) => normalized.includes(utility.toUpperCase())) ?? "";
}

export function normalizeConsumerTariff(...values: Array<string | null | undefined>): ConsumerTariff {
  const normalized = values.filter(Boolean).join(" ").toLowerCase();
  for (const code of ["1", "2", "3", "4", "5"] as const) if (new RegExp(`\\bb\\s*-?\\s*${code}\\b`).test(normalized)) return `industrial_b${code}`;
  if (/a\s*-?\s*2|commercial/.test(normalized)) return "commercial_a2";
  if (/a\s*-?\s*1|residential/.test(normalized)) return "residential_a1";
  return "unknown";
}

export function consumerTariffPayload(tariff: ConsumerTariff) {
  if (tariff === "residential_a1") return { tariffCategory: "A-1", connectionType: "Residential", consumerCategory: "residential" as const };
  if (tariff === "commercial_a2") return { tariffCategory: "A-2", connectionType: "Commercial", consumerCategory: "commercial" as const };
  if (tariff.startsWith("industrial_b")) return { tariffCategory: `B-${tariff.at(-1)}`, connectionType: "Industrial", consumerCategory: "industrial" as const };
  return { tariffCategory: null, connectionType: null, consumerCategory: "unknown" as const };
}

export function prosumerPayload(
  greenMeterStatus: TriState,
  agreementStatus: TriState,
  regime: ProsumerRegime,
  agreementDate: string,
): { prosumerStatus: VerifiedSolarInput["prosumerStatus"]; prosumerAgreementDate: string | null } {
  if (greenMeterStatus === "no" || agreementStatus === "no") return { prosumerStatus: "none", prosumerAgreementDate: null };
  if (agreementStatus !== "yes" || regime === "unknown") return { prosumerStatus: "unknown", prosumerAgreementDate: null };
  return { prosumerStatus: regime, prosumerAgreementDate: regime === "legacy" && agreementDate ? agreementDate : null };
}

export type VerificationContext = {
  cityKnown: boolean;
  utility: string;
  consumerTariff: ConsumerTariff;
  residentialStatus: VerifiedSolarInput["protectedStatus"];
  sanctionedLoadKw: number | null;
  billingType: TriState;
  mdiKw: number | null;
  peakUnitsKwh: number | null;
  offPeakUnitsKwh: number | null;
  greenMeterStatus: TriState;
  agreementStatus: TriState;
  prosumerRegime: ProsumerRegime;
  agreementDate: string;
};

export function getMissingVerificationFields(input: VerificationContext): string[] {
  const missing: string[] = [];
  if (!input.cityKnown) missing.push("Installation city in Pakistan");
  if (!normalizeUtility(input.utility)) missing.push("Utility");
  if (input.consumerTariff === "unknown") missing.push("Consumer tariff");
  if (input.consumerTariff === "residential_a1" && input.residentialStatus === "unknown") missing.push("Residential status");
  if (input.sanctionedLoadKw === null) missing.push("Sanctioned load (kW)");
  if (input.billingType === "not_sure") missing.push("Billing type");
  const industrial = input.consumerTariff.startsWith("industrial_b");
  if (input.consumerTariff === "industrial_b5" && input.billingType === "no") missing.push("Billing type");
  if (((input.billingType === "yes" && !industrial) || (industrial && input.consumerTariff !== "industrial_b1")) && input.mdiKw === null) missing.push("Maximum demand / MDI (kW)");
  if (industrial && input.billingType === "yes") {
    if (input.peakUnitsKwh === null) missing.push("Industrial TOU peak units (kWh)");
    if (input.offPeakUnitsKwh === null) missing.push("Industrial TOU off-peak units (kWh)");
  }
  if (input.greenMeterStatus === "not_sure") missing.push("Existing green meter");
  if (input.greenMeterStatus === "yes") {
    if (input.agreementStatus === "not_sure") missing.push("Green-meter agreement status");
    if (input.agreementStatus === "yes" && input.prosumerRegime === "unknown") missing.push("Agreement type");
    if (input.agreementStatus === "yes" && input.prosumerRegime === "legacy" && !input.agreementDate) missing.push("Agreement / approval date");
  }
  return missing;
}

export function isVerificationContextComplete(input: VerificationContext): boolean {
  return getMissingVerificationFields(input).length === 0;
}

export const getAnalyzerApiOrigin = () => getApiOrigin();
export const analyzerApiUrl = (path: string) => apiUrl(path);
export function validateBillFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf", "jpg", "jpeg", "png"].includes(extension) || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return "Upload a PDF, JPG, JPEG, or PNG electricity bill.";
  if (file.size === 0) return "The selected bill is empty.";
  if (file.size > MAX_BILL_FILE_BYTES) return `The bill must be ${SOLAR_ANALYZER_MAX_FILE_MB} MB or smaller.`;
  return null;
}
export function createTwelveMonthGrid(readings: MonthlyReading[] = [], today = new Date()): EditableMonth[] {
  const valid = readings.filter((reading) => reading.year >= 2000 && reading.month >= 1 && reading.month <= 12);
  const latest = [...valid].sort((a, b) => b.year - a.year || b.month - a.month)[0];
  const anchor = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const byKey = new Map(valid.map((reading) => [`${reading.year}-${reading.month}`, reading]));
  return Array.from({ length: 12 }, (_, index) => { const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (11 - index), 1)); const year = date.getUTCFullYear(); const month = date.getUTCMonth() + 1; const reading = byKey.get(`${year}-${month}`); return { year, month, kwh: reading?.kwh == null ? "" : String(reading.kwh), confidence: reading?.confidence ?? "low" }; });
}
export function summarizeConsumption(months: readonly EditableMonth[]) {
  const values = months.flatMap((month) => { const value = Number(month.kwh); return month.kwh.trim() && Number.isFinite(value) && value >= 0 ? [{ ...month, value }] : []; });
  if (!values.length) return null;
  const uniqueValues = new Map(values.map((month) => [`${month.year}-${month.month}`, month]));
  const complete = values.length === 12 && uniqueValues.size === 12;
  const total = values.reduce((sum, month) => sum + month.value, 0);
  const averageMonthly = complete ? total / 12 : null;
  return { readableMonths: uniqueValues.size, complete, annualConsumption: complete ? total : null, averageMonthly, averageDaily: averageMonthly === null ? null : total / 365, highest: [...values].sort((a, b) => b.value - a.value)[0]!, lowest: [...values].sort((a, b) => a.value - b.value)[0]! };
}
export function createAnalyzerLeadContext(result: SolarRecommendationResult, system: OptimizedSystem): AnalyzerLeadContext {
  return { source: "solar_bill_analyzer", utility: result.verifiedContext.utility, tariff: result.verifiedContext.tariff, city: result.location.requestedCity, annualConsumptionKwh: result.consumption.annualConsumptionKwh, analysisMode: result.analysisMode, selectedArchitecture: result.verifiedContext.selectedArchitecture, recommendedArchitecture: system.architecture, pvCapacityKwp: system.actualInstalledKwp, panels: system.panelCount, inverterKw: system.inverterKw, battery: system.batteryKwh == null ? null : `${system.batteryKwh} kWh`, estimatedBillReductionPercent: system.estimatedBillReductionPercent, estimatedRemainingBillPkr: system.estimatedRemainingBillPkr, greenMeterStatus: result.verifiedContext.greenMeterStatus, backupRequirement: result.verifiedContext.backupRequirement, confidence: { billExtraction: result.dataQuality.billExtractionConfidence, tariffPolicy: result.dataQuality.tariffPolicyConfidence, recommendation: result.dataQuality.recommendationConfidence } };
}
export function analyzerLeadMessage(context: AnalyzerLeadContext): string {
  return [
    "Hello, I used the Solar System Analyzer.",
    "Source: Solar Analyzer",
    `System: ${context.recommendedArchitecture}`,
    `PV: ${context.pvCapacityKwp} kWp · ${context.panels} panels`,
    `Inverter: ${context.inverterKw} kW`,
    `Battery: ${context.battery ?? "Not included"}`,
    `Estimated practical bill reduction: ${context.estimatedBillReductionPercent == null ? "Not applicable" : `${context.estimatedBillReductionPercent}%`}`,
    `Location: ${context.city} · ${context.utility ?? "Utility not stated"}`,
    `Recommendation confidence: ${context.confidence.recommendation}`,
    "I would like an exact solar proposal.",
  ].join("\n");
}
export function saveAnalyzerLeadContext(context: AnalyzerLeadContext) { window.sessionStorage.setItem(ANALYZER_LEAD_STORAGE_KEY, JSON.stringify(context)); }
export function consumeAnalyzerLeadContext(): AnalyzerLeadContext | null {
  const raw = window.sessionStorage.getItem(ANALYZER_LEAD_STORAGE_KEY); if (!raw) return null; window.sessionStorage.removeItem(ANALYZER_LEAD_STORAGE_KEY);
  try { const value = JSON.parse(raw) as Partial<AnalyzerLeadContext>; return value.source === "solar_bill_analyzer" && value.city && value.recommendedArchitecture && typeof value.pvCapacityKwp === "number" ? value as AnalyzerLeadContext : null; } catch { return null; }
}
