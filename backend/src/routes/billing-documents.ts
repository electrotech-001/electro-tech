import { Router, type NextFunction, type RequestHandler, type Response } from "express";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { DocumentError, type OpeningReceipt } from "../services/billing/documents-math.js";
import { getDocumentsRepository, type DocumentsRepository } from "../services/billing/documents-store.js";
import type { BankMode, GuarantorInput } from "../services/billing/documents-math.js";
import { getQuotationRepository, QuotationServiceError, type QuotationRepository } from "../services/billing/quotation-store.js";
import type { PaymentMode, QuotationDraft, QuotationItemInput } from "../services/billing/quotation-math.js";

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

function discountAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  return amount(value);
}

function mode(value: unknown): BankMode {
  return value === "cash" ? "cash" : "bank_transfer";
}

function saleDraft(body: unknown): QuotationDraft {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    quotationDate: text(source.quotationDate),
    customerName: text(source.customerName),
    cnic: text(source.cnic),
    address: text(source.address),
    contactNo: text(source.contactNo),
    whatsappNo: text(source.whatsappNo),
    customerPackage: text(source.customerPackage),
    paymentMode: text(source.paymentMode) as PaymentMode,
    downPayment: source.downPayment == null || source.downPayment === "" ? null : amount(source.downPayment),
    planDiscount: source.planDiscount == null || source.planDiscount === "" ? 0 : amount(source.planDiscount),
    installmentCount: source.installmentCount == null || source.installmentCount === "" ? null : amount(source.installmentCount),
    installmentAmounts: Array.isArray(source.installmentAmounts) ? source.installmentAmounts.map(amount) : null,
    installmentDueDates: Array.isArray(source.installmentDueDates) ? source.installmentDueDates.map((date) => String(date ?? "")) : null,
    items: items.map((item): QuotationItemInput => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        description: text(row.description),
        qty: amount(row.qty),
        unit: text(row.unit),
        price: amount(row.price),
        taxPercent: row.taxPercent == null || row.taxPercent === "" ? 0 : amount(row.taxPercent),
      };
    }),
  };
}

function openingFrom(value: unknown): OpeningReceipt | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.paidAmount == null || source.paidAmount === "") return null;
  const paidAmount = amount(source.paidAmount);
  if (!(paidAmount > 0)) return null;
  if (source.paymentMode !== "cash" && source.paymentMode !== "bank_transfer") {
    throw new DocumentError("Choose bank transfer or cash.");
  }
  return {
    paidAmount,
    paymentDate: text(source.paymentDate),
    paymentMode: source.paymentMode,
  };
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
      contactNo: text(row.contactNo),
      cnic: text(row.cnic),
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

  router.get("/summary", async (_request, response, next) => {
    try {
      const [documents, quotationsCount] = await Promise.all([
        repository().summary(),
        quotations().countQuotations(),
      ]);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ ...documents, quotations: quotationsCount });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/ledger", async (_request, response, next) => {
    try {
      response.status(200).json({ entries: await repository().listLedger() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.get("/discounts", async (_request, response, next) => {
    try {
      response.status(200).json({ entries: await repository().listDiscounts() });
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
  router.get("/agreements", async (request, response, next) => {
    try {
      response.status(200).json({ agreements: await repository().listAgreements(request.query.photos !== "0") });
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
  router.patch("/invoices/:id", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      response.status(200).json({
        project: await repository().setInvoiceDiscount(request.params.id ?? "", discountAmount(body.discountAmount)),
      });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.delete("/invoices/:id", async (request, response, next) => {
    try {
      response.status(200).json({ project: await repository().deleteInvoice(request.params.id ?? "") });
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
  router.get("/direct-invoices/next-serial", async (_request, response, next) => {
    try {
      response.status(200).json({ serial: await quotations().nextDirectSaleSerial() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/direct-invoices", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const dueDates = Array.isArray(body.dueDates) ? body.dueDates.map((date) => text(date)) : [];
      response.status(201).json({
        project: await repository().createDirectSale(saleDraft(body), openingFrom(body.opening), dueDates),
      });
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
          discountAmount: discountAmount(body.discountAmount),
          paymentDate: text(body.paymentDate),
          paymentMode: mode(body.paymentMode),
        }),
      });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.delete("/direct-sales/:id", async (request, response, next) => {
    try {
      await repository().deleteDirectSale(request.params.id ?? "");
      response.status(204).end();
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.delete("/payments/:id", async (request, response, next) => {
    try {
      response.status(200).json({ project: await repository().deletePayment(request.params.id ?? "") });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/projects/:id/agreement", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const dueDates = Array.isArray(body.dueDates) ? body.dueDates.map((date) => text(date)) : [];
      const planDiscount = body.planDiscount == null || body.planDiscount === "" ? undefined : discountAmount(body.planDiscount);
      const agreement = await repository().saveAgreement(request.params.id ?? "", {
        dueDates,
        guarantors: guarantors(body.guarantors),
        body: text(body.body),
        opening: openingFrom(body.opening),
        ...(planDiscount == null ? {} : { planDiscount }),
      });
      response.status(201).json({ agreement });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.patch("/agreements/:id", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const agreement = await repository().updateAgreementWording(request.params.id ?? "", text(body.body));
      response.status(200).json({ agreement });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/projects/:id/invoice", async (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      response.status(201).json({ project: await repository().issueInvoice(request.params.id ?? "", openingFrom(body)) });
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
          discountAmount: discountAmount(body.discountAmount),
          paymentDate: text(body.paymentDate),
          paymentMode: mode(body.paymentMode),
        })
        : body.kind === "opening"
          ? await repository().recordPayment(request.params.id ?? "", {
            kind: "opening",
            paidAmount: amount(body.paidAmount),
            discountAmount: discountAmount(body.discountAmount),
            paymentDate: text(body.paymentDate),
            paymentMode: mode(body.paymentMode),
          })
          : await repository().recordPayment(request.params.id ?? "", {
            kind: "direct",
            paidAmount: amount(body.paidAmount),
            discountAmount: discountAmount(body.discountAmount),
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
