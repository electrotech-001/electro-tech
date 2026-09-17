import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

async function readTree(path: string): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const content = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? readTree(child) : readFile(child, "utf8");
  }));
  return content.join("\n");
}

describe("storage-free frontend architecture", () => {
  test("contains no persistence packages or server-only secrets", async () => {
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
    expect(content.includes("sup" + "abase")).toBe(false);
    expect(content.includes("service_role_key")).toBe(false);
    expect(content.includes("gemini_api_key")).toBe(false);
    expect(content.includes("resend_api_key")).toBe(false);
    expect(content.includes("quote_to_email")).toBe(false);
    expect(content.includes("quote_from_email")).toBe(false);
    expect(lock.packages["node_modules/@supabase/supabase-js"]).toBeUndefined();
    expect(lock.packages["node_modules/drizzle-orm"]).toBeUndefined();
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
