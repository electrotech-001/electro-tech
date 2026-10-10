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
