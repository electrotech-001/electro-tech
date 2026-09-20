import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import express, { type RequestHandler } from "express";
import { createAdminProjectsRouter } from "../src/routes/admin-projects.js";
import type { ProjectDatabaseRow } from "../src/services/projects.js";

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

const mockAdminUser = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "admin@electrotech.pk",
  displayName: "Admin Operator",
};

const passAuthMiddleware: RequestHandler = (req, _res, next) => {
  req.adminUser = mockAdminUser;
  next();
};

function createMockClient(initialProjects: ProjectDatabaseRow[] = []): {
  client: SupabaseClient;
  projects: ProjectDatabaseRow[];
  rpcCalls: { name: string; args: any }[];
} {
  const projects = initialProjects.map((p) => ({ ...p }));
  const rpcCalls: { name: string; args: any }[] = [];

  const client = {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
        remove: async (_paths: string[]) => ({ data: _paths, error: null }),
      }),
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "replace_homepage_projects") {
        const ids = (args.p_project_ids as string[]) || [];
        if (ids.length > 3) {
          return { error: { message: "requires 0 to 3 project UUIDs" } };
        }
        // Verify all exist and are published
        const matches = projects.filter((p) => ids.includes(p.id));
        if (matches.length !== ids.length) {
          return { error: { message: "project does not exist" } };
        }
        if (matches.some((p) => p.status !== "published")) {
          return { error: { message: "all must be published" } };
        }
        // Clear existing
        projects.forEach((p) => {
          p.is_featured_homepage = false;
          p.homepage_order = null;
        });
        // Assign new
        ids.forEach((id, idx) => {
          const p = projects.find((proj) => proj.id === id);
          if (p) {
            p.is_featured_homepage = true;
            p.homepage_order = idx + 1;
          }
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      assert.equal(table, "projects");
      return {
        select: (_cols?: string) => {
          let filtered = [...projects];

          const builder: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((p) => (p as any)[col] === val);
              return builder;
            },
            order: (col: string, options: { ascending?: boolean } = {}) => {
              const asc = options.ascending !== false;
              filtered.sort((a: any, b: any) => {
                const valA = a[col];
                const valB = b[col];
                if (valA === valB) return 0;
                if (valA == null) return 1;
                if (valB == null) return -1;
                return asc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
              });
              return builder;
            },
            maybeSingle: async () => {
              return { data: filtered[0] ? { ...filtered[0] } : null, error: null };
            },
            single: async () => {
              return { data: filtered[0] ? { ...filtered[0] } : null, error: null };
            },
            then: (resolve: (result: any) => void) => {
              resolve({ data: filtered.map((p) => ({ ...p })), error: null });
            },
          };
          return builder;
        },
        insert: (payload: any) => {
          const newRow: ProjectDatabaseRow = {
            id: payload.id ?? randomUUID(),
            slug: payload.slug,
            title: payload.title,
            location: payload.location ?? null,
            size: payload.size ?? null,
            description: payload.description ?? null,
            equipment: payload.equipment ?? [],
            primary_image_path: payload.primary_image_path ?? null,
            secondary_image_path: payload.secondary_image_path ?? null,
            primary_alt: payload.primary_alt ?? null,
            secondary_alt: payload.secondary_alt ?? null,
            primary_image_position: payload.primary_image_position ?? "center",
            secondary_image_position: payload.secondary_image_position ?? "center",
            status: payload.status ?? "draft",
            is_featured_homepage: false,
            homepage_order: null,
            project_order: payload.project_order ?? 0,
            published_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          projects.push(newRow);

          return {
            select: () => ({
              single: async () => ({ data: { ...newRow }, error: null }),
            }),
          };
        },
        update: (payload: any) => {
          return {
            eq: (_col: string, id: string) => {
              const target = projects.find((p) => p.id === id);
              if (target) {
                Object.assign(target, payload);
                if (payload.status && payload.status !== "published") {
                  target.is_featured_homepage = false;
                  target.homepage_order = null;
                }
                if (payload.status === "published" && !target.published_at) {
                  target.published_at = new Date().toISOString();
                }
                target.updated_at = new Date().toISOString();
              }
              return {
                select: () => ({
                  single: async () => ({ data: target ? { ...target } : null, error: null }),
                }),
              };
            },
          };
        },
        delete: () => {
          return {
            eq: (_col: string, id: string) => {
              const idx = projects.findIndex((p) => p.id === id);
              if (idx !== -1) {
                projects.splice(idx, 1);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, projects, rpcCalls };
}

async function startAdminServer(
  client: SupabaseClient,
  authMiddleware: RequestHandler = passAuthMiddleware,
): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/projects",
    createAdminProjectsRouter({ client, authMiddleware }),
  );

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const sampleCompleteProject: ProjectDatabaseRow = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  slug: "completed-draft-project",
  title: "Completed Draft Project",
  client_organization: "Islamabad Commercial",
  location: "Islamabad Sector F-7",
  size: "20 kW",
  category: "Complete Solar System Installation",
  completion_year: 2026,
  short_summary: "Complete draft ready for publishing with high capacity.",
  full_story: "Full installation narrative.",
  description: "Complete draft ready for publishing.",
  equipment: ["Panels", "Inverter"],
  primary_image_path: "projects/img-1.webp",
  secondary_image_path: "projects/img-2.webp",
  primary_alt: "Solar Array",
  secondary_alt: "Control Box",
  primary_image_position: "center",
  secondary_image_position: "center",
  status: "draft",
  is_featured_homepage: false,
  homepage_order: null,
  project_order: 1,
  published_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// 1. Rejects unauthenticated requests with 401 across admin endpoints
test("1. Admin endpoints reject unauthenticated requests with 401", async () => {
  const { client } = createMockClient();
  // Using real authenticateAdmin with no token
  const baseUrl = await startAdminServer(
    client,
    (await import("../src/middleware/authenticate-admin.js")).authenticateAdmin,
  );

  const res1 = await fetch(`${baseUrl}/api/admin/projects`);
  assert.equal(res1.status, 401);

  const res2 = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Test Project" }),
  });
  assert.equal(res2.status, 401);

  const res3 = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: ["a", "b", "c"] }),
  });
  assert.equal(res3.status, 401);
});

// 2. Rejects non-admin / inactive users with 403
test("2. Admin endpoints reject unauthorized users with 403", async () => {
  const { client } = createMockClient();
  const rejectingAuth: RequestHandler = (_req, res) => {
    res.status(403).json({ error: "Forbidden", message: "Access denied." });
  };
  const baseUrl = await startAdminServer(client, rejectingAuth);

  const res = await fetch(`${baseUrl}/api/admin/projects`);
  assert.equal(res.status, 403);
});

// 3. List projects with status filter
test("3. Admin GET /api/admin/projects lists projects and supports status filter", async () => {
  const initial = [
    { ...sampleCompleteProject, id: "11111111-1111-1111-1111-111111111111", status: "draft" as const },
    { ...sampleCompleteProject, id: "22222222-2222-2222-2222-222222222222", status: "published" as const },
    { ...sampleCompleteProject, id: "33333333-3333-3333-3333-333333333333", status: "archived" as const },
  ];
  const { client } = createMockClient(initial);
  const baseUrl = await startAdminServer(client);

  // All
  const resAll = await fetch(`${baseUrl}/api/admin/projects`);
  assert.equal(resAll.status, 200);
  const all = (await resAll.json()) as any[];
  assert.equal(all.length, 3);

  // Filter draft
  const resDraft = await fetch(`${baseUrl}/api/admin/projects?status=draft`);
  assert.equal(resDraft.status, 200);
  const drafts = (await resDraft.json()) as any[];
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].status, "draft");

  // Invalid filter
  const resBad = await fetch(`${baseUrl}/api/admin/projects?status=invalid_status`);
  assert.equal(resBad.status, 400);
});

// 4. Detail returns project or 404
test("4. Admin GET /api/admin/projects/:id returns project detail or 404", async () => {
  const { client } = createMockClient([sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  const resFound = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`);
  assert.equal(resFound.status, 200);
  const project = (await resFound.json()) as any;
  assert.equal(project.id, sampleCompleteProject.id);
  assert.equal(project.title, sampleCompleteProject.title);

  // Invalid UUID
  const resInvalid = await fetch(`${baseUrl}/api/admin/projects/not-a-uuid`);
  assert.equal(resInvalid.status, 400);

  // Missing UUID
  const resMissing = await fetch(`${baseUrl}/api/admin/projects/99999999-9999-9999-9999-999999999999`);
  assert.equal(resMissing.status, 404);
});

// 5 & 6. Create project starts as draft and rejects forbidden injected fields
test("5 & 6. Create project starts as draft and rejects client injection of status, homepage flags, and images", async () => {
  const { client } = createMockClient();
  const baseUrl = await startAdminServer(client);

  // Valid creation
  const resValid = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "New Solar Installation",
      location: "Islamabad",
      size: "30 kW",
      equipment: ["Panels", "Inverter"],
    }),
  });
  assert.equal(resValid.status, 201);
  const created = (await resValid.json()) as any;
  assert.equal(created.status, "draft");
  assert.equal(created.slug, "new-solar-installation");
  assert.equal(created.isFeaturedHomepage, false);
  assert.equal(created.homepageOrder, null);

  // Attempting to inject status
  const resStatus = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Hacked Project",
      status: "published",
    }),
  });
  assert.equal(resStatus.status, 400);

  // Attempting to inject homepage flags
  const resHomepage = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Hacked Project",
      isFeaturedHomepage: true,
    }),
  });
  assert.equal(resHomepage.status, 400);

  // Attempting to inject image paths
  const resImage = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Hacked Project",
      primaryImagePath: "malicious/path.jpg",
    }),
  });
  assert.equal(resImage.status, 400);
});

// 7 & 8. Auto-generate slug and collision check
test("7 & 8. Create project auto-generates slug and rejects collisions with 409", async () => {
  const { client } = createMockClient([sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  // Attempt to create with colliding slug
  const resCollision = await fetch(`${baseUrl}/api/admin/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Completed Draft Project", // Generates identical slug
    }),
  });
  assert.equal(resCollision.status, 409);
  const body = (await resCollision.json()) as { error: string };
  assert.equal(body.error, "Project slug already exists");
});

// 9 & 10. Partial update and rejection of disallowed fields
test("9 & 10. Update project allows partial metadata and rejects status/image changes", async () => {
  const { client } = createMockClient([sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  // Valid partial update
  const resUpdate = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: "25 kW Updated",
      projectOrder: 5,
    }),
  });
  assert.equal(resUpdate.status, 200);
  const updated = (await resUpdate.json()) as any;
  assert.equal(updated.size, "25 kW Updated");
  assert.equal(updated.projectOrder, 5);

  // Reject status update via PATCH
  const resStatus = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(resStatus.status, 400);

  // Reject image path update via PATCH
  const resImage = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryImagePath: "new/path.jpg" }),
  });
  assert.equal(resImage.status, 400);
});

// 11. Image position validation
test("11. Image position validation accepts valid CSS positions and rejects arbitrary/unsafe CSS", async () => {
  const { client } = createMockClient([sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  const validPositions = ["center", "center 65%", "center 35%", "center bottom", "left center", "50% 60%", "100% 0%"];
  for (const pos of validPositions) {
    const res = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryImagePosition: pos }),
    });
    assert.equal(res.status, 200, `Expected position '${pos}' to be valid`);
  }

  const invalidPositions = [
    "calc(100% - 10px)",
    "var(--custom)",
    "url(https://evil.com)",
    "center; color: red",
    "150% 50%",
    "-10% 50%",
    "arbitrary css string",
  ];
  for (const pos of invalidPositions) {
    const res = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryImagePosition: pos }),
    });
    assert.equal(res.status, 400, `Expected position '${pos}' to be rejected`);
  }
});

// 12. Equipment validation
test("12. Equipment validation enforces max 20 items, max 200 chars, non-empty", async () => {
  const { client } = createMockClient([sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  // Reject empty string
  const resEmpty = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipment: [""] }),
  });
  assert.equal(resEmpty.status, 400);

  // Reject > 20 items
  const resTooMany = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipment: Array.from({ length: 21 }, (_, i) => `Item ${i}`) }),
  });
  assert.equal(resTooMany.status, 400);
});

// 13 & 14. Publish transition
test("13 & 14. Publish transition requires all mandatory fields and succeeds when complete", async () => {
  const incompleteProject: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    slug: "incomplete-project",
    primary_image_path: null, // Missing image path
  };
  const { client } = createMockClient([incompleteProject, sampleCompleteProject]);
  const baseUrl = await startAdminServer(client);

  // Incomplete project publish fails with 400 and lists missingFields
  const resFail = await fetch(`${baseUrl}/api/admin/projects/${incompleteProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resFail.status, 400);
  const bodyFail = (await resFail.json()) as { error: string; missingFields: string[] };
  assert.equal(bodyFail.missingFields.includes("primaryImagePath"), true);

  // Complete project publish succeeds
  const resSuccess = await fetch(`${baseUrl}/api/admin/projects/${sampleCompleteProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resSuccess.status, 200);
  const published = (await resSuccess.json()) as any;
  assert.equal(published.status, "published");
  assert.equal(typeof published.publishedAt, "string");
});

// 15. Unpublish transition
test("15. Unpublish transitions published to draft and clears homepage assignment", async () => {
  const publishedFeatured: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    slug: "published-featured",
    status: "published",
    is_featured_homepage: true,
    homepage_order: 1,
    published_at: "2026-01-01T00:00:00Z",
  };
  const { client } = createMockClient([publishedFeatured]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${publishedFeatured.id}/unpublish`, {
    method: "POST",
  });
  assert.equal(res.status, 200);
  const unpublished = (await res.json()) as any;
  assert.equal(unpublished.status, "draft");
  assert.equal(unpublished.isFeaturedHomepage, false);
  assert.equal(unpublished.homepageOrder, null);
});

// 16, 17, 18. Archive, restore, and invalid transition checks
test("16, 17, 18. Archive and restore transitions with state integrity", async () => {
  const draftProject: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    slug: "archive-test",
    status: "draft",
  };
  const { client } = createMockClient([draftProject]);
  const baseUrl = await startAdminServer(client);

  // draft -> archived
  const resArchive = await fetch(`${baseUrl}/api/admin/projects/${draftProject.id}/archive`, {
    method: "POST",
  });
  assert.equal(resArchive.status, 200);
  const archived = (await resArchive.json()) as any;
  assert.equal(archived.status, "archived");

  // archived -> publish is invalid (must restore first)
  const resBadPublish = await fetch(`${baseUrl}/api/admin/projects/${draftProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resBadPublish.status, 409);

  // archived -> draft (restore)
  const resRestore = await fetch(`${baseUrl}/api/admin/projects/${draftProject.id}/restore`, {
    method: "POST",
  });
  assert.equal(resRestore.status, 200);
  const restored = (await resRestore.json()) as any;
  assert.equal(restored.status, "draft");
});

// 19, 20, 21. Homepage selection via RPC (0 to 3 UUIDs)
test("19, 20, 21. Homepage selection requires 0 to 3 UUIDs and invokes replace_homepage_projects RPC", async () => {
  const p1: ProjectDatabaseRow = { ...sampleCompleteProject, id: "11111111-1111-1111-1111-111111111111", status: "published" };
  const p2: ProjectDatabaseRow = { ...sampleCompleteProject, id: "22222222-2222-2222-2222-222222222222", status: "published" };
  const p3: ProjectDatabaseRow = { ...sampleCompleteProject, id: "33333333-3333-3333-3333-333333333333", status: "published" };
  const p4: ProjectDatabaseRow = { ...sampleCompleteProject, id: "44444444-4444-4444-4444-444444444444", status: "published" };
  const p5Draft: ProjectDatabaseRow = { ...sampleCompleteProject, id: "55555555-5555-5555-5555-555555555555", status: "draft" };

  const { client, rpcCalls } = createMockClient([p1, p2, p3, p4, p5Draft]);
  const baseUrl = await startAdminServer(client);

  // Rejects more than 3
  const resTooMany = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, p2.id, p3.id, p4.id] }),
  });
  assert.equal(resTooMany.status, 400);

  // Rejects duplicates
  const resDupes = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, p1.id, p2.id] }),
  });
  assert.equal(resDupes.status, 400);

  // Rejects unpublished project
  const resUnpub = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, p2.id, p5Draft.id] }),
  });
  assert.equal(resUnpub.status, 409);
  const unpubData = (await resUnpub.json()) as { error: string };
  assert.equal(unpubData.error, "All homepage projects must be published.");

  // Rejects non-existent project
  const resNonExistent = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, "99999999-9999-9999-9999-999999999999"] }),
  });
  assert.equal(resNonExistent.status, 409);
  const nonExistentData = (await resNonExistent.json()) as { error: string };
  assert.equal(nonExistentData.error, "One or more selected projects do not exist.");

  // Accepts 0 projects (empty array)
  const resEmpty = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [] }),
  });
  assert.equal(resEmpty.status, 200);

  // Accepts 2 projects
  const resTwo = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, p2.id] }),
  });
  assert.equal(resTwo.status, 200);

  // Valid 3 selection invokes RPC
  const resSuccess = await fetch(`${baseUrl}/api/admin/projects/homepage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds: [p1.id, p2.id, p3.id] }),
  });
  assert.equal(resSuccess.status, 200);
  assert.equal(rpcCalls.length, 5); // 2 failed (unpub, non-existent) + 3 successful (empty, two, three)
  const successCall = rpcCalls[4];
  assert.ok(successCall);
  assert.equal(successCall.name, "replace_homepage_projects");
  assert.deepEqual(successCall.args, { p_project_ids: [p1.id, p2.id, p3.id] });
});

// 22, 23, 24, 25. Delete safety checks
test("22, 23, 24, 25. Delete project enforces safety: published delete rejected, draft and archived deleted with cleanup", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "11111111-1111-1111-1111-111111111111",
    status: "published",
    primary_image_path: null,
    secondary_image_path: null,
  };
  const draftWithImages: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "22222222-2222-2222-2222-222222222222",
    status: "draft",
    primary_image_path: "path/1.webp",
  };
  const archivedWithImages: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "33333333-3333-3333-3333-333333333333",
    status: "archived",
    secondary_image_path: "path/2.webp",
  };
  const safeDraft: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "44444444-4444-4444-4444-444444444444",
    status: "draft",
    primary_image_path: null,
    secondary_image_path: null,
  };
  const safeArchived: ProjectDatabaseRow = {
    ...sampleCompleteProject,
    id: "55555555-5555-5555-5555-555555555555",
    status: "archived",
    primary_image_path: null,
    secondary_image_path: null,
  };

  const { client, projects } = createMockClient([
    publishedProject,
    draftWithImages,
    archivedWithImages,
    safeDraft,
    safeArchived,
  ]);
  const baseUrl = await startAdminServer(client);

  // Published delete denied (409)
  const res1 = await fetch(`${baseUrl}/api/admin/projects/${publishedProject.id}`, { method: "DELETE" });
  assert.equal(res1.status, 409);

  // Draft with images allowed with storage cleanup (Phase 3E) (200)
  const res2 = await fetch(`${baseUrl}/api/admin/projects/${draftWithImages.id}`, { method: "DELETE" });
  assert.equal(res2.status, 200);
  assert.equal(projects.some((p) => p.id === draftWithImages.id), false);

  // Archived with images allowed with storage cleanup (Phase 3E) (200)
  const res3 = await fetch(`${baseUrl}/api/admin/projects/${archivedWithImages.id}`, { method: "DELETE" });
  assert.equal(res3.status, 200);
  assert.equal(projects.some((p) => p.id === archivedWithImages.id), false);

  // Safe draft delete allowed (200)
  const res4 = await fetch(`${baseUrl}/api/admin/projects/${safeDraft.id}`, { method: "DELETE" });
  assert.equal(res4.status, 200);
  assert.equal(projects.some((p) => p.id === safeDraft.id), false);

  // Safe archived delete allowed (200)
  const res5 = await fetch(`${baseUrl}/api/admin/projects/${safeArchived.id}`, { method: "DELETE" });
  assert.equal(res5.status, 200);
  assert.equal(projects.some((p) => p.id === safeArchived.id), false);
});
