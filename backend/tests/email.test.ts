import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQuoteEmail,
  loadQuoteEmailConfig,
  sendQuoteEmail,
  type QuoteEmailPayload,
} from "../src/services/email.js";
import { quoteSchema } from "../src/validation/quote.js";

const quote = quoteSchema.parse({
  fullName: "Test <script>alert('x')</script> Customer",
  phone: "0092 (310) 505-6394",
  email: "CUSTOMER@EXAMPLE.COM",
  city: "Attock",
  service: "Solar Energy",
  propertyType: "Home",
  systemType: "Hybrid",
  requiredCapacity: "10.8 kWp",
  message: "Please contact me. Account Number: 1234567890. Meter No: ABC12345.",
  analyzerContext: {
    source: "solar_bill_analyzer",
    utility: "IESCO",
    tariff: "A-1",
    city: "Attock",
    annualConsumptionKwh: 14_400,
    analysisMode: "both",
    selectedArchitecture: "On-Grid Only",
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
});

const environment = {
  RESEND_API_KEY: "re_test_key",
  QUOTE_TO_EMAIL: "quotes@electrotech.test",
  QUOTE_FROM_EMAIL: "Electrotech Website <website@send.electrotech.test>",
};

test("Resend delivery uses configured recipient/sender and visitor email only as reply-to", async () => {
  let usedApiKey = "";
  let payload: QuoteEmailPayload | undefined;
  const result = await sendQuoteEmail(quote, {
    environment,
    createClient(apiKey) {
      usedApiKey = apiKey;
      return {
        emails: {
          async send(value) {
            payload = value;
            return { data: { id: "email_accepted_123" }, error: null };
          },
        },
      };
    },
  });

  assert.deepEqual(result, { id: "email_accepted_123" });
  assert.equal(usedApiKey, "re_test_key");
  assert.deepEqual(payload?.to, ["quotes@electrotech.test"]);
  assert.equal(payload?.from, "Electrotech Website <website@send.electrotech.test>");
  assert.equal(payload?.replyTo, "customer@example.com");
  assert.equal(payload?.subject, "New Solar Quote Request — Electrotech");
});

test("email includes structured analyzer context, escapes HTML, and redacts bill identifiers", () => {
  const content = buildQuoteEmail(quote);
  assert.match(content.text, /Analyzer recommended architecture: Hybrid \+ Green Meter \+ Battery/);
  assert.match(content.text, /Analyzer PV capacity: 10\.8 kWp/);
  assert.match(content.text, /Analyzer inverter: 10 kW/);
  assert.match(content.text, /Analyzer battery: 10\.24 kWh/);
  assert.match(content.text, /Analyzer annual consumption: 14,400 kWh/);
  assert.match(content.text, /Bill extraction confidence: High/);
  assert.doesNotMatch(content.text, /1234567890|ABC12345/);
  assert.doesNotMatch(content.html, /<script>/i);
  assert.match(content.html, /&lt;script&gt;/);
});

test("email configuration rejects missing values and header injection", () => {
  assert.deepEqual(loadQuoteEmailConfig(environment), {
    apiKey: "re_test_key",
    toEmail: "quotes@electrotech.test",
    fromEmail: "Electrotech Website <website@send.electrotech.test>",
  });
  assert.throws(() => loadQuoteEmailConfig({}), /not configured/);
  assert.throws(
    () => loadQuoteEmailConfig({
      ...environment,
      QUOTE_TO_EMAIL: "quotes@electrotech.test\r\nBcc: attacker@example.test",
    }),
    /not configured/,
  );
  assert.throws(
    () => loadQuoteEmailConfig({
      ...environment,
      QUOTE_FROM_EMAIL: "Electrotech <website@send.electrotech.test>, attacker@example.test",
    }),
    /not configured/,
  );
});

test("unrecognized analyzer fields are rejected before delivery", () => {
  const result = quoteSchema.safeParse({
    ...quote,
    analyzerContext: { ...quote.analyzerContext, accountNumber: "1234567890" },
  });
  assert.equal(result.success, false);
});
