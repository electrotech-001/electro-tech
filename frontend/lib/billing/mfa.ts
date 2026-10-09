import type { AuthError, Session } from "@supabase/supabase-js";
import { billingSupabase } from "./supabase";

/**
 * Authenticator setup stays in this module, but it is off while Billing CMS is still being built.
 * Set this to true when development is complete so the login page requires the QR code and 6-digit code.
 */
export const billingMfaEnabled = false;

export type SecondFactor =
  | {
      mode: "verify";
      factorId: string;
      challengeId: string;
    }
  | {
      mode: "enroll";
      factorId: string;
      challengeId: string;
      qrCode: string;
      secret: string;
    };

export class BillingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingAuthError";
  }
}

function authMessage(error: AuthError | null, fallback: string): string {
  return error?.message || fallback;
}

export function authenticatorQrSrc(qrCode: string): string {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await billingSupabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.session) {
    throw new BillingAuthError(authMessage(error, "Invalid email or password."));
  }
  return data.session;
}

export function hasBillingAccess(level: "aal1" | "aal2" | null): boolean {
  if (level === "aal2") return true;
  return !billingMfaEnabled && level === "aal1";
}

export async function currentAssuranceLevel(): Promise<"aal1" | "aal2" | null> {
  const { data: sessionData } = await billingSupabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await billingSupabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "aal1";
  return data.currentLevel === "aal2" ? "aal2" : "aal1";
}

export async function startSecondFactor(): Promise<SecondFactor> {
  const listed = await billingSupabase.auth.mfa.listFactors();
  if (listed.error) {
    throw new BillingAuthError(authMessage(listed.error, "Could not check authenticator setup."));
  }

  const stale = listed.data.totp.filter((factor) => factor.status !== "verified");
  for (const factor of stale) {
    const removed = await billingSupabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removed.error) {
      throw new BillingAuthError(authMessage(removed.error, "Could not reset an unfinished authenticator setup."));
    }
  }

  const verified = listed.data.totp.find((factor) => factor.status === "verified");
  if (verified) {
    const challenge = await billingSupabase.auth.mfa.challenge({ factorId: verified.id });
    if (challenge.error || !challenge.data) {
      throw new BillingAuthError(authMessage(challenge.error, "Could not start two-factor verification."));
    }
    return { mode: "verify", factorId: verified.id, challengeId: challenge.data.id };
  }

  const enrolled = await billingSupabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Electro Tech Billing CMS",
    issuer: "Electro Tech",
  });
  if (enrolled.error || !enrolled.data) {
    throw new BillingAuthError(
      authMessage(enrolled.error, "Could not start authenticator setup. Two-factor authentication may be disabled for this project."),
    );
  }

  const challenge = await billingSupabase.auth.mfa.challenge({ factorId: enrolled.data.id });
  if (challenge.error || !challenge.data) {
    throw new BillingAuthError(authMessage(challenge.error, "Could not start authenticator setup."));
  }

  return {
    mode: "enroll",
    factorId: enrolled.data.id,
    challengeId: challenge.data.id,
    qrCode: authenticatorQrSrc(enrolled.data.totp.qr_code),
    secret: enrolled.data.totp.secret,
  };
}

export async function refreshSecondFactorChallenge(factorId: string): Promise<string> {
  const challenge = await billingSupabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    throw new BillingAuthError(authMessage(challenge.error, "Could not refresh the authenticator challenge."));
  }
  return challenge.data.id;
}

export async function verifySecondFactor(factorId: string, challengeId: string, code: string): Promise<void> {
  const verified = await billingSupabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: code.trim(),
  });
  if (verified.error) {
    throw new BillingAuthError(authMessage(verified.error, "That authenticator code is not valid."));
  }

  const level = await billingSupabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.error || level.data?.currentLevel !== "aal2") {
    throw new BillingAuthError("Two-factor verification did not finish. Enter the current code again.");
  }
}

export async function signOutBilling(): Promise<void> {
  await billingSupabase.auth.signOut({ scope: "local" });
}
