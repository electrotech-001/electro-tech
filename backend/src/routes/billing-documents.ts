import { Router, type NextFunction, type RequestHandler, type Response } from "express";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { DocumentError } from "../services/billing/documents-math.js";
import { getDocumentsRepository, type DocumentsRepository } from "../services/billing/documents-store.js";
import type { BankMode, GuarantorInput } from "../services/billing/documents-math.js";
import { getQuotationRepository, QuotationServiceError, type QuotationRepository } from "../services/billing/quotation-store.js";

type Dependencies = {
  authMiddleware?: RequestHandler;
  repository?: DocumentsRepository;
  quotations?: QuotationRepository;
};

function sendFailure(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof DocumentError || error instanceof QuotationServiceError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  next(error);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function amount(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function mode(value: unknown): BankMode {
  return value === "cash" ? "cash" : "bank_transfer";
}

function guarantors(value: unknown): GuarantorInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      fullName: text(row.fullName),
      designation: text(row.designation),
      occupation: text(row.occupation),
      sector: row.sector === "government" ? "government" : "private",
      cnicFront: text(row.cnicFront),
      cnicBack: text(row.cnicBack),
    };
  });
}

export function createBillingDocumentsRouter(dependencies: Dependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const repository = () => dependencies.repository ?? getDocumentsRepository();
  const quotations = () => dependencies.quotations ?? getQuotationRepository();
  router.use(auth);

  router.get("/ledger", async (_request, response, next) => {
    try {
      response.status(200).json({ entries: await repository().listLedger() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.put("/customers", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const saved = await quotations().updateCustomer(text(body.cnic), {
        customerName: text(body.customerName),
        cnic: text(body.nextCnic),
        address: text(body.address),
        contactNo: text(body.contactNo),
        whatsappNo: text(body.whatsappNo),
      });
      await repository().renameCustomer(saved.projectIds, text(body.customerName));
      response.status(200).json({ cnic: saved.cnic });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/agreements", async (_request, response, next) => {
    try {
      response.status(200).json({ agreements: await repository().listAgreements() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/guarantors", async (_request, response, next) => {
    try {
      response.status(200).json({ guarantors: await repository().listGuarantors() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/invoices", async (_request, response, next) => {
    try {
      response.status(200).json({ invoices: await repository().listInvoices() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/receive-payments", async (_request, response, next) => {
    try {
      response.status(200).json({ projects: await repository().listReceiveProjects() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/receive-payments/:projectId", async (request, response, next) => {
    try {
      response.status(200).json({ project: await repository().workspace(request.params.projectId ?? "") });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.put("/payments/:id", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      response.status(200).json({
        project: await repository().updatePayment(request.params.id ?? "", {
          paidAmount: amount(body.paidAmount),
          paymentDate: text(body.paymentDate),
          paymentMode: mode(body.paymentMode),
        }),
      });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/projects/:id/agreement", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const dueDates = Array.isArray(body.dueDates) ? body.dueDates.map((date) => text(date)) : [];
      const agreement = await repository().saveAgreement(request.params.id ?? "", { dueDates, guarantors: guarantors(body.guarantors) });
      response.status(201).json({ agreement });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/projects/:id/payments", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const project = body.kind === "installment"
        ? await repository().recordPayment(request.params.id ?? "", {
          kind: "installment",
          installmentNumber: amount(body.installmentNumber),
          paidAmount: amount(body.paidAmount),
          paymentDate: text(body.paymentDate),
          paymentMode: mode(body.paymentMode),
        })
        : await repository().recordPayment(request.params.id ?? "", {
          kind: "direct",
          paidAmount: amount(body.paidAmount),
          paymentDate: text(body.paymentDate),
          paymentMode: mode(body.paymentMode),
        });
      response.status(201).json({ project });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.patch("/projects/:id/installments/:number", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      response.status(200).json({
        project: await repository().updateDueDate(request.params.id ?? "", amount(request.params.number), text(body.dueDate)),
      });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/projects/:id/complete", async (request, response, next) => {
    try {
      await repository().completeProject(request.params.id ?? "");
      response.status(200).json({ ok: true });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });

  return router;
}
