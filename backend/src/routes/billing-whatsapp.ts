import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { createWhatsAppSendRateLimiter } from "../services/rate-limit.js";
import { SupabaseConfigError } from "../config.js";
import { WhatsAppServiceError } from "../services/whatsapp/errors.js";
import { formatWhatsAppPhone, type WhatsAppDocumentKind } from "../services/whatsapp/phone.js";
import { getWhatsAppSession, type WhatsAppSession, type WhatsAppSnapshot } from "../services/whatsapp/session.js";

export const MAX_WHATSAPP_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const sendFieldsSchema = z.object({
  phone: z.string().trim().min(1).max(32),
  kind: z.enum(["quotation", "invoice", "agreement", "slip", "thanks", "feedback", "reminder", "card"]),
  message: z.string().trim().min(1).max(1000),
});

type SessionGateway = Pick<WhatsAppSession, "snapshot" | "connect" | "disconnect" | "send" | "sendText">;

export type BillingWhatsAppRouterDependencies = {
  authMiddleware?: RequestHandler;
  session?: SessionGateway;
  sendRateLimitMax?: number;
};

function present(snapshot: WhatsAppSnapshot) {
  return {
    status: snapshot.status,
    phone: snapshot.phone,
    phoneDisplay: snapshot.phone ? formatWhatsAppPhone(snapshot.phone) : null,
    pushName: snapshot.pushName,
    qrDataUrl: snapshot.qrDataUrl,
    savedSession: snapshot.savedSession,
    error: snapshot.error,
  };
}

function fieldValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createBillingWhatsAppRouter(dependencies: BillingWhatsAppRouterDependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const session = (): SessionGateway => dependencies.session ?? getWhatsAppSession();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_WHATSAPP_DOCUMENT_BYTES,
      files: 1,
      fields: 8,
      parts: 12,
    },
  });

  const sendDocument: RequestHandler = (request, response, next) => {
    upload.single("document")(request, response, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        response.status(tooLarge ? 413 : 400).json({
          code: tooLarge ? "file_too_large" : "malformed_upload",
          message: tooLarge
            ? "The document must be 10 MB or smaller."
            : "Upload one PDF or image with the document field.",
        });
        return;
      }
      if (error) {
        next(error);
        return;
      }
      void handleSend(request, response, next);
    });
  };

  async function handleSend(request: Request, response: Response, next: NextFunction) {
    try {
      const parsed = sendFieldsSchema.safeParse({
        phone: fieldValue(request.body?.phone),
        kind: fieldValue(request.body?.kind),
        message: fieldValue(request.body?.message),
      });
      if (!parsed.success) {
        response.status(400).json({
          code: "invalid_request",
          message: "Choose a document type, customer number, and a short message.",
        });
        return;
      }
      const file = request.file;
      if (!file) {
        if (parsed.data.kind !== "card") {
          response.status(400).json({
            code: "invalid_file",
            message: "Upload a PDF, JPG, PNG, or WebP of the quotation, invoice, agreement, or paid slip.",
          });
          return;
        }
        const result = await session().sendText({ phone: parsed.data.phone, message: parsed.data.message });
        response.status(200).json({ ok: true, id: result.id });
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        response.status(400).json({
          code: "invalid_file",
          message: "Upload a PDF, JPG, PNG, or WebP of the quotation, invoice, agreement, or paid slip.",
        });
        return;
      }
      const result = await session().send({
        phone: parsed.data.phone,
        kind: parsed.data.kind as WhatsAppDocumentKind,
        message: parsed.data.message,
        fileName: file.originalname || "document",
        mimeType: file.mimetype,
        file: file.buffer,
      });
      response.status(200).json({ ok: true, id: result.id });
    } catch (error) {
      sendFailure(error, response, next);
    }
  }

  router.use(auth);
  router.get("/", async (_request, response, next) => {
    try {
      response.status(200).json(present(session().snapshot()));
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/connect", async (_request, response, next) => {
    try {
      response.status(200).json(present(await session().connect()));
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/disconnect", async (_request, response, next) => {
    try {
      response.status(200).json(present(await session().disconnect()));
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post(
    "/send",
    createWhatsAppSendRateLimiter(dependencies.sendRateLimitMax),
    sendDocument,
  );

  return router;
}

function sendFailure(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof WhatsAppServiceError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof SupabaseConfigError) {
    response.status(503).json({
      code: "storage_unconfigured",
      message: "WhatsApp session storage is not configured.",
    });
    return;
  }
  next(error);
}
