import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WhatsAppConnectPage } from "@/components/billing/WhatsAppConnectPage";

const status = {
  fetchWhatsAppStatus: vi.fn(),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  sendWhatsAppDocument: vi.fn(),
};

vi.mock("@/lib/billing/whatsapp-api", () => ({
  fetchWhatsAppStatus: (...args: unknown[]) => status.fetchWhatsAppStatus(...args),
  connectWhatsApp: (...args: unknown[]) => status.connectWhatsApp(...args),
  disconnectWhatsApp: (...args: unknown[]) => status.disconnectWhatsApp(...args),
  sendWhatsAppDocument: (...args: unknown[]) => status.sendWhatsAppDocument(...args),
  WhatsAppApiError: class WhatsAppApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows a saved session resume action and the document sender when connected", async () => {
  status.fetchWhatsAppStatus.mockResolvedValue({
    status: "connected",
    phone: "923001234567",
    phoneDisplay: "+92 300 1234567",
    pushName: "Electro Tech",
    qrDataUrl: null,
    savedSession: true,
    error: null,
  });

  render(<WhatsAppConnectPage />);

  expect(await screen.findByText("+92 300 1234567")).toBeTruthy();
  expect(screen.getByText("Electro Tech")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send quotation" })).toBeTruthy();
  expect(screen.getByLabelText("Customer WhatsApp")).toBeTruthy();
});

it("offers a fresh QR connection when nothing is saved", async () => {
  status.fetchWhatsAppStatus.mockResolvedValue({
    status: "disconnected",
    phone: null,
    phoneDisplay: null,
    pushName: null,
    qrDataUrl: null,
    savedSession: false,
    error: null,
  });

  render(<WhatsAppConnectPage />);

  expect(await screen.findByRole("button", { name: "Connect WhatsApp" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send quotation" }).closest("fieldset")?.hasAttribute("disabled")).toBe(true);
});
