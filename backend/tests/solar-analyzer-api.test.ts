import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";
import type { RuntimeConfig } from "../src/config.js";
import { BillUploadError, MAX_BILL_FILE_BYTES, validateBillUpload } from "../src/services/bill-upload.js";
import { classifyGeminiProviderFailure, GeminiExtractionError, loadGeminiConfig, parseGeminiExtraction } from "../src/services/gemini.js";
import type { BillExtraction } from "../src/validation/solar-analyzer.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.clear();
});

const extraction: BillExtraction = {
  provider: "IESCO",
  city: "Islamabad",
  tariffCategory: "A-1",
  connectionType: "Residential",
  phase: "single",
  sanctionedLoadKw: 5,
  mdiKw: null,
  consumerCategory: "A-1",
  currentBillYear: 2026,
  currentBillMonth: 12,
  currentMonthConsumptionKwh: 420,
  currentBillAmountPkr: 24_000,
  touStatus: "no",
  peakUnitsKwh: null,
  offPeakUnitsKwh: null,
  importUnitsKwh: null,
  exportUnitsKwh: null,
  greenMeterStatus: "no",
  existingProsumerStatus: "no",
  prosumerAgreementDate: null,
  monthlyConsumption: Array.from({ length: 12 }, (_, index) => ({ year: 2026, month: index + 1, kwh: 400 + index, confidence: "high" as const })),
  uncertainFields: [],
};

async function startApi(options: {
  extractBill?: () => Promise<BillExtraction>;
  useDefaultExtractor?: boolean;
  config?: Partial<Pick<RuntimeConfig, "geminiTimeoutMs" | "solarAnalyzerMaxFileMb" | "solarAnalyzerMaxFileBytes" | "solarAnalyzerExtractRateLimitMax" | "solarAnalyzerCalculateRateLimitMax">>;
} = {}) {
  const app = createApp({
    config: { nodeEnv: "test", frontendOrigin: "http://localhost:3000", ...options.config },
    ...(options.extractBill
      ? { extractBill: options.extractBill }
      : options.useDefaultExtractor
        ? {}
        : { extractBill: async () => extraction }),
  });
  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function formFor(name: string, type: string, bytes: Uint8Array): FormData {
  const form = new FormData();
  form.set("bill", new File([bytes.slice().buffer as ArrayBuffer], name, { type }));
  return form;
}

const pdf = new TextEncoder().encode("%PDF-1.7\nminimal-test");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

test("accepts validated PDF, JPEG and PNG uploads with mocked Gemini extraction", async () => {
  for (const [name, type, bytes] of [
    ["bill.pdf", "application/pdf", pdf],
    ["bill.jpg", "image/jpeg", jpeg],
    ["bill.png", "image/png", png],
  ] as const) {
    const baseUrl = await startApi();
    const response = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor(name, type, bytes) });
    assert.equal(response.status, 200);
    const body = await response.json() as { extraction: BillExtraction; billAnalysisConfidence: string };
    assert.equal(body.extraction.provider, "IESCO");
    assert.equal(body.billAnalysisConfidence, "High");
  }
});

test("marks recommendation data incomplete when the extracted installation city is missing", async () => {
  const baseUrl = await startApi({ extractBill: async () => ({ ...extraction, city: null }) });
  const response = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor("bill.pdf", "application/pdf", pdf) });
  assert.equal(response.status, 200);
  const body = await response.json() as { extraction: BillExtraction; recommendationData: string };
  assert.equal(body.extraction.city, null);
  assert.equal(body.recommendationData, "Incomplete");
});

test("rejects unsupported, signature-mismatched and oversized uploads", async () => {
  const baseUrl = await startApi();
  const unsupported = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor("bill.txt", "text/plain", pdf) });
  assert.equal(unsupported.status, 415);

  const mismatch = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor("bill.pdf", "application/pdf", png) });
  assert.equal(mismatch.status, 415);

  const oversized = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
    method: "POST",
    body: formFor("bill.pdf", "application/pdf", new Uint8Array(MAX_BILL_FILE_BYTES + 1).fill(1).map((value, index) => index < pdf.length ? pdf[index]! : value)),
  });
  assert.equal(oversized.status, 413);
});

test("enforces upload MIME compatibility and signature security", async () => {
  const makeFile = (originalname: string, mimetype: string, bytes: Uint8Array): Express.Multer.File => ({
    fieldname: "bill",
    originalname,
    encoding: "7bit",
    mimetype,
    size: bytes.length,
    buffer: Buffer.from(bytes),
    stream: null as never,
    destination: "",
    filename: originalname,
    path: "",
  });

  // .jpg + image/jpeg + JPEG bytes → accept
  assert.equal(validateBillUpload(makeFile("bill.jpg", "image/jpeg", jpeg)).mimeType, "image/jpeg");
  // .jpg + image/pjpeg + JPEG bytes → accept
  assert.equal(validateBillUpload(makeFile("bill.jpg", "image/pjpeg", jpeg)).mimeType, "image/jpeg");
  // .jpg + image/jpg + JPEG bytes → accept
  assert.equal(validateBillUpload(makeFile("bill.jpg", "image/jpg", jpeg)).mimeType, "image/jpeg");
  // .jpg + application/octet-stream + JPEG bytes → accept
  assert.equal(validateBillUpload(makeFile("bill.jpg", "application/octet-stream", jpeg)).mimeType, "image/jpeg");
  // .jpg + empty MIME + JPEG bytes → accept where upload layer permits
  assert.equal(validateBillUpload(makeFile("bill.jpg", "", jpeg)).mimeType, "image/jpeg");
  // .jpg + image/png + JPEG bytes → reject
  assert.throws(
    () => validateBillUpload(makeFile("bill.jpg", "image/png", jpeg)),
    (err: unknown) => err instanceof BillUploadError && err.code === "mismatch",
  );
  // .png + image/jpeg + PNG bytes → reject
  assert.throws(
    () => validateBillUpload(makeFile("bill.png", "image/jpeg", png)),
    (err: unknown) => err instanceof BillUploadError && err.code === "mismatch",
  );
  // .pdf + application/pdf + PDF signature → accept
  assert.equal(validateBillUpload(makeFile("bill.pdf", "application/pdf", pdf)).mimeType, "application/pdf");
  // fake .pdf with JPEG bytes → reject
  assert.throws(
    () => validateBillUpload(makeFile("bill.pdf", "application/pdf", jpeg)),
    (err: unknown) => err instanceof BillUploadError && err.code === "mismatch",
  );

  // HTTP endpoint verification
  const baseUrl = await startApi({ config: { solarAnalyzerExtractRateLimitMax: 50 } });
  for (const [name, type, bytes] of [
    ["bill.jpg", "image/pjpeg", jpeg],
    ["bill.jpg", "image/jpg", jpeg],
    ["bill.jpg", "application/octet-stream", jpeg],
    ["bill.pdf", "application/pdf", pdf],
  ] as const) {
    const res = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor(name, type, bytes) });
    assert.equal(res.status, 200, `Upload should accept ${name} with ${type}`);
  }
  for (const [name, type, bytes] of [
    ["bill.jpg", "image/png", jpeg],
    ["bill.png", "image/jpeg", png],
    ["bill.pdf", "application/pdf", jpeg],
  ] as const) {
    const res = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor(name, type, bytes) });
    assert.equal(res.status, 415, `Upload should reject ${name} with ${type}`);
  }
});

test("rejects missing and malformed multipart requests safely", async () => {
  const baseUrl = await startApi();
  const missing = await fetch(`${baseUrl}/api/solar-analyzer/extract`, { method: "POST", body: new FormData() });
  assert.equal(missing.status, 400);
  const malformed = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=broken" },
    body: "--broken\r\nContent-Disposition: form-data; name=\"bill\"; filename=\"bill.pdf\"",
  });
  assert.equal(malformed.status, 400);
});

test("maps mocked Gemini timeout and invalid-output failures to safe responses", async () => {
  const timeoutUrl = await startApi({ extractBill: async () => { throw new GeminiExtractionError("timeout", "private detail"); } });
  const timeout = await fetch(`${timeoutUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor("bill.pdf", "application/pdf", pdf) });
  assert.equal(timeout.status, 504);
  assert.doesNotMatch(JSON.stringify(await timeout.json()), /private detail/);

  assert.throws(() => parseGeminiExtraction({ provider: "IESCO" }), /invalid response/);
});

test("strips PII and preserves missing and uncertain extraction values", () => {
  const parsed = parseGeminiExtraction({
    ...extraction,
    customerName: "Must not leave server validation",
    accountNumber: "Must not leave server validation",
    provider: null,
    monthlyConsumption: [{ year: 2026, month: 1, kwh: null, confidence: "low" }],
    currentMonthConsumptionKwh: 420,
    uncertainFields: ["monthlyConsumption.0.kwh"],
  });
  assert.equal("customerName" in parsed, false);
  assert.equal("accountNumber" in parsed, false);
  assert.equal(parsed.provider, null);
  assert.equal(parsed.monthlyConsumption[0]?.kwh, null);
});

test("keeps provider and city separate and preserves extracted calculation fields", () => {
  const parsed = parseGeminiExtraction({
    ...extraction,
    provider: "GEPCO",
    city: null,
    currentBillYear: 2026,
    currentBillMonth: 12,
    currentMonthConsumptionKwh: 420,
    touStatus: "yes",
    peakUnitsKwh: 120,
    offPeakUnitsKwh: 300,
    importUnitsKwh: 420,
    exportUnitsKwh: 75,
    monthlyConsumption: extraction.monthlyConsumption.slice(0, 11),
  });
  assert.equal(parsed.provider, "GEPCO");
  assert.equal(parsed.city, null);
  assert.equal(parsed.touStatus, "yes");
  assert.equal(parsed.sanctionedLoadKw, 5);
  assert.equal(parsed.monthlyConsumption.at(-1)?.month, 12);
  assert.equal(parsed.monthlyConsumption.at(-1)?.kwh, 420);
});

test("enforces process-local rate limiting before paid extraction", async () => {
  let extractorCalled = false;
  const baseUrl = await startApi({ extractBill: async () => { extractorCalled = true; return extraction; } });
  for (let index = 0; index < 3; index += 1) {
    const allowed = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
      method: "POST",
      headers: { "x-forwarded-for": "198.51.100.12" },
      body: formFor("bill.pdf", "application/pdf", pdf),
    });
    assert.equal(allowed.status, 200);
  }
  extractorCalled = false;
  const limited = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.12" },
    body: formFor("bill.pdf", "application/pdf", pdf),
  });
  assert.equal(limited.status, 429);
  assert.equal(extractorCalled, false);
});

test("applies configured upload, extraction and calculation limits", async () => {
  const baseUrl = await startApi({
    config: {
      solarAnalyzerMaxFileMb: 1,
      solarAnalyzerMaxFileBytes: 1024 * 1024,
      solarAnalyzerExtractRateLimitMax: 1,
      solarAnalyzerCalculateRateLimitMax: 1,
    },
  });
  const upload = () => fetch(`${baseUrl}/api/solar-analyzer/extract`, {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.61" },
    body: formFor("bill.pdf", "application/pdf", pdf),
  });
  assert.equal((await upload()).status, 200);
  assert.equal((await upload()).status, 429);

  const oversized = new Uint8Array(1024 * 1024 + 1);
  oversized.set(pdf);
  const oversizedResponse = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.62" },
    body: formFor("bill.pdf", "application/pdf", oversized),
  });
  assert.equal(oversizedResponse.status, 413);
  assert.match((await oversizedResponse.json() as { message: string }).message, /1 MB/);

  const calculate = () => fetch(`${baseUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.63" },
    body: JSON.stringify({
      provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", consumerCategory: "residential",
      protectedStatus: "non_protected", sanctionedLoadKw: 5, touStatus: "no", greenMeterStatus: "no",
      prosumerStatus: "none", usagePattern: "mostly_daytime", gridReliability: "reliable",
      existingSolar: { status: "no" }, analysisMode: "recommend", panelWattage: 585,
      monthlyConsumption: extraction.monthlyConsumption,
    }),
  });
  assert.equal((await calculate()).status, 200);
  assert.equal((await calculate()).status, 429);
});

test("calculates from verified non-PII JSON and validates bad requests", async () => {
  const baseUrl = await startApi();
  const valid = await fetch(`${baseUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", consumerCategory: "residential",
      protectedStatus: "non_protected", phase: "single", sanctionedLoadKw: 5, mdiKw: null,
      touStatus: "no", peakUnitsKwh: null, offPeakUnitsKwh: null, greenMeterStatus: "no",
      prosumerStatus: "none", usagePattern: "mostly_daytime", gridReliability: "reliable",
      existingSolar: { status: "no", pvKwp: null }, analysisMode: "recommend", selectedArchitecture: null,
      panelWattage: 585, monthlyConsumption: extraction.monthlyConsumption,
    }),
  });
  assert.equal(valid.status, 200);
  const result = await valid.json() as { bestRecommended: { architecture: string; actualInstalledKwp: number } };
  assert.notEqual(result.bestRecommended.architecture, "Off-Grid");
  assert.ok(result.bestRecommended.actualInstalledKwp > 0);

  const invalid = await fetch(`${baseUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ city: "", monthlyConsumption: [] }),
  });
  assert.equal(invalid.status, 400);
});

test("allows partial extraction but blocks full calculation until twelve unique months exist", async () => {
  const partialExtraction = { ...extraction, monthlyConsumption: extraction.monthlyConsumption.slice(0, 11) };
  const extractionUrl = await startApi({ extractBill: async () => partialExtraction });
  const extracted = await fetch(`${extractionUrl}/api/solar-analyzer/extract`, { method: "POST", body: formFor("bill.pdf", "application/pdf", pdf) });
  assert.equal(extracted.status, 200);
  assert.equal((await extracted.json() as { recommendationData: string }).recommendationData, "Incomplete");

  const request = (monthlyConsumption: BillExtraction["monthlyConsumption"]) => fetch(`${extractionUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.44" },
    body: JSON.stringify({
      provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", consumerCategory: "residential",
      protectedStatus: "non_protected", sanctionedLoadKw: 5, touStatus: "no", greenMeterStatus: "no",
      prosumerStatus: "none", usagePattern: "mostly_daytime", gridReliability: "reliable",
      existingSolar: { status: "no" }, analysisMode: "recommend", panelWattage: 585, monthlyConsumption,
    }),
  });

  for (const incomplete of [partialExtraction.monthlyConsumption, partialExtraction.monthlyConsumption.slice(0, 1)]) {
    const response = await request(incomplete);
    assert.equal(response.status, 422);
    const body = await response.json() as { code: string; missingFields: string[]; bestRecommended?: unknown };
    assert.equal(body.code, "incomplete_monthly_consumption");
    assert.deepEqual(body.missingFields, ["12 unique monthly consumption readings"]);
    assert.equal(body.bestRecommended, undefined);
  }

  const duplicate = [...partialExtraction.monthlyConsumption, partialExtraction.monthlyConsumption[0]!];
  assert.equal((await request(duplicate)).status, 422);
  assert.equal((await request(extraction.monthlyConsumption)).status, 200);
});

test("blocks exact recommendations until billing-critical tariff inputs are resolved", async () => {
  const baseUrl = await startApi();
  const request = async (overrides: Record<string, unknown>) => fetch(`${baseUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" },
    body: JSON.stringify({
      provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", consumerCategory: "residential",
      protectedStatus: "non_protected", sanctionedLoadKw: 5, mdiKw: null, touStatus: "no",
      greenMeterStatus: "no", prosumerStatus: "none", usagePattern: "mostly_daytime", gridReliability: "reliable",
      existingSolar: { status: "no" }, analysisMode: "recommend", panelWattage: 585,
      monthlyConsumption: extraction.monthlyConsumption,
      ...overrides,
    }),
  });

  const unresolvedTariff = await request({ tariffCategory: null, consumerCategory: "unknown", protectedStatus: "unknown" });
  assert.equal(unresolvedTariff.status, 422);
  const tariffBody = await unresolvedTariff.json() as { missingFields: string[]; bestRecommended?: unknown };
  assert.deepEqual(tariffBody.missingFields, ["Consumer tariff"]);
  assert.equal(tariffBody.bestRecommended, undefined);

  const unresolvedStatus = await request({ protectedStatus: "unknown" });
  assert.equal(unresolvedStatus.status, 422);
  assert.deepEqual((await unresolvedStatus.json() as { missingFields: string[] }).missingFields, ["Residential status"]);

  const unresolvedIndustrial = await request({ tariffCategory: "Industrial", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100 });
  assert.equal(unresolvedIndustrial.status, 422);
  assert.deepEqual((await unresolvedIndustrial.json() as { missingFields: string[] }).missingFields, ["Consumer tariff"]);

  const missingIndustrialMdi = await request({ tariffCategory: "B-2", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: null });
  assert.equal(missingIndustrialMdi.status, 422);
  assert.deepEqual((await missingIndustrialMdi.json() as { missingFields: string[] }).missingFields, ["Maximum demand / MDI (kW)"]);

  const missingIndustrialTou = await request({ tariffCategory: "B-1", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 20, touStatus: "yes", peakUnitsKwh: null, offPeakUnitsKwh: null });
  assert.equal(missingIndustrialTou.status, 422);
  assert.deepEqual((await missingIndustrialTou.json() as { missingFields: string[] }).missingFields, ["Industrial TOU peak units (kWh)", "Industrial TOU off-peak units (kWh)"]);

  const unsupportedDate = await request({ tariffCategory: "B-1", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 20, tariffEffectiveDate: "2026-02-11" });
  assert.equal(unsupportedDate.status, 422);
  assert.deepEqual((await unsupportedDate.json() as { missingFields: string[] }).missingFields, ["Supported tariff effective date"]);

  const resolved = await request({});
  assert.equal(resolved.status, 200);
  assert.ok((await resolved.json() as { bestRecommended: unknown }).bestRecommended);

  const resolvedIndustrial = await request({ tariffCategory: "B-2", connectionType: "Industrial", consumerCategory: "industrial", protectedStatus: "unknown", sanctionedLoadKw: 100, mdiKw: 60 });
  assert.equal(resolvedIndustrial.status, 200);
  const industrialBody = await resolvedIndustrial.json() as { tariffDetails: { tariffCode: string; sourceReference: string; utilityGroup: string } };
  assert.deepEqual(industrialBody.tariffDetails, { tariffCode: "B-2", sourceReference: "S.R.O. 279(I)/2026", utilityGroup: "XWDISCO", usage: "Current Reference Tariff", tariffName: "B-2 Industrial Supply", version: "2026.02", effectiveFrom: "2026-02-12", effectiveTo: null, utility: "IESCO", source: "NEPRA", modeledComponents: ["Base energy charges", "TOU energy charges where applicable", "Fixed/demand charges where supported", "Export credits where applicable"], notModeledComponents: ["Fuel Charges Adjustments (FCA)", "Quarterly/periodic tariff adjustments (QTA)", "Taxes and duties", "Other bill-specific adjustments"] });
});

test("limits calculations to twenty requests per client per 30 minutes", async () => {
  const baseUrl = await startApi();
  const request = () => fetch(`${baseUrl}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.20" },
    body: JSON.stringify({
      provider: "IESCO", city: "Islamabad", tariffCategory: "A-1", consumerCategory: "residential", protectedStatus: "non_protected", sanctionedLoadKw: 5, touStatus: "no",
      greenMeterStatus: "no", prosumerStatus: "none", usagePattern: "mostly_daytime", gridReliability: "reliable",
      existingSolar: { status: "no" }, analysisMode: "recommend", panelWattage: 585,
      monthlyConsumption: extraction.monthlyConsumption,
    }),
  });
  for (let index = 0; index < 20; index += 1) assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
});

test("loads the stable Gemini model from server environment only", () => {
  assert.deepEqual(
    loadGeminiConfig({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3.6-flash" }),
    { apiKey: "test-key", model: "gemini-3.6-flash" },
  );
  assert.throws(() => loadGeminiConfig({}), /not configured/);
  assert.throws(
    () => loadGeminiConfig({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-flash-latest" }),
    /stable model identifier/,
  );
});

test("classifies Gemini provider failures without exposing provider details", () => {
  assert.equal(classifyGeminiProviderFailure({ status: 401 }), "authentication");
  assert.equal(classifyGeminiProviderFailure({ status: 404 }), "model_access");
  assert.equal(classifyGeminiProviderFailure({ status: 429 }), "quota");
  assert.equal(classifyGeminiProviderFailure(new Error("request timed out")), "timeout");
  assert.equal(classifyGeminiProviderFailure(new Error("private provider detail")), "provider_error");
});

test("missing Gemini configuration fails safely without destabilizing the API", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  try {
    const baseUrl = await startApi({ useDefaultExtractor: true });
    const response = await fetch(`${baseUrl}/api/solar-analyzer/extract`, {
      method: "POST",
      body: formFor("bill.pdf", "application/pdf", pdf),
    });
    assert.equal(response.status, 503);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});
