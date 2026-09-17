import { DYNAMIC_CHARGES_NOTICE } from "../policies/electricity-2026.js";
import type { ProsumerResolution } from "../prosumer/policy.js";
import type { ResolvedTariff } from "../tariffs/resolver.js";

export type BillingEnergyState = { totalImportKwh: number; peakImportKwh: number; offPeakImportKwh: number; exportKwh: number; peakExportKwh?: number; offPeakExportKwh?: number };
export type BillEstimate = { energyChargesPkr: number; fixedChargesPkr: number; exportValuePkr: number; estimatedAnnualBillPkr: number; notice: string };

function round(value: number): number { return Math.round(Math.max(0, value)); }

export function estimateAnnualBill(state: BillingEnergyState, tariff: ResolvedTariff, prosumer: ProsumerResolution): BillEstimate {
  let energyCharges: number;
  let exportValue = 0;
  if (prosumer.settlement === "legacy_netting") {
    if (tariff.tou) {
      const peakExport = state.peakExportKwh ?? 0;
      const offPeakExport = state.offPeakExportKwh ?? state.exportKwh;
      const netPeak = Math.max(0, state.peakImportKwh - peakExport);
      const netOffPeak = Math.max(0, state.offPeakImportKwh - offPeakExport);
      const excess = Math.max(0, peakExport - state.peakImportKwh) + Math.max(0, offPeakExport - state.offPeakImportKwh);
      energyCharges = netPeak * tariff.peakRate! + netOffPeak * tariff.offPeakRate!;
      exportValue = excess * prosumer.excessExportRate;
    } else {
      const netImport = Math.max(0, state.totalImportKwh - state.exportKwh);
      energyCharges = netImport * tariff.variableRate;
      exportValue = Math.max(0, state.exportKwh - state.totalImportKwh) * prosumer.excessExportRate;
    }
  } else {
    energyCharges = tariff.tou
      ? state.peakImportKwh * tariff.peakRate! + state.offPeakImportKwh * tariff.offPeakRate!
      : state.totalImportKwh * tariff.variableRate;
    exportValue = prosumer.exportPermitted ? state.exportKwh * prosumer.exportRate : 0;
  }
  return { energyChargesPkr: round(energyCharges), fixedChargesPkr: round(tariff.annualFixedCharge), exportValuePkr: round(exportValue), estimatedAnnualBillPkr: round(energyCharges + tariff.annualFixedCharge - exportValue), notice: DYNAMIC_CHARGES_NOTICE };
}
