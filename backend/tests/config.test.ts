import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OPERATIONAL_CONFIG, loadRuntimeConfig, loadSupabaseConfig, SupabaseConfigError } from "../src/config.js";

test("preserves operational defaults when overrides are unset", () => {
  const config = loadRuntimeConfig({ NODE_ENV: "test" });
  assert.equal(config.geminiTimeoutMs, 45_000);
  assert.equal(config.solarAnalyzerMaxFileMb, 10);
  assert.equal(config.solarAnalyzerMaxFileBytes, 10 * 1024 * 1024);
  assert.equal(config.solarAnalyzerExtractRateLimitMax, 3);
  assert.equal(config.solarAnalyzerCalculateRateLimitMax, 20);
  assert.equal(config.quoteRateLimitMax, 5);
  assert.equal(DEFAULT_OPERATIONAL_CONFIG.geminiTimeoutMs, 45_000);
});

test("applies valid operational overrides", () => {
  const config = loadRuntimeConfig({
    NODE_ENV: "test",
    GEMINI_TIMEOUT_MS: "12000",
    SOLAR_ANALYZER_MAX_FILE_MB: "4",
    SOLAR_ANALYZER_EXTRACT_RATE_LIMIT_MAX: "7",
    SOLAR_ANALYZER_CALCULATE_RATE_LIMIT_MAX: "31",
    QUOTE_RATE_LIMIT_MAX: "9",
  });
  assert.equal(config.geminiTimeoutMs, 12_000);
  assert.equal(config.solarAnalyzerMaxFileBytes, 4 * 1024 * 1024);
  assert.equal(config.solarAnalyzerExtractRateLimitMax, 7);
  assert.equal(config.solarAnalyzerCalculateRateLimitMax, 31);
  assert.equal(config.quoteRateLimitMax, 9);
});

test("rejects invalid, zero, negative, non-finite and fractional count overrides", () => {
  for (const [name, value] of [
    ["GEMINI_TIMEOUT_MS", "invalid"],
    ["GEMINI_TIMEOUT_MS", "Infinity"],
    ["SOLAR_ANALYZER_MAX_FILE_MB", "0"],
    ["SOLAR_ANALYZER_MAX_FILE_MB", "-1"],
    ["SOLAR_ANALYZER_EXTRACT_RATE_LIMIT_MAX", "1.5"],
    ["SOLAR_ANALYZER_CALCULATE_RATE_LIMIT_MAX", "0"],
    ["QUOTE_RATE_LIMIT_MAX", "-2"],
  ] as const) {
    assert.throws(() => loadRuntimeConfig({ NODE_ENV: "test", [name]: value }), new RegExp(name));
  }
});

test("loads valid Supabase configuration", () => {
  const config = loadSupabaseConfig({
    NODE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "test-secret-value",
  });
  assert.equal(config.supabaseUrl, "https://example.supabase.co");
  assert.equal(config.supabaseSecretKey, "test-secret-value");
});

test("allows http for Supabase URL in non-production", () => {
  const config = loadSupabaseConfig({
    NODE_ENV: "development",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SECRET_KEY: "test-secret-value",
  });
  assert.equal(config.supabaseUrl, "http://localhost:54321");
});

test("rejects missing or empty Supabase configuration", () => {
  assert.throws(
    () => loadSupabaseConfig({ SUPABASE_URL: "", SUPABASE_SECRET_KEY: "secret" }),
    (err: unknown) => err instanceof SupabaseConfigError && err.message.includes("SUPABASE_URL is required"),
  );
  assert.throws(
    () => loadSupabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "" }),
    (err: unknown) => err instanceof SupabaseConfigError && err.message.includes("SUPABASE_SECRET_KEY is required"),
  );
  assert.throws(
    () => loadSupabaseConfig({}),
    (err: unknown) => err instanceof SupabaseConfigError,
  );
});

test("rejects malformed Supabase URL or non-HTTPS in production", () => {
  assert.throws(
    () => loadSupabaseConfig({
      NODE_ENV: "production",
      SUPABASE_URL: "not-a-valid-url",
      SUPABASE_SECRET_KEY: "secret",
    }),
    (err: unknown) => err instanceof SupabaseConfigError && err.message.includes("valid URL"),
  );

  assert.throws(
    () => loadSupabaseConfig({
      NODE_ENV: "production",
      SUPABASE_URL: "http://example.supabase.co",
      SUPABASE_SECRET_KEY: "secret",
    }),
    (err: unknown) => err instanceof SupabaseConfigError && err.message.includes("HTTPS in production"),
  );
});

test("ensures error messages never echo the secret key", () => {
  const secret = "super-secret-key-12345";
  try {
    loadSupabaseConfig({
      NODE_ENV: "production",
      SUPABASE_URL: "not-a-valid-url",
      SUPABASE_SECRET_KEY: secret,
    });
    assert.fail("Should have thrown");
  } catch (err) {
    const message = (err as Error).message;
    assert.equal(message.includes(secret), false);
  }
});
