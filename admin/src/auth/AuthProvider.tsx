import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, fetchAdminMe, type AdminMeResponse } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";

export type AdminUser = AdminMeResponse["user"];

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextType = {
  status: AuthStatus;
  user: AdminUser | null;
  session: Session | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep references to latest user and status to avoid stale closures in auth listeners
  const userRef = useRef<AdminUser | null>(null);
  userRef.current = user;
  const statusRef = useRef<AuthStatus>("loading");
  statusRef.current = status;

  // Prevent race conditions during rapid state transitions
  const verificationSeq = useRef(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const verifyBackendAuthorization = useCallback(
    async (_currentSession?: Session): Promise<AdminUser | null> => {
      const seq = ++verificationSeq.current;
      try {
        const response = await fetchAdminMe();
        if (seq !== verificationSeq.current) return null;
        return response.user;
      } catch (err: unknown) {
        if (seq !== verificationSeq.current) return null;

        // If backend returns 403 Forbidden, the Supabase user is not an active Electro Tech admin
        if (err instanceof ApiError && err.status === 403) {
          await supabase.auth.signOut();
          setError("This account is not authorized to access the Electro Tech admin portal.");
          return null;
        }

        // If 401 or token is invalid, sign out
        if (err instanceof ApiError && err.status === 401) {
          await supabase.auth.signOut();
          setError("Invalid or expired session. Please sign in again.");
          return null;
        }

        // Infrastructure or connection issue
        setError("Admin authorization service is temporarily unavailable. Please try again later.");
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    // Listen to Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      // Handle sign-out or missing session
      if (event === "SIGNED_OUT" || !newSession) {
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      // Always update current session with newest JWT
      setSession(newSession);

      // 1. TOKEN_REFRESHED: Background token rotation
      // Must NOT set status to "loading" and must NOT remount the protected application.
      if (event === "TOKEN_REFRESHED") {
        // If the user is already authenticated with the same user ID, session update is complete
        if (userRef.current && userRef.current.userId === newSession.user.id) {
          return;
        }

        // If user identity changed or was not yet set, verify in background
        const verifiedUser = await verifyBackendAuthorization(newSession);
        if (!isMounted) return;

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
          setError(null);
        } else {
          setUser(null);
          setStatus("unauthenticated");
        }
        return;
      }

      // 2. SIGNED_IN: Can fire on fresh login or on window focus / re-connect
      if (event === "SIGNED_IN") {
        // If already authenticated as the same user, treat as a background session refresh
        if (
          userRef.current &&
          userRef.current.userId === newSession.user.id &&
          statusRef.current === "authenticated"
        ) {
          return;
        }

        // Otherwise, perform verification
        if (statusRef.current !== "loading") {
          setStatus("loading");
        }
        const verifiedUser = await verifyBackendAuthorization(newSession);
        if (!isMounted) return;

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
          setError(null);
        } else {
          setUser(null);
          setStatus("unauthenticated");
        }
        return;
      }

      // 3. INITIAL_SESSION: Application bootstrap
      if (event === "INITIAL_SESSION") {
        setStatus("loading");
        const verifiedUser = await verifyBackendAuthorization(newSession);
        if (!isMounted) return;

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
          setError(null);
        } else {
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [verifyBackendAuthorization]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setError(null);
      setStatus("loading");

      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        setStatus("unauthenticated");
        setError("Email and password are required.");
        throw new Error("Email and password are required.");
      }

      // 1. Authenticate with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError || !data.session) {
        setStatus("unauthenticated");
        setUser(null);
        setSession(null);
        const genericError = "Invalid email or password.";
        setError(genericError);
        throw new Error(genericError);
      }

      // 2. Verify backend authorization
      setSession(data.session);
      const verifiedUser = await verifyBackendAuthorization(data.session);

      if (!verifiedUser) {
        setStatus("unauthenticated");
        setUser(null);
        setSession(null);
        throw new Error(
          error ?? "This account is not authorized to access the Electro Tech admin portal.",
        );
      }

      setUser(verifiedUser);
      setStatus("authenticated");
      setError(null);
    },
    [error, verifyBackendAuthorization],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setUser(null);
      setStatus("unauthenticated");
      setError(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        session,
        error,
        signIn,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
