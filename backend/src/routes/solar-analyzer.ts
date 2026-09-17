import { Router } from "express";
import multer from "multer";
import { DEFAULT_OPERATIONAL_CONFIG, type RuntimeConfig } from "../config.js";
import { validateBillUpload } from "../services/bill-upload.js";
import { extractBillWithGemini, GeminiExtractionError, type ExtractableBill } from "../services/gemini.js";
import { createCalculateRateLimiter, createExtractionRateLimiter } from "../services/rate-limit.js";
import { calculateSolarRecommendation } from "../services/solar/calculator.js";
import { assessDataConfidence, getMissingRecommendationFields, hasTwelveUniqueReadableMonths, RECOMMENDATION_FIELD_LABELS, type BillExtraction, verifiedSolarInputSchema } from "../validation/solar-analyzer.js";

export const MAX_CALCULATE_BODY_BYTES = 32_768;

export type SolarAnalyzerRouterDependencies = {
  extractBill?: (file: ExtractableBill) => Promise<BillExtraction>;
  config?: Pick<RuntimeConfig, "geminiTimeoutMs" | "solarAnalyzerMaxFileBytes" | "solarAnalyzerExtractRateLimitMax" | "solarAnalyzerCalculateRateLimitMax">;
};

function extractionErrorResponse(error: GeminiExtractionError) {
  if (error.code === "timeout") return { status: 504, code: "timeout", message: "Bill extraction timed out. Please retry or enter consumption manually." };
  if (error.code === "quota") return { status: 503, code: "rate_limited", message: "Bill extraction is temporarily busy. Please retry shortly or enter consumption manually." };
  if (error.code === "structured_output_validation") return { status: 502, code: "invalid_output", message: "The bill could not be read reliably. Try the original PDF or enter consumption manually." };
  if (error.code === "unreadable") return { status: 422, code: "unreadable", message: "No readable consumption data was found. Upload a clearer bill or enter consumption manually." };
  return { status: 503, code: "unavailable", message: "Bill extraction is temporarily unavailable. You can enter consumption manually." };
}

export function createSolarAnalyzerRouter(dependencies: SolarAnalyzerRouterDependencies = {}) {
  const router = Router();
  const config = dependencies.config ?? {
    geminiTimeoutMs: DEFAULT_OPERATIONAL_CONFIG.geminiTimeoutMs,
    solarAnalyzerMaxFileBytes: DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerMaxFileMb * 1024 * 1024,
    solarAnalyzerExtractRateLimitMax: DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerExtractRateLimitMax,
    solarAnalyzerCalculateRateLimitMax: DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerCalculateRateLimitMax,
  };
  const extractBill = dependencies.extractBill ?? ((file: ExtractableBill) => extractBillWithGemini(file, { timeoutMs: config.geminiTimeoutMs }));
  const billUpload = multer({
    storage: multer.memoryStorage(),
    // Busboy checks the parts limit before yielding the final permitted part;
    // allow its terminal boundary while still accepting one file and zero fields.
    limits: { fileSize: config.solarAnalyzerMaxFileBytes, files: 1, fields: 0, parts: 2 },
  });

  router.post("/extract", createExtractionRateLimiter(config.solarAnalyzerExtractRateLimitMax), billUpload.single("bill"), async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ code: "missing_file", message: "Choose one electricity bill to upload." });
    }

    let file: ExtractableBill;
    try {
      file = validateBillUpload(request.file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid bill upload.";
      return response.status(415).json({ code: "invalid_file", message });
    }

    try {
      const extraction = await extractBill(file);
      const requiredContextComplete = Boolean(extraction.city?.trim());
      return response.json({ extraction, ...assessDataConfidence(extraction.monthlyConsumption, extraction.uncertainFields, requiredContextComplete) });
    } catch (error) {
      if (error instanceof GeminiExtractionError) {
        console.warn("Gemini bill extraction failed", { category: error.code });
        const safe = extractionErrorResponse(error);
        return response.status(safe.status).json({ code: safe.code, message: safe.message });
      }
      console.error("Unexpected bill extraction error", error);
      return response.status(503).json({ code: "unavailable", message: "Bill extraction is temporarily unavailable. You can enter consumption manually." });
    }
  });

  router.post("/calculate", createCalculateRateLimiter(config.solarAnalyzerCalculateRateLimitMax), (request, response) => {
    const parsed = verifiedSolarInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        code: "invalid_verified_data",
        message: "Review the verified consumption and location fields.",
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    if (!hasTwelveUniqueReadableMonths(parsed.data.monthlyConsumption)) {
      return response.status(422).json({
        code: "incomplete_monthly_consumption",
        message: "Enter exactly 12 unique monthly consumption readings before calculating a full recommendation.",
        missingFields: [RECOMMENDATION_FIELD_LABELS.monthlyConsumption],
      });
    }

    const missingFields = getMissingRecommendationFields(parsed.data);
    if (missingFields.length > 0) {
      return response.status(422).json({
        code: "incomplete_verified_data",
        message: "Complete the highlighted tariff and policy inputs before calculating.",
        missingFields,
      });
    }

    try {
      return response.json(calculateSolarRecommendation({
        ...parsed.data,
        monthlyConsumption: [...parsed.data.monthlyConsumption].sort((a, b) => a.year - b.year || a.month - b.month),
      }));
    } catch {
      console.error("Deterministic solar calculation failed", { reason: "calculation_error" });
      return response.status(422).json({
        code: "calculation_failed",
        message: "The recommendation could not be calculated from the verified inputs. Review the consumption data and try again.",
      });
    }
  });

  return router;
}
