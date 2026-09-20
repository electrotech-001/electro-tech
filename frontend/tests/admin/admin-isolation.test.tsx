import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import adminLayoutMetadata from "@/app/admin/layout";
import adminPageMetadata from "@/app/admin/page";
import adminLoginMetadata from "@/app/admin/login/page";
import adminProjectsMetadata from "@/app/admin/projects/page";
import adminNewProjectMetadata from "@/app/admin/projects/new/page";

async function readTree(path: string): Promise<string> {
  const entries = await readdir(path, { withFileTypes: true });
  const content = await Promise.all(
    entries.map((entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? readTree(child) : readFile(child, "utf8");
    }),
  );
  return content.join("\n");
}

describe("Admin Route & Component Isolation", () => {
  it("public navigation, footer, and pages never link to /admin", async () => {
    const publicSite = await readFile(join(process.cwd(), "components", "electro-tech-site.tsx"), "utf8");
    const projectsDir = await readFile(join(process.cwd(), "components", "projects-directory.tsx"), "utf8");
    const homePage = await readFile(join(process.cwd(), "app", "page.tsx"), "utf8");
    const projectsPage = await readFile(join(process.cwd(), "app", "projects", "page.tsx"), "utf8");

    const combinedPublicCode = [publicSite, projectsDir, homePage, projectsPage].join("\n");

    expect(combinedPublicCode.includes('href="/admin"')).toBe(false);
    expect(combinedPublicCode.includes('to="/admin"')).toBe(false);
    expect(combinedPublicCode.includes('href="/admin/')).toBe(false);
    expect(combinedPublicCode.includes('to="/admin/')).toBe(false);
    expect(combinedPublicCode.includes('admin.electrotech')).toBe(false);
  });

  it("all admin routes specify robots noindex and nofollow metadata", async () => {
    const layoutContent = await readFile(join(process.cwd(), "app", "admin", "layout.tsx"), "utf8");
    const pageContent = await readFile(join(process.cwd(), "app", "admin", "page.tsx"), "utf8");
    const loginContent = await readFile(join(process.cwd(), "app", "admin", "login", "page.tsx"), "utf8");
    const projectsContent = await readFile(join(process.cwd(), "app", "admin", "projects", "page.tsx"), "utf8");
    const newProjectContent = await readFile(join(process.cwd(), "app", "admin", "projects", "new", "page.tsx"), "utf8");
    const editContent = await readFile(join(process.cwd(), "app", "admin", "projects", "[id]", "edit", "page.tsx"), "utf8");
    const previewContent = await readFile(join(process.cwd(), "app", "admin", "projects", "[id]", "preview", "page.tsx"), "utf8");

    const adminRouteFiles = [
      layoutContent,
      pageContent,
      loginContent,
      projectsContent,
      newProjectContent,
      editContent,
      previewContent,
    ];

    for (const file of adminRouteFiles) {
      expect(file).toContain("robots");
      expect(file).toContain("index: false");
      expect(file).toContain("follow: false");
    }
  });

  it("admin components and lib never call database tables, Storage, or RPC directly in browser", async () => {
    const adminComponents = await readTree(join(process.cwd(), "components", "admin"));
    const adminLib = await readTree(join(process.cwd(), "lib", "admin"));

    const combinedAdminCode = [adminComponents, adminLib].join("\n");

    expect(combinedAdminCode.includes("supabase.from")).toBe(false);
    expect(combinedAdminCode.includes("supabase.storage")).toBe(false);
    expect(combinedAdminCode.includes("supabase.rpc")).toBe(false);
    expect(combinedAdminCode.includes("service_role")).toBe(false);
    expect(combinedAdminCode.includes("SUPABASE_SECRET_KEY")).toBe(false);
    expect(combinedAdminCode.includes("sb_secret_")).toBe(false);
  });
});
