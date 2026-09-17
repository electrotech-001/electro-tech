import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SolarBillAnalyzer } from "@/components/solar-bill-analyzer";
import { apiUrl, getApiOrigin } from "@/lib/api-origin";
import {
  ANALYZER_EXTRACTION_REQUEST_TIMEOUT_MS, analyzerLeadMessage, consumeAnalyzerLeadContext, consumerTariffPayload, createAnalyzerLeadContext, createTwelveMonthGrid,
  isVerificationContextComplete, normalizeConsumerTariff, normalizeUtility, prosumerPayload, saveAnalyzerLeadContext, summarizeConsumption, validateBillFile,
  type BillExtraction, type OptimizedSystem, type SolarArchitecture, type SolarRecommendationResult,
} from "@/lib/solar-analyzer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

const extraction: BillExtraction = {
  provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", connectionType: "Residential",
  phase: "single", sanctionedLoadKw: 5, mdiKw: null, consumerCategory: "A-1",
  currentBillYear: 2026, currentBillMonth: 12, currentMonthConsumptionKwh: 420, currentBillAmountPkr: 24_000,
  touStatus: "no", peakUnitsKwh: null, offPeakUnitsKwh: null, importUnitsKwh: null, exportUnitsKwh: null,
  greenMeterStatus: "no", existingProsumerStatus: "no", prosumerAgreementDate: null,
  monthlyConsumption: Array.from({ length: 12 }, (_, index) => ({ year: 2026, month: index + 1, kwh: 400 + index, confidence: "high" as const })),
  uncertainFields: [],
};

function system(architectureKey: SolarArchitecture, architecture: string, batteryKwh: number | null = null): OptimizedSystem {
  const offGrid = architectureKey === "off_grid";
  const architectureExportCapable = ["on_grid_only", "hybrid_green_no_battery", "hybrid_green_battery"].includes(architectureKey);
  return {
    architectureKey, architecture, actualInstalledKwp: offGrid ? 4.68 : 2.34, inverterKw: offGrid ? 4 : 2,
    panelCount: offGrid ? 8 : 4, panelWattage: 585, batteryKwh, annualGenerationKwh: 4_100,
    directSolarConsumptionKwh: 2_600, batteryChargeInputKwh: batteryKwh ? 652 : 0, batteryDischargeKwh: batteryKwh ? 600 : 0, batteryLossKwh: batteryKwh ? 52 : 0, usableBatteryCapacityKwh: batteryKwh ? batteryKwh * 0.8 : 0,
    gridImportKwh: offGrid ? 0 : 2_100, gridExportKwh: 0, curtailedGenerationKwh: 200, unusedSurplusKwh: 200, unservedLoadKwh: offGrid ? 120 : 0,
    selfConsumptionPercent: 78, consumptionCoveragePercent: 64,
    estimatedBillReductionPkr: offGrid ? null : 105_000, estimatedBillReductionPercent: offGrid ? null : 61.4,
    estimatedRemainingBillPkr: offGrid ? null : 66_000,
    currentBill: offGrid ? null : { energyChargesPkr: 165_000, fixedChargesPkr: 6_000, exportValuePkr: 0, estimatedAnnualBillPkr: 171_000, notice: "Estimate" },
    postSolarBill: offGrid ? null : { energyChargesPkr: 60_000, fixedChargesPkr: 6_000, exportValuePkr: 0, estimatedAnnualBillPkr: 66_000, notice: "Estimate" },
    architectureExportCapable, currentExportArrangement: "not-established",
    regulatoryValid: !architectureExportCapable, prosumerRegime: "none",
    regulatoryStatus: architectureExportCapable ? "interconnection-approval-required" : "not-applicable", regulatoryStatusLabel: architectureExportCapable ? "DISCO Interconnection / Prosumer Approval Required" : "Zero-Export / Off-Grid — Prosumer Export Check Not Applicable",
    phaseStatus: architectureExportCapable ? "eligible" : "not-applicable", currentGridEligibleCapacityKwp: architectureExportCapable ? 2.34 : null,
    exceedsSanctionedLoad: false, excessCapacityKwp: 0, loadExtensionRequired: false, materialModification: false,
    legacyAgreementStatus: "not-applicable", agreementLifecycleStatus: "none", regulatoryQualifications: offGrid ? ["Zero-Export / Off-Grid — Prosumer Export Check Not Applicable"] : ["Utility interconnection approval still applies."],
    monthlySimulation: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, monthName: new Date(2026, index).toLocaleString("en", { month: "long" }), consumptionKwh: 400 + index, generationKwh: 340, daytimeLoadKwh: 280, nighttimeLoadKwh: 120 + index, directSolarKwh: 220, batteryChargeInputKwh: batteryKwh ? 54 : 0, batteryDischargeKwh: batteryKwh ? 50 : 0, batteryLossKwh: batteryKwh ? 4 : 0, usableBatteryCapacityKwh: batteryKwh ? batteryKwh * 0.8 : 0, peakGridImportKwh: 0, offPeakGridImportKwh: offGrid ? 0 : 180, gridImportKwh: offGrid ? 0 : 180, gridExportKwh: 0, curtailedGenerationKwh: 20, unusedSurplusKwh: 20, unservedLoadKwh: offGrid ? 10 : 0 })),
    qualification: offGrid ? ["Final Off-Grid design requires load, surge, autonomy and site studies."] : ["Final interconnection remains subject to utility approval."],
    whyThisSystem: ["The PV size is evaluated against verified annual use.", "Fixed charges remain in the bill estimate.", "Unused surplus receives no export value."],
  };
}

const onGrid = system("on_grid_only", "On-Grid Only");
const hybrid = system("hybrid_battery_no_green", "Hybrid + Battery — No Green Meter", 10.24);
const offGrid = system("off_grid", "Off-Grid", 30.72);
const recommendation: SolarRecommendationResult = {
  modelVersion: "test-v2", analysisMode: "recommend",
  location: { requestedCity: "Islamabad", profileCity: "Islamabad", regionalFallbackUsed: false, assumption: null },
  dataQuality: { billExtractionConfidence: "High", tariffPolicyConfidence: "High", recommendationConfidence: "Medium", recommendationConfidenceExplanation: "Medium confidence — annual consumption and tariff inputs are usable, but daytime and nighttime consumption are estimated.", recommendationData: "Complete", readableMonths: 12 },
  consumption: { annualConsumptionKwh: 4_866, annualConsumptionEstimated: false, averageMonthlyKwh: 405.5, averageDailyKwh: 13.3, highestMonth: { label: "December 2026", kwh: 411 }, lowestMonth: { label: "January 2026", kwh: 400 } },
  assumptions: { panelWattage: 585, performanceRatio: .78, policyLastVerified: "2026-08-26", dynamicChargesConfigured: false, loadProfile: "mostly_daytime", daytimeLoadShare: .7, loadProfileMethodology: "Monthly representative-day simulation using 70% daytime load.", touMethodology: "Not applicable to non-TOU billing.", batteryRoundTripEfficiency: .92, solarProfileSource: { modelVersion: "test-v2", provider: "NASA POWER", climatologyPeriod: "2001-2020" } },
  verifiedContext: { utility: "IESCO", tariff: "A-1", greenMeterStatus: "no", backupRequirement: "None stated", selectedArchitecture: null },
  tariffDetails: { usage: "Current Reference Tariff", tariffCode: "A-1", tariffName: "A-1 General Supply Tariff — Residential", version: "2026.02", effectiveFrom: "2026-02-12", effectiveTo: null, utility: "IESCO", utilityGroup: "XWDISCO", source: "NEPRA", sourceReference: "S.R.O. 279(I)/2026", modeledComponents: ["Base energy charges"], notModeledComponents: ["Fuel Charges Adjustments (FCA)", "Quarterly/periodic tariff adjustments (QTA)", "Taxes and duties"] },
  bestRecommended: onGrid, meaningfulAlternative: hybrid, userSelected: null, comparisonExplanation: null,
  evaluatedArchitectures: ["on_grid_only", "hybrid_no_green_no_battery", "hybrid_battery_no_green"],
};

async function fillAllMonthlyReadings(user: ReturnType<typeof userEvent.setup>, value = "300") {
  for (const input of screen.getAllByLabelText(/consumption in kWh/i)) {
    fireEvent.change(input, { target: { value } });
  }
}

async function reachMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
  await user.type(screen.getByLabelText(/Installation city in Pakistan/i), "Islamabad");
  await user.selectOptions(screen.getByLabelText(/^Utility$/i), "IESCO");
  await user.selectOptions(screen.getByLabelText(/Consumer tariff/i), "residential_a1");
  await user.selectOptions(screen.getByLabelText(/Residential status/i), "non_protected");
  await user.type(screen.getByLabelText(/Sanctioned load/i), "5");
  await user.selectOptions(screen.getByLabelText(/Billing type/i), "no");
  await user.selectOptions(screen.getByLabelText(/Existing green meter/i), "no");
  await fillAllMonthlyReadings(user);
  await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
}

test.each([
  ["on_grid_only", "unverified", "requires-disco-verification", "DISCO Verification Required"],
  ["on_grid_only", "confirmed", "eligible", "Existing Prosumer / Export Arrangement Confirmed"],
  ["hybrid_no_green_no_battery", "not-established", "not-applicable", "Zero-Export / Off-Grid — Prosumer Export Check Not Applicable"],
  ["hybrid_battery_no_green", "not-established", "not-applicable", "Zero-Export / Off-Grid — Prosumer Export Check Not Applicable"],
  ["off_grid", "not-established", "not-applicable", "Zero-Export / Off-Grid — Prosumer Export Check Not Applicable"],
] as const)("renders regulatory status for %s with %s arrangement", async (architecture, arrangement, status, label) => {
  const user = userEvent.setup();
  const selected: OptimizedSystem = {
    ...system(architecture, architecture), currentExportArrangement: arrangement,
    regulatoryStatus: status, regulatoryStatusLabel: label,
    prosumerRegime: arrangement === "confirmed" ? "current" : arrangement === "unverified" ? "uncertain" : "none",
    regulatoryQualifications: ["Final interconnection remains subject to utility/DISCO network and transformer feasibility."],
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    ...recommendation, analysisMode: "chosen", bestRecommended: null, meaningfulAlternative: null, userSelected: selected,
    verifiedContext: { ...recommendation.verifiedContext, greenMeterStatus: arrangement === "confirmed" ? "yes" : arrangement === "unverified" ? "not_sure" : "no" },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  render(<SolarBillAnalyzer />);
  await reachMode(user);
  const mode = screen.getByRole("heading", { name: /Analyze a system I choose/i }).closest("article")!;
  await user.click(within(mode).getByRole("button", { name: /Choose/i }));
  await user.selectOptions(screen.getByLabelText(/Architecture to analyze/i), architecture);
  await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
  const panel = await screen.findByRole("region", { name: "Grid and regulatory status" });
  expect(panel.textContent).toContain(label);
  expect(panel.textContent).toContain("network and transformer feasibility");
  expect(panel.textContent).not.toMatch(/Grid-Export Eligible|(?:NEPRA|DISCO|Government) Approved/i);
  if (selected.architectureExportCapable) expect(panel.textContent).not.toMatch(/Export Check Not Applicable/i);
  else expect(panel.textContent).toContain("Modeled Grid Export: 0 kWh/year");
}, 10_000);

describe("solar analyzer utilities", () => {
  test("centralizes API URLs and normalizes the configured public origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.electrotech.test/");
    expect(getApiOrigin()).toBe("https://api.electrotech.test");
    expect(apiUrl("api/quote")).toBe("https://api.electrotech.test/api/quote");
  });

  test("validates uploads and builds a rolling editable grid", () => {
    expect(validateBillFile(new File(["x"], "bill.txt", { type: "text/plain" }))).toMatch(/PDF/);
    expect(validateBillFile(new File([], "bill.pdf", { type: "application/pdf" }))).toMatch(/empty/);
    expect(validateBillFile(new File(["%PDF"], "bill.pdf", { type: "application/pdf" }))).toBeNull();
    const grid = createTwelveMonthGrid(extraction.monthlyConsumption.slice(0, 6), new Date("2026-12-01"));
    expect(grid).toHaveLength(12);
    expect(grid.filter((month) => !month.kwh)).toHaveLength(6);
  });

  test("calculates summaries and creates non-sensitive quote/WhatsApp context", () => {
    const summary = summarizeConsumption(createTwelveMonthGrid(extraction.monthlyConsumption))!;
    expect(summary.readableMonths).toBe(12);
    expect(summary.highest.value).toBe(411);
    expect(summary.annualConsumption).toBe(4_866);
    const context = createAnalyzerLeadContext(recommendation, onGrid);
    expect(context.source).toBe("solar_bill_analyzer");
    expect(context.pvCapacityKwp).toBe(2.34);
    expect(analyzerLeadMessage(context)).toContain("On-Grid Only");
    expect(analyzerLeadMessage(context)).not.toMatch(/account|meter|consumer number/i);
    saveAnalyzerLeadContext(context);
    expect(consumeAnalyzerLeadContext()).toEqual(context);
    expect(consumeAnalyzerLeadContext()).toBeNull();
  });

  test("normalizes customer-facing verification choices into the existing backend contract", () => {
    expect(normalizeUtility("Islamabad Electric Supply Company (IESCO)")).toBe("IESCO");
    expect(normalizeUtility("KESC / K Electric")).toBe("K-Electric");
    expect(normalizeConsumerTariff("A-1", "Residential")).toBe("residential_a1");
    expect(normalizeConsumerTariff("A-2 commercial")).toBe("commercial_a2");
    expect(normalizeConsumerTariff("B3", "Industrial")).toBe("industrial_b3");
    expect(normalizeConsumerTariff("Industrial")).toBe("unknown");
    expect(consumerTariffPayload("residential_a1")).toEqual({ tariffCategory: "A-1", connectionType: "Residential", consumerCategory: "residential" });
    expect(consumerTariffPayload("industrial_b5")).toEqual({ tariffCategory: "B-5", connectionType: "Industrial", consumerCategory: "industrial" });
    expect(prosumerPayload("no", "not_sure", "unknown", "")).toEqual({ prosumerStatus: "none", prosumerAgreementDate: null });
  });

  test("requires all visible policy context before reporting recommendation data complete", () => {
    const base = { cityKnown: true, utility: "IESCO", consumerTariff: "residential_a1" as const, residentialStatus: "non_protected" as const, sanctionedLoadKw: 5, billingType: "no" as const, mdiKw: null, peakUnitsKwh: null, offPeakUnitsKwh: null, greenMeterStatus: "no" as const, agreementStatus: "not_sure" as const, prosumerRegime: "unknown" as const, agreementDate: "" };
    expect(isVerificationContextComplete(base)).toBe(true);
    expect(isVerificationContextComplete({ ...base, billingType: "yes" })).toBe(false);
    expect(isVerificationContextComplete({ ...base, billingType: "yes", mdiKw: 4 })).toBe(true);
    expect(isVerificationContextComplete({ ...base, consumerTariff: "industrial_b2", residentialStatus: "unknown", billingType: "no" })).toBe(false);
    expect(isVerificationContextComplete({ ...base, consumerTariff: "industrial_b2", residentialStatus: "unknown", billingType: "no", mdiKw: 12 })).toBe(true);
    expect(isVerificationContextComplete({ ...base, consumerTariff: "industrial_b1", residentialStatus: "unknown", billingType: "yes", peakUnitsKwh: null, offPeakUnitsKwh: null })).toBe(false);
    expect(isVerificationContextComplete({ ...base, greenMeterStatus: "yes", agreementStatus: "yes", prosumerRegime: "legacy" })).toBe(false);
    expect(isVerificationContextComplete({ ...base, greenMeterStatus: "yes", agreementStatus: "yes", prosumerRegime: "legacy", agreementDate: "2025-01-15" })).toBe(true);
  });
});

describe("solar analyzer customer flow", () => {
  test("allows the bounded two-attempt extraction window before browser abort", () => {
    expect(ANALYZER_EXTRACTION_REQUEST_TIMEOUT_MS).toBe(100_000);
    expect(ANALYZER_EXTRACTION_REQUEST_TIMEOUT_MS).toBeGreaterThan(2 * 45_000);
  });

  test("keeps manual entry available without Gemini and shows twelve editable months", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    expect(screen.getByRole("heading", { name: /Confirm the inputs/i })).toBeTruthy();
    expect(screen.getAllByLabelText(/consumption in kWh/i)).toHaveLength(12);
  });

  test("keeps incomplete history on Verify until the user manually completes all twelve months", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    const inputs = screen.getAllByLabelText(/consumption in kWh/i);
    await user.type(inputs[0]!, "300");
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/exactly 12 unique monthly/i);
    expect(screen.queryByText(/Estimated annual/i)).toBeNull();
    expect(screen.getByText(/Recommendation Data: Incomplete/i)).toBeTruthy();
    await fillAllMonthlyReadings(user, "300");
    expect(screen.getByText(/Annual consumption/i)).toBeTruthy();
    expect(screen.getByText(/Recommendation Data: Incomplete/i)).toBeTruthy();
  });

  test("uploads a bill and preserves corrected verification data", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ extraction, billAnalysisConfidence: "High", recommendationData: "Complete" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(recommendation), { status: 200, headers: { "content-type": "application/json" } }));
    const { container } = render(<SolarBillAnalyzer />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["%PDF-1.7"], "bill.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /Analyze Bill/i }));
    const provider = await screen.findByLabelText(/^Utility$/i);
    await user.selectOptions(provider, "LESCO");
    await user.selectOptions(screen.getByLabelText(/Residential status/i), "non_protected");
    const firstMonth = screen.getAllByLabelText(/consumption in kWh/i)[0]!;
    await user.clear(firstMonth);
    await user.type(firstMonth, "450");
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    const card = screen.getByRole("heading", { name: /Recommend the best system for me/i }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Choose/i }));
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect(await screen.findByRole("heading", { name: "On-Grid Only" })).toBeTruthy();
    const regulatory = within(screen.getByRole("heading", { name: "On-Grid Only" }).closest("article")!).getByRole("region", { name: "Grid and regulatory status" });
    expect(regulatory.textContent).toContain("DISCO Interconnection / Prosumer Approval Required");
    expect(regulatory.textContent).toContain("Export-capable");
    expect(regulatory.textContent).toContain("Not established");
    expect(regulatory.textContent).toContain("None currently confirmed");
    expect(regulatory.textContent).toContain("Modeled Grid Export: 0 kWh/year");
    expect(regulatory.textContent).toContain("surplus solar is curtailed");
    expect(regulatory.textContent).not.toMatch(/Grid-Export Eligible|Prosumer Export Check Not Applicable/i);
    expect(screen.getByRole("heading", { name: "Current Reference Tariff" })).toBeTruthy();
    expect(screen.getByText(/S\.R\.O\. 279\(I\)\/2026/)).toBeTruthy();
    expect(screen.getByText(/Fuel Charges Adjustments/)).toBeTruthy();
    const calculateBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(calculateBody.provider).toBe("LESCO");
    expect(calculateBody.monthlyConsumption[0].kwh).toBe(450);
    expect(calculateBody.analysisMode).toBe("recommend");
    expect(calculateBody.backupPreference).toEqual({ level: "none" });
  });

  test("requires an explicit analysis mode with no automatic default", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    expect(screen.getAllByRole("button", { name: "Choose" })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/Choose an analysis mode/i);
  });

  test("supports Chosen mode and sends only the selected architecture", async () => {
    const user = userEvent.setup();
    const chosen = { ...recommendation, analysisMode: "chosen" as const, bestRecommended: null, meaningfulAlternative: null, userSelected: hybrid, verifiedContext: { ...recommendation.verifiedContext, selectedArchitecture: "hybrid_battery_no_green" as const }, evaluatedArchitectures: ["hybrid_battery_no_green" as const] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(chosen), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    await user.selectOptions(screen.getByLabelText(/Existing solar/i), "yes");
    await user.type(screen.getByLabelText(/Existing PV/i), "5");
    await user.type(screen.getByLabelText(/Existing inverter/i), "5");
    await user.click(screen.getByLabelText(/Replace or change inverter/i));
    const card = screen.getByRole("heading", { name: /Analyze a system I choose/i }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Choose/i }));
    await user.selectOptions(screen.getByLabelText(/Architecture to analyze/i), "hybrid_battery_no_green");
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect(await screen.findByText("YOUR SELECTED SYSTEM ANALYSIS")).toBeTruthy();
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.analysisMode).toBe("chosen");
    expect(body.selectedArchitecture).toBe("hybrid_battery_no_green");
    expect(body.existingSolar).toMatchObject({ status: "yes", pvKwp: 5, inverterKw: 5, plannedInverterReplacement: true });
  }, 10_000);

  test("shows safe extraction errors and leaves manual fallback available", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Bill extraction is temporarily unavailable. You can enter consumption manually." }), { status: 503, headers: { "content-type": "application/json" } }));
    const { container } = render(<SolarBillAnalyzer />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["%PDF"], "bill.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /Analyze Bill/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/temporarily unavailable/i);
    expect((screen.getByRole("button", { name: /Enter Consumption Manually/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("blocks analysis until a real installation city is supplied and keeps completeness accurate", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ extraction: { ...extraction, city: null }, billAnalysisConfidence: "High", recommendationData: "Complete" }), { status: 200, headers: { "content-type": "application/json" } }));
    const { container } = render(<SolarBillAnalyzer />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["%PDF"], "bill.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /Analyze Bill/i }));
    expect(await screen.findByText(/Recommendation Data: Incomplete/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/installation city in Pakistan/i);
    expect(screen.queryByRole("heading", { name: /How should Electrotech analyze/i })).toBeNull();
    await user.type(screen.getByLabelText(/Installation city in Pakistan/i), "Attock");
    expect(screen.getByText(/Recommendation Data: Incomplete/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/Residential status/i), "non_protected");
    expect(screen.getByText(/Recommendation Data: Complete/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.getByRole("heading", { name: /How should Electrotech analyze/i })).toBeTruthy();
  });

  test("keeps unresolved tariff inputs on Verify and highlights customer-facing fields", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    await user.type(screen.getByLabelText(/Installation city in Pakistan/i), "Islamabad");
    await fillAllMonthlyReadings(user);
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.queryByRole("heading", { name: /How should Electrotech analyze/i })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/Consumer tariff/);
    expect(screen.getByLabelText(/Consumer tariff/i).closest("label")?.className).toMatch(/fieldNeedsReview/);
    expect(screen.getByText(/Recommendation Data: Incomplete/i)).toBeTruthy();
  });

  test("keeps normal residential verification concise and reveals TOU fields only when selected", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    expect(screen.getByLabelText(/Installation city/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Utility$/i)).toBeTruthy();
    expect(screen.getByLabelText(/Consumer tariff/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/Consumer tariff/i), "residential_a1");
    expect(screen.getByLabelText(/Residential status/i)).toBeTruthy();
    expect(screen.getByLabelText(/Sanctioned load/i)).toBeTruthy();
    expect(screen.getByLabelText(/Billing type/i)).toBeTruthy();
    expect(screen.getByLabelText(/Existing green meter/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Maximum demand/i)).toBeNull();
    expect(screen.queryByLabelText(/^Peak units/i)).toBeNull();
    expect(screen.queryByLabelText(/^Off-peak units/i)).toBeNull();
    expect(screen.getByLabelText(/Connection phase/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Current bill amount/i)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Billing type/i), "yes");
    expect(screen.getByLabelText(/Maximum demand/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Peak units/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Off-peak units/i)).toBeTruthy();
  });

  test("reveals green-meter agreement questions progressively", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    expect(screen.getByLabelText(/approved net-metering or prosumer agreement/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Agreement type/i)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Existing green meter/i), "yes");
    await user.selectOptions(screen.getByLabelText(/approved net-metering or prosumer agreement/i), "yes");
    expect(screen.getByLabelText(/Agreement type/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Agreement \/ approval date/i)).toBeNull();
    await user.selectOptions(screen.getByLabelText(/Agreement type/i), "legacy");
    expect(screen.getByLabelText(/Agreement \/ approval date/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/Existing green meter/i), "no");
    expect(screen.queryByLabelText(/approved net-metering or prosumer agreement/i)).toBeNull();
  });

  test("uses the commercial flow without residential status and maps A-2 correctly", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(recommendation), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    await user.type(screen.getByLabelText(/Installation city/i), "Islamabad");
    await user.selectOptions(screen.getByLabelText(/^Utility$/i), "IESCO");
    await user.selectOptions(screen.getByLabelText(/Consumer tariff/i), "commercial_a2");
    expect(screen.queryByLabelText(/Residential status/i)).toBeNull();
    await user.type(screen.getByLabelText(/Sanctioned load/i), "12");
    await user.selectOptions(screen.getByLabelText(/Billing type/i), "no");
    await user.selectOptions(screen.getByLabelText(/Existing green meter/i), "no");
    await fillAllMonthlyReadings(user, "450");
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    const card = screen.getByRole("heading", { name: /Recommend the best system for me/i }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Choose/i }));
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    await screen.findByRole("heading", { name: "On-Grid Only" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.tariffCategory).toBe("A-2");
    expect(body.connectionType).toBe("Commercial");
    expect(body.consumerCategory).toBe("commercial");
    expect(body.protectedStatus).toBe("unknown");
  }, 10_000);

  test("requires an exact industrial code and progressively requests demand inputs", async () => {
    const user = userEvent.setup();
    render(<SolarBillAnalyzer />);
    await user.click(screen.getByRole("button", { name: /Enter Consumption Manually/i }));
    await user.type(screen.getByLabelText(/Installation city/i), "Islamabad");
    await user.selectOptions(screen.getByLabelText(/^Utility$/i), "IESCO");
    await user.selectOptions(screen.getByLabelText(/Consumer tariff/i), "industrial_b2");
    expect(screen.queryByLabelText(/Residential status/i)).toBeNull();
    expect(screen.getByText(/Industrial demand details/i)).toBeTruthy();
    await user.type(screen.getByLabelText(/Sanctioned load/i), "100");
    await user.selectOptions(screen.getByLabelText(/Billing type/i), "no");
    await user.selectOptions(screen.getByLabelText(/Existing green meter/i), "no");
    await fillAllMonthlyReadings(user, "1000");
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/Maximum demand \/ MDI/);
    expect(screen.getByLabelText(/Maximum demand/i).closest("label")?.className).toMatch(/fieldNeedsReview/);
    await user.type(screen.getByLabelText(/Maximum demand/i), "60");
    await user.click(screen.getByRole("button", { name: /Continue to Analysis Mode/i }));
    expect(screen.getByRole("heading", { name: /How should Electrotech analyze/i })).toBeTruthy();
  }, 10_000);

  test("qualifies Off-Grid shortfall metrics in explicitly chosen results", async () => {
    const user = userEvent.setup();
    const chosen = { ...recommendation, analysisMode: "chosen" as const, bestRecommended: null, meaningfulAlternative: null, userSelected: offGrid, verifiedContext: { ...recommendation.verifiedContext, selectedArchitecture: "off_grid" as const }, evaluatedArchitectures: ["off_grid" as const] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(chosen), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    const card = screen.getByRole("heading", { name: /Analyze a system I choose/i }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Choose/i }));
    await user.selectOptions(screen.getByLabelText(/Architecture to analyze/i), "off_grid");
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect(await screen.findByText(/PRELIMINARY OFF-GRID SIZING/i)).toBeTruthy();
    expect(screen.getAllByText(/Modeled unserved energy/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Not Applicable if fully disconnected/i)).toBeTruthy();
    expect(screen.queryByText(/Remaining bill/i)).toBeNull();
  });

  test("renders recommendation metrics, quote CTA and safe WhatsApp handoff", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(recommendation), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    const card = screen.getByRole("heading", { name: /Recommend the best system for me/i }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: /Choose/i }));
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect((await screen.findAllByText(/estimated maximum practical bill reduction/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /GET AN EXACT SOLAR PROPOSAL/i })).toBeTruthy();
    const href = screen.getByRole("link", { name: /Discuss on WhatsApp/i }).getAttribute("href")!;
    expect(href).toContain("wa.me");
    expect(decodeURIComponent(href)).not.toMatch(/account|meter number|consumer number/i);
  });

  test("separates engineering, regulatory and financial results with preliminary disclosures", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(recommendation), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    await user.click(within(screen.getByRole("heading", { name: /Recommend the best system/i }).closest("article")!).getByRole("button", { name: /Choose/i }));
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));

    const primary = (await screen.findByRole("heading", { name: "On-Grid Only" })).closest("article")!;
    expect(screen.getAllByText(/PRELIMINARY AI-ASSISTED SOLAR SYSTEM RECOMMENDATION/i).length).toBeGreaterThan(1);
    expect(within(primary).getByLabelText(/Engineering recommendation/i)).toBeTruthy();
    expect(within(primary).getByLabelText(/Grid and regulatory status/i)).toBeTruthy();
    expect(within(primary).getByLabelText(/Financial recommendation/i)).toBeTruthy();
    expect(within(primary).getByText(/Estimated Maximum Practical Bill Reduction/i)).toBeTruthy();
    expect(within(primary).getByText(/Estimated Remaining Electricity Bill/i)).toBeTruthy();
    expect(within(primary).getByText(/Energy coverage/i)).toBeTruthy();
    expect(within(primary).getByText(/Self-consumption/i)).toBeTruthy();
    expect(within(primary).queryByText(/Battery capacity/i)).toBeNull();
    expect(within(primary).getByRole("heading", { name: /Why This System/i })).toBeTruthy();
    expect(screen.getByLabelText(/Recommendation confidence/i).textContent).toContain("Medium confidence");
    expect(screen.getByText(/Tariff Version:/i)).toBeTruthy();
    expect(screen.getByText(/Excluded \/ Non-Modeled Components:/i)).toBeTruthy();
    expect(screen.getByText(/Actual future bills may differ due to FCA/i)).toBeTruthy();
    expect(screen.getByText(/not a final EPC or structural design/i)).toBeTruthy();
    expect(screen.getAllByText("ALTERNATIVE CONFIGURATION")).toHaveLength(1);
  });

  test("Both mode labels recommendation and selection neutrally using actual comparison metrics", async () => {
    const user = userEvent.setup();
    const both = { ...recommendation, analysisMode: "both" as const, meaningfulAlternative: null, userSelected: hybrid, comparisonExplanation: "On-Grid Only estimates 61.4% bill reduction versus 54.2% for the selected Hybrid system; modeled imports and backup capability differ.", verifiedContext: { ...recommendation.verifiedContext, selectedArchitecture: "hybrid_battery_no_green" as const } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(both), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    await user.click(within(screen.getByRole("heading", { name: /^Both$/i }).closest("article")!).getByRole("button", { name: /Choose/i }));
    await user.selectOptions(screen.getByLabelText(/Architecture to analyze/i), "hybrid_battery_no_green");
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));

    expect(await screen.findByText("BEST RECOMMENDED")).toBeTruthy();
    expect(screen.getByText("YOUR SELECTED SYSTEM")).toBeTruthy();
    expect(screen.getByLabelText(/Deterministic system comparison/i).textContent).toContain("61.4%");
    const selected = screen.getByRole("heading", { name: "Hybrid + Battery — No Green Meter" }).closest("article")!;
    expect(within(selected).getByText("Battery capacity", { exact: true })).toBeTruthy();
    expect(within(selected).getByText(/^Grid export$/i).closest("div")?.textContent).toContain("0 kWh/year");
    expect(within(selected).getByText(/Excess solar/i)).toBeTruthy();
    expect(within(selected).queryByText(/Export compensation/i)).toBeNull();
  });

  test("shows the named regional solar-profile fallback", async () => {
    const user = userEvent.setup();
    const fallback = { ...recommendation, location: { requestedCity: "Attock", profileCity: "Islamabad", regionalFallbackUsed: true, assumption: "Attock uses the conservative Islamabad regional solar profile." } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(fallback), { status: 200, headers: { "content-type": "application/json" } }));
    render(<SolarBillAnalyzer />);
    await reachMode(user);
    await user.click(within(screen.getByRole("heading", { name: /Recommend the best system/i }).closest("article")!).getByRole("button", { name: /Choose/i }));
    await user.click(screen.getByRole("button", { name: /Calculate Practical Bill Reduction/i }));
    expect(await screen.findByText(/Attock uses the conservative Islamabad regional solar profile/i)).toBeTruthy();
  });

  test("renders accessible 'Back to website' link targeting '/' without history dependency", () => {
    const historyBackSpy = vi.spyOn(window.history, "back");
    render(<SolarBillAnalyzer />);

    const backLink = screen.getByRole("link", { name: /Back to website/i });
    expect(backLink).toBeTruthy();
    expect(backLink.getAttribute("href")).toBe("/");
    expect(backLink.getAttribute("href")).not.toContain("/solar-bill-analyzer");
    expect(backLink.tagName.toLowerCase()).toBe("a");

    fireEvent.click(backLink);
    expect(historyBackSpy).not.toHaveBeenCalled();
  });
});
