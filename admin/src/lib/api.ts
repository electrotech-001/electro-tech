import { supabase } from "./supabase.js";

const apiOrigin = import.meta.env.VITE_API_ORIGIN || "";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export type AdminMeResponse = {
  user: {
    userId: string;
    email: string;
    displayName: string;
  };
};

/**
 * Executes an authenticated request to the Express backend API.
 * Automatically attaches the current Supabase session JWT in the Authorization header.
 */
export async function adminApiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !headers.has("Content-Type") &&
    options.body &&
    typeof options.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiOrigin}${normalizedPath}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (typeof obj.message === "string") {
        message = obj.message;
      } else if (typeof obj.error === "string") {
        message = obj.error;
      }
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

/**
 * Fetches the currently authenticated administrator profile from the backend.
 */
export async function fetchAdminMe(): Promise<AdminMeResponse> {
  return adminApiFetch<AdminMeResponse>("/api/admin/me");
}
