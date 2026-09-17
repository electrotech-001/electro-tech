import { z } from "zod";

export const readingConfidenceSchema = z.enum(["high", "medium", "low"]);
export const triStateSchema = z.enum(["yes", "no", "not_sure"]);
export const architectureSchema = z.enum([
  "on_grid_only",
  "hybrid_green_no_battery",
  "hybrid_green_battery",
  "hybrid_no_green_no_battery",
  "hybrid_battery_no_green",
  "off_grid",
]);
export const analysisModeSchema = z.enum(["recommend", "chosen", "both"]);

export const monthlyConsumptionSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  kwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  confidence: readingConfidenceSchema,
});

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const billExtractionSchema = z.object({
  provider: nullableText(120),
  city: nullableText(100),
  tariffCategory: nullableText(100),
  connectionType: nullableText(80),
  phase: z.enum(["single", "three"]).nullable(),
  sanctionedLoadKw: z.number().finite().nonnegative().max(10_000).nullable(),
  mdiKw: z.number().finite().nonnegative().max(10_000).nullable(),
  consumerCategory: nullableText(100),
  currentBillYear: z.number().int().min(2000).max(2100).nullable(),
  currentBillMonth: z.number().int().min(1).max(12).nullable(),
  currentMonthConsumptionKwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  currentBillAmountPkr: z.number().finite().nonnegative().max(1_000_000_000).nullable(),
  touStatus: triStateSchema,
  peakUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  offPeakUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  importUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  exportUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable(),
  greenMeterStatus: triStateSchema,
  existingProsumerStatus: triStateSchema,
  prosumerAgreementDate: z.string().trim().max(20).nullable(),
  monthlyConsumption: z.array(monthlyConsumptionSchema).max(24),
  uncertainFields: z.array(z.string().trim().min(1).max(120)).max(40),
});

export type BillExtraction = z.infer<typeof billExtractionSchema>;
export type ReadingConfidence = z.infer<typeof readingConfidenceSchema>;
export type SolarArchitecture = z.infer<typeof architectureSchema>;
export type AnalysisMode = z.infer<typeof analysisModeSchema>;

export function buildRollingTwelveMonths(extraction: BillExtraction): BillExtraction["monthlyConsumption"] {
  const byKey = new Map<string, BillExtraction["monthlyConsumption"][number]>();
  for (const reading of extraction.monthlyConsumption) byKey.set(`${reading.year}-${reading.month}`, reading);
  if (extraction.currentBillYear !== null && extraction.currentBillMonth !== null && extraction.currentMonthConsumptionKwh !== null) {
    const key = `${extraction.currentBillYear}-${extraction.currentBillMonth}`;
    byKey.set(key, {
      year: extraction.currentBillYear,
      month: extraction.currentBillMonth,
      kwh: extraction.currentMonthConsumptionKwh,
      confidence: extraction.uncertainFields.some((field) => /current.*(?:month|units|consumption)/i.test(field)) ? "medium" : "high",
    });
  }
  return [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month).slice(-12);
}

export function normalizeBillExtraction(extraction: BillExtraction): BillExtraction {
  return { ...extraction, monthlyConsumption: buildRollingTwelveMonths(extraction) };
}

const backupPreferenceSchema = z.object({
  level: z.enum(["none", "essential", "most", "entire"]),
  durationHours: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).optional(),
  backupLoadKw: z.number().finite().positive().max(10_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.level !== "none" && value.durationHours === undefined) {
    context.addIssue({ code: "custom", path: ["durationHours"], message: "Choose a backup duration when backup is requested." });
  }
}).transform((value) => value.level === "none"
  ? { level: "none" as const }
  : {
      level: value.level,
      durationHours: value.durationHours!,
      ...(value.backupLoadKw == null ? {} : { backupLoadKw: value.backupLoadKw }),
    });

export const verifiedSolarInputSchema = z.object({
  provider: nullableText(120).optional(),
  city: z.string().trim().min(2).max(100),
  tariffCategory: nullableText(100).optional(),
  connectionType: nullableText(80).optional(),
  consumerCategory: z.enum(["residential", "commercial", "industrial", "other", "unknown"]),
  protectedStatus: z.enum(["lifeline", "protected", "non_protected", "unknown"]),
  phase: z.enum(["single", "three"]).nullable().optional(),
  sanctionedLoadKw: z.number().finite().nonnegative().max(10_000).nullable().optional(),
  mdiKw: z.number().finite().nonnegative().max(10_000).nullable().optional(),
  touStatus: triStateSchema,
  peakUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable().optional(),
  offPeakUnitsKwh: z.number().finite().nonnegative().max(10_000_000).nullable().optional(),
  greenMeterStatus: triStateSchema,
  prosumerStatus: z.enum(["none", "current", "legacy", "unknown"]),
  prosumerAgreementDate: z.string().trim().max(20).nullable().optional(),
  usagePattern: z.enum(["mostly_daytime", "mostly_evening", "roughly_equal", "not_sure"]),
  gridReliability: z.enum(["reliable", "frequent_outages", "no_grid"]),
  existingSolar: z.object({
    status: triStateSchema,
    pvKwp: z.number().finite().nonnegative().max(1_000).nullable().optional(),
    inverterKw: z.number().finite().nonnegative().max(1_000).nullable().optional(),
    plannedOutputIncrease: z.boolean().optional(),
    plannedInverterReplacement: z.boolean().optional(),
    plannedInterconnectionEquipmentChange: z.boolean().optional(),
  }),
  analysisMode: analysisModeSchema,
  selectedArchitecture: architectureSchema.nullable().optional(),
  panelWattage: z.union([z.literal(550), z.literal(580), z.literal(585), z.literal(600)]),
  currentBillAmountPkr: z.number().finite().nonnegative().max(1_000_000_000).nullable().optional(),
  tariffEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyConsumption: z.array(monthlyConsumptionSchema).min(1).max(12),
  backupPreference: backupPreferenceSchema.optional(),
}).superRefine((value, context) => {
  if ((value.analysisMode === "chosen" || value.analysisMode === "both") && !value.selectedArchitecture) {
    context.addIssue({ code: "custom", path: ["selectedArchitecture"], message: "Choose an architecture for this analysis mode." });
  }
  if (value.consumerCategory === "other") {
    context.addIssue({ code: "custom", path: ["consumerCategory"], message: "This policy pack currently supports residential, commercial and industrial tariffs." });
  }
});

export type VerifiedSolarInput = z.infer<typeof verifiedSolarInputSchema>;
export const CONFIDENCE_THRESHOLDS = Object.freeze({ highMinimumReadableMonths: 11, highMaximumUncertainMonths: 1, mediumMinimumReadableMonths: 6 });
export type BillAnalysisConfidence = "High" | "Medium" | "Low";
export type RecommendationDataStatus = "Complete" | "Incomplete";
export type PolicyConfidence = "High" | "Medium" | "Preliminary";

export const RECOMMENDATION_FIELD_LABELS = Object.freeze({
  monthlyConsumption: "12 unique monthly consumption readings",
  city: "Installation city in Pakistan",
  utility: "Utility",
  consumerTariff: "Consumer tariff",
  residentialStatus: "Residential status",
  sanctionedLoad: "Sanctioned load (kW)",
  billingType: "Billing type",
  mdi: "Maximum demand / MDI (kW)",
  peakUnits: "Industrial TOU peak units (kWh)",
  offPeakUnits: "Industrial TOU off-peak units (kWh)",
  tariffEffectiveDate: "Supported tariff effective date",
  greenMeter: "Existing green meter",
  agreementStatus: "Green-meter agreement status",
  agreementType: "Agreement type",
  agreementDate: "Agreement / approval date",
} as const);

const SUPPORTED_TARIFF_UTILITIES = new Set(["FESCO", "GEPCO", "HAZECO", "HESCO", "IESCO", "LESCO", "MEPCO", "PESCO", "QESCO", "SEPCO", "TESCO", "K-ELECTRIC", "KESC"]);

function hasSupportedTariffUtility(provider: string | null | undefined): boolean {
  return SUPPORTED_TARIFF_UTILITIES.has(provider?.trim().toUpperCase().replace(/\s+/g, "") === "KELECTRIC" ? "K-ELECTRIC" : provider?.trim().toUpperCase() ?? "");
}

export function hasTwelveUniqueReadableMonths(monthlyConsumption: BillExtraction["monthlyConsumption"]): boolean {
  if (monthlyConsumption.length !== 12) return false;
  const readable = monthlyConsumption.filter((reading) => reading.kwh !== null);
  return readable.length === 12 && new Set(readable.map((reading) => `${reading.year}-${reading.month}`)).size === 12;
}

function normalizedTariffCategory(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/[\s-]/g, "") ?? "";
}

export function getMissingBillingFields(input: VerifiedSolarInput): string[] {
  const missing: string[] = [];
  const tariff = normalizedTariffCategory(input.tariffCategory);
  const supportedCategory = input.consumerCategory === "residential" || input.consumerCategory === "commercial" || input.consumerCategory === "industrial";
  const industrialTariff = /^B[1-5]$/.test(tariff);
  const tariffMatchesCategory = input.consumerCategory === "residential" ? tariff === "A1" : input.consumerCategory === "commercial" ? tariff === "A2" : input.consumerCategory === "industrial" ? industrialTariff : false;
  if (!supportedCategory || !tariffMatchesCategory) missing.push(RECOMMENDATION_FIELD_LABELS.consumerTariff);
  if (input.consumerCategory === "industrial" && tariff === "B5" && input.touStatus === "no") missing.push(RECOMMENDATION_FIELD_LABELS.billingType);
  if (input.consumerCategory === "residential" && input.protectedStatus === "unknown") missing.push(RECOMMENDATION_FIELD_LABELS.residentialStatus);
  if (input.sanctionedLoadKw == null) missing.push(RECOMMENDATION_FIELD_LABELS.sanctionedLoad);
  if (input.touStatus === "not_sure") missing.push(RECOMMENDATION_FIELD_LABELS.billingType);
  if (((input.touStatus === "yes" && input.consumerCategory !== "industrial") || (input.consumerCategory === "industrial" && /^B[2-5]$/.test(tariff))) && input.mdiKw == null) missing.push(RECOMMENDATION_FIELD_LABELS.mdi);
  if (input.consumerCategory === "industrial" && input.touStatus === "yes") {
    if (input.peakUnitsKwh == null) missing.push(RECOMMENDATION_FIELD_LABELS.peakUnits);
    if (input.offPeakUnitsKwh == null) missing.push(RECOMMENDATION_FIELD_LABELS.offPeakUnits);
  }
  if (input.tariffEffectiveDate && input.tariffEffectiveDate < "2026-02-12") missing.push(RECOMMENDATION_FIELD_LABELS.tariffEffectiveDate);
  return missing;
}

export function getMissingRecommendationFields(input: VerifiedSolarInput): string[] {
  const missing = [...getMissingBillingFields(input)];
  if (!input.city.trim()) missing.unshift(RECOMMENDATION_FIELD_LABELS.city);
  if (!hasSupportedTariffUtility(input.provider)) missing.push(RECOMMENDATION_FIELD_LABELS.utility);
  if (input.greenMeterStatus === "not_sure") missing.push(RECOMMENDATION_FIELD_LABELS.greenMeter);
  if (input.greenMeterStatus === "yes") {
    if (input.prosumerStatus === "unknown") missing.push(RECOMMENDATION_FIELD_LABELS.agreementStatus, RECOMMENDATION_FIELD_LABELS.agreementType);
    if (input.prosumerStatus === "legacy" && !input.prosumerAgreementDate) missing.push(RECOMMENDATION_FIELD_LABELS.agreementDate);
  }
  return [...new Set(missing)];
}

export function hasCompleteRecommendationContext(input: VerifiedSolarInput): boolean {
  return getMissingRecommendationFields(input).length === 0;
}

export function assessDataConfidence(
  monthlyConsumption: BillExtraction["monthlyConsumption"],
  uncertainFields: readonly string[] = [],
  requiredContextComplete = true,
) {
  const readable = monthlyConsumption.filter((reading) => reading.kwh !== null);
  const uniqueReadableMonths = new Set(readable.map((reading) => `${reading.year}-${reading.month}`)).size;
  const uncertainMonths = readable.filter((reading) => reading.confidence !== "high").length;
  const significantUncertainty = uncertainFields.some((field) => /consumption|units|month|year|location|city/i.test(field));
  let billAnalysisConfidence: BillAnalysisConfidence = "Low";
  if (uniqueReadableMonths >= 11 && uncertainMonths <= 1 && !significantUncertainty) billAnalysisConfidence = "High";
  else if (uniqueReadableMonths >= 6) billAnalysisConfidence = "Medium";
  return { billAnalysisConfidence, recommendationData: (uniqueReadableMonths === 12 && requiredContextComplete ? "Complete" : "Incomplete") as RecommendationDataStatus };
}
