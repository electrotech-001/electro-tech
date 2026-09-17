import type { VerifiedSolarInput } from "../../validation/solar-analyzer.js";
import { PROSUMER_POLICY_2026 } from "../policies/electricity-2026.js";
import type { ResolvedTariff } from "../tariffs/resolver.js";

export type ProsumerResolution = {
  regime: "none" | "current" | "legacy" | "uncertain";
  settlement: "none" | "purchase" | "legacy_netting";
  exportPermitted: boolean;
  exportRate: number;
  excessExportRate: number;
  confidence: "High" | "Medium" | "Preliminary";
  legacyAgreementStatus: "confirmed" | "likely" | "unverified" | "not-applicable";
  agreementLifecycleStatus: "active" | "expired" | "none" | "unknown";
  qualifications: string[];
};

export type RegulatoryStatus = "eligible" | "interconnection-approval-required" | "upgrade-required" | "load-extension-required" | "requires-disco-verification" | "not-applicable";
export type PhaseStatus = "eligible" | "verification-required" | "not-applicable";
export type CurrentExportArrangement = "confirmed" | "not-established" | "unverified";

// Customer-supplied current arrangement, independent of the proposed architecture.
// Confirmation here is not evidence of external utility or regulatory approval.
export function currentExportArrangement(input: VerifiedSolarInput): CurrentExportArrangement {
  if (input.greenMeterStatus === "not_sure" || input.prosumerStatus === "unknown") return "unverified";
  if (input.greenMeterStatus === "no" || input.prosumerStatus === "none") return "not-established";
  return "confirmed";
}

export const REGULATORY_STATUS_LABELS: Readonly<Record<RegulatoryStatus, string>> = Object.freeze({
  eligible: "Existing Prosumer / Export Arrangement Confirmed",
  "interconnection-approval-required": "DISCO Interconnection / Prosumer Approval Required",
  "upgrade-required": "Phase Verification / Upgrade Required",
  "load-extension-required": "Load Extension Required",
  "requires-disco-verification": "DISCO Verification Required",
  "not-applicable": "Zero-Export / Off-Grid — Prosumer Export Check Not Applicable",
});

function agreementStillValid(date: string | null | undefined): boolean | null {
  if (!date) return null;
  const start = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const expiry = new Date(start);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + PROSUMER_POLICY_2026.legacy.agreementTermYears);
  return expiry >= new Date("2026-08-26T00:00:00Z");
}

function agreementStatuses(input: VerifiedSolarInput) {
  if (input.prosumerStatus === "none") return { legacyAgreementStatus: "not-applicable" as const, agreementLifecycleStatus: "none" as const };
  if (input.prosumerStatus === "current") return { legacyAgreementStatus: "not-applicable" as const, agreementLifecycleStatus: "active" as const };
  if (input.prosumerStatus === "unknown") return { legacyAgreementStatus: "unverified" as const, agreementLifecycleStatus: "unknown" as const };
  const valid = agreementStillValid(input.prosumerAgreementDate);
  return {
    legacyAgreementStatus: input.prosumerAgreementDate ? "confirmed" as const : "unverified" as const,
    agreementLifecycleStatus: valid === true ? "active" as const : valid === false ? "expired" as const : "unknown" as const,
  };
}

export function resolveProsumer(input: VerifiedSolarInput, tariff: ResolvedTariff, architectureAllowsExport: boolean): ProsumerResolution {
  const qualifications: string[] = [];
  const agreement = agreementStatuses(input);
  if (!architectureAllowsExport || input.greenMeterStatus === "no") return { regime: "none", settlement: "none", exportPermitted: false, exportRate: 0, excessExportRate: 0, confidence: "High", ...agreement, qualifications };
  if (input.greenMeterStatus === "not_sure") {
    qualifications.push("Green/bidirectional meter and interconnection status require confirmation.");
    return { regime: "uncertain", settlement: "none", exportPermitted: false, exportRate: 0, excessExportRate: 0, confidence: "Preliminary", ...agreement, qualifications };
  }
  if (input.prosumerStatus === "none") return { regime: "none", settlement: "none", exportPermitted: false, exportRate: 0, excessExportRate: 0, confidence: "High", ...agreement, qualifications };
  if (input.prosumerStatus === "unknown") return { regime: "uncertain", settlement: "none", exportPermitted: false, exportRate: 0, excessExportRate: 0, confidence: "Preliminary", ...agreement, qualifications: ["Prosumer agreement status requires confirmation; no export value is assumed until confirmed."] };
  if (input.prosumerStatus === "legacy") {
    const valid = agreementStillValid(input.prosumerAgreementDate);
    if (valid === true) return { regime: "legacy", settlement: "legacy_netting", exportPermitted: true, exportRate: tariff.tou ? tariff.offPeakRate! : tariff.variableRate, excessExportRate: PROSUMER_POLICY_2026.legacy.excessExportRate, confidence: "Medium", ...agreement, qualifications: ["Legacy peak/off-peak netting and excess treatment are preliminary until the agreement and expiry are verified."] };
    if (valid === null) {
      qualifications.push("Legacy agreement date/expiry is unknown; current-regime economics are used until verified.");
      return { regime: "uncertain", settlement: "purchase", exportPermitted: true, exportRate: PROSUMER_POLICY_2026.current.exportRate, excessExportRate: PROSUMER_POLICY_2026.current.exportRate, confidence: "Preliminary", ...agreement, qualifications };
    }
  }
  return { regime: "current", settlement: "purchase", exportPermitted: true, exportRate: PROSUMER_POLICY_2026.current.exportRate, excessExportRate: PROSUMER_POLICY_2026.current.exportRate, confidence: "High", ...agreement, qualifications };
}

export function checkInterconnection(pvKwp: number, input: VerifiedSolarInput, architectureExportCapable: boolean) {
  const qualifications = ["Final interconnection remains subject to utility/DISCO network and transformer feasibility."];
  if (!architectureExportCapable) return { valid: true, withinPolicyScope: true, regulatoryStatus: "not-applicable" as const, regulatoryStatusLabel: REGULATORY_STATUS_LABELS["not-applicable"], phaseStatus: "not-applicable" as const, exceedsSanctionedLoad: false, excessCapacityKwp: 0, loadExtensionRequired: false, currentGridEligibleCapacityKwp: null, qualifications: [REGULATORY_STATUS_LABELS["not-applicable"]] };
  if (pvKwp > PROSUMER_POLICY_2026.dgMaximumKw) return { valid: false, withinPolicyScope: false, regulatoryStatus: "requires-disco-verification" as const, regulatoryStatusLabel: REGULATORY_STATUS_LABELS["requires-disco-verification"], phaseStatus: input.phase === "three" ? "eligible" as const : "verification-required" as const, exceedsSanctionedLoad: input.sanctionedLoadKw != null && pvKwp > input.sanctionedLoadKw, excessCapacityKwp: input.sanctionedLoadKw == null ? 0 : Math.max(0, pvKwp - input.sanctionedLoadKw), loadExtensionRequired: input.sanctionedLoadKw != null && pvKwp > input.sanctionedLoadKw, currentGridEligibleCapacityKwp: input.sanctionedLoadKw ?? null, qualifications: [...qualifications, "DG capacity exceeds the configured 1 MW scope."] };
  const exceedsSanctionedLoad = input.sanctionedLoadKw != null && pvKwp > input.sanctionedLoadKw;
  const phaseStatus: PhaseStatus = input.phase === "three" ? "eligible" : "verification-required";
  const arrangement = currentExportArrangement(input);
  const regulatoryStatus: RegulatoryStatus = arrangement === "unverified"
    ? "requires-disco-verification"
    : arrangement === "not-established"
      ? "interconnection-approval-required"
      : exceedsSanctionedLoad
        ? "load-extension-required"
        : phaseStatus === "verification-required"
          ? input.phase === "single" ? "upgrade-required" : "requires-disco-verification"
          : "eligible";
  if (exceedsSanctionedLoad) qualifications.push("Export-connected DG capacity exceeds sanctioned load; a load extension is required before interconnection at the proposed capacity.");
  if (phaseStatus === "verification-required") qualifications.push("Phase Verification / Upgrade Required", "Your existing connection may require DISCO verification or a phase upgrade before grid-export/prosumer interconnection can be enabled.");
  if (input.sanctionedLoadKw == null) qualifications.push("Sanctioned load is unknown; export-connected eligibility is preliminary.");
  if (arrangement !== "confirmed") qualifications.push(REGULATORY_STATUS_LABELS[regulatoryStatus]);
  qualifications.push(pvKwp <= 25 ? "NEPRA concurrence is not required for DG ≤25 kW; utility interconnection approval still applies." : "Utility approval and applicable NEPRA/interconnection review remain required.");
  if (pvKwp >= 250) qualifications.push("A load-flow study is required at 250 kW and above.");
  return {
    valid: regulatoryStatus === "eligible",
    withinPolicyScope: true,
    regulatoryStatus,
    regulatoryStatusLabel: REGULATORY_STATUS_LABELS[regulatoryStatus],
    phaseStatus,
    exceedsSanctionedLoad,
    excessCapacityKwp: input.sanctionedLoadKw == null ? 0 : Math.max(0, pvKwp - input.sanctionedLoadKw),
    loadExtensionRequired: exceedsSanctionedLoad,
    currentGridEligibleCapacityKwp: input.sanctionedLoadKw == null ? null : Math.min(pvKwp, input.sanctionedLoadKw),
    qualifications,
  };
}

export function assessMaterialModification(pvKwp: number, inverterKw: number, input: VerifiedSolarInput) {
  if (input.existingSolar.status !== "yes") return { materialModification: false, reasons: [] as string[] };
  const reasons: string[] = [];
  if (input.existingSolar.plannedOutputIncrease || (input.existingSolar.pvKwp != null && pvKwp > input.existingSolar.pvKwp)) reasons.push("The proposed maximum PV/DG output exceeds the existing system output.");
  if (input.existingSolar.plannedInverterReplacement || (input.existingSolar.inverterKw != null && inverterKw !== input.existingSolar.inverterKw)) reasons.push("The proposed inverter differs from the existing interconnection equipment.");
  if (input.existingSolar.plannedInterconnectionEquipmentChange) reasons.push("A change to interconnection equipment is planned.");
  return { materialModification: reasons.length > 0, reasons };
}
