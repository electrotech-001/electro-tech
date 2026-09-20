import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import { createAuthenticateAdmin } from "../src/middleware/authenticate-admin.js";
import { createAdminMeRouter } from "../src/routes/admin-me.js";
import type { ActiveAdminUser } from "../src/services/supabase.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

function createTestServer(options: {
  getUserResult?: {
    data: { user: { id: string; email?: string } | null };
    error: { message: string; status?: number } | null;
  };
  adminUserResult?: ActiveAdminUser | null;
}) {
  const app = express();
  const authMiddleware = createAuthenticateAdmin({
    getUser: async (_token: string) =>
      options.getUserResult ?? {
        data: { user: null },
        error: { message: "Invalid or expired token." },
      },
    getActiveAdmin: async (_userId: string) =>
      options.adminUserResult !== undefined ? options.adminUserResult : null,
  });

  app.use("/api/admin/me", createAdminMeRouter({ authMiddleware }));

  return new Promise<string>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      servers.add(server);
      const port = (server.address() as AddressInfo).port;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

test("GET /api/admin/me returns 401 when Authorization header is missing", async () => {
  const baseUrl = await createTestServer({});
  const response = await fetch(`${baseUrl}/api/admin/me`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "Unauthorized");
  assert.equal(body.message, "Missing authorization header.");
});

test("GET /api/admin/me returns 401 when token is invalid or expired", async () => {
  const baseUrl = await createTestServer({
    getUserResult: {
      data: { user: null },
      error: { message: "Invalid token" },
    },
  });
  const response = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { Authorization: "Bearer invalid-token" },
  });
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "Unauthorized");
  assert.equal(body.message, "Invalid or expired token.");
});

test("GET /api/admin/me returns 403 when authenticated user is not an active admin", async () => {
  const baseUrl = await createTestServer({
    getUserResult: {
      data: { user: { id: "user-123", email: "nonadmin@example.com" } },
      error: null,
    },
    adminUserResult: null, // Not in admin_users table
  });
  const response = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { Authorization: "Bearer valid-token-non-admin" },
  });
  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "Forbidden");
  assert.equal(body.message, "Access denied. Active administrator permissions required.");
});

test("GET /api/admin/me returns 403 when admin user is deactivated", async () => {
  const baseUrl = await createTestServer({
    getUserResult: {
      data: { user: { id: "user-deactivated", email: "inactive@example.com" } },
      error: null,
    },
    adminUserResult: {
      userId: "user-deactivated",
      displayName: "Inactive Admin",
      isActive: false,
    },
  });
  const response = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { Authorization: "Bearer valid-token-inactive" },
  });
  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "Forbidden");
});

test("GET /api/admin/me returns 200 with minimal trusted user data for active administrator", async () => {
  const baseUrl = await createTestServer({
    getUserResult: {
      data: { user: { id: "admin-uuid-1", email: "admin@electrotech.pk" } },
      error: null,
    },
    adminUserResult: {
      userId: "admin-uuid-1",
      displayName: "Lead Administrator",
      isActive: true,
    },
  });
  const response = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { Authorization: "Bearer valid-admin-token" },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    user: { userId: string; email: string; displayName: string };
  };

  assert.deepEqual(body, {
    user: {
      userId: "admin-uuid-1",
      email: "admin@electrotech.pk",
      displayName: "Lead Administrator",
    },
  });

  // Response safety checks: does NOT leak secrets, tokens, or raw admin rows
  const rawJson = JSON.stringify(body);
  assert.equal(rawJson.includes("token"), false);
  assert.equal(rawJson.includes("refreshToken"), false);
  assert.equal(rawJson.includes("password"), false);
  assert.equal(rawJson.includes("secret"), false);
  assert.equal(rawJson.includes("is_active"), false);
  assert.equal(rawJson.includes("created_at"), false);
});
