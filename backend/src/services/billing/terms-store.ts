import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase.js";

const MAX_LENGTH = 4000;

export class TermsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "invalid_terms") {
    super(message);
    this.name = "TermsError";
    this.status = status;
    this.code = code;
  }
}

export type TermsRepository = {
  read(): Promise<string>;
  save(body: string): Promise<string>;
};

export function cleanTerms(body: string): string {
  const text = body.trim();
  if (text.length > MAX_LENGTH) throw new TermsError("Terms and conditions must be 4000 characters or fewer.");
  return text;
}

export function createMemoryTermsRepository(initial = ""): TermsRepository {
  let body = cleanTerms(initial);
  return {
    async read() {
      return body;
    },
    async save(next) {
      body = cleanTerms(next);
      return body;
    },
  };
}

type TermsRow = {
  body: string;
};

export function createSupabaseTermsRepository(client: SupabaseClient): TermsRepository {
  function storageFailure(error: { message: string }, action: string): TermsError {
    console.error(`Terms and conditions could not be ${action}.`, error.message);
    return new TermsError("Terms storage is unavailable.", 503, "storage_unavailable");
  }

  return {
    async read() {
      const result = await client.from("billing_document_terms").select("body").eq("id", 1).maybeSingle();
      if (result.error) throw storageFailure(result.error, "read");
      return (result.data as TermsRow | null)?.body ?? "";
    },
    async save(next) {
      const body = cleanTerms(next);
      const saved = await client.from("billing_document_terms").upsert({
        id: 1,
        body,
        updated_at: new Date().toISOString(),
      }).select("body").single();
      if (saved.error || !saved.data) throw storageFailure(saved.error ?? { message: "Missing terms." }, "saved");
      return (saved.data as TermsRow).body;
    },
  };
}

let cached: TermsRepository | null = null;

export function getTermsRepository(): TermsRepository {
  if (!cached) cached = createSupabaseTermsRepository(getSupabaseClient());
  return cached;
}
