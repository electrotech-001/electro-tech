import { Resend } from "resend";
import { z } from "zod";
import { normalizePhone, type QuoteData } from "../validation/quote.js";

const emailAddressSchema = z.string().trim().email().max(320);
const sensitiveBillIdentifier = /\b(account|reference|meter|consumer)(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*[a-z0-9][a-z0-9/-]{3,}\b/gi;

export type QuoteEmailConfig = {
  apiKey: string;
  toEmail: string;
  fromEmail: string;
};

export type QuoteEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type ResendEmailClient = {
  emails: {
    send(payload: QuoteEmailPayload): Promise<{
      data: { id: string } | null;
      error: unknown;
    }>;
  };
};

export type QuoteEmailDependencies = {
  environment?: NodeJS.ProcessEnv;
  createClient?: (apiKey: string) => ResendEmailClient;
};

export type QuoteEmailSender = (quote: QuoteData) => Promise<{ id: string }>;

export class QuoteEmailError extends Error {
  constructor(
    public readonly code: "not_configured" | "delivery_failed",
    message: string,
  ) {
    super(message);
    this.name = "QuoteEmailError";
  }
}

function isValidSender(value: string): boolean {
  if (/\r|\n|,/.test(value)) return false;
  const displayAddress = /^(?:[^<>]{1,100})<([^<>]+)>$/.exec(value);
  return emailAddressSchema.safeParse(displayAddress?.[1]?.trim() ?? value).success;
}

export function loadQuoteEmailConfig(environment: NodeJS.ProcessEnv = process.env): QuoteEmailConfig {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const toEmail = environment.QUOTE_TO_EMAIL?.trim();
  const fromEmail = environment.QUOTE_FROM_EMAIL?.trim();

  if (
    !apiKey || /\r|\n/.test(apiKey) ||
    !toEmail || !emailAddressSchema.safeParse(toEmail).success ||
    !fromEmail || !isValidSender(fromEmail)
  ) {
    throw new QuoteEmailError("not_configured", "Quote email delivery is not configured.");
  }

  return { apiKey, toEmail, fromEmail };
}

export function sanitizeQuoteText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(sensitiveBillIdentifier, (_match, label: string) => `${label} number: [redacted]`);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

function quoteEmailFields(quote: QuoteData): Array<[string, string]> {
  const fields: Array<[string, string | undefined]> = [
    ["Name", sanitizeQuoteText(quote.fullName)],
    ["Phone", normalizePhone(quote.phone)],
    ["Email", quote.email ? sanitizeQuoteText(quote.email) : undefined],
    ["Company / organization", quote.company ? sanitizeQuoteText(quote.company) : undefined],
    ["City / project location", sanitizeQuoteText(quote.city)],
    ["Requested service", quote.service],
    ["Property type", quote.propertyType],
    ["System preference", quote.systemType],
    ["Requested / estimated capacity", quote.requiredCapacity ? sanitizeQuoteText(quote.requiredCapacity) : undefined],
    ["Monthly bill range", quote.monthlyBillRange],
    ["Message", quote.message ? sanitizeQuoteText(quote.message) : undefined],
  ];

  if (quote.analyzerContext) {
    const context = quote.analyzerContext;
    fields.push(
      ["Analyzer source", context.source],
      ["Analyzer utility", context.utility ?? undefined],
      ["Analyzer tariff", context.tariff ?? undefined],
      ["Analyzer mode", context.analysisMode],
      ["Analyzer selected architecture", context.selectedArchitecture ?? undefined],
      ["Analyzer recommended architecture", context.recommendedArchitecture],
      ["Analyzer PV capacity", `${formatNumber(context.pvCapacityKwp)} kWp`],
      ["Analyzer panels", String(context.panels)],
      ["Analyzer inverter", `${formatNumber(context.inverterKw)} kW`],
      ["Analyzer battery", context.battery ? sanitizeQuoteText(context.battery) : undefined],
      ["Analyzer annual consumption", `${formatNumber(context.annualConsumptionKwh)} kWh`],
      ["Analyzer city", sanitizeQuoteText(context.city)],
      ["Estimated practical bill reduction", context.estimatedBillReductionPercent == null ? undefined : `${formatNumber(context.estimatedBillReductionPercent)}%`],
      ["Estimated remaining annual bill", context.estimatedRemainingBillPkr == null ? undefined : `PKR ${formatNumber(context.estimatedRemainingBillPkr)}`],
      ["Green meter status", context.greenMeterStatus],
      ["Backup requirement", sanitizeQuoteText(context.backupRequirement)],
      ["Bill extraction confidence", context.confidence.billExtraction],
      ["Tariff / policy confidence", context.confidence.tariffPolicy],
      ["Recommendation confidence", context.confidence.recommendation],
    );
  }

  return fields.filter((field): field is [string, string] => Boolean(field[1]));
}

export function buildQuoteEmail(quote: QuoteData): Pick<QuoteEmailPayload, "subject" | "html" | "text"> {
  const fields = quoteEmailFields(quote);
  const text = [
    "A new project quote request was submitted through the Electrotech website.",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "This email was delivered without storing the submission in the Electrotech application.",
  ].join("\n");
  const rows = fields
    .map(([label, value]) => `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #e5e5e5;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${escapeHtml(value)}</td></tr>`)
    .join("");

  return {
    subject: "New Solar Quote Request — Electrotech",
    text,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#171717"><h1 style="font-size:22px">New Electrotech quote request</h1><p>A visitor submitted the following validated project details.</p><table style="border-collapse:collapse;max-width:720px;width:100%">${rows}</table><p style="color:#666;font-size:13px">This email was delivered without storing the submission in the Electrotech application.</p></body></html>`,
  };
}

export async function sendQuoteEmail(
  quote: QuoteData,
  dependencies: QuoteEmailDependencies = {},
): Promise<{ id: string }> {
  const config = loadQuoteEmailConfig(dependencies.environment);
  const createClient = dependencies.createClient ?? ((apiKey: string) => new Resend(apiKey) as unknown as ResendEmailClient);
  const client = createClient(config.apiKey);
  const content = buildQuoteEmail(quote);
  const payload: QuoteEmailPayload = {
    from: config.fromEmail,
    to: [config.toEmail],
    ...content,
    ...(quote.email ? { replyTo: quote.email } : {}),
  };

  try {
    const { data, error } = await client.emails.send(payload);
    if (error || !data?.id) {
      throw new QuoteEmailError("delivery_failed", "The email provider did not accept the quote request.");
    }
    return { id: data.id };
  } catch (error) {
    if (error instanceof QuoteEmailError) throw error;
    throw new QuoteEmailError("delivery_failed", "The email provider could not accept the quote request.");
  }
}
