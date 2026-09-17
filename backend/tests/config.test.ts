import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OPERATIONAL_CONFIG, loadRuntimeConfig } from "../src/config.js";

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
