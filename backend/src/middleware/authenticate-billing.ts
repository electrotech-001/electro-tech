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
type VerifiedBillingUser = {
  userId: string;
  email: string;
  expiresAt: number;
};

const verifiedUsers = new Map<string, VerifiedBillingUser>();
const pendingUsers = new Map<string, Promise<VerifiedBillingUser>>();
const CACHE_MS = 30_000;

function tokenExpiry(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) return Date.now() + CACHE_MS;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof parsed.exp === "number") return Math.min(parsed.exp * 1000 - 5_000, Date.now() + CACHE_MS);
  } catch {
    return Date.now() + CACHE_MS;
  }
  return Date.now() + CACHE_MS;
}

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

    const cached = verifiedUsers.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      request.billingUser = { userId: cached.userId, email: cached.email };
      next();
      return;
    }

    try {
      let lookup = pendingUsers.get(token);
      if (!lookup) {
        let resolveUser!: (user: VerifiedBillingUser) => void;
        let rejectUser!: (error: unknown) => void;
        lookup = new Promise<VerifiedBillingUser>((resolve, reject) => {
          resolveUser = resolve;
          rejectUser = reject;
        });
        pendingUsers.set(token, lookup);
        void (async () => {
          try {
            const result = dependencies.getUser
              ? await dependencies.getUser(token)
              : await (dependencies.client ?? getSupabaseClient()).auth.getUser(token);
            if (result.error) {
              const status = result.error.status && result.error.status >= 500 ? 503 : 401;
              const failure = new Error(status === 503 ? "unavailable" : "invalid");
              (failure as Error & { statusCode?: number }).statusCode = status;
              throw failure;
            }
            const user = result.data.user;
            if (!user?.id) {
              const failure = new Error("invalid");
              (failure as Error & { statusCode?: number }).statusCode = 401;
              throw failure;
            }
            const verified: VerifiedBillingUser = {
              userId: user.id,
              email: user.email ?? "",
              expiresAt: tokenExpiry(token),
            };
            if (verified.expiresAt > Date.now()) {
              if (verifiedUsers.size > 200) {
                const now = Date.now();
                for (const [key, value] of verifiedUsers) {
                  if (value.expiresAt <= now) verifiedUsers.delete(key);
                }
              }
              verifiedUsers.set(token, verified);
            }
            resolveUser(verified);
          } catch (error) {
            rejectUser(error);
          } finally {
            pendingUsers.delete(token);
          }
        })();
      }
      const verified = await lookup;
      request.billingUser = { userId: verified.userId, email: verified.email };
      next();
    } catch (error) {
      const statusCode = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 503;
      if (statusCode === 401) {
        response.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token.",
        });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Authentication service is temporarily unavailable.",
      });
    }
  };
}
