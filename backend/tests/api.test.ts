import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";
import type { QuoteEmailSender } from "../src/services/email.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) => new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    ),
  );
  servers.clear();
});

async function startApi(options: {
  nodeEnv?: string;
  frontendOrigin?: string;
  sendQuoteEmail?: QuoteEmailSender;
  useDefaultEmailSender?: boolean;
  quoteRateLimitMax?: number;
} = {}) {
  const config = {
    nodeEnv: options.nodeEnv ?? "test",
    ...(options.quoteRateLimitMax ? { quoteRateLimitMax: options.quoteRateLimitMax } : {}),
    ...(options.frontendOrigin ? { frontendOrigin: options.frontendOrigin } : {}),
  };
  const server = createApp({
    config,
    ...(options.useDefaultEmailSender
      ? {}
      : { sendQuoteEmail: options.sendQuoteEmail ?? (async () => ({ id: "email_test_123" })) }),
  }).listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const validQuote = {
  fullName: "Test Customer",
  phone: "0092 (310) 505-6394",
  city: "Attock",
  service: "Solar Energy",
  email: "CUSTOMER@EXAMPLE.COM",
  company: "",
  propertyType: "Home",
  systemType: "Hybrid",
  requiredCapacity: "10 kW",
  monthlyBillRange: "PKR 25,000–50,000",
  message: "Solar Bill Analyzer preliminary result: 10.8 kWp Hybrid; 10 kW inverter; battery 10–15 kWh. Location: Attock. Annual consumption: 14,400 kWh.",
  analyzerContext: {
    source: "solar_bill_analyzer",
    utility: "IESCO",
    tariff: "A-1",
    city: "Attock",
    annualConsumptionKwh: 14_400,
    analysisMode: "recommend",
    selectedArchitecture: null,
    recommendedArchitecture: "Hybrid + Green Meter + Battery",
    pvCapacityKwp: 10.8,
    panels: 19,
    inverterKw: 10,
    battery: "10.24 kWh",
    estimatedBillReductionPercent: 72.4,
    estimatedRemainingBillPkr: 118_000,
    greenMeterStatus: "yes",
    backupRequirement: "essential · 4 hours",
    confidence: { billExtraction: "High", tariffPolicy: "High", recommendation: "Medium" },
  },
  website: "",
};

test("GET /api/health returns HTTP 200 without external services", async () => {
  const response = await fetch(`${await startApi()}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("POST /api/quote preserves validation and honeypot behavior", async () => {
  const baseUrl = await startApi();
  const response = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validQuote, website: "spam.example" }),
  });
  const body = (await response.json()) as { message: string; issues: Record<string, string[]> };
  assert.equal(response.status, 400);
  assert.equal(body.message, "Please review the highlighted fields.");
  assert.deepEqual(body.issues.website, ["Invalid submission"]);
});

test("POST /api/quote rejects malformed and oversized JSON", async () => {
  const baseUrl = await startApi();
  const malformed = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { message: "Invalid request." });

  const oversized = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(17_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { message: "Request is too large." });
});

test("POST /api/quote waits for email acceptance and returns a WhatsApp secondary handoff", async () => {
  let deliveredQuote: Parameters<QuoteEmailSender>[0] | undefined;
  const baseUrl = await startApi({
    sendQuoteEmail: async (quote) => {
      deliveredQuote = quote;
      return { id: "email_accepted" };
    },
  });
  const response = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" },
    body: JSON.stringify(validQuote),
  });
  const body = (await response.json()) as {
    ok: boolean;
    message: string;
    handoff: { channel: string; message: string };
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.handoff.channel, "whatsapp");
  assert.equal(body.message, "Your request has been sent successfully.");
  assert.equal(deliveredQuote?.email, "customer@example.com");
  assert.equal(deliveredQuote?.analyzerContext?.annualConsumptionKwh, 14_400);
  assert.match(body.handoff.message, /Phone: \+923105056394/);
  assert.match(body.handoff.message, /Hybrid \+ Green Meter \+ Battery/);
  assert.match(body.handoff.message, /10\.8 kWp/);
  assert.match(body.handoff.message, /10 kW inverter/);
  assert.match(body.handoff.message, /Battery: 10\.24 kWh/);
  assert.doesNotMatch(body.handoff.message, /account|meter number|consumer number/i);
});

test("invalid quote submissions are rejected before email delivery", async () => {
  let emailCalled = false;
  const baseUrl = await startApi({
    sendQuoteEmail: async () => {
      emailCalled = true;
      return { id: "must_not_send" };
    },
  });
  const response = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validQuote, email: "invalid-address" }),
  });
  assert.equal(response.status, 400);
  assert.equal(emailCalled, false);
});

test("production CORS permits only the configured frontend origin", async () => {
  const baseUrl = await startApi({ nodeEnv: "production", frontendOrigin: "https://electrotech-frontend.example" });
  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { origin: "https://electrotech-frontend.example" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://electrotech-frontend.example");

  const preflight = await fetch(`${baseUrl}/api/quote`, {
    method: "OPTIONS",
    headers: {
      origin: "https://electrotech-frontend.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://electrotech-frontend.example");

  const rejected = await fetch(`${baseUrl}/api/health`, { headers: { origin: "https://untrusted.example" } });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("POST /api/quote limits each client to five handoffs per 30 minutes", async () => {
  const baseUrl = await startApi();
  const request = () => fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
    body: JSON.stringify(validQuote),
  });
  for (let index = 0; index < 5; index += 1) assert.equal((await request()).status, 200);
  const limited = await request();
  assert.equal(limited.status, 429);
  assert.match(JSON.stringify(await limited.json()), /Too many recent requests/);
});

test("POST /api/quote applies the configured handoff limit", async () => {
  const baseUrl = await startApi({ quoteRateLimitMax: 1 });
  const request = () => fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(validQuote),
  });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 429);
});

test("email delivery failure returns a safe failure and keeps WhatsApp available", async () => {
  const diagnostics: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => diagnostics.push(values);
  try {
    const baseUrl = await startApi({ sendQuoteEmail: async () => { throw new Error("provider-private-detail"); } });
    const response = await fetch(`${baseUrl}/api/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validQuote),
    });
    const body = await response.json() as { message: string; handoff: { channel: string; message: string }; ok?: boolean };
    assert.equal(response.status, 503);
    assert.equal(body.ok, undefined);
    assert.equal(body.message, "We couldn't send your request right now. Please try again or contact us on WhatsApp.");
    assert.equal(body.handoff.channel, "whatsapp");
    assert.doesNotMatch(JSON.stringify(body), /provider-private-detail/);
    assert.doesNotMatch(JSON.stringify(diagnostics), /provider-private-detail/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("missing Resend configuration fails safely while health remains available", async () => {
  const names = ["RESEND_API_KEY", "QUOTE_TO_EMAIL", "QUOTE_FROM_EMAIL"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const baseUrl = await startApi({ useDefaultEmailSender: true });
    const response = await fetch(`${baseUrl}/api/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validQuote),
    });
    assert.equal(response.status, 503);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
  } finally {
    console.error = originalConsoleError;
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
