import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function getAllFiles(dir: string, extensions: string[] = [".ts", ".tsx", ".js", ".html"]): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".tmp") continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Admin Portal Security & Architecture Invariants", () => {
  const srcFiles = getAllFiles(join(process.cwd(), "src"));

  it("21. Admin code never directly queries database tables, Storage, or RPC", () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf8");

      expect(content.includes("supabase.from")).toBe(false);
      expect(content.includes("supabase.storage")).toBe(false);
      expect(content.includes("supabase.rpc")).toBe(false);
    }
  });

  it("22. Admin source contains no Supabase secret keys or service_role references", () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf8");

      expect(content.includes("SUPABASE_SECRET_KEY")).toBe(false);
      expect(content.includes("sb_secret_")).toBe(false);
      expect(content.includes("service_role")).toBe(false);
    }
  });

  it("23. Admin code contains no public sign-up or registration flows", () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf8");

      expect(content.includes("signUp")).toBe(false);
      expect(content.includes("createUser")).toBe(false);
      expect(content.includes("register")).toBe(false);
    }
  });
});
