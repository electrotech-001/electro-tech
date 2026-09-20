"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./useAuth";

export function LoginPage() {
  const { status, error, signIn, clearError } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const from = searchParams.get("from") || "/admin";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(from);
    }
  }, [status, from, router]);

  // If already authenticated and authorized, redirect to admin home
  if (status === "authenticated") {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Redirecting...</p>
      </div>
    );
  }

  // If still checking initial session on client, show loading
  if (typeof window !== "undefined" && status === "loading" && !isSubmitting) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Checking session...</p>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setLocalError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError("Please enter both email and password.");
      return;
    }

    try {
      setIsSubmitting(true);
      await signIn(trimmedEmail, password);
      router.replace(from);
    } catch {
      // Clear password on error as a security best practice
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = localError || error;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <img
              src="/logos/electrotech-horizontal.png"
              alt="Electro Tech"
              className="auth-logo-img"
            />
            <span className="auth-badge">Admin Portal</span>
          </div>
          <h1 className="auth-title">Sign In</h1>
          <p className="auth-subtitle">Authorized personnel only</p>
        </div>

        {displayedError && (
          <div className="alert-banner alert-danger" role="alert">
            <span>{displayedError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@electrotech.pk"
              required
              autoFocus
              autoComplete="username"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <div className="input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
