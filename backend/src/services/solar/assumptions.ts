export const SOLAR_MODEL_VERSION = "pk-nasa-power-2001-2020-v1";

export const LOAD_PROFILE_ASSUMPTIONS = Object.freeze({
  mostly_daytime: Object.freeze({ daytimeLoadShare: 0.7, defaultTouPeakShare: 0.15, description: "70% daytime load" }),
  mostly_evening: Object.freeze({ daytimeLoadShare: 0.3, defaultTouPeakShare: 0.45, description: "30% daytime load" }),
  roughly_equal: Object.freeze({ daytimeLoadShare: 0.5, defaultTouPeakShare: 0.3, description: "50% daytime load" }),
  not_sure: Object.freeze({ daytimeLoadShare: 0.45, defaultTouPeakShare: 0.3, description: "conservative default of 45% daytime load" }),
});

export const SOLAR_ASSUMPTIONS = Object.freeze({
  performanceRatio: 0.78,
  offGridPerformanceRatio: 0.72,
  panelWattage: 585,
  panelWattageOptions: [550, 580, 585, 600] as const,
  dcAcRatioMin: 1.1,
  dcAcRatioMax: 1.35,
  dcAcRatioTarget: 1.2,
  batteryDepthOfDischarge: 0.8,
  // Round-trip efficiency is applied exactly once when solar charge input is
  // converted to energy delivered from the battery to customer load.
  batteryRoundTripEfficiency: 0.92,
  batterySafetyMargin: 1.15,
  batteryModuleKwh: 5.12,
  offGridReserveFactor: 1.2,
  smallerCandidateCoverageTolerance: 0.02,
  annualGenerationTargetMin: 0.85,
  annualGenerationTargetMax: 1.15,
});

// Candidate generation uses integer panel counts, beginning at two modules.
// This list is retained only for compatibility with older imports.
export const PRACTICAL_PV_CAPACITIES_KWP = Object.freeze([1.1, 1.65, 2.2, 2.75, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]);

export const PRACTICAL_INVERTER_CAPACITIES_KW = Object.freeze([
  1, 1.5, 2, 2.5, 3, 3.6, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250,
  300, 400, 500, 630, 750, 1000,
]);

export const BACKUP_LEVEL_FACTORS = Object.freeze({
  essential: 0.25,
  most: 0.55,
  entire: 0.9,
});
