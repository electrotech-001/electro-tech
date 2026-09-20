import { rateLimit } from "express-rate-limit";
import { DEFAULT_OPERATIONAL_CONFIG } from "../config.js";

export const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;
export const API_RATE_LIMITS = Object.freeze({
  extract: DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerExtractRateLimitMax,
  calculate: DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerCalculateRateLimitMax,
  quote: DEFAULT_OPERATIONAL_CONFIG.quoteRateLimitMax,
});

function createApiRateLimiter(limit: number, message: string, code = "rate_limited") {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ code, message }),
  });
}

export function createExtractionRateLimiter(limit: number = API_RATE_LIMITS.extract) {
  return createApiRateLimiter(
    limit,
    "Too many bill-analysis attempts. Enter consumption manually or try again later.",
  );
}

export function createCalculateRateLimiter(limit: number = API_RATE_LIMITS.calculate) {
  return createApiRateLimiter(
    limit,
    "Too many calculation requests. Please try again later.",
  );
}

export function createQuoteRateLimiter(limit: number = API_RATE_LIMITS.quote) {
  return createApiRateLimiter(
    limit,
    "Too many recent requests. Please use WhatsApp or try again later.",
  );
}

export function createAdminImageUploadRateLimiter(
  limit: number = DEFAULT_OPERATIONAL_CONFIG.adminImageUploadRateLimitMax,
) {
  return createApiRateLimiter(
    limit,
    "Too many image upload attempts. Please try again later.",
  );
}
