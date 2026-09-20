import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveAdminUser, getSupabaseClient, type ActiveAdminUser } from "../services/supabase.js";

export type AdminUserContext = {
  userId: string;
  email: string;
  displayName: string;
};

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUserContext;
    }
  }
}

export type AuthenticateAdminDependencies = {
  client?: SupabaseClient;
  getUser?: (token: string) => Promise<{
    data: { user: { id: string; email?: string } | null };
    error: { message: string; status?: number } | null;
  }>;
  getActiveAdmin?: (userId: string) => Promise<ActiveAdminUser | null>;
};

/**
 * Creates an Express middleware for verifying Supabase admin authentication and authorization.
 *
 * 1. Extracts the Bearer token from the Authorization header.
 * 2. Verifies the JWT with Supabase Auth (getUser).
 * 3. Checks authorization against the public.admin_users table (user_id and is_active = true).
 * 4. Attaches the verified admin user context to req.adminUser.
 */
export function createAuthenticateAdmin(dependencies: AuthenticateAdminDependencies = {}) {
  return async function authenticateAdminMiddleware(
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

    const token = tokenPart ? tokenPart.trim() : "";
    if (!token) {
      response.status(401).json({
        error: "Unauthorized",
        message: "Empty authorization token.",
      });
      return;
    }

    let user: { id: string; email?: string } | null = null;
    try {
      if (dependencies.getUser) {
        const result = await dependencies.getUser(token);
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
        user = result.data?.user ?? null;
      } else {
        const client = dependencies.client ?? getSupabaseClient();
        const { data, error } = await client.auth.getUser(token);
        if (error) {
          if (error.status && error.status >= 500) {
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
        user = data?.user ?? null;
      }
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Authentication service is temporarily unavailable.",
      });
      return;
    }

    if (!user || !user.id) {
      response.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token.",
      });
      return;
    }

    let adminUser: ActiveAdminUser | null = null;
    try {
      if (dependencies.getActiveAdmin) {
        adminUser = await dependencies.getActiveAdmin(user.id);
      } else {
        const client = dependencies.client ?? getSupabaseClient();
        adminUser = await getActiveAdminUser(user.id, client);
      }
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Database query failed.",
      });
      return;
    }

    if (!adminUser || !adminUser.isActive) {
      response.status(403).json({
        error: "Forbidden",
        message: "Access denied. Active administrator permissions required.",
      });
      return;
    }

    request.adminUser = {
      userId: adminUser.userId,
      email: user.email ?? "",
      displayName: adminUser.displayName,
    };

    next();
  };
}

export const authenticateAdmin = createAuthenticateAdmin();
