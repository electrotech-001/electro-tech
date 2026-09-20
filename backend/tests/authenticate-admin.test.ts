import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import express, { type RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authenticateAdmin,
  createAuthenticateAdmin,
  type AdminUserContext,
} from "../src/middleware/authenticate-admin.js";

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

async function startServer(middleware: RequestHandler): Promise<string> {
  const app = express();
  app.use(express.json());
  app.get("/admin/test", middleware, (request, response) => {
    response.status(200).json({
      ok: true,
      adminUser: request.adminUser,
    });
  });
  app.post("/admin/test", middleware, (request, response) => {
    response.status(200).json({
      ok: true,
      adminUser: request.adminUser,
    });
  });

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const VALID_TOKEN = "valid-test-token-xyz";
const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@electrotech.pk",
};
const MOCK_ADMIN_ROW = {
  userId: MOCK_USER.id,
  displayName: "Electro Admin",
  isActive: true,
};

// 1. No Authorization header -> 401
test("1. No Authorization header returns 401 Unauthorized", async () => {
  const baseUrl = await startServer(createAuthenticateAdmin());
  const res = await fetch(`${baseUrl}/admin/test`);

  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "Unauthorized");
  assert.equal(body.message, "Missing authorization header.");
});

// 2. Wrong auth scheme -> 401
test("2. Wrong auth scheme returns 401 Unauthorized", async () => {
  const baseUrl = await startServer(createAuthenticateAdmin());

  // Basic scheme
  const resBasic = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Basic dXNlcjpwYXNz" },
  });
  assert.equal(resBasic.status, 401);
  const bodyBasic = (await resBasic.json()) as { error: string; message: string };
  assert.equal(bodyBasic.error, "Unauthorized");
  assert.equal(bodyBasic.message, "Invalid authorization scheme.");

  // Custom scheme
  const resToken = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Token my-secret-token" },
  });
  assert.equal(resToken.status, 401);
  const bodyToken = (await resToken.json()) as { error: string; message: string };
  assert.equal(bodyToken.error, "Unauthorized");
});

// 3. Bearer with empty token -> 401
test("3. Bearer with empty token returns 401 Unauthorized", async () => {
  const baseUrl = await startServer(createAuthenticateAdmin());

  const res1 = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Bearer" },
  });
  assert.equal(res1.status, 401);

  const res2 = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Bearer " },
  });
  assert.equal(res2.status, 401);

  const res3 = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Bearer    " },
  });
  assert.equal(res3.status, 401);
});

// 4. Invalid Supabase token -> 401
test("4. Invalid Supabase token returns 401 Unauthorized", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: null },
      error: { message: "Invalid JWT signature", status: 401 },
    }),
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: "Bearer invalid.token.value" },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "Unauthorized");
  assert.equal(body.message, "Invalid or expired token.");
});

// 5. Expired/rejected Supabase token -> 401
test("5. Expired or rejected Supabase token returns 401 Unauthorized", async () => {
  // Expired token (status 400 from Supabase Auth)
  const middlewareExpired = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: null },
      error: { message: "JWT expired", status: 400 },
    }),
  });
  const baseUrlExpired = await startServer(middlewareExpired);
  const resExpired = await fetch(`${baseUrlExpired}/admin/test`, {
    headers: { Authorization: "Bearer expired.token.value" },
  });
  assert.equal(resExpired.status, 401);

  // Null user returned without explicit error
  const middlewareNullUser = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: null },
      error: null,
    }),
  });
  const baseUrlNull = await startServer(middlewareNullUser);
  const resNull = await fetch(`${baseUrlNull}/admin/test`, {
    headers: { Authorization: "Bearer ghost.token.value" },
  });
  assert.equal(resNull.status, 401);
});

// 6. Valid Supabase user -> continue to authorization
test("6. Valid Supabase user continues to authorization lookup", async () => {
  let authorizationCheckedUserId = "";
  const middleware = createAuthenticateAdmin({
    getUser: async (token) => {
      assert.equal(token, VALID_TOKEN);
      return { data: { user: MOCK_USER }, error: null };
    },
    getActiveAdmin: async (userId) => {
      authorizationCheckedUserId = userId;
      return MOCK_ADMIN_ROW;
    },
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 200);
  assert.equal(authorizationCheckedUserId, MOCK_USER.id);
});

// 7. Valid user with no admin_users record -> 403
test("7. Valid Supabase user with no admin_users record returns 403 Forbidden", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => null,
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "Forbidden");
  assert.equal(body.message, "Access denied. Active administrator permissions required.");
});

// 8. Valid user with is_active = false -> 403
test("8. Valid Supabase user with is_active = false returns 403 Forbidden", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => ({
      userId: MOCK_USER.id,
      displayName: "Deactivated Admin",
      isActive: false,
    }),
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "Forbidden");
});

// 9. Valid user with active admin row -> next()
test("9. Valid user with active admin row calls next() and proceeds", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => MOCK_ADMIN_ROW,
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; adminUser: AdminUserContext };
  assert.equal(body.ok, true);
  assert.deepEqual(body.adminUser, {
    userId: MOCK_USER.id,
    email: MOCK_USER.email,
    displayName: MOCK_ADMIN_ROW.displayName,
  });
});

// 10. Attached admin context uses verified Supabase user ID
test("10. Attached admin context uses verified Supabase user ID and email", async () => {
  const specificUserId = "11111111-2222-3333-4444-555555555555";
  const specificEmail = "verified@electrotech.pk";
  const specificDisplayName = "Verified Operator";

  const middleware = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: { id: specificUserId, email: specificEmail } },
      error: null,
    }),
    getActiveAdmin: async (userId) => {
      assert.equal(userId, specificUserId);
      return {
        userId,
        displayName: specificDisplayName,
        isActive: true,
      };
    },
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; adminUser: AdminUserContext };
  assert.equal(body.adminUser.userId, specificUserId);
  assert.equal(body.adminUser.email, specificEmail);
  assert.equal(body.adminUser.displayName, specificDisplayName);
});

// 11. Supabase Auth unavailable -> 503
test("11. Supabase Auth unavailable returns 503 Service Unavailable", async () => {
  // Thrown network exception
  const middlewareThrown = createAuthenticateAdmin({
    getUser: async () => {
      throw new Error("Supabase Auth connection timed out");
    },
  });
  const baseUrlThrown = await startServer(middlewareThrown);
  const resThrown = await fetch(`${baseUrlThrown}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(resThrown.status, 503);
  const bodyThrown = (await resThrown.json()) as { error: string; message: string };
  assert.equal(bodyThrown.error, "Service Unavailable");
  assert.equal(bodyThrown.message, "Authentication service is temporarily unavailable.");

  // 5xx response from Supabase Auth
  const middleware5xx = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: null },
      error: { message: "Internal Auth Error", status: 503 },
    }),
  });
  const baseUrl5xx = await startServer(middleware5xx);
  const res5xx = await fetch(`${baseUrl5xx}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res5xx.status, 503);
});

// 12. Database query unavailable -> 503
test("12. Database query unavailable returns 503 Service Unavailable", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => {
      throw new Error("Database query failed.");
    },
  });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "Service Unavailable");
  assert.equal(body.message, "Database query failed.");
});

// 13. Raw access token never appears in error body
test("13. Raw access token never appears in any error response body", async () => {
  const secretToken = "super-secret-user-jwt-value-never-leak-99999";

  // Case A: 401 on invalid token
  const middleware401 = createAuthenticateAdmin({
    getUser: async () => ({
      data: { user: null },
      error: { message: `Bad token: ${secretToken}`, status: 401 },
    }),
  });
  const baseUrl401 = await startServer(middleware401);
  const res401 = await fetch(`${baseUrl401}/admin/test`, {
    headers: { Authorization: `Bearer ${secretToken}` },
  });
  const text401 = await res401.text();
  assert.equal(text401.includes(secretToken), false);

  // Case B: 403 on missing admin
  const middleware403 = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => null,
  });
  const baseUrl403 = await startServer(middleware403);
  const res403 = await fetch(`${baseUrl403}/admin/test`, {
    headers: { Authorization: `Bearer ${secretToken}` },
  });
  const text403 = await res403.text();
  assert.equal(text403.includes(secretToken), false);

  // Case C: 503 on service failure
  const middleware503 = createAuthenticateAdmin({
    getUser: async () => {
      throw new Error(`Failed to verify token ${secretToken}`);
    },
  });
  const baseUrl503 = await startServer(middleware503);
  const res503 = await fetch(`${baseUrl503}/admin/test`, {
    headers: { Authorization: `Bearer ${secretToken}` },
  });
  const text503 = await res503.text();
  assert.equal(text503.includes(secretToken), false);
});

// 14. Supabase secret never appears in error body
test("14. Supabase secret never appears in any error response body", async () => {
  const supabaseSecret = "sbp_live_secret_key_never_leak_xyz789";

  const middlewareAuthError = createAuthenticateAdmin({
    getUser: async () => {
      throw new Error(`Connection to Supabase with key ${supabaseSecret} failed`);
    },
  });
  const baseUrlAuth = await startServer(middlewareAuthError);
  const resAuth = await fetch(`${baseUrlAuth}/admin/test`, {
    headers: { Authorization: "Bearer some-token" },
  });
  const textAuth = await resAuth.text();
  assert.equal(textAuth.includes(supabaseSecret), false);

  const middlewareDbError = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => {
      throw new Error(`Database query with secret ${supabaseSecret} failed`);
    },
  });
  const baseUrlDb = await startServer(middlewareDbError);
  const resDb = await fetch(`${baseUrlDb}/admin/test`, {
    headers: { Authorization: "Bearer some-token" },
  });
  const textDb = await resDb.text();
  assert.equal(textDb.includes(supabaseSecret), false);
});

// 15. Request-provided email/user ID cannot override verified identity
test("15. Request-provided email/user ID cannot override verified identity", async () => {
  const middleware = createAuthenticateAdmin({
    getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
    getActiveAdmin: async () => MOCK_ADMIN_ROW,
  });
  const baseUrl = await startServer(middleware);

  // Attempt to spoof identity via body and custom headers
  const res = await fetch(`${baseUrl}/admin/test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VALID_TOKEN}`,
      "Content-Type": "application/json",
      "x-user-id": "spoofed-user-id-hacker",
      "x-admin-role": "super-admin",
    },
    body: JSON.stringify({
      userId: "spoofed-user-id-hacker",
      email: "hacker@evil.com",
      displayName: "Fake Admin",
    }),
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; adminUser: AdminUserContext };
  assert.equal(body.adminUser.userId, MOCK_USER.id);
  assert.equal(body.adminUser.email, MOCK_USER.email);
  assert.equal(body.adminUser.displayName, MOCK_ADMIN_ROW.displayName);
  assert.notEqual(body.adminUser.userId, "spoofed-user-id-hacker");
  assert.notEqual(body.adminUser.email, "hacker@evil.com");
  assert.notEqual(body.adminUser.displayName, "Fake Admin");
});

// 16. Injected mock SupabaseClient integration
test("16. createAuthenticateAdmin supports injected mock SupabaseClient", async () => {
  const mockClient = {
    auth: {
      getUser: async (token: string) => {
        if (token === VALID_TOKEN) {
          return { data: { user: MOCK_USER }, error: null };
        }
        return { data: { user: null }, error: { message: "Invalid token" } };
      },
    },
    from: (table: string) => {
      assert.equal(table, "admin_users");
      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => {
              if (val === MOCK_USER.id) {
                return {
                  data: {
                    user_id: MOCK_USER.id,
                    display_name: "Mock Client Admin",
                    is_active: true,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;

  const middleware = createAuthenticateAdmin({ client: mockClient });
  const baseUrl = await startServer(middleware);

  const res = await fetch(`${baseUrl}/admin/test`, {
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; adminUser: AdminUserContext };
  assert.equal(body.adminUser.displayName, "Mock Client Admin");
});

// 17. Default exported authenticateAdmin middleware is defined and callable
test("17. authenticateAdmin is exported as a default pre-configured middleware", () => {
  assert.equal(typeof authenticateAdmin, "function");
  assert.equal(authenticateAdmin.length, 3); // (req, res, next)
});
