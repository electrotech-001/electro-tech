import cors, { type CorsOptions } from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import multer from "multer";
import { DEFAULT_OPERATIONAL_CONFIG, type RuntimeConfig } from "./config.js";
import { createAdminMeRouter } from "./routes/admin-me.js";
import { createAdminProjectsRouter } from "./routes/admin-projects.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createQuoteRouter, MAX_QUOTE_BODY_BYTES } from "./routes/quote.js";
import { createSolarAnalyzerRouter, MAX_CALCULATE_BODY_BYTES, type SolarAnalyzerRouterDependencies } from "./routes/solar-analyzer.js";
import type { QuoteEmailSender } from "./services/email.js";

type AppDependencies = {
  config: Pick<RuntimeConfig, "nodeEnv" | "frontendOrigin"> &
    Partial<
      Pick<
        RuntimeConfig,
        | "adminOrigin"
        | "geminiTimeoutMs"
        | "solarAnalyzerMaxFileMb"
        | "solarAnalyzerMaxFileBytes"
        | "solarAnalyzerExtractRateLimitMax"
        | "solarAnalyzerCalculateRateLimitMax"
        | "quoteRateLimitMax"
      >
    >;
  extractBill?: SolarAnalyzerRouterDependencies["extractBill"];
  sendQuoteEmail?: QuoteEmailSender;
  projectsRouter?: express.Router;
  adminProjectsRouter?: express.Router;
  adminMeRouter?: express.Router;
};

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function createCorsOptions(config: AppDependencies["config"]): CorsOptions {
  return {
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.frontendOrigin && origin === config.frontendOrigin) return callback(null, true);
      if (config.adminOrigin && origin === config.adminOrigin) return callback(null, true);
      if (config.nodeEnv !== "production" && isLocalDevelopmentOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed."));
    },
  };
}

const quoteContentLengthGuard: RequestHandler = (request, response, next) => {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_QUOTE_BODY_BYTES) {
    response.status(413).json({ message: "Request is too large." });
    return;
  }
  next();
};

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const solarAnalyzerMaxFileMb = dependencies.config.solarAnalyzerMaxFileMb ?? DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerMaxFileMb;
  const operationalConfig = {
    geminiTimeoutMs: dependencies.config.geminiTimeoutMs ?? DEFAULT_OPERATIONAL_CONFIG.geminiTimeoutMs,
    solarAnalyzerMaxFileBytes: dependencies.config.solarAnalyzerMaxFileBytes ?? solarAnalyzerMaxFileMb * 1024 * 1024,
    solarAnalyzerExtractRateLimitMax: dependencies.config.solarAnalyzerExtractRateLimitMax ?? DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerExtractRateLimitMax,
    solarAnalyzerCalculateRateLimitMax: dependencies.config.solarAnalyzerCalculateRateLimitMax ?? DEFAULT_OPERATIONAL_CONFIG.solarAnalyzerCalculateRateLimitMax,
  };

  app.disable("x-powered-by");
  // Belmo routes edge traffic directly through one load balancer hop.
  app.set("trust proxy", 1);
  app.use(cors(createCorsOptions(dependencies.config)));
  app.get("/api/health", (_request, response) => response.status(200).json({ ok: true }));
  app.use("/api/quote", quoteContentLengthGuard);
  app.use("/api/quote", express.json({ limit: MAX_QUOTE_BODY_BYTES }));
  app.use(
    "/api/quote",
    createQuoteRouter({
      ...(dependencies.sendQuoteEmail ? { sendEmail: dependencies.sendQuoteEmail } : {}),
      rateLimitMax: dependencies.config.quoteRateLimitMax ?? DEFAULT_OPERATIONAL_CONFIG.quoteRateLimitMax,
    }),
  );
  app.use(
    "/api/solar-analyzer",
    express.json({ limit: MAX_CALCULATE_BODY_BYTES }),
    createSolarAnalyzerRouter({
      ...(dependencies.extractBill ? { extractBill: dependencies.extractBill } : {}),
      config: operationalConfig,
    }),
  );
  app.use(
    "/api/projects",
    dependencies.projectsRouter ?? createProjectsRouter(),
  );
  app.use(
    "/api/admin/projects",
    express.json(),
    dependencies.adminProjectsRouter ?? createAdminProjectsRouter(),
  );
  app.use(
    "/api/admin/me",
    dependencies.adminMeRouter ?? createAdminMeRouter(),
  );

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    void _next;
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        response.status(413).json({ code: "file_too_large", message: `The bill must be ${solarAnalyzerMaxFileMb} MB or smaller.` });
        return;
      }
      response.status(400).json({ code: "malformed_upload", message: "Upload one bill file using the bill field." });
      return;
    }
    if (error instanceof Error && /unexpected end of form|malformed part header/i.test(error.message)) {
      response.status(400).json({ code: "malformed_upload", message: "Upload one bill file using the bill field." });
      return;
    }
    const bodyError = error as { status?: number; type?: string };
    if (bodyError.status === 413 || bodyError.type === "entity.too.large") {
      response.status(413).json({ message: "Request is too large." });
      return;
    }
    if (bodyError.status === 400 || bodyError.type === "entity.parse.failed") {
      response.status(400).json({ message: "Invalid request." });
      return;
    }
    if (error instanceof Error && error.message === "Origin is not allowed.") {
      response.status(403).json({ message: "Origin is not allowed." });
      return;
    }

    console.error("Unhandled API error", error);
    response.status(500).json({ message: "Internal server error." });
  };

  app.use(errorHandler);
  return app;
}
