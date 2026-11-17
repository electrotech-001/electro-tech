export type TemplateKind = "reminder" | "thank_you" | "feedback" | "custom";

export type TemplateValues = {
  name: string;
  project: string;
  packageName: string;
  phone: string;
};

export function fillTemplate(body: string, values: TemplateValues): string {
  return body
    .replaceAll("{{name}}", values.name)
    .replaceAll("{{project}}", values.project)
    .replaceAll("{{package}}", values.packageName)
    .replaceAll("{{phone}}", values.phone);
}

export function withCustomerName(body: string, name: string): string {
  const clean = name.trim();
  if (!clean) return body;
  if (body.toLowerCase().includes(clean.toLowerCase())) return body;
  return `${clean}\n\n${body}`;
}

export function thankYouCardMessage(name: string, project: string): string {
  const customer = name.trim() || "Valued customer";
  const job = project.trim();
  return `Assalam o Alaikum ${customer}, thank you for completing your payments with Electro Tech${job ? ` for ${job}` : ""}. We are grateful for your trust.`;
}

export function templateKindLabel(kind: TemplateKind): string {
  if (kind === "thank_you") return "Thank you";
  if (kind === "feedback") return "Feedback";
  if (kind === "reminder") return "Reminder";
  return "Custom";
}

export function templateCardTitle(kind: TemplateKind): string {
  if (kind === "thank_you") return "THANK YOU";
  if (kind === "feedback") return "FEEDBACK";
  if (kind === "reminder") return "REMINDER";
  return "MESSAGE";
}

export function templateSendsCard(kind: TemplateKind): boolean {
  return kind === "thank_you" || kind === "feedback";
}
