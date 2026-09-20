import { Router, type RequestHandler } from "express";
import { authenticateAdmin as defaultAuthenticateAdmin } from "../middleware/authenticate-admin.js";

export type AdminMeRouterDependencies = {
  authMiddleware?: RequestHandler;
};

/**
 * Creates an Express router handling GET /api/admin/me.
 * Protected by authenticateAdmin middleware.
 * Returns minimal trusted admin data from request.adminUser context.
 */
export function createAdminMeRouter(dependencies: AdminMeRouterDependencies = {}) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? defaultAuthenticateAdmin;

  router.get("/", auth, (request, response) => {
    if (!request.adminUser) {
      response.status(401).json({
        error: "Unauthorized",
        message: "Missing admin user context.",
      });
      return;
    }

    response.status(200).json({
      user: {
        userId: request.adminUser.userId,
        email: request.adminUser.email,
        displayName: request.adminUser.displayName,
      },
    });
  });

  return router;
}
