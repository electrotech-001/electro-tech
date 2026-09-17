const LOCAL_PORT = 3001;

export const DEFAULT_OPERATIONAL_CONFIG = Object.freeze({
  geminiTimeoutMs: 45_000,
  solarAnalyzerMaxFileMb: 10,
  solarAnalyzerExtractRateLimitMax: 3,
  solarAnalyzerCalculateRateLimitMax: 20,
  quoteRateLimitMax: 5,
});

export type RuntimeConfig = {
  nodeEnv: string;
  frontendOrigin?: string;
  port: number;
  geminiTimeoutMs: number;
  solarAnalyzerMaxFileMb: number;
  solarAnalyzerMaxFileBytes: number;
  solarAnalyzerExtractRateLimitMax: number;
  solarAnalyzerCalculateRateLimitMax: number;
  quoteRateLimitMax: number;
};

function parsePositiveNumber(
  value: string | undefined,
  name: string,
  fallback: number,
  options: { integer?: boolean } = {},
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (options.integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be a positive${options.integer ? " integer" : " finite number"}.`);
  }
  return parsed;
}

function parsePort(value: string | undefined): number {
  if (!value) return LOCAL_PORT;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parseOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const url = new URL(value);
  if (url.origin !== value || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("FRONTEND_ORIGIN must be a complete origin without a path.");
  }

  return url.origin;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = environment.NODE_ENV || "development";
  const frontendOrigin = parseOrigin(environment.FRONTEND_ORIGIN);

  if (nodeEnv === "production" && !frontendOrigin) {
    throw new Error("FRONTEND_ORIGIN is required when NODE_ENV=production.");
  }

  const solarAnalyzerMaxFileMb = parsePositiveNumber(
    environment.SOLAR_ANALYZER_MAX_FILE_MB,
    "SOLAR_ANALYZER_MAX_FILE_MB",
    DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerMaxFileMb,
  );
  const solarAnalyzerMaxFileBytes = solarAnalyzerMaxFileMb * 1024 * 1024;
  if (!Number.isSafeInteger(solarAnalyzerMaxFileBytes)) {
    throw new Error("SOLAR_ANALYZER_MAX_FILE_MB must convert to a safe whole-byte value.");
  }

  return {
    nodeEnv,
    port: parsePort(environment.PORT),
    geminiTimeoutMs: parsePositiveNumber(environment.GEMINI_TIMEOUT_MS, "GEMINI_TIMEOUT_MS", DEFAULT_OPERATIONAL_CONFIG.geminiTimeoutMs, { integer: true }),
    solarAnalyzerMaxFileMb,
    solarAnalyzerMaxFileBytes,
    solarAnalyzerExtractRateLimitMax: parsePositiveNumber(environment.SOLAR_ANALYZER_EXTRACT_RATE_LIMIT_MAX, "SOLAR_ANALYZER_EXTRACT_RATE_LIMIT_MAX", DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerExtractRateLimitMax, { integer: true }),
    solarAnalyzerCalculateRateLimitMax: parsePositiveNumber(environment.SOLAR_ANALYZER_CALCULATE_RATE_LIMIT_MAX, "SOLAR_ANALYZER_CALCULATE_RATE_LIMIT_MAX", DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerCalculateRateLimitMax, { integer: true }),
    quoteRateLimitMax: parsePositiveNumber(environment.QUOTE_RATE_LIMIT_MAX, "QUOTE_RATE_LIMIT_MAX", DEFAULT_OPERATIONAL_CONFIG.quoteRateLimitMax, { integer: true }),
    ...(frontendOrigin ? { frontendOrigin } : {}),
  };
}
