import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/billing/supabase", () => ({
  billingSupabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "token-1" } } }),
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadBillingFetch() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.electrotech.test");
  return (await import("@/lib/billing/billing-fetch")).billingFetch;
}

test("a blocked API host is reached through the site's own domain", async () => {
  const billingFetch = await loadBillingFetch();
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://api.electrotech.test")) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ status: "qr" }), { status: 200 });
  });

  const first = await billingFetch("/api/billing/whatsapp/connect", { method: "POST" });
  const second = await billingFetch("/api/billing/whatsapp");

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(urls).toEqual([
    "https://api.electrotech.test/api/billing/whatsapp/connect",
    "/backend/api/billing/whatsapp/connect",
    "/backend/api/billing/whatsapp",
  ]);
});

test("a reachable API host is used directly", async () => {
  const billingFetch = await loadBillingFetch();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

  await billingFetch("/api/billing/quotations");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.electrotech.test/api/billing/quotations");
  const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
  expect(headers.get("Authorization")).toBe("Bearer token-1");
});

test("when neither route answers, staff see a plain connection message", async () => {
  const billingFetch = await loadBillingFetch();
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

  await expect(billingFetch("/api/billing/whatsapp/connect", { method: "POST" })).rejects.toThrow(
    "The billing server could not be reached. Check the internet connection, then try again.",
  );
});
