import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase.js";

export type TemplateKind = "reminder" | "thank_you" | "feedback" | "custom";

export type MessageTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  body: string;
  updatedAt: string;
};

export type TemplateDraft = {
  name: string;
  body: string;
};

export class TemplateError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "invalid_template") {
    super(message);
    this.name = "TemplateError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULTS: Array<Omit<MessageTemplate, "id" | "updatedAt">> = [
  {
    name: "Installment reminder",
    kind: "reminder",
    body: "Assalam o Alaikum {{name}}, this is Electro Tech. The installment for {{project}} ({{package}}) is due. Please arrange the payment at your earliest convenience.",
  },
  {
    name: "Thank you",
    kind: "thank_you",
    body: "Assalam o Alaikum {{name}}, thank you for completing your payments with Electro Tech for {{project}}. We are grateful for your trust.",
  },
  {
    name: "Feedback",
    kind: "feedback",
    body: "Assalam o Alaikum {{name}}, we hope the {{package}} installation for {{project}} is working well. Kindly share your feedback with Electro Tech when you have a moment.",
  },
];

const KIND_ORDER: TemplateKind[] = ["reminder", "thank_you", "feedback", "custom"];

export type TemplatesRepository = {
  list(): Promise<MessageTemplate[]>;
  create(draft: TemplateDraft): Promise<MessageTemplate>;
  update(id: string, draft: TemplateDraft): Promise<MessageTemplate>;
  remove(id: string): Promise<void>;
};

function cleanDraft(draft: TemplateDraft): TemplateDraft {
  const name = draft.name.trim();
  const body = draft.body.trim();
  if (!name || name.length > 80) throw new TemplateError("Enter a template name of 80 characters or fewer.");
  if (!body || body.length > 1000) throw new TemplateError("Enter a message of 1000 characters or fewer.");
  return { name, body };
}

function sortTemplates(rows: MessageTemplate[]): MessageTemplate[] {
  return [...rows].sort((left, right) => {
    const kindOrder = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
    if (kindOrder !== 0) return kindOrder;
    return left.name.localeCompare(right.name);
  });
}

export function createMemoryTemplatesRepository(): TemplatesRepository {
  const rows: MessageTemplate[] = DEFAULTS.map((template) => ({
    ...template,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  }));

  return {
    async list() {
      return sortTemplates(rows);
    },
    async create(draft) {
      const clean = cleanDraft(draft);
      const created: MessageTemplate = {
        id: crypto.randomUUID(),
        name: clean.name,
        kind: "custom",
        body: clean.body,
        updatedAt: new Date().toISOString(),
      };
      rows.push(created);
      return created;
    },
    async update(id, draft) {
      const clean = cleanDraft(draft);
      const current = rows.find((row) => row.id === id);
      if (!current) throw new TemplateError("Template was not found.", 404, "not_found");
      current.name = clean.name;
      current.body = clean.body;
      current.updatedAt = new Date().toISOString();
      return { ...current };
    },
    async remove(id) {
      const index = rows.findIndex((row) => row.id === id);
      const current = rows[index];
      if (!current) throw new TemplateError("Template was not found.", 404, "not_found");
      if (current.kind !== "custom") throw new TemplateError("This template stays in the list. You can edit the message.", 409, "builtin");
      rows.splice(index, 1);
    },
  };
}

type TemplateRow = {
  id: string;
  name: string;
  kind: TemplateKind;
  body: string;
  updated_at: string;
};

function fromRow(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseTemplatesRepository(client: SupabaseClient): TemplatesRepository {
  function storageFailure(error: { message: string }, action: string): TemplateError {
    console.error(`Message template could not be ${action}.`, error.message);
    return new TemplateError("Template storage is unavailable.", 503, "storage_unavailable");
  }

  async function ensureDefaults(): Promise<void> {
    const existing = await client.from("billing_message_templates").select("kind");
    if (existing.error) throw storageFailure(existing.error, "listed");
    const present = new Set(((existing.data ?? []) as Array<{ kind: string }>).map((row) => row.kind));
    const missing = DEFAULTS.filter((template) => !present.has(template.kind));
    if (missing.length === 0) return;
    const inserted = await client.from("billing_message_templates").insert(missing.map((template) => ({
      name: template.name,
      kind: template.kind,
      body: template.body,
    })));
    if (inserted.error) throw storageFailure(inserted.error, "saved");
  }

  return {
    async list() {
      await ensureDefaults();
      const result = await client.from("billing_message_templates").select("id, name, kind, body, updated_at");
      if (result.error) throw storageFailure(result.error, "listed");
      return sortTemplates(((result.data ?? []) as TemplateRow[]).map(fromRow));
    },
    async create(draft) {
      const clean = cleanDraft(draft);
      const inserted = await client.from("billing_message_templates").insert({
        name: clean.name,
        kind: "custom",
        body: clean.body,
      }).select("id, name, kind, body, updated_at").single();
      if (inserted.error || !inserted.data) throw storageFailure(inserted.error ?? { message: "Missing template." }, "saved");
      return fromRow(inserted.data as TemplateRow);
    },
    async update(id, draft) {
      const clean = cleanDraft(draft);
      const updated = await client.from("billing_message_templates").update({
        name: clean.name,
        body: clean.body,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("id, name, kind, body, updated_at").maybeSingle();
      if (updated.error) throw storageFailure(updated.error, "updated");
      if (!updated.data) throw new TemplateError("Template was not found.", 404, "not_found");
      return fromRow(updated.data as TemplateRow);
    },
    async remove(id) {
      const found = await client.from("billing_message_templates").select("id, kind").eq("id", id).maybeSingle();
      if (found.error) throw storageFailure(found.error, "read");
      if (!found.data) throw new TemplateError("Template was not found.", 404, "not_found");
      if ((found.data as { kind: string }).kind !== "custom") {
        throw new TemplateError("This template stays in the list. You can edit the message.", 409, "builtin");
      }
      const removed = await client.from("billing_message_templates").delete().eq("id", id);
      if (removed.error) throw storageFailure(removed.error, "deleted");
    },
  };
}

let cached: TemplatesRepository | null = null;

export function getTemplatesRepository(): TemplatesRepository {
  if (!cached) cached = createSupabaseTemplatesRepository(getSupabaseClient());
  return cached;
}
