import { Router } from "express";
import { DEFAULT_OPERATIONAL_CONFIG } from "../config.js";
import { QuoteEmailError, sanitizeQuoteText, sendQuoteEmail, type QuoteEmailSender } from "../services/email.js";
import { createQuoteRateLimiter } from "../services/rate-limit.js";
import { normalizePhone, quoteSchema } from "../validation/quote.js";

export const MAX_QUOTE_BODY_BYTES = 16_384;

function createWhatsAppMessage(data: ReturnType<typeof quoteSchema.parse>): string {
  const lines = [
    "Hello Electro Tech, I would like to request a project quote.",
    "",
    `Name: ${sanitizeQuoteText(data.fullName)}`,
    `Phone: ${normalizePhone(data.phone)}`,
    `City / project location: ${sanitizeQuoteText(data.city)}`,
    `Service: ${data.service}`,
  ];

  if (data.email) lines.push(`Email: ${sanitizeQuoteText(data.email)}`);
  if (data.company) lines.push(`Company / organization: ${sanitizeQuoteText(data.company)}`);
  if (data.propertyType) lines.push(`Property type: ${data.propertyType}`);
  if (data.systemType) lines.push(`Preferred system: ${data.systemType}`);
  if (data.requiredCapacity) lines.push(`Required capacity: ${sanitizeQuoteText(data.requiredCapacity)}`);
  if (data.monthlyBillRange) lines.push(`Monthly bill range: ${data.monthlyBillRange}`);
  if (data.message) lines.push("", `Project details: ${sanitizeQuoteText(data.message)}`);

  if (data.analyzerContext) {
    const context = data.analyzerContext;
    lines.push(
      "",
      "Solar Bill Analyzer summary:",
      `Recommended system: ${context.recommendedArchitecture}`,
      `PV capacity: ${context.pvCapacityKwp} kWp`,
      `Panels: ${context.panels}`,
      `Inverter: ${context.inverterKw} kW`,
      ...(context.battery ? [`Battery: ${sanitizeQuoteText(context.battery)}`] : []),
      ...(context.estimatedBillReductionPercent == null ? [] : [`Estimated practical bill reduction: ${context.estimatedBillReductionPercent}%`]),
    );
  }

  lines.push("", "Please review these details and advise on the next step.");
  return lines.join("\n");
}

type QuoteRouterDependencies = {
  sendEmail?: QuoteEmailSender;
  rateLimitMax?: number;
};

export function createQuoteRouter(dependencies: QuoteRouterDependencies = {}) {
  const router = Router();
  const deliverEmail = dependencies.sendEmail ?? sendQuoteEmail;

  router.post("/", createQuoteRateLimiter(dependencies.rateLimitMax ?? DEFAULT_OPERATIONAL_CONFIG.quoteRateLimitMax), async (request, response) => {
    if (request.body === undefined) {
      return response.status(400).json({ message: "Invalid request." });
    }

    const parsed = quoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({
        message: "Please review the highlighted fields.",
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const data = parsed.data;
    const handoff = {
      channel: "whatsapp" as const,
      message: createWhatsAppMessage(data),
    };

    try {
      await deliverEmail(data);
    } catch (error) {
      console.error("Quote email delivery failed", {
        reason: error instanceof QuoteEmailError ? error.code : "unexpected",
      });
      return response.status(503).json({
        message: "We couldn't send your request right now. Please try again or contact us on WhatsApp.",
        handoff,
      });
    }

    return response.json({
      ok: true,
      message: "Your request has been sent successfully.",
      handoff,
    });
  });

  return router;
}
