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

export type ActiveAdminUser = {
  userId: string;
  displayName: string;
  isActive: boolean;
};

/**
 * Queries 'admin_users' for an active administrator with the given user UUID.
 * Returns null if the user record does not exist or is_active is false.
 */
export async function getActiveAdminUser(
  userId: string,
  client?: SupabaseClient,
): Promise<ActiveAdminUser | null> {
  try {
    const supabase = client ?? getSupabaseClient();
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id, display_name, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error("Database query failed.");
    }

    if (!data || !data.is_active) {
      return null;
    }

    return {
      userId: data.user_id,
      displayName: data.display_name,
      isActive: data.is_active,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Database query failed.") {
      throw error;
    }
    throw new Error("Database query failed.");
  }
}
