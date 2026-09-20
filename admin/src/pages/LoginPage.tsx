import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

export function LoginPage() {
  const { status, error, signIn, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || "/";

  // If already authenticated and authorized, redirect to admin home
  if (status === "authenticated") {
    return <Navigate to={from} replace />;
  }

  // If still checking initial session, show loading
  if (status === "loading" && !isSubmitting) {
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
            <svg
              className="auth-brand-logo"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0284c7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="auth-brand-name">Electro Tech</span>
          </div>
          <div>
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
