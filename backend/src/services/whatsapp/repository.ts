import type { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppServiceError } from "./errors.js";

export type WhatsAppLinkStatus = "disconnected" | "connecting" | "qr" | "connected";

export type WhatsAppConnectionRecord = {
  status: WhatsAppLinkStatus;
  phone: string | null;
  pushName: string | null;
};

export type WhatsAppAuthRepository = {
  read(key: string): Promise<unknown | null>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
};

export type WhatsAppConnectionStore = {
  write(record: WhatsAppConnectionRecord): Promise<void>;
};

const AUTH_TABLE = "whatsapp_auth";
const CONNECTION_TABLE = "whatsapp_connection";
const CONNECTION_ID = "official";

function storageError(error: { message: string }, action: string): WhatsAppServiceError {
  console.error(`WhatsApp session could not be ${action}.`, error.message);
  return new WhatsAppServiceError(
    "WhatsApp session storage is unavailable.",
    503,
    "storage_unavailable",
  );
}

export function createMemoryAuthRepository(): WhatsAppAuthRepository {
  const rows = new Map<string, unknown>();
  return {
    async read(key) {
      return rows.has(key) ? rows.get(key) ?? null : null;
    },
    async write(key, value) {
      rows.set(key, value);
    },
    async remove(key) {
      rows.delete(key);
    },
    async clear() {
      rows.clear();
    },
  };
}

export function createMemoryConnectionStore(): WhatsAppConnectionStore & {
  record: WhatsAppConnectionRecord;
} {
  const state: WhatsAppConnectionRecord = {
    status: "disconnected",
    phone: null,
    pushName: null,
  };
  return {
    record: state,
    async write(record) {
      state.status = record.status;
      state.phone = record.phone;
      state.pushName = record.pushName;
    },
  };
}

export function createSupabaseAuthRepository(client: SupabaseClient): WhatsAppAuthRepository {
  return {
    async read(key) {
      const { data, error } = await client
        .from(AUTH_TABLE)
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw storageError(error, "read");
      return data?.value ?? null;
    },
    async write(key, value) {
      const { error } = await client.from(AUTH_TABLE).upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      });
      if (error) throw storageError(error, "saved");
    },
    async remove(key) {
      const { error } = await client.from(AUTH_TABLE).delete().eq("key", key);
      if (error) throw storageError(error, "updated");
    },
    async clear() {
      const { error } = await client.from(AUTH_TABLE).delete().neq("key", "");
      if (error) throw storageError(error, "cleared");
    },
  };
}

export function createSupabaseConnectionStore(client: SupabaseClient): WhatsAppConnectionStore {
  return {
    async write(record) {
      const now = new Date().toISOString();
      const { error } = await client.from(CONNECTION_TABLE).upsert({
        id: CONNECTION_ID,
        status: record.status,
        phone: record.phone,
        push_name: record.pushName,
        connected_at: record.status === "connected" ? now : null,
        updated_at: now,
      });
      if (error) throw storageError(error, "status saved");
    },
  };
}
