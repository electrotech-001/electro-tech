import { getMissingBillingFields, type PolicyConfidence, type VerifiedSolarInput } from "../../validation/solar-analyzer.js";
import { COMMERCIAL_A2_2026, GOP_CONSUMER_TARIFF_2026_02, INDUSTRIAL_B_2026, RESIDENTIAL_A1_2026 } from "../policies/electricity-2026.js";

export type IndustrialTariffCode = keyof typeof INDUSTRIAL_B_2026.categories;
export type ApplicableUtilityGroup = "XWDISCO" | "K-Electric";

const XWDISCOS = new Set(["FESCO", "GEPCO", "HAZECO", "HESCO", "IESCO", "LESCO", "MEPCO", "PESCO", "QESCO", "SEPCO", "TESCO"]);
const MODELED_COMPONENTS = ["Base energy charges", "TOU energy charges where applicable", "Fixed/demand charges where supported", "Export credits where applicable"] as const;
const NOT_MODELED_COMPONENTS = ["Fuel Charges Adjustments (FCA)", "Quarterly/periodic tariff adjustments (QTA)", "Taxes and duties", "Other bill-specific adjustments"] as const;

export type ResolvedTariff = {
  category: "residential" | "commercial" | "industrial";
  tariffCode: "A-1" | "A-2" | IndustrialTariffCode;
  tariffName: string;
  tou: boolean;
  variableRate: number;
  peakRate: number | null;
  offPeakRate: number | null;
  annualFixedCharge: number;
  fixedChargeBasis: string;
  confidence: PolicyConfidence;
  qualifications: string[];
  scheduleId: string;
  scheduleVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  sourceReference: string;
  scheduleStatus: "active";
  applicableUtilities: readonly ["XWDISCO", "K-Electric"];
  applicableUtilityGroup: ApplicableUtilityGroup;
  referenceMode: "Current Reference Tariff";
  modeledComponents: readonly string[];
  notModeledComponents: readonly string[];
};

function normalizedTariffCode(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, "").replace(/^([AB])(?=\d)/, "$1-") ?? "";
}

export function resolveUtilityGroup(provider: string | null | undefined): ApplicableUtilityGroup | null {
  const normalized = provider?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  if (normalized === "K-ELECTRIC" || normalized === "KELECTRIC" || normalized === "KESC") return "K-Electric";
  return XWDISCOS.has(normalized) ? "XWDISCO" : null;
}

function scheduleMetadata(input: VerifiedSolarInput) {
  const applicableUtilityGroup = resolveUtilityGroup(input.provider);
  if (!applicableUtilityGroup) throw new Error("Unsupported or unresolved utility for the configured tariff schedule.");
  if (input.tariffEffectiveDate && input.tariffEffectiveDate < GOP_CONSUMER_TARIFF_2026_02.effectiveFrom) {
    throw new Error("The requested tariff date is outside the configured schedule period.");
  }
  return {
    scheduleId: GOP_CONSUMER_TARIFF_2026_02.id,
    scheduleVersion: GOP_CONSUMER_TARIFF_2026_02.version,
    effectiveFrom: GOP_CONSUMER_TARIFF_2026_02.effectiveFrom,
    effectiveTo: GOP_CONSUMER_TARIFF_2026_02.effectiveTo,
    source: GOP_CONSUMER_TARIFF_2026_02.source,
    sourceReference: GOP_CONSUMER_TARIFF_2026_02.sourceReference,
    scheduleStatus: GOP_CONSUMER_TARIFF_2026_02.status,
    applicableUtilities: GOP_CONSUMER_TARIFF_2026_02.applicableUtilities,
    applicableUtilityGroup,
    referenceMode: GOP_CONSUMER_TARIFF_2026_02.usage,
    modeledComponents: MODELED_COMPONENTS,
    notModeledComponents: NOT_MODELED_COMPONENTS,
  };
}

function fixedDemand(input: VerifiedSolarInput, multiplier: number, qualifications: string[]): number {
  const sanctioned = input.sanctionedLoadKw ?? 0;
  if (input.mdiKw == null) {
    qualifications.push("MDI is unavailable; the tariff estimate uses the configured sanctioned-load minimum and remains preliminary.");
    return sanctioned * multiplier;
  }
  return Math.max(sanctioned * multiplier, input.mdiKw);
}

export function resolveTariff(input: VerifiedSolarInput, annualConsumptionKwh: number): ResolvedTariff {
  const missingFields = getMissingBillingFields(input);
  if (missingFields.length > 0) throw new Error(`Unresolved billing inputs: ${missingFields.join(", ")}`);
  const averageMonthly = annualConsumptionKwh / 12;
  const tou = input.touStatus === "yes";
  const qualifications: string[] = [];
  let confidence: PolicyConfidence = "High";
  const category = input.consumerCategory as "residential" | "commercial" | "industrial";
  const metadata = scheduleMetadata(input);

  if (category === "industrial") {
    const tariffCode = normalizedTariffCode(input.tariffCategory) as IndustrialTariffCode;
    const policy = INDUSTRIAL_B_2026.categories[tariffCode];
    if (!policy) throw new Error("An exact supported industrial tariff code is required.");
    if (!tou && policy.nonTouRate == null) throw new Error(`${tariffCode} is TOU-only in the configured schedule.`);
    const annualFixedCharge = policy.fixedChargeBasis === "connection"
      ? policy.fixedCharge * 12
      : Math.max((input.sanctionedLoadKw ?? 0) * INDUSTRIAL_B_2026.fixedDemandMinimumFraction, input.mdiKw!) * policy.fixedCharge * 12;
    return {
      category, tariffCode, tariffName: policy.label, tou,
      variableRate: tou ? policy.offPeakRate : policy.nonTouRate!,
      peakRate: tou ? policy.peakRate : null,
      offPeakRate: tou ? policy.offPeakRate : null,
      annualFixedCharge,
      fixedChargeBasis: policy.fixedChargeBasis,
      confidence, qualifications, ...metadata,
    };
  }

  if (category === "commercial") {
    if (tou) {
      const demand = fixedDemand(input, 0.25, qualifications);
      if (input.mdiKw == null) confidence = "Preliminary";
      return { category, tariffCode: "A-2", tariffName: "A-2 General Supply Tariff — Commercial", tou, variableRate: COMMERCIAL_A2_2026.tou.offPeakRate, peakRate: COMMERCIAL_A2_2026.tou.peakRate, offPeakRate: COMMERCIAL_A2_2026.tou.offPeakRate, annualFixedCharge: demand * COMMERCIAL_A2_2026.tou.fixedCharge * 12, fixedChargeBasis: COMMERCIAL_A2_2026.tou.fixedChargeBasis, confidence, qualifications, ...metadata };
    }
    const underFive = (input.sanctionedLoadKw ?? 0) < 5;
    const policy = underFive ? COMMERCIAL_A2_2026.underFiveKw : COMMERCIAL_A2_2026.fiveKwAndAbove;
    const annualFixedCharge = policy.fixedChargeBasis === "connection" ? policy.fixedCharge * 12 : policy.fixedCharge * (input.sanctionedLoadKw ?? 0) * 12;
    if (input.sanctionedLoadKw == null) confidence = "Preliminary";
    return { category, tariffCode: "A-2", tariffName: "A-2 General Supply Tariff — Commercial", tou, variableRate: policy.variableRate, peakRate: null, offPeakRate: null, annualFixedCharge, fixedChargeBasis: policy.fixedChargeBasis, confidence, qualifications, ...metadata };
  }

  if (tou) {
    const demand = fixedDemand(input, 0.5, qualifications);
    if (input.mdiKw == null) confidence = "Preliminary";
    return { category, tariffCode: "A-1", tariffName: "A-1 General Supply Tariff — Residential", tou, variableRate: RESIDENTIAL_A1_2026.tou.offPeakRate, peakRate: RESIDENTIAL_A1_2026.tou.peakRate, offPeakRate: RESIDENTIAL_A1_2026.tou.offPeakRate, annualFixedCharge: demand * RESIDENTIAL_A1_2026.tou.fixedCharge * 12, fixedChargeBasis: RESIDENTIAL_A1_2026.tou.fixedChargeBasis, confidence, qualifications, ...metadata };
  }

  let status = input.protectedStatus;
  let candidates = RESIDENTIAL_A1_2026.bands.filter((band) => band.protectedStatus === status && averageMonthly >= band.minimumMonthlyKwh && (band.maximumMonthlyKwh == null || averageMonthly <= band.maximumMonthlyKwh));
  if (!candidates.length && status !== "non_protected") {
    status = "non_protected";
    confidence = "Preliminary";
    qualifications.push("The stated lifeline/protected status does not match the configured monthly-use band; non-protected rates are used provisionally.");
    candidates = RESIDENTIAL_A1_2026.bands.filter((band) => band.protectedStatus === status && averageMonthly >= band.minimumMonthlyKwh && (band.maximumMonthlyKwh == null || averageMonthly <= band.maximumMonthlyKwh));
  }
  const band = candidates[0] ?? RESIDENTIAL_A1_2026.bands.find((item) => item.protectedStatus === "non_protected" && item.maximumMonthlyKwh == null)!;
  return { category, tariffCode: "A-1", tariffName: "A-1 General Supply Tariff — Residential", tou, variableRate: band.variableRate, peakRate: null, offPeakRate: null, annualFixedCharge: band.fixedCharge * (input.sanctionedLoadKw ?? 0) * 12, fixedChargeBasis: RESIDENTIAL_A1_2026.fixedChargeBasis, confidence, qualifications, ...metadata };
}
