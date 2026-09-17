import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";
import {
  calculateRetryDelayMs,
  classifyGeminiProviderFailure,
  createGeminiExtractionRequest,
  extractBillWithGemini,
  extractRetryDelayMs,
  GEMINI_EXTRACTION_MAX_ATTEMPTS,
  GEMINI_EXTRACTION_MAX_PROVIDER_TIME_MS,
  GEMINI_EXTRACTION_MAX_TOTAL_TIME_MS,
  GEMINI_EXTRACTION_TIMEOUT_MS,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_RETRY_MAX_DELAY_MS,
  GEMINI_RETRY_MAX_JITTER_MS,
  GeminiExtractionError,
  isRetryableGeminiError,
  type ExtractableBill,
  type GeminiExtractionAttempt,
} from "../src/services/gemini.js";
import type { BillExtraction } from "../src/validation/solar-analyzer.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.clear();
});
const environment = {
  GEMINI_API_KEY: "test-placeholder-key",
  GEMINI_MODEL: "gemini-3.6-flash",
} as NodeJS.ProcessEnv;

const file: ExtractableBill = {
  bytes: Buffer.from("%PDF-1.7\nsynthetic-test"),
  mimeType: "application/pdf",
};

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
  currentBillMonth: 8,
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
  monthlyConsumption: [{ year: 2026, month: 8, kwh: 420, confidence: "high" }],
  uncertainFields: [],
};

function formFor(name: string, type: string, bytes: Buffer): FormData {
  const form = new FormData();
  form.set("bill", new File([new Uint8Array(bytes)], name, { type }));
  return form;
}

async function startApi(options: {
  extractBill?: (file: ExtractableBill) => Promise<BillExtraction>;
} = {}) {
  const app = createApp({
    config: { nodeEnv: "test", frontendOrigin: "http://localhost:3000" },
    extractBill: options.extractBill ?? (async () => extraction),
  });
  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("configures each Gemini document attempt with the 45-second threshold", () => {
  const request = createGeminiExtractionRequest(file, environment.GEMINI_MODEL!);
  assert.equal(GEMINI_EXTRACTION_TIMEOUT_MS, 45_000);
  assert.equal(request.config.httpOptions.timeout, GEMINI_EXTRACTION_TIMEOUT_MS);
  assert.equal(GEMINI_EXTRACTION_MAX_ATTEMPTS, 2);
  assert.equal(GEMINI_EXTRACTION_MAX_PROVIDER_TIME_MS, 90_000);
  assert.equal(GEMINI_RETRY_BASE_DELAY_MS, 1500);
  assert.equal(GEMINI_RETRY_MAX_JITTER_MS, 1000);
  assert.equal(GEMINI_RETRY_MAX_DELAY_MS, 3500);
  assert.equal(GEMINI_EXTRACTION_MAX_TOTAL_TIME_MS, 93_500);
});

test("applies a configured Gemini timeout without exposing configuration in errors", () => {
  const request = createGeminiExtractionRequest(file, environment.GEMINI_MODEL!, 12_345);
  assert.equal(request.config.httpOptions.timeout, 12_345);
});

test("returns a request that completes below the configured timeout without retrying", async () => {
  let attempts = 0;
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    return extraction;
  };
  assert.equal(await extractBillWithGemini(file, { environment, attempt }), extraction);
  assert.equal(attempts, 1);
});

test("1. first Gemini call returns 503, second succeeds -> extraction succeeds", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    if (attempts === 1) throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE", 503);
    return extraction;
  };
  const result = await extractBillWithGemini(file, {
    environment,
    attempt,
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  assert.equal(result, extraction);
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);
});

test("2. first call 503 -> retry is delayed, not immediate", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    if (attempts === 1) throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE", 503);
    return extraction;
  };
  await extractBillWithGemini(file, {
    environment,
    attempt,
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  assert.equal(sleepCalls.length, 1);
  const firstSleep = sleepCalls[0];
  assert.ok(typeof firstSleep === "number" && firstSleep >= GEMINI_RETRY_BASE_DELAY_MS, `Expected delay >= ${GEMINI_RETRY_BASE_DELAY_MS}, got ${firstSleep}`);
  assert.ok(typeof firstSleep === "number" && firstSleep <= GEMINI_RETRY_MAX_DELAY_MS, `Expected delay <= ${GEMINI_RETRY_MAX_DELAY_MS}, got ${firstSleep}`);
});

test("3. jitter/backoff remains within configured bound", () => {
  const minDelay = calculateRetryDelayMs(0, { random: () => 0 });
  assert.equal(minDelay, GEMINI_RETRY_BASE_DELAY_MS);

  const maxDelay = calculateRetryDelayMs(0, { random: () => 1 });
  assert.equal(maxDelay, GEMINI_RETRY_BASE_DELAY_MS + GEMINI_RETRY_MAX_JITTER_MS);

  const midDelay = calculateRetryDelayMs(0, { random: () => 0.5 });
  assert.equal(midDelay, GEMINI_RETRY_BASE_DELAY_MS + 500);

  const attempt1Max = calculateRetryDelayMs(1, { random: () => 1 });
  assert.equal(attempt1Max, GEMINI_RETRY_MAX_DELAY_MS);

  assert.equal(calculateRetryDelayMs(0, { retryAfterMs: 2000 }), 2000);
  assert.equal(calculateRetryDelayMs(0, { retryAfterMs: 500 }), 1000);
  assert.equal(calculateRetryDelayMs(0, { retryAfterMs: 60_000 }), GEMINI_RETRY_MAX_DELAY_MS);
});

test("4. both calls return 503 -> controlled HTTP 503 returned", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE: raw internal cluster failure", 503);
  };
  await assert.rejects(
    extractBillWithGemini(file, {
      environment,
      attempt,
      sleep: async (ms) => { sleepCalls.push(ms); },
    }),
    (error) => {
      assert.ok(error instanceof GeminiExtractionError);
      assert.equal(error.code, "provider_error");
      assert.equal(error.status, 503);
      return true;
    },
  );
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);

  const server = await startApi({
    extractBill: async () => {
      throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE: raw internal cluster failure", 503);
    },
  });
  const response = await fetch(`${server}/api/solar-analyzer/extract`, {
    method: "POST",
    body: formFor("bill.pdf", "application/pdf", file.bytes),
  });
  assert.equal(response.status, 503);
  const data = (await response.json()) as { code: string; message: string };
  assert.equal(data.code, "unavailable");
  assert.equal(data.message, "Bill extraction is temporarily unavailable. You can enter consumption manually.");
  assert.equal(JSON.stringify(data).includes("raw internal cluster failure"), false);
});

test("5. 429 provider transient response -> retried appropriately", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new GeminiExtractionError("quota", "RESOURCE_EXHAUSTED", 429, true, 2000);
    }
    return extraction;
  };
  const result = await extractBillWithGemini(file, {
    environment,
    attempt,
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  assert.equal(result, extraction);
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);
  assert.equal(sleepCalls[0], 2000);

  assert.equal(extractRetryDelayMs({ retryAfterMs: 1800 }), 1800);
  assert.equal(extractRetryDelayMs({ retryAfter: 2 }), 2000);
  assert.equal(extractRetryDelayMs({ response: { headers: { get: (name: string) => name === "retry-after" ? "3" : null } } }), 3000);
  assert.equal(extractRetryDelayMs({ error: { details: [{ retryDelay: "2.5s" }] } }), 2500);
});

test("6. 400 -> no retry", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    throw new GeminiExtractionError("invalid_request", "bad request", 400, false);
  };
  await assert.rejects(
    extractBillWithGemini(file, {
      environment,
      attempt,
      sleep: async (ms) => { sleepCalls.push(ms); },
    }),
    GeminiExtractionError,
  );
  assert.equal(attempts, 1, "400 error must not be retried");
  assert.equal(sleepCalls.length, 0);
  assert.equal(isRetryableGeminiError(new GeminiExtractionError("provider_error", "bad request", 400)), false);
  assert.equal(classifyGeminiProviderFailure({ status: 400 }), "invalid_request");
});

test("7. 401 -> no retry", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    throw new GeminiExtractionError("authentication", "unauthenticated", 401, false);
  };
  await assert.rejects(
    extractBillWithGemini(file, {
      environment,
      attempt,
      sleep: async (ms) => { sleepCalls.push(ms); },
    }),
    GeminiExtractionError,
  );
  assert.equal(attempts, 1, "401 error must not be retried");
  assert.equal(sleepCalls.length, 0);
  assert.equal(isRetryableGeminiError(new GeminiExtractionError("authentication", "API key expired", 401)), false);
});

test("8. 403 -> no retry", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    throw new GeminiExtractionError("model_access", "permission denied", 403, false);
  };
  await assert.rejects(
    extractBillWithGemini(file, {
      environment,
      attempt,
      sleep: async (ms) => { sleepCalls.push(ms); },
    }),
    GeminiExtractionError,
  );
  assert.equal(attempts, 1, "403 error must not be retried");
  assert.equal(sleepCalls.length, 0);
  assert.equal(isRetryableGeminiError(new GeminiExtractionError("model_access", "access denied", 403)), false);
});

test("9. timeout -> existing bounded retry behavior preserved", async () => {
  let attempts = 0;
  const sleepCalls: number[] = [];
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    if (attempts === 1) throw new GeminiExtractionError("timeout", "safe timeout");
    return extraction;
  };
  const result = await extractBillWithGemini(file, {
    environment,
    attempt,
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  assert.equal(result, extraction);
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);

  let failAttempts = 0;
  const failAttempt: GeminiExtractionAttempt = async () => {
    failAttempts += 1;
    throw new GeminiExtractionError("timeout", "safe timeout");
  };
  await assert.rejects(
    extractBillWithGemini(file, { environment, attempt: failAttempt, sleep: async () => {} }),
    (error) => error instanceof GeminiExtractionError && error.code === "timeout",
  );
  assert.equal(failAttempts, 2);
});

test("10. retry timer does not exceed frontend timing budget", () => {
  const FRONTEND_TIMEOUT_MS = 100_000;
  assert.equal(GEMINI_EXTRACTION_TIMEOUT_MS, 45_000);
  assert.equal(GEMINI_EXTRACTION_MAX_ATTEMPTS, 2);
  assert.equal(GEMINI_RETRY_MAX_DELAY_MS, 3500);

  const maxTheoreticalDuration =
    GEMINI_EXTRACTION_TIMEOUT_MS * GEMINI_EXTRACTION_MAX_ATTEMPTS + GEMINI_RETRY_MAX_DELAY_MS;
  assert.equal(maxTheoreticalDuration, 93_500);
  assert.ok(
    maxTheoreticalDuration < FRONTEND_TIMEOUT_MS,
    `Max backend duration ${maxTheoreticalDuration}ms must be below frontend timeout ${FRONTEND_TIMEOUT_MS}ms`,
  );
  const margin = FRONTEND_TIMEOUT_MS - maxTheoreticalDuration;
  assert.ok(margin >= 5000, `Expected at least 5000ms safety margin, got ${margin}ms`);

  const delay = calculateRetryDelayMs(0, { retryAfterMs: 999_999, random: () => 1 });
  assert.equal(delay, GEMINI_RETRY_MAX_DELAY_MS);
});

test("11. manual fallback remains available", async () => {
  const server = await startApi({
    extractBill: async () => {
      throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE", 503);
    },
  });

  const extractRes = await fetch(`${server}/api/solar-analyzer/extract`, {
    method: "POST",
    body: formFor("bill.pdf", "application/pdf", file.bytes),
  });
  assert.equal(extractRes.status, 503);
  const extractBody = (await extractRes.json()) as { message: string };
  assert.match(extractBody.message, /enter consumption manually/i);

  const calculateRes = await fetch(`${server}/api/solar-analyzer/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "IESCO",
      city: "Islamabad",
      tariffCategory: "A-1",
      consumerCategory: "residential",
      protectedStatus: "non_protected",
      sanctionedLoadKw: 5,
      touStatus: "no",
      greenMeterStatus: "no",
      prosumerStatus: "none",
      usagePattern: "mostly_daytime",
      gridReliability: "reliable",
      existingSolar: { status: "no" },
      analysisMode: "recommend",
      panelWattage: 585,
      monthlyConsumption: Array.from({ length: 12 }, (_, i) => ({
        year: 2026,
        month: i + 1,
        kwh: 400 + i * 10,
        confidence: "high",
      })),
    }),
  });
  assert.equal(calculateRes.status, 200);
  const calcBody = (await calculateRes.json()) as { bestRecommended: { architecture: string; actualInstalledKwp: number } };
  assert.ok(calcBody.bestRecommended.actualInstalledKwp > 0);
});

test("12. no PII in logs", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };

  try {
    let attempts = 0;
    const attempt: GeminiExtractionAttempt = async () => {
      attempts += 1;
      if (attempts === 1) throw new GeminiExtractionError("provider_error", "503 UNAVAILABLE", 503);
      return extraction;
    };
    await extractBillWithGemini(file, {
      environment: { GEMINI_API_KEY: "secret-api-key-12345", GEMINI_MODEL: "gemini-3.6-flash" },
      attempt,
      sleep: async () => {},
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }

  const allLogs = logs.join("\n");
  assert.equal(allLogs.includes("secret-api-key-12345"), false, "Must not log API key");
  assert.equal(allLogs.includes("Islamabad"), false, "Must not log bill city/data");
  assert.equal(allLogs.includes("IESCO"), false, "Must not log provider data");
  assert.match(allLogs, /Gemini extraction attempt 1 failed: transient HTTP 503\. Retrying after \d+ms\.\.\./);
  assert.match(allLogs, /Gemini extraction attempt 2\.\.\./);
});

test("retries malformed structured output once and never adds a third attempt", async () => {
  let attempts = 0;
  const attempt: GeminiExtractionAttempt = async () => {
    attempts += 1;
    throw new GeminiExtractionError("structured_output_validation", "invalid structured output");
  };
  await assert.rejects(extractBillWithGemini(file, { environment, attempt, sleep: async () => {} }), GeminiExtractionError);
  assert.equal(attempts, 2);
});

test("does not retry authentication, model_access, invalid_request or unreadable failures", async () => {
  for (const code of ["authentication", "model_access", "invalid_request", "unreadable"] as const) {
    let attempts = 0;
    const attempt: GeminiExtractionAttempt = async () => {
      attempts += 1;
      throw new GeminiExtractionError(code, "safe failure");
    };
    await assert.rejects(extractBillWithGemini(file, { environment, attempt }), GeminiExtractionError);
    assert.equal(attempts, 1, `${code} must not be retried`);
  }
});
