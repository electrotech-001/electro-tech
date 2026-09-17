export const POLICY_LAST_VERIFIED = "2026-08-26";

export const GOP_CONSUMER_TARIFF_2026_02 = Object.freeze({
  id: "gop-applicable-consumer-tariff-2026-02",
  version: "2026.02",
  effectiveFrom: "2026-02-12",
  effectiveTo: null,
  source: "NEPRA",
  sourceReference: "S.R.O. 279(I)/2026",
  status: "active" as const,
  applicableUtilities: ["XWDISCO", "K-Electric"] as const,
  usage: "Current Reference Tariff" as const,
});

export type TariffBand = {
  minimumMonthlyKwh: number;
  maximumMonthlyKwh: number | null;
  fixedCharge: number;
  variableRate: number;
  protectedStatus: "lifeline" | "protected" | "non_protected";
};

export const RESIDENTIAL_A1_2026 = Object.freeze({
  ...GOP_CONSUMER_TARIFF_2026_02,
  lastVerified: POLICY_LAST_VERIFIED,
  fixedChargeBasis: "sanctioned_load" as const,
  bands: [
    { minimumMonthlyKwh: 0, maximumMonthlyKwh: 50, fixedCharge: 0, variableRate: 3.95, protectedStatus: "lifeline" },
    { minimumMonthlyKwh: 51, maximumMonthlyKwh: 100, fixedCharge: 0, variableRate: 7.74, protectedStatus: "lifeline" },
    { minimumMonthlyKwh: 0, maximumMonthlyKwh: 100, fixedCharge: 200, variableRate: 10.54, protectedStatus: "protected" },
    { minimumMonthlyKwh: 101, maximumMonthlyKwh: 200, fixedCharge: 300, variableRate: 13.01, protectedStatus: "protected" },
    { minimumMonthlyKwh: 0, maximumMonthlyKwh: 100, fixedCharge: 275, variableRate: 22.44, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 101, maximumMonthlyKwh: 200, fixedCharge: 300, variableRate: 28.91, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 201, maximumMonthlyKwh: 300, fixedCharge: 350, variableRate: 33.10, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 301, maximumMonthlyKwh: 400, fixedCharge: 400, variableRate: 36.46, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 401, maximumMonthlyKwh: 500, fixedCharge: 500, variableRate: 38.95, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 501, maximumMonthlyKwh: 600, fixedCharge: 675, variableRate: 40.22, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 601, maximumMonthlyKwh: 700, fixedCharge: 675, variableRate: 41.85, protectedStatus: "non_protected" },
    { minimumMonthlyKwh: 701, maximumMonthlyKwh: null, fixedCharge: 675, variableRate: 47.20, protectedStatus: "non_protected" },
  ] satisfies TariffBand[],
  tou: { peakRate: 46.85, offPeakRate: 34.53, fixedCharge: 675, fixedChargeBasis: "max_50_percent_sanctioned_load_or_mdi" as const },
});

export const COMMERCIAL_A2_2026 = Object.freeze({
  ...GOP_CONSUMER_TARIFF_2026_02,
  lastVerified: POLICY_LAST_VERIFIED,
  underFiveKw: { fixedCharge: 1_000, fixedChargeBasis: "connection" as const, variableRate: 37.44 },
  fiveKwAndAbove: { fixedCharge: 1_250, fixedChargeBasis: "sanctioned_load" as const, variableRate: 39.76 },
  tou: { peakRate: 43.82, offPeakRate: 35.15, fixedCharge: 1_250, fixedChargeBasis: "max_25_percent_sanctioned_load_or_mdi" as const },
});

export const INDUSTRIAL_B_2026 = Object.freeze({
  ...GOP_CONSUMER_TARIFF_2026_02,
  lastVerified: POLICY_LAST_VERIFIED,
  fixedDemandMinimumFraction: 0.25,
  fixedDemandBasis: "max_25_percent_sanctioned_load_or_mdi" as const,
  categories: {
    "B-1": { label: "B-1 Industrial Supply", nonTouRate: 26.23, peakRate: 35.74, offPeakRate: 25.48, fixedCharge: 1_000, fixedChargeBasis: "connection" as const },
    "B-2": { label: "B-2 Industrial Supply", nonTouRate: 26.16, peakRate: 35.68, offPeakRate: 22.83, fixedCharge: 1_250, fixedChargeBasis: "max_25_percent_sanctioned_load_or_mdi" as const },
    "B-3": { label: "B-3 Industrial Supply", nonTouRate: 27.00, peakRate: 35.68, offPeakRate: 23.67, fixedCharge: 1_250, fixedChargeBasis: "max_25_percent_sanctioned_load_or_mdi" as const },
    "B-4": { label: "B-4 Industrial Supply", nonTouRate: 26.43, peakRate: 35.68, offPeakRate: 23.38, fixedCharge: 1_250, fixedChargeBasis: "max_25_percent_sanctioned_load_or_mdi" as const },
    "B-5": { label: "B-5 Industrial Supply", nonTouRate: null, peakRate: 35.68, offPeakRate: 23.13, fixedCharge: 1_250, fixedChargeBasis: "max_25_percent_sanctioned_load_or_mdi" as const },
  },
});

export const PROSUMER_POLICY_2026 = Object.freeze({
  current: {
    effectiveFrom: "2026-02-09",
    effectiveTo: null,
    sourceReference: "NEPRA Prosumer Regulations 2026 · S.R.O. 251(I)/2026",
    exportRate: 8.13,
    exportRateBasis: "NAEPP_CY2026" as const,
    napppReferenceOnly: 25.32,
  },
  legacy: {
    deemedEffectiveFrom: "2026-02-09",
    sourceReference: "S.R.O. 547(I)/2026",
    agreementTermYears: 5,
    renewalTermYears: 5,
    settlementBasis: "peak_and_off_peak_import_export_netting" as const,
    excessExportRate: 25.32,
    excessExportRateBasis: "NAPPP_CY2026" as const,
  },
  dgMaximumKw: 1_000,
  dgCapacityLimitedToSanctionedLoad: true,
  loadFlowStudyThresholdKw: 250,
  transformerHostingThresholdPercent: 80,
  concurrenceExemptionThresholdKw: 25,
  concurrenceSourceReference: "S.R.O. 1330(I)/2026 · 6 August 2026",
  lastVerified: POLICY_LAST_VERIFIED,
});

export const TOU_WINDOWS = Object.freeze([
  { months: [12, 1, 2], startHour: 17, endHour: 21 },
  { months: [3, 4, 5], startHour: 18, endHour: 22 },
  { months: [6, 7, 8], startHour: 19, endHour: 23 },
  { months: [9, 10, 11], startHour: 18, endHour: 22 },
]);

export const DYNAMIC_CHARGES_NOTICE = "Base tariff estimate excludes dynamic FCA, QTA and statutory taxes because verified values are not configured.";
