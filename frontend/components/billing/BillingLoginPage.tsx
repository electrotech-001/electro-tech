"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  BillingAuthError,
  billingMfaEnabled,
  currentAssuranceLevel,
  hasBillingAccess,
  signInWithPassword,
  signOutBilling,
  refreshSecondFactorChallenge,
  startSecondFactor,
  verifySecondFactor,
  type SecondFactor,
} from "@/lib/billing/mfa";
import styles from "./billing-login.module.css";

type Step = "credentials" | SecondFactor["mode"];

export function BillingLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");
  const [factor, setFactor] = useState<SecondFactor | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    async function resume() {
      try {
        const level = await currentAssuranceLevel();
        if (!active) return;
        if (hasBillingAccess(level)) {
          router.replace("/billing");
          return;
        }
        if (billingMfaEnabled && level === "aal1") {
          const next = await startSecondFactor();
          if (!active) return;
          setFactor(next);
          setStep(next.mode);
        }
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof BillingAuthError ? caught.message : "Could not resume sign-in.");
      } finally {
        if (active) setIsCheckingSession(false);
      }
    }
    void resume();
    return () => {
      active = false;
    };
  }, [router]);

  async function onCredentials(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    try {
      setIsSubmitting(true);
      await signInWithPassword(email, password);
      if (!billingMfaEnabled) {
        router.replace("/billing");
        return;
      }
      const next = await startSecondFactor();
      setFactor(next);
      setStep(next.mode);
      setPassword("");
      setCode("");
    } catch (caught) {
      setPassword("");
      setError(caught instanceof BillingAuthError ? caught.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onCode(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting || !factor) return;
    const trimmed = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await verifySecondFactor(factor.factorId, factor.challengeId, trimmed);
      router.replace("/billing");
    } catch (caught) {
      setCode("");
      setError(caught instanceof BillingAuthError ? caught.message : "Two-factor verification failed.");
      try {
        const challengeId = await refreshSecondFactorChallenge(factor.factorId);
        setFactor({ ...factor, challengeId });
      } catch {
        // Keep the current challenge on screen if a refresh fails.
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function backToCredentials() {
    setIsSubmitting(true);
    setError(null);
    await signOutBilling();
    setFactor(null);
    setCode("");
    setStep("credentials");
    setIsSubmitting(false);
  }

  return (
    <main className={styles.page}>
      <p className={styles.badge}>Billing CMS</p>
      <section className={styles.card} aria-labelledby="billing-login-title">
        <div className={styles.brand}>
          <img
            className={styles.logo}
            src="/logos/electrotech-horizontal-dark.png"
            alt="Electro Tech, Electrical and Solar Solutions"
          />
        </div>
        <div className={styles.body}>
          <h1 id="billing-login-title" className={styles.heading}>
            {step === "credentials" ? "Login" : step === "enroll" ? "Set up 2FA" : "Authenticator"}
          </h1>
          <p className={styles.subheading}>
            {step === "credentials"
              ? "Staff sign-in for quotations, invoices and projects."
              : step === "enroll"
                ? "Scan this code once, then enter the 6-digit code to finish sign-in."
                : "Enter the current 6-digit code from your authenticator app."}
          </p>

          {error ? (
            <p className={styles.alert} role="alert">
              {error}
            </p>
          ) : null}

          {isCheckingSession ? (
            <p className={styles.help}>Checking your session…</p>
          ) : step === "credentials" ? (
            <form className={styles.form} onSubmit={onCredentials} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="billing-email">
                  Email
                </label>
                <input
                  id="billing-email"
                  className={styles.input}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="billing-password">
                  Password
                </label>
                <div className={styles.passwordWrap}>
                  <input
                    id="billing-password"
                    className={styles.input}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  <button
                    className={styles.eye}
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={isSubmitting}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button className={styles.submit} type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Checking…" : "Login"}
              </button>
            </form>
          ) : (
            <form className={styles.form} onSubmit={onCode} noValidate>
              {factor?.mode === "enroll" ? (
                <>
                  <img className={styles.qr} src={factor.qrCode} alt="Authenticator setup QR code" />
                  <p className={styles.help}>
                    Use Google Authenticator, Microsoft Authenticator, or Authy. If you cannot scan, enter this key manually.
                  </p>
                  <p className={styles.secret}>{factor.secret}</p>
                </>
              ) : null}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="billing-otp">
                  Authenticator code
                </label>
                <input
                  id="billing-otp"
                  className={styles.otp}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isSubmitting}
                  required
                  autoFocus
                />
              </div>
              <button className={styles.submit} type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Verifying…" : "Verify and continue"}
              </button>
              <button className={styles.textButton} type="button" onClick={() => void backToCredentials()} disabled={isSubmitting}>
                Use a different account
              </button>
            </form>
          )}
          <p className={styles.footer}>Electro Tech · Electrical &amp; Solar Solutions</p>
        </div>
      </section>
    </main>
  );
}
