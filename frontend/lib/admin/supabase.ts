import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

/**
 * Storage key helper identifying this Supabase project's auth token key.
 */
export function getSupabaseAuthStorageKey(): string {
  try {
    if ((supabase?.auth as any)?.storageKey) {
      return (supabase.auth as any).storageKey;
    }
  } catch {}
  try {
    if (supabaseUrl) {
      const hostname = new URL(supabaseUrl).hostname;
      const ref = hostname.split(".")[0];
      if (ref) return `sb-${ref}-auth-token`;
    }
  } catch {}
  return "sb-pugoystdafgmmvnwyslo-auth-token";
}

/**
 * Removes legacy persistent auth tokens from localStorage for this Supabase project.
 * Does NOT clear unrelated localStorage items or use localStorage.clear().
 */
export function cleanLegacyLocalStorageAuth(customKey?: string): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    const key = customKey || getSupabaseAuthStorageKey();
    if (key) {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}-code-verifier`);
      window.localStorage.removeItem(`${key}-user`);
    }
  } catch {
    // Ignore environments where storage is restricted
  }
}

/**
 * Supabase browser client dedicated strictly to Supabase Auth.
 * The Admin Portal does NOT directly query tables or Storage;
 * all operational data flows through the Express backend.
 *
 * Auth sessions are persisted only within the current browser session
 * (window.sessionStorage), ensuring that closing the browser ends the session
 * while refreshes and same-session navigation remain authenticated.
 */
export const supabase = createClient(
  supabaseUrl || "https://pugoystdafgmmvnwyslo.supabase.co",
  supabasePublishableKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    },
  },
);

// Run cleanup immediately on module evaluation in browser environments
cleanLegacyLocalStorageAuth();
