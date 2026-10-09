import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { getDocumentsRepository } from "../services/billing/documents-store.js";
import { QuotationServiceError, getQuotationRepository, type QuotationRepository } from "../services/billing/quotation-store.js";
import type { PaymentMode, QuotationDraft, QuotationItemInput } from "../services/billing/quotation-math.js";

export type BillingQuotationsRouterDependencies = {
  authMiddleware?: RequestHandler;
  repository?: QuotationRepository;
};

function sendFailure(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof QuotationServiceError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  next(error);
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function readDraft(body: unknown): QuotationDraft {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    quotationDate: String(source.quotationDate ?? ""),
    customerName: String(source.customerName ?? ""),
    cnic: String(source.cnic ?? ""),
    address: String(source.address ?? ""),
    contactNo: String(source.contactNo ?? ""),
    whatsappNo: String(source.whatsappNo ?? ""),
    customerPackage: String(source.customerPackage ?? ""),
    paymentMode: String(source.paymentMode ?? "") as PaymentMode,
    downPayment: source.downPayment == null || source.downPayment === "" ? null : numberValue(source.downPayment),
    installmentCount: source.installmentCount == null || source.installmentCount === "" ? null : numberValue(source.installmentCount),
    items: items.map((item): QuotationItemInput => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        description: String(row.description ?? ""),
        qty: numberValue(row.qty),
        unit: String(row.unit ?? ""),
        price: numberValue(row.price),
        taxPercent: row.taxPercent == null || row.taxPercent === "" ? 0 : numberValue(row.taxPercent),
      };
    }),
  };
}

export function createBillingQuotationsRouter(dependencies: BillingQuotationsRouterDependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const repository = () => dependencies.repository ?? getQuotationRepository();

  router.use(auth);
  router.get("/", async (_request, response, next) => {
    try {
      response.status(200).json({ quotations: await repository().listQuotations() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/next-serial", async (_request, response, next) => {
    try {
      response.status(200).json({ serial: await repository().nextSerial() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/", async (request, response, next) => {
    try {
      response.status(201).json({ quotation: await repository().create(readDraft(request.body)) });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.put("/:id", async (request, response, next) => {
    try {
      response.status(200).json({ quotation: await repository().update(request.params.id ?? "", readDraft(request.body)) });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/:id/approve", async (request, response, next) => {
    try {
      response.status(201).json({ project: await repository().approve(request.params.id ?? "") });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/:id/disapprove", async (request, response, next) => {
    try {
      response.status(200).json({ quotation: await repository().disapprove(request.params.id ?? "") });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.delete("/:id", async (request, response, next) => {
    try {
      await repository().remove(request.params.id ?? "");
      response.status(200).json({ ok: true });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });

  return router;
}

export function createBillingProjectsRouter(dependencies: BillingQuotationsRouterDependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const repository = () => dependencies.repository ?? getQuotationRepository();
  router.use(auth);
  router.get("/", async (_request: Request, response, next) => {
    try {
      response.status(200).json({ projects: await repository().listProjects() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/:id/disapprove", async (request, response, next) => {
    try {
      const id = request.params.id ?? "";
      if (await getDocumentsRepository().projectHasDocuments(id)) {
        response.status(409).json({
          code: "has_documents",
          message: "This project already has an agreement or a payment, so it cannot be disapproved.",
        });
        return;
      }
      response.status(200).json({ quotation: await repository().disapproveProject(id) });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  return router;
}
