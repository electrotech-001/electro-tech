import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../services/supabase.js";

export type BillingUserContext = {
  userId: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      billingUser?: BillingUserContext;
    }
  }
}

export type AuthenticateBillingDependencies = {
  client?: SupabaseClient;
  getUser?: (token: string) => Promise<{
    data: { user: { id: string; email?: string } | null };
    error: { message: string; status?: number } | null;
  }>;
};

/**
 * Confirms the caller is a signed-in Billing CMS user.
 * WhatsApp session secrets stay on the server; this only checks the Supabase JWT.
 */
export function createAuthenticateBilling(dependencies: AuthenticateBillingDependencies = {}) {
  return async function authenticateBilling(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== "string") {
      response.status(401).json({
        error: "Unauthorized",
        message: "Missing authorization header.",
      });
      return;
    }

    const parts = authHeader.trim().split(/\s+/);
    const [scheme, tokenPart] = parts;
    if (parts.length !== 2 || !scheme || scheme.toLowerCase() !== "bearer") {
      response.status(401).json({
        error: "Unauthorized",
        message: "Invalid authorization scheme.",
      });
      return;
    }

    const token = tokenPart?.trim() ?? "";
    if (!token) {
      response.status(401).json({
        error: "Unauthorized",
        message: "Empty authorization token.",
      });
      return;
    }

    try {
      const result = dependencies.getUser
        ? await dependencies.getUser(token)
        : await (dependencies.client ?? getSupabaseClient()).auth.getUser(token);
      if (result.error) {
        if (result.error.status && result.error.status >= 500) {
          response.status(503).json({
            error: "Service Unavailable",
            message: "Authentication service is temporarily unavailable.",
          });
          return;
        }
        response.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token.",
        });
        return;
      }
      const user = result.data.user;
      if (!user?.id) {
        response.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token.",
        });
        return;
      }
      request.billingUser = {
        userId: user.id,
        email: user.email ?? "",
      };
      next();
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Authentication service is temporarily unavailable.",
      });
    }
  };
}
