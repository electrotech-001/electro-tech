import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

async function readTree(path: string, excludeDirs: string[] = []): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const content = await Promise.all(
    entries.map((entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name)) return "";
        return readTree(child, excludeDirs);
      }
      return readFile(child, "utf8");
    }),
  );
  return content.join("\n");
}

describe("frontend security and architectural invariants", () => {
  test("contains no server-only secrets or database ORM packages", async () => {
    const content = [
      await readTree(join(process.cwd(), "app")),
      await readTree(join(process.cwd(), "components")),
      await readTree(join(process.cwd(), "lib")),
      await readFile(join(process.cwd(), "package.json"), "utf8"),
      await readFile(join(process.cwd(), ".env.example"), "utf8"),
    ].join("\n").toLowerCase();
    const lock = JSON.parse(await readFile(join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages: Record<string, unknown>;
    };

    expect(content.includes("service_role")).toBe(false);
    expect(content.includes("sb_secret_")).toBe(false);
    expect(content.includes("gemini_api_key")).toBe(false);
    expect(content.includes("resend_api_key")).toBe(false);
    expect(content.includes("quote_to_email")).toBe(false);
    expect(content.includes("quote_from_email")).toBe(false);
    expect(lock.packages["node_modules/drizzle-orm"]).toBeUndefined();
  });

  test("public website contains no direct database, storage, or admin references", async () => {
    const publicContent = [
      await readFile(join(process.cwd(), "components", "electro-tech-site.tsx"), "utf8"),
      await readFile(join(process.cwd(), "components", "solar-bill-analyzer.tsx"), "utf8"),
      await readFile(join(process.cwd(), "components", "projects-directory.tsx"), "utf8"),
      await readFile(join(process.cwd(), "lib", "projects.ts"), "utf8"),
      await readFile(join(process.cwd(), "app", "page.tsx"), "utf8"),
      await readFile(join(process.cwd(), "app", "projects", "page.tsx"), "utf8"),
    ].join("\n");

    // Public website code has zero direct supabase/admin calls
    expect(publicContent.includes("supabase")).toBe(false);
    expect(publicContent.includes('href="/admin"')).toBe(false);
    expect(publicContent.includes('to="/admin"')).toBe(false);
    expect(publicContent.includes("/admin/")).toBe(false);
  });

  test("admin code never directly queries database tables, Storage, or RPC", async () => {
    const adminContent = [
      await readTree(join(process.cwd(), "app", "admin")),
      await readTree(join(process.cwd(), "components", "admin")),
      await readTree(join(process.cwd(), "lib", "admin")),
    ].join("\n");

    expect(adminContent.includes("supabase.from")).toBe(false);
    expect(adminContent.includes("supabase.storage")).toBe(false);
    expect(adminContent.includes("supabase.rpc")).toBe(false);
    expect(adminContent.includes("signUp")).toBe(false);
    expect(adminContent.includes("createUser")).toBe(false);
    expect(adminContent.includes("register")).toBe(false);
  });

  test("routes quote and analyzer requests through the public API-origin helper", async () => {
    const quoteComponent = await readFile(join(process.cwd(), "components", "electro-tech-site.tsx"), "utf8");
    const analyzerComponent = await readFile(join(process.cwd(), "components", "solar-bill-analyzer.tsx"), "utf8");
    expect(quoteComponent).toContain('apiUrl("/api/quote")');
    expect(quoteComponent).not.toContain('fetch("/api/quote")');
    expect(analyzerComponent).toContain('analyzerApiUrl("/api/solar-analyzer/extract")');
    expect(analyzerComponent).toContain('analyzerApiUrl("/api/solar-analyzer/calculate")');
    await expect(access(join(process.cwd(), "app", "api", "quote", "route.ts"))).rejects.toThrow();
  });
});
