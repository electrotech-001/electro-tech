import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseConfig, type SupabaseConfig } from "../config.js";

export type SupabaseServiceDependencies = {
  config?: SupabaseConfig;
  client?: SupabaseClient;
};

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client initialized with the server-only secret key.
 * Disables session persistence, auto-refresh, and URL session detection for server execution.
 */
export function getSupabaseClient(dependencies: SupabaseServiceDependencies = {}): SupabaseClient {
  if (dependencies.client) {
    return dependencies.client;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const config = dependencies.config ?? loadSupabaseConfig();
  cachedClient = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

/**
 * Resets the cached singleton client (useful for testing).
 */
export function resetSupabaseClient(): void {
  cachedClient = null;
}

export type SupabaseConnectionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Performs a minimal, read-only query against the 'projects' table (selecting 'id' with limit 1)
 * to verify database connectivity without exposing raw error details or executing mutations.
 */
export async function checkSupabaseConnection(
  client?: SupabaseClient,
): Promise<SupabaseConnectionResult> {
  try {
    const supabase = client ?? getSupabaseClient();
    const { error } = await supabase
      .from("projects")
      .select("id")
      .limit(1);

    if (error) {
      return {
        ok: false,
        error: "Database query failed.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not connect to Supabase.",
    };
  }
}
