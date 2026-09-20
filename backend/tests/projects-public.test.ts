import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import { createProjectsRouter } from "../src/routes/projects.js";
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

function createMockClient(projects: ProjectDatabaseRow[]): SupabaseClient {
  return {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
    from: (table: string) => {
      assert.equal(table, "projects");
      return {
        select: (_cols: string) => {
          let filtered = [...projects];

          const orderCriteria: { col: string; ascending: boolean }[] = [];

          const applySort = () => {
            if (orderCriteria.length > 0) {
              filtered.sort((a: any, b: any) => {
                for (const { col, ascending } of orderCriteria) {
                  const valA = a[col];
                  const valB = b[col];
                  if (valA !== valB) {
                    if (valA == null) return 1;
                    if (valB == null) return -1;
                    return ascending ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                  }
                }
                return 0;
              });
            }
          };

          const builder: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((p) => (p as any)[col] === val);
              return builder;
            },
            order: (col: string, options: { ascending?: boolean } = {}) => {
              orderCriteria.push({ col, ascending: options.ascending !== false });
              return builder;
            },
            limit: (count: number) => {
              applySort();
              filtered = filtered.slice(0, count);
              return builder;
            },
            maybeSingle: async () => {
              applySort();
              return { data: filtered[0] ?? null, error: null };
            },
            then: (resolve: (result: any) => void) => {
              applySort();
              resolve({ data: filtered, error: null });
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
}

async function startServer(client: SupabaseClient): Promise<string> {
  const app = express();
  app.use("/api/projects", createProjectsRouter({ client }));

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const mockProjects: ProjectDatabaseRow[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "commercial-solar-lahore",
    title: "Commercial Solar Lahore",
    location: "Lahore, Punjab",
    size: "100 kW",
    description: "Industrial rooftop solar installation.",
    equipment: ["Tier-1 Panels", "String Inverter"],
    primary_image_path: "projects/lahore-1.webp",
    secondary_image_path: "projects/lahore-2.webp",
    primary_alt: "Lahore Solar Panels",
    secondary_alt: "Lahore Inverter Setup",
    primary_image_position: "center",
    secondary_image_position: "center",
    status: "published",
    is_featured_homepage: true,
    homepage_order: 1,
    project_order: 10,
    published_at: "2026-01-15T10:00:00Z",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    slug: "residential-hybrid-islamabad",
    title: "Residential Hybrid Islamabad",
    location: "Islamabad",
    size: "15 kW",
    description: "Hybrid residential solar system.",
    equipment: ["Mono PERC", "Hybrid Inverter", "Lithium Battery"],
    primary_image_path: "projects/isb-1.webp",
    secondary_image_path: "projects/isb-2.webp",
    primary_alt: "Islamabad Rooftop Panels",
    secondary_alt: "Islamabad Battery Bank",
    primary_image_position: "center 40%",
    secondary_image_position: "center",
    status: "published",
    is_featured_homepage: true,
    homepage_order: 2,
    project_order: 20,
    published_at: "2026-02-01T10:00:00Z",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    slug: "textile-factory-faisalabad",
    title: "Textile Factory Faisalabad",
    location: "Faisalabad",
    size: "500 kW",
    description: "Large scale industrial solar solution.",
    equipment: ["Bifacial Panels", "Central Inverters"],
    primary_image_path: "projects/fsd-1.webp",
    secondary_image_path: "projects/fsd-2.webp",
    primary_alt: "Faisalabad Factory Roof",
    secondary_alt: "Faisalabad Switchgear",
    primary_image_position: "center",
    secondary_image_position: "bottom",
    status: "published",
    is_featured_homepage: true,
    homepage_order: 3,
    project_order: 30,
    published_at: "2026-02-15T10:00:00Z",
    created_at: "2026-01-20T10:00:00Z",
    updated_at: "2026-02-15T10:00:00Z",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    slug: "draft-hospital-project",
    title: "Draft Hospital Project",
    location: "Rawalpindi",
    size: "50 kW",
    description: "Hospital emergency solar system.",
    equipment: [],
    primary_image_path: null,
    secondary_image_path: null,
    primary_alt: null,
    secondary_alt: null,
    primary_image_position: "center",
    secondary_image_position: "center",
    status: "draft",
    is_featured_homepage: false,
    homepage_order: null,
    project_order: 0,
    published_at: null,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    slug: "archived-farm-project",
    title: "Archived Farm Project",
    location: "Multan",
    size: "25 kW",
    description: "Agricultural tube well solar system.",
    equipment: ["Panels"],
    primary_image_path: "projects/multan-1.webp",
    secondary_image_path: "projects/multan-2.webp",
    primary_alt: "Multan Solar",
    secondary_alt: "Multan Pump",
    primary_image_position: "center",
    secondary_image_position: "center",
    status: "archived",
    is_featured_homepage: false,
    homepage_order: null,
    project_order: 0,
    published_at: "2025-06-01T10:00:00Z",
    created_at: "2025-05-01T10:00:00Z",
    updated_at: "2025-12-01T10:00:00Z",
  },
];

// 1. GET /api/projects returns only published projects
test("1. GET /api/projects returns only published projects", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any[];
  assert.equal(data.length, 3);
  assert.equal(data.every((p) => p.status === undefined), true);
  assert.equal(data.some((p) => p.slug === "draft-hospital-project"), false);
  assert.equal(data.some((p) => p.slug === "archived-farm-project"), false);
});

// 2. Draft projects are excluded from public listing
test("2. Draft projects are strictly excluded from public directory", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects`);
  const data = (await res.json()) as any[];
  const slugs = data.map((p) => p.slug);
  assert.equal(slugs.includes("draft-hospital-project"), false);
});

// 3. Archived projects are excluded from public listing
test("3. Archived projects are strictly excluded from public directory", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects`);
  const data = (await res.json()) as any[];
  const slugs = data.map((p) => p.slug);
  assert.equal(slugs.includes("archived-farm-project"), false);
});

// 4. Correct directory ordering
test("4. Public directory orders by project_order ASC, published_at DESC, created_at DESC", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects`);
  const data = (await res.json()) as any[];
  assert.equal(data[0].slug, "commercial-solar-lahore");
  assert.equal(data[1].slug, "residential-hybrid-islamabad");
  assert.equal(data[2].slug, "textile-factory-faisalabad");
});

// 5. ?featured=home returns homepage projects ordered 1–3
test("5. GET /api/projects?featured=home returns at most 3 homepage projects ordered by homepage_order", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects?featured=home`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any[];
  assert.equal(data.length, 3);
  assert.equal(data[0].slug, "commercial-solar-lahore");
  assert.equal(data[1].slug, "residential-hybrid-islamabad");
  assert.equal(data[2].slug, "textile-factory-faisalabad");
});

// 6. Public response strips admin-only fields
test("6. Public project response strips internal and admin-only metadata", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects`);
  const data = (await res.json()) as any[];
  const first = data[0];

  assert.equal(first.status, undefined);
  assert.equal(first.is_featured_homepage, undefined);
  assert.equal(first.isFeaturedHomepage, undefined);
  assert.equal(first.homepage_order, undefined);
  assert.equal(first.homepageOrder, undefined);
  assert.equal(first.project_order, undefined);
  assert.equal(first.projectOrder, undefined);
  assert.equal(first.created_at, undefined);
  assert.equal(first.createdAt, undefined);
  assert.equal(first.updated_at, undefined);
  assert.equal(first.updatedAt, undefined);

  // Expected public fields
  assert.equal(typeof first.id, "string");
  assert.equal(typeof first.slug, "string");
  assert.equal(typeof first.title, "string");
  assert.equal(typeof first.location, "string");
  assert.equal(typeof first.size, "string");
  assert.equal(typeof first.description, "string");
  assert.equal(Array.isArray(first.equipment), true);
  assert.equal(first.primaryImageUrl.startsWith("https://mock.supabase.co/"), true);
  assert.equal(first.secondaryImageUrl.startsWith("https://mock.supabase.co/"), true);
  assert.equal(typeof first.primaryAlt, "string");
  assert.equal(typeof first.secondaryAlt, "string");
  assert.equal(typeof first.primaryImagePosition, "string");
  assert.equal(typeof first.secondaryImagePosition, "string");
  assert.equal(typeof first.publishedAt, "string");
});

// 7. GET /api/projects/:slug returns published project
test("7. GET /api/projects/:slug returns published project by slug", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects/commercial-solar-lahore`);
  assert.equal(res.status, 200);
  const project = (await res.json()) as any;
  assert.equal(project.slug, "commercial-solar-lahore");
  assert.equal(project.title, "Commercial Solar Lahore");
  assert.equal(project.primaryImageUrl.includes("lahore-1.webp"), true);
});

// 8. Hidden/draft slug returns 404
test("8. GET /api/projects/:slug returns 404 for draft project without leaking existence", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects/draft-hospital-project`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "Project not found");
});

// 9. Archived slug returns 404
test("9. GET /api/projects/:slug returns 404 for archived project", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects/archived-farm-project`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "Project not found");
});

// 10. Nonexistent slug returns 404
test("10. GET /api/projects/:slug returns 404 for nonexistent slug", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects/non-existent-project`);
  assert.equal(res.status, 404);
});

// 11. Invalid slug rejected with 400
test("11. GET /api/projects/:slug rejects invalid slug format with 400", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  const res = await fetch(`${baseUrl}/api/projects/INVALID_SLUG_UPPERCASE!`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "Invalid project slug.");
});

// 12. Invalid query parameters rejected with 400
test("12. GET /api/projects rejects arbitrary query parameters with 400", async () => {
  const client = createMockClient(mockProjects);
  const baseUrl = await startServer(client);

  // Status query attempted on public endpoint
  const res1 = await fetch(`${baseUrl}/api/projects?status=all`);
  assert.equal(res1.status, 400);

  // Arbitrary filter attempted
  const res2 = await fetch(`${baseUrl}/api/projects?filter=foo`);
  assert.equal(res2.status, 400);

  // Invalid featured value
  const res3 = await fetch(`${baseUrl}/api/projects?featured=sidebar`);
  assert.equal(res3.status, 400);
});

// 13. Service failure returns 503
test("13. GET /api/projects returns 503 on database query failure", async () => {
  const failingClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({
              order: () => Promise.resolve({ data: null, error: { message: "Database down" } }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const baseUrl = await startServer(failingClient);
  const res = await fetch(`${baseUrl}/api/projects`);
  assert.equal(res.status, 503);
});
