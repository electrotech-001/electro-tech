import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

async function readTree(path: string): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const content = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? readTree(child) : readFile(child, "utf8");
  }));
  return content.join("\n");
}

test("backend production files isolate Supabase to approved server integration and contain no browser secrets", async () => {
  const backendSrc = await readTree(join(process.cwd(), "src"));
  const envExample = await readFile(join(process.cwd(), ".env.example"), "utf8");
  const packageLock = await readFile(join(process.cwd(), "package-lock.json"), "utf8");

  // Prohibit legacy key naming
  assert.equal(backendSrc.toLowerCase().includes("service_role_key"), false);
  assert.equal(envExample.toLowerCase().includes("service_role_key"), false);

  // Prohibit browser-facing Supabase variables in backend
  assert.equal(backendSrc.toLowerCase().includes("next_public_sup" + "abase"), false);
  assert.equal(envExample.toLowerCase().includes("next_public_sup" + "abase"), false);
  assert.equal(envExample.toLowerCase().includes("vite_sup" + "abase"), false);

  // Verify approved backend dependency
  assert.equal(packageLock.includes("@supabase/supabase-js"), true);

  // Ensure no real secret values are committed in .env.example
  assert.equal(/SUPABASE_SECRET_KEY=\s*\S+/.test(envExample), false);
});

test("frontend workspace remains completely storage-free and unaware of Supabase", async () => {
  const frontendDir = join(process.cwd(), "..", "frontend");
  const frontendContent = [
    await readTree(join(frontendDir, "app")),
    await readTree(join(frontendDir, "components")),
    await readTree(join(frontendDir, "lib")),
    await readFile(join(frontendDir, "package.json"), "utf8"),
    await readFile(join(frontendDir, ".env.example"), "utf8"),
  ].join("\n").toLowerCase();

  const frontendLock = JSON.parse(
    await readFile(join(frontendDir, "package-lock.json"), "utf8"),
  ) as { packages: Record<string, unknown> };

  assert.equal(frontendContent.includes("sup" + "abase"), false);
  assert.equal(frontendContent.includes("supabase_secret_key"), false);
  assert.equal(frontendLock.packages["node_modules/@supabase/supabase-js"], undefined);
});

test("backend security invariants: no custom login/signup endpoints, no password handling, and no token logging", async () => {
  const backendSrc = await readTree(join(process.cwd(), "src"));
  const packageJson = await readFile(join(process.cwd(), "package.json"), "utf8");

  // No password hashing libraries or password management dependencies
  const forbiddenDeps = ["bcrypt", "argon2", "scrypt", "passport"];
  for (const dep of forbiddenDeps) {
    assert.equal(packageJson.includes(`"${dep}"`), false, `Must not depend on ${dep}`);
  }

  // No custom login or signup API endpoints implemented in Express backend
  assert.equal(backendSrc.includes("/api/admin/login"), false);
  assert.equal(backendSrc.includes("/api/admin/signup"), false);
  assert.equal(backendSrc.includes("/api/login"), false);
  assert.equal(backendSrc.includes("/api/signup"), false);

  // Authenticate middleware must never log tokens or authorization headers
  const authMiddleware = await readFile(
    join(process.cwd(), "src", "middleware", "authenticate-admin.ts"),
    "utf8",
  );
  assert.equal(/console\.(log|info|warn|error)\(.*token/i.test(authMiddleware), false);
  assert.equal(/console\.(log|info|warn|error)\(.*authHeader/i.test(authMiddleware), false);
  assert.equal(/console\.(log|info|warn|error)\(.*authorization/i.test(authMiddleware), false);
});

test("Phase 3E architecture: project upload routes under admin only, memory storage only, no SVG support, no disk writes", async () => {
  const publicRoutes = await readFile(
    join(process.cwd(), "src", "routes", "projects.ts"),
    "utf8",
  );
  const adminRoutes = await readFile(
    join(process.cwd(), "src", "routes", "admin-projects.ts"),
    "utf8",
  );
  const imageService = await readFile(
    join(process.cwd(), "src", "services", "project-images.ts"),
    "utf8",
  );

  // 1. Public project endpoints do not permit mutations or uploads
  assert.equal(publicRoutes.includes("router.post"), false);
  assert.equal(publicRoutes.includes("router.put"), false);
  assert.equal(publicRoutes.includes("router.patch"), false);
  assert.equal(publicRoutes.includes("router.delete"), false);
  assert.equal(publicRoutes.includes("multer"), false);
  assert.equal(publicRoutes.includes("/images"), false);

  // 2. Public project endpoints do not accept status filters
  assert.equal(publicRoutes.toLowerCase().includes("statusfilter"), false);
  assert.equal(publicRoutes.includes("query.status"), false);

  // 3. Admin project routes require authenticateAdmin
  assert.equal(adminRoutes.includes("authenticateAdmin"), true);
  assert.equal(adminRoutes.includes("router.use(auth)"), true);

  // 4. Memory storage only; no disk writes
  assert.equal(adminRoutes.includes("multer.memoryStorage()"), true);
  assert.equal(adminRoutes.includes("diskStorage"), false);

  // 5. No SVG or executable formats allowed in project image service
  assert.equal(imageService.toLowerCase().includes("image/svg"), false);
  assert.equal(imageService.includes(".svg"), false);

  // 6. No client-controlled Storage paths
  assert.equal(adminRoutes.includes("req.body.path"), false);
  assert.equal(adminRoutes.includes("request.body.path"), false);
});
