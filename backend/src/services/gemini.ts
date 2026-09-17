import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { DEFAULT_OPERATIONAL_CONFIG } from "../config.js";
import { billExtractionSchema, normalizeBillExtraction, type BillExtraction } from "../validation/solar-analyzer.js";

export const GEMINI_EXTRACTION_TIMEOUT_MS = DEFAULT_OPERATIONAL_CONFIG.geminiTimeoutMs;
export const GEMINI_EXTRACTION_MAX_ATTEMPTS = 2;
export const GEMINI_RETRY_BASE_DELAY_MS = 1500;
export const GEMINI_RETRY_MAX_JITTER_MS = 1000;
export const GEMINI_RETRY_MAX_DELAY_MS = 3500;
export const GEMINI_EXTRACTION_MAX_PROVIDER_TIME_MS =
  GEMINI_EXTRACTION_TIMEOUT_MS * GEMINI_EXTRACTION_MAX_ATTEMPTS;
export const GEMINI_EXTRACTION_MAX_TOTAL_TIME_MS =
  GEMINI_EXTRACTION_MAX_PROVIDER_TIME_MS + GEMINI_RETRY_MAX_DELAY_MS;

const EXTRACTION_PROMPT = `You are reading a Pakistani electricity bill only to extract non-personal energy-use data.
Return only the requested JSON structure. Never calculate or recommend a solar system.

Rules:
- Extract only information visible in the bill.
- Use null for missing or unreadable values. Never invent months or infer unseen consumption.
- Preserve the printed month/year relationship.
- Interpret "units" as kWh only when the bill context supports it.
- Mark ambiguous readings with low or medium confidence and list the affected field in uncertainFields.
- Do not return customer name, account/reference number, meter number, consumer number, phone, CNIC, or a street address.
- Extract utility/DISCO separately from installation city.
- A city may be returned only when it is explicitly printed as a reliable city/location field. Never infer city from the utility, utility headquarters, service territory, or provider name.
- Extract tariff/category, current bill month/year, sanctioned load, MDI, TOU evidence, peak/off-peak units, import/export units, green/bidirectional meter evidence and existing prosumer evidence only when visibly supported.
- Normalize yes/no evidence to "yes", "no", or "not_sure". Missing or ambiguous values must remain null or "not_sure" as required by the schema.
- Normalize phase only to "single", "three", or null.`;

export type ExtractableBill = {
  bytes: Buffer;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
};

export type GeminiExtractionAttempt = (
  file: ExtractableBill,
  apiKey: string,
  model: string,
  timeoutMs?: number,
) => Promise<BillExtraction>;

export type SleepFunction = (ms: number) => Promise<void>;

type GeminiExtractionDependencies = {
  environment?: NodeJS.ProcessEnv | undefined;
  attempt?: GeminiExtractionAttempt | undefined;
  timeoutMs?: number | undefined;
  sleep?: SleepFunction | undefined;
  random?: (() => number) | undefined;
};

export type GeminiProviderFailureCategory =
  | "authentication"
  | "model_access"
  | "invalid_request"
  | "quota"
  | "timeout"
  | "provider_error"
  | "structured_output_validation";

export class GeminiExtractionError extends Error {
  constructor(
    public readonly code: "not_configured" | "unreadable" | GeminiProviderFailureCategory,
    message: string,
    public readonly status?: number | undefined,
    public readonly retryable?: boolean | undefined,
    public readonly retryAfterMs?: number | undefined,
  ) {
    super(message);
    this.name = "GeminiExtractionError";
  }
}

export function loadGeminiConfig(environment: NodeJS.ProcessEnv = process.env) {
  const apiKey = environment.GEMINI_API_KEY?.trim();
  const model = environment.GEMINI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new GeminiExtractionError("not_configured", "Bill extraction is not configured.");
  }
  if (/-(?:latest|preview)(?:-|$)/.test(model)) {
    throw new GeminiExtractionError("not_configured", "GEMINI_MODEL must use a stable model identifier.");
  }
  return { apiKey, model };
}

export function parseGeminiExtraction(value: unknown): BillExtraction {
  const parsed = billExtractionSchema.safeParse(value);
  if (!parsed.success) {
    throw new GeminiExtractionError("structured_output_validation", "The bill reader returned an invalid response.");
  }
  if (
    parsed.data.monthlyConsumption.length === 0 &&
    parsed.data.currentMonthConsumptionKwh === null
  ) {
    throw new GeminiExtractionError("unreadable", "No readable consumption data was found in this bill.");
  }
  return normalizeBillExtraction(parsed.data);
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = "status" in error ? (error as { status?: unknown }).status : "code" in error ? (error as { code?: unknown }).code : undefined;
  if (typeof status === "number") return status;
  if (typeof status === "string" && /^\d{3}$/.test(status)) return Number(status);
  return undefined;
}

export function extractRetryDelayMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  if ("retryAfterMs" in error && typeof (error as { retryAfterMs?: unknown }).retryAfterMs === "number") {
    return (error as { retryAfterMs: number }).retryAfterMs;
  }
  if ("retryAfter" in error) {
    const raw = (error as { retryAfter?: unknown }).retryAfter;
    if (typeof raw === "number") {
      return raw <= 120 ? raw * 1000 : raw;
    }
    if (typeof raw === "string") {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed)) return parsed <= 120 ? parsed * 1000 : parsed;
    }
  }

  const errObj = error as Record<string, unknown>;
  const headers = (errObj.response as Record<string, unknown> | undefined)?.headers ?? errObj.headers;
  if (headers) {
    let headerVal: string | null | undefined;
    if (typeof (headers as Headers).get === "function") {
      headerVal = (headers as Headers).get("retry-after");
    } else if (typeof headers === "object") {
      headerVal = (headers as Record<string, string>)["retry-after"] ?? (headers as Record<string, string>)["Retry-After"];
    }
    if (headerVal) {
      const parsedSec = parseFloat(headerVal);
      if (!Number.isNaN(parsedSec)) {
        return parsedSec * 1000;
      }
      const parsedDate = Date.parse(headerVal);
      if (!Number.isNaN(parsedDate)) {
        const diff = parsedDate - Date.now();
        if (diff > 0) return diff;
      }
    }
  }

  const details = (errObj.error as Record<string, unknown> | undefined)?.details ?? errObj.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (detail && typeof detail === "object") {
        if ("retryDelay" in detail) {
          const rd = (detail as { retryDelay?: unknown }).retryDelay;
          if (typeof rd === "string") {
            const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(rd.trim());
            if (match && match[1]) {
              return parseFloat(match[1]) * 1000;
            }
          } else if (typeof rd === "number") {
            return rd <= 120 ? rd * 1000 : rd;
          } else if (rd && typeof rd === "object") {
            const sec = Number((rd as { seconds?: unknown }).seconds ?? 0);
            const nanos = Number((rd as { nanos?: unknown }).nanos ?? 0);
            const ms = sec * 1000 + nanos / 1e6;
            if (ms > 0) return ms;
          }
        }
      }
    }
  }

  return undefined;
}

export function isRetryableGeminiError(error: GeminiExtractionError): boolean {
  if (error.retryable !== undefined) {
    return error.retryable;
  }
  if (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404) {
    return false;
  }
  if (
    error.code === "authentication" ||
    error.code === "model_access" ||
    error.code === "invalid_request" ||
    error.code === "unreadable" ||
    error.code === "not_configured"
  ) {
    return false;
  }
  if (
    error.code === "timeout" ||
    error.code === "quota" ||
    error.code === "provider_error" ||
    error.code === "structured_output_validation"
  ) {
    return true;
  }
  return false;
}

export type RetryDelayOptions = {
  baseDelayMs?: number | undefined;
  maxJitterMs?: number | undefined;
  maxDelayMs?: number | undefined;
  retryAfterMs?: number | undefined;
  random?: (() => number) | undefined;
};

export function calculateRetryDelayMs(
  attemptIndex: number = 0,
  options: RetryDelayOptions = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? GEMINI_RETRY_BASE_DELAY_MS;
  const maxJitterMs = options.maxJitterMs ?? GEMINI_RETRY_MAX_JITTER_MS;
  const maxDelayMs = options.maxDelayMs ?? GEMINI_RETRY_MAX_DELAY_MS;
  const randomFn = options.random ?? Math.random;

  if (typeof options.retryAfterMs === "number" && !Number.isNaN(options.retryAfterMs) && options.retryAfterMs > 0) {
    return Math.min(Math.max(Math.round(options.retryAfterMs), 1000), maxDelayMs);
  }

  const backoff = baseDelayMs * Math.pow(2, attemptIndex);
  const jitter = Math.round(randomFn() * maxJitterMs);
  const calculated = backoff + jitter;

  return Math.min(calculated, maxDelayMs);
}

export function classifyGeminiProviderFailure(error: unknown): GeminiProviderFailureCategory {
  const status = providerStatus(error);
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (status === 400 || /invalid.*argument|bad.*request/.test(message)) {
    return "invalid_request";
  }
  if (status === 401 || /api.?key.*(?:invalid|expired)|unauthenticated|authentication/.test(message)) {
    return "authentication";
  }
  if (status === 403 || status === 404 || /model.*(?:not found|not available|unsupported)|permission.?denied|access.*model/.test(message)) {
    return "model_access";
  }
  if (status === 429 || /quota|rate.?limit|resource_exhausted/.test(message)) {
    return "quota";
  }
  if (status === 408 || /timeout|timed out|deadline|aborted/.test(message)) {
    return "timeout";
  }
  return "provider_error";
}

export function createGeminiExtractionRequest(file: ExtractableBill, model: string, timeoutMs: number = GEMINI_EXTRACTION_TIMEOUT_MS) {
  return {
    model,
    contents: [{
      role: "user",
      parts: [
        { text: EXTRACTION_PROMPT },
        { inlineData: { data: file.bytes.toString("base64"), mimeType: file.mimeType } },
      ],
    }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(billExtractionSchema),
      httpOptions: { timeout: timeoutMs },
    },
  };
}

async function runGeminiAttempt(file: ExtractableBill, apiKey: string, model: string, timeoutMs: number = GEMINI_EXTRACTION_TIMEOUT_MS): Promise<BillExtraction> {
  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent(createGeminiExtractionRequest(file, model, timeoutMs));

    const text = response.text?.trim();
    if (!text) throw new GeminiExtractionError("structured_output_validation", "No readable bill data was returned.", undefined, true);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new GeminiExtractionError("structured_output_validation", "The bill reader returned malformed data.", undefined, true);
    }
    return parseGeminiExtraction(json);
  } catch (error) {
    if (error instanceof GeminiExtractionError) throw error;
    const category = classifyGeminiProviderFailure(error);
    const status = providerStatus(error);
    const retryAfterMs = extractRetryDelayMs(error);
    const isNonRetryable = status === 400 || status === 401 || status === 403 || status === 404 ||
      category === "invalid_request" || category === "authentication" || category === "model_access";
    const retryable = !isNonRetryable;
    const safeMessage = category === "timeout"
      ? "Bill extraction timed out."
      : category === "quota"
        ? "The bill reader is temporarily busy."
        : category === "invalid_request"
          ? "The bill extraction request was invalid."
          : "Bill extraction is temporarily unavailable.";
    throw new GeminiExtractionError(category, safeMessage, status, retryable, retryAfterMs);
  }
}

const defaultSleep: SleepFunction = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function extractBillWithGemini(
  file: ExtractableBill,
  dependencies: GeminiExtractionDependencies = {},
): Promise<BillExtraction> {
  const { apiKey, model } = loadGeminiConfig(dependencies.environment);
  const executeAttempt = dependencies.attempt ?? runGeminiAttempt;
  const timeoutMs = dependencies.timeoutMs ?? GEMINI_EXTRACTION_TIMEOUT_MS;
  const sleep = dependencies.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < GEMINI_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      console.log(`Gemini extraction attempt ${attempt + 1}...`);
    }
    try {
      return await executeAttempt(file, apiKey, model, timeoutMs);
    } catch (error) {
      if (!(error instanceof GeminiExtractionError)) throw error;
      const retryable = isRetryableGeminiError(error);
      if (!retryable || attempt === GEMINI_EXTRACTION_MAX_ATTEMPTS - 1) {
        throw error;
      }
      const delayMs = calculateRetryDelayMs(attempt, {
        retryAfterMs: error.retryAfterMs,
        random: dependencies.random,
      });
      const statusDescriptor = error.status ? `HTTP ${error.status}` : error.code;
      console.warn(
        `Gemini extraction attempt ${attempt + 1} failed: transient ${statusDescriptor}. Retrying after ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }
  throw new GeminiExtractionError("provider_error", "Bill extraction is temporarily unavailable.");
}
