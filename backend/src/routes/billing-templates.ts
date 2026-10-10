import { Router, type NextFunction, type RequestHandler, type Response } from "express";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { getTemplatesRepository, TemplateError, type TemplateDraft, type TemplatesRepository } from "../services/billing/templates-store.js";

type Dependencies = {
  authMiddleware?: RequestHandler;
  repository?: TemplatesRepository;
};

function sendFailure(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof TemplateError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  next(error);
}

function draftFrom(body: unknown): TemplateDraft {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    name: typeof source.name === "string" ? source.name : "",
    body: typeof source.body === "string" ? source.body : "",
  };
}

export function createBillingTemplatesRouter(dependencies: Dependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const repository = () => dependencies.repository ?? getTemplatesRepository();
  router.use(auth);

  router.get("/", async (_request, response, next) => {
    try {
      response.status(200).json({ templates: await repository().list() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.post("/", async (request, response, next) => {
    try {
      response.status(201).json({ template: await repository().create(draftFrom(request.body)) });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });
  router.put("/:id", async (request, response, next) => {
    try {
      response.status(200).json({ template: await repository().update(request.params.id ?? "", draftFrom(request.body)) });
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
