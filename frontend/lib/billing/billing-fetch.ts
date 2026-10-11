import { apiUrl } from "../api-origin";
import { billingSupabase } from "./supabase";

const NETWORK_MESSAGE = "The billing API is not running. Start it, then try again.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let pendingToken: Promise<string | null> | null = null;

async function readAccessToken(): Promise<string | null> {
  if (!pendingToken) {
    pendingToken = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { data } = await billingSupabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) return token;
        } catch {
          // Several pages ask for the session at once. The auth lock can miss the first try.
        }
        await sleep(120 * (attempt + 1));
      }
      return null;
    })().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

function canRetry(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export async function billingFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const retry = canRetry(method);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < (retry ? 3 : 1); attempt += 1) {
    const token = await readAccessToken();
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    try {
      const response = await fetch(apiUrl(path), { ...options, headers, cache: "no-store" });
      const overloaded = response.status === 502 || response.status === 503 || response.status === 429;
      const sessionLate = response.status === 401 && !token;
      if (retry && (overloaded || sessionLate) && attempt < 2) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!retry || attempt >= 2) break;
      await sleep(250 * (attempt + 1));
    }
  }

  const message = lastError instanceof Error && lastError.message.trim() ? lastError.message : NETWORK_MESSAGE;
  if (/failed to fetch|networkerror|load failed|aborted/i.test(message)) {
    throw new Error(NETWORK_MESSAGE);
  }
  throw new Error(NETWORK_MESSAGE);
}
