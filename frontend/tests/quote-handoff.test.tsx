import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ElectroTechSite } from "@/components/electro-tech-site";
import { ANALYZER_LEAD_STORAGE_KEY, type AnalyzerLeadContext } from "@/lib/solar-analyzer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function completeRequiredQuoteFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full Name/), "Test Customer");
  await user.type(screen.getByLabelText(/Phone \/ WhatsApp/), "+92 310 5056394");
  await user.type(screen.getByLabelText(/City \/ Project Location/), "Attock");
}

test("quote form uses the backend origin and presents email success with optional WhatsApp", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.electrotech.test/");
  const handoffMessage = "Hello Electro Tech, I would like to request a solar quote.";
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/projects")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      message: "Your request has been sent successfully.",
      handoff: { channel: "whatsapp", message: handoffMessage },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const user = userEvent.setup();

  render(<ElectroTechSite />);
  await completeRequiredQuoteFields(user);
  await user.click(screen.getByRole("button", { name: /Request My Quote/i }));

  await waitFor(() => {
    const quoteCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/quote"));
    expect(quoteCall).toBeDefined();
  });
  const quoteCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/quote"))!;
  expect(quoteCall[0]).toBe("https://api.electrotech.test/api/quote");
  expect(await screen.findByRole("heading", { name: /your request has been sent/i })).toBeTruthy();
  expect(screen.getByText(/No quote details were stored/i)).toBeTruthy();
  const link = screen.getByRole("link", { name: /Also Send via WhatsApp/i });
  expect(link.getAttribute("href")).toBe(
    `https://wa.me/923105056394?text=${encodeURIComponent(handoffMessage)}`,
  );
});

test("email failure keeps the form and exposes the prepared WhatsApp fallback", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.electrotech.test");
  const handoffMessage = "Hello Electro Tech, please review this fallback quote.";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/projects")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      message: "We couldn't send your request right now. Please try again or contact us on WhatsApp.",
      handoff: { channel: "whatsapp", message: handoffMessage },
    }), { status: 503, headers: { "content-type": "application/json" } });
  });
  const user = userEvent.setup();

  render(<ElectroTechSite />);
  await completeRequiredQuoteFields(user);
  await user.click(screen.getByRole("button", { name: /Request My Quote/i }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't send your request right now/i);
  const fallback = screen.getByRole("link", { name: /Send via WhatsApp/i });
  expect(fallback.getAttribute("href")).toBe(
    `https://wa.me/923105056394?text=${encodeURIComponent(handoffMessage)}`,
  );
});

test("one-time analyzer summary is included as structured quote context", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.electrotech.test");
  const context: AnalyzerLeadContext = {
    source: "solar_bill_analyzer",
    utility: "IESCO",
    tariff: "A-1",
    city: "Attock",
    annualConsumptionKwh: 14_400,
    analysisMode: "both",
    selectedArchitecture: "On-Grid Only",
    recommendedArchitecture: "Hybrid + Green Meter + Battery",
    pvCapacityKwp: 10.8,
    panels: 19,
    inverterKw: 10,
    battery: "10.24 kWh",
    estimatedBillReductionPercent: 72.4,
    estimatedRemainingBillPkr: 118_000,
    greenMeterStatus: "yes",
    backupRequirement: "essential · 4 hours",
    confidence: { billExtraction: "High", tariffPolicy: "High", recommendation: "Medium" },
  };
  window.sessionStorage.setItem(ANALYZER_LEAD_STORAGE_KEY, JSON.stringify(context));
  window.history.replaceState({}, "", "/?source=solar_bill_analyzer#contact");
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/projects")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      message: "Your request has been sent successfully.",
      handoff: { channel: "whatsapp", message: "Analyzer quote" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const user = userEvent.setup();

  render(<ElectroTechSite />);
  await completeRequiredQuoteFields(user);
  await user.click(screen.getByRole("button", { name: /Request My Quote/i }));
  await waitFor(() => {
    const quoteCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/quote"));
    expect(quoteCall).toBeDefined();
  });
  const quoteCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/quote"))!;
  const request = quoteCall[1] as RequestInit;
  expect(JSON.parse(String(request.body)).analyzerContext).toEqual(context);
});
