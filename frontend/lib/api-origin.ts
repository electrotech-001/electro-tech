export function getApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  throw new Error("The Electrotech API is not configured.");
}

export function apiUrl(path: string): string {
  return `${getApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function friendlyFetchError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : "";
  if (/failed to fetch|networkerror when attempting to fetch resource|^load failed$/i.test(message)) return fallback;
  if (message) return message;
  return fallback;
}
