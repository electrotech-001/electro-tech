import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test, { afterEach } from "node:test";
import express from "express";
import {
  createAdminImageUploadRateLimiter,
  API_RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  ADMIN_UPLOAD_RATE_LIMIT_WINDOW_MS,
} from "../src/services/rate-limit.js";
import { DEFAULT_OPERATIONAL_CONFIG } from "../src/config.js";

const servers = new Set<Server>();

afterEach(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers.clear();
});

async function startRateLimitedServer(limit: number, windowMs?: number): Promise<string> {
  const app = express();
  const limiter = createAdminImageUploadRateLimiter(limit, windowMs);

  app.post("/test-upload", (req, _res, next) => {
    // Simulate authenticated admin user from auth header
    const authHeader = req.headers.authorization;
    if (authHeader?.includes("admin-2")) {
      req.adminUser = { userId: "admin-2", email: "admin2@example.com", displayName: "Admin Two" };
    } else {
      req.adminUser = { userId: "admin-1", email: "admin1@example.com", displayName: "Admin One" };
    }
    next();
  }, limiter, (_req, res) => {
    res.status(200).json({ success: true });
  });

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test("1. legitimate burst of 5 authenticated media uploads is not rate-limited", async () => {
  // Using default configuration or limit >= 5
  const baseUrl = await startRateLimitedServer(DEFAULT_OPERATIONAL_CONFIG.adminImageUploadRateLimitMax);

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/test-upload`, {
      method: "POST",
      headers: { authorization: "Bearer token-admin-1" },
    });
    assert.equal(res.status, 200, `Upload #${i + 1} should succeed`);
    const data = await res.json();
    assert.deepEqual(data, { success: true });
  }
});

test("2. abusive repeated upload traffic eventually receives HTTP 429", async () => {
  // Configured with a test burst limit of 5
  const baseUrl = await startRateLimitedServer(5);

  // First 5 succeed
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/test-upload`, {
      method: "POST",
      headers: { authorization: "Bearer token-admin-1" },
    });
    assert.equal(res.status, 200);
  }

  // 6th attempt is blocked
  const blockedRes = await fetch(`${baseUrl}/test-upload`, {
    method: "POST",
    headers: { authorization: "Bearer token-admin-1" },
  });
  assert.equal(blockedRes.status, 429);
  const body = (await blockedRes.json()) as { code: string; message: string };
  assert.equal(body.code, "rate_limited");
  assert.equal(body.message, "Too many image upload attempts. Please try again later.");
});

test("3. authenticated rate limiting is scoped per admin user", async () => {
  // Burst limit of 3
  const baseUrl = await startRateLimitedServer(3);

  // Exhaust admin-1
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/test-upload`, {
      method: "POST",
      headers: { authorization: "Bearer token-admin-1" },
    });
    assert.equal(res.status, 200);
  }

  // Admin 1 is blocked
  const admin1Blocked = await fetch(`${baseUrl}/test-upload`, {
    method: "POST",
    headers: { authorization: "Bearer token-admin-1" },
  });
  assert.equal(admin1Blocked.status, 429);

  // Admin 2 is not blocked
  const admin2Allowed = await fetch(`${baseUrl}/test-upload`, {
    method: "POST",
    headers: { authorization: "Bearer token-admin-2" },
  });
  assert.equal(admin2Allowed.status, 200);
});

test("4. unrelated public API rate limits remain unchanged", async () => {
  assert.equal(API_RATE_LIMITS.extract, 3);
  assert.equal(API_RATE_LIMITS.calculate, 20);
  assert.equal(API_RATE_LIMITS.quote, 5);
  assert.equal(RATE_LIMIT_WINDOW_MS, 30 * 60 * 1000);
  assert.equal(ADMIN_UPLOAD_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
});
