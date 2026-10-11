import { Router, type NextFunction, type RequestHandler, type Response } from "express";
import { createAuthenticateBilling } from "../middleware/authenticate-billing.js";
import { getTermsRepository, TermsError, type TermsRepository } from "../services/billing/terms-store.js";

type Dependencies = {
  authMiddleware?: RequestHandler;
  repository?: TermsRepository;
};

function sendFailure(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof TermsError) {
    response.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  next(error);
}

export function createBillingTermsRouter(dependencies: Dependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? createAuthenticateBilling();
  const repository = () => dependencies.repository ?? getTermsRepository();
  router.use(auth);

  router.get("/", async (_request, response, next) => {
    try {
      response.status(200).json({ body: await repository().read() });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });

  router.put("/", async (request, response, next) => {
    try {
      const source = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const body = typeof source.body === "string" ? source.body : "";
      response.status(200).json({ body: await repository().save(body) });
    } catch (error) {
      sendFailure(error, response, next);
    }
  });

  return router;
}
