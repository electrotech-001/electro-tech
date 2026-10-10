import { WhatsAppServiceError } from "./errors.js";

const DOCUMENT_LABELS = {
  quotation: "Quotation",
  invoice: "Invoice",
  agreement: "Agreement",
  slip: "Paid slip",
  thanks: "Thank you",
  feedback: "Feedback",
  reminder: "Reminder",
  card: "Message",
} as const;

export type WhatsAppDocumentKind = keyof typeof DOCUMENT_LABELS;

export function normalizeCustomerPhone(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const withoutPrefix = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : compact;
  const local = /^0\d{10}$/.test(withoutPrefix) ? `92${withoutPrefix.slice(1)}` : withoutPrefix;
  if (!/^\d{8,15}$/.test(local)) {
    throw new WhatsAppServiceError(
      "Enter a valid customer WhatsApp number.",
      400,
      "invalid_phone",
    );
  }
  return local;
}

export function formatWhatsAppPhone(phone: string): string {
  if (phone.startsWith("92") && phone.length === 12) {
    return `+92 ${phone.slice(2, 5)} ${phone.slice(5)}`;
  }
  return `+${phone}`;
}

export function customerJid(phone: string): string {
  return `${phone}@s.whatsapp.net`;
}

export function documentLabel(kind: WhatsAppDocumentKind): string {
  return DOCUMENT_LABELS[kind];
}

export function documentFileName(kind: WhatsAppDocumentKind, originalName: string, mimeType: string): string {
  const extension = mimeType === "application/pdf"
    ? "pdf"
    : mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const cleaned = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w -]+/g, "")
    .trim()
    .slice(0, 60);
  const stem = cleaned || `Electro-Tech-${documentLabel(kind)}`;
  return `${stem}.${extension}`;
}

export function documentCaption(kind: WhatsAppDocumentKind, message: string): string {
  const label = documentLabel(kind);
  const text = message.trim();
  if (text.toLowerCase().startsWith(label.toLowerCase())) return text;
  return `${label}\n${text}`;
}
