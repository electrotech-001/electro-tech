import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://pugoystdafgmmvnwyslo.supabase.co";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

/**
 * Browser client for the Billing CMS only.
 * A separate storage key keeps this session apart from the project admin portal.
 */
export const billingSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "sb-electrotech-billing-auth",
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
  },
});
