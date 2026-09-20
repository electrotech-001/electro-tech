import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkSupabaseConnection,
  getSupabaseClient,
  resetSupabaseClient,
} from "../src/services/supabase.js";

test("getSupabaseClient accepts an injected client and respects singleton caching", () => {
  resetSupabaseClient();
  const mockClient = { auth: {} } as unknown as SupabaseClient;

  const client1 = getSupabaseClient({ client: mockClient });
  assert.equal(client1, mockClient);

  // When config is injected
  resetSupabaseClient();
  const client2 = getSupabaseClient({
    config: {
      supabaseUrl: "https://example.supabase.co",
      supabaseSecretKey: "test-key",
    },
  });
  const client3 = getSupabaseClient();
  assert.equal(client2, client3);
  resetSupabaseClient();
});

test("checkSupabaseConnection returns ok: true on successful query", async () => {
  const mockClient = {
    from: (table: string) => {
      assert.equal(table, "projects");
      return {
        select: (cols: string) => {
          assert.equal(cols, "id");
          return {
            limit: (count: number) => {
              assert.equal(count, 1);
              return Promise.resolve({ data: [{ id: "test-uuid" }], error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const result = await checkSupabaseConnection(mockClient);
  assert.deepEqual(result, { ok: true });
});

test("checkSupabaseConnection returns sanitized error on query failure", async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: null, error: { message: "Internal Postgres Error: Sensitive DB Details" } }),
      }),
    }),
  } as unknown as SupabaseClient;

  const result = await checkSupabaseConnection(mockClient);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Database query failed.");
    assert.equal(result.error.includes("Sensitive DB Details"), false);
  }
});

test("checkSupabaseConnection handles thrown connection exception safely", async () => {
  const mockClient = {
    from: () => {
      throw new Error("Network unreachable at 192.168.1.1:5432");
    },
  } as unknown as SupabaseClient;

  const result = await checkSupabaseConnection(mockClient);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Could not connect to Supabase.");
    assert.equal(result.error.includes("192.168.1.1"), false);
  }
});
