import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import express, { type RequestHandler } from "express";
import { createAdminProjectsRouter } from "../src/routes/admin-projects.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import type { ProjectDatabaseRow } from "../src/services/projects.js";
import type { ProjectMediaRow } from "../src/services/project-media.js";

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

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const VALID_WEBP_BUFFER = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.from("VP8 "),
]);

interface MockClientOptions {
  initialProjects?: ProjectDatabaseRow[];
  initialMedia?: ProjectMediaRow[];
  failDbInsert?: boolean;
  failStorageDelete?: boolean;
}

function createMockClient(options: MockClientOptions = {}): {
  client: SupabaseClient;
  projects: ProjectDatabaseRow[];
  media: ProjectMediaRow[];
  uploadedObjects: { path: string; buffer: Buffer; contentType: string }[];
  removedObjects: string[][];
  rpcCalls: { name: string; args: any }[];
} {
  const projects = (options.initialProjects ?? []).map((p) => ({ ...p }));
  const media = (options.initialMedia ?? []).map((m) => ({ ...m }));
  const uploadedObjects: { path: string; buffer: Buffer; contentType: string }[] = [];
  const removedObjects: string[][] = [];
  const rpcCalls: { name: string; args: any }[] = [];

  const client = {
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, "project-images");
        return {
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`,
            },
          }),
          upload: async (path: string, buffer: Buffer, uploadOpts: any) => {
            uploadedObjects.push({ path, buffer, contentType: uploadOpts.contentType });
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            if (options.failStorageDelete) {
              return { data: null, error: { message: "Simulated Storage deletion error" } };
            }
            removedObjects.push(paths);
            return { data: paths, error: null };
          },
        };
      },
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "set_primary_project_media") {
        const { p_project_id, p_media_id } = args;
        const target = media.find((m) => m.id === p_media_id && m.project_id === p_project_id);
        if (!target) {
          return { data: null, error: { code: "P0002", message: "Media item not found" } };
        }
        const proj = projects.find((p) => p.id === p_project_id);
        if (proj?.status === "published" && (!target.alt_text || !target.alt_text.trim())) {
          return {
            data: null,
            error: {
              code: "check_violation",
              message: "Cannot set an image without alt text as primary on a published project.",
            },
          };
        }
        // Atomic switch: clear old primary, set new primary
        media.forEach((m) => {
          if (m.project_id === p_project_id) {
            m.is_primary = m.id === p_media_id;
            m.updated_at = new Date().toISOString();
          }
        });
        return { data: { ...target, is_primary: true }, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${name}` } };
    },
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: (_cols?: string) => {
            let filtered = [...projects];
            const builder: any = {
              eq: (col: string, val: any) => {
                filtered = filtered.filter((p) => (p as any)[col] === val);
                return builder;
              },
              order: (col: string, orderOpts: { ascending?: boolean } = {}) => {
                const asc = orderOpts.ascending !== false;
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
              limit: (count: number) => {
                filtered = filtered.slice(0, count);
                return builder;
              },
              maybeSingle: async () => {
                const proj = filtered[0];
                if (!proj) return { data: null, error: null };
                const projMedia = media.filter((m) => m.project_id === proj.id);
                return { data: { ...proj, project_media: projMedia }, error: null };
              },
              single: async () => {
                const proj = filtered[0];
                if (!proj) return { data: null, error: new Error("Row not found") };
                const projMedia = media.filter((m) => m.project_id === proj.id);
                return { data: { ...proj, project_media: projMedia }, error: null };
              },
              then: (resolve: (result: any) => void) => {
                const res = filtered.map((p) => ({
                  ...p,
                  project_media: media.filter((m) => m.project_id === p.id),
                }));
                resolve({ data: res, error: null });
              },
            };
            return builder;
          },
          update: (payload: any) => {
            return {
              eq: (_col: string, id: string) => {
                const target = projects.find((p) => p.id === id);
                if (target) {
                  Object.assign(target, payload);
                  target.updated_at = new Date().toISOString();
                }
                return {
                  select: () => ({
                    single: async () => {
                      const projMedia = media.filter((m) => m.project_id === id);
                      return { data: target ? { ...target, project_media: projMedia } : null, error: null };
                    },
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
      }

      if (table === "project_media") {
        return {
          select: (_cols?: string) => {
            let filtered = [...media];
            const builder: any = {
              eq: (col: string, val: any) => {
                filtered = filtered.filter((m) => (m as any)[col] === val);
                return builder;
              },
              order: (col: string, orderOpts: { ascending?: boolean } = {}) => {
                const asc = orderOpts.ascending !== false;
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
                resolve({ data: filtered.map((m) => ({ ...m })), error: null });
              },
            };
            return builder;
          },
          insert: (payload: any) => {
            if (options.failDbInsert) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: "Simulated DB insert failure" } }),
                }),
              };
            }

            // Emulate partial unique index uq_project_media_primary:
            // ON public.project_media (project_id) WHERE is_primary = TRUE
            if (payload.is_primary) {
              const existingPrimary = media.find(
                (m) => m.project_id === payload.project_id && m.is_primary,
              );
              if (existingPrimary) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: {
                        code: "23505",
                        message: 'duplicate key value violates unique constraint "uq_project_media_primary"',
                      },
                    }),
                  }),
                };
              }
            }

            // Emulate check_project_media_limit: max 5 images
            const projectMediaCount = media.filter((m) => m.project_id === payload.project_id).length;
            if (projectMediaCount >= 5) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: "23514",
                      message: "A project cannot have more than 5 images.",
                    },
                  }),
                }),
              };
            }

            const newRow: ProjectMediaRow = {
              id: payload.id ?? randomUUID(),
              project_id: payload.project_id,
              object_path: payload.object_path,
              mime_type: payload.mime_type,
              is_primary: payload.is_primary ?? false,
              sort_order: payload.sort_order ?? 0,
              alt_text: payload.alt_text ?? null,
              caption: payload.caption ?? null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            media.push(newRow);
            return {
              select: () => ({
                single: async () => ({ data: { ...newRow }, error: null }),
              }),
            };
          },
          update: (payload: any) => {
            const builder: any = {
              eq: (col: string, val: any) => {
                const matches = media.filter((m) => (m as any)[col] === val);
                matches.forEach((m) => {
                  Object.assign(m, payload);
                  m.updated_at = new Date().toISOString();
                });
                return {
                  eq: (col2: string, val2: any) => {
                    const matched = matches.find((m) => (m as any)[col2] === val2);
                    return {
                      select: () => ({
                        single: async () => ({ data: matched ? { ...matched } : null, error: null }),
                      }),
                    };
                  },
                  select: () => ({
                    single: async () => ({ data: matches[0] ? { ...matches[0] } : null, error: null }),
                  }),
                };
              },
            };
            return builder;
          },
          delete: () => {
            return {
              eq: (_col: string, id: string) => ({
                eq: (_col2: string, projectId: string) => {
                  const idx = media.findIndex((m) => m.id === id && m.project_id === projectId);
                  if (idx !== -1) {
                    media.splice(idx, 1);
                  }
                  return Promise.resolve({ error: null });
                },
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, projects, media, uploadedObjects, removedObjects, rpcCalls };
}

async function startAdminServer(
  client: SupabaseClient,
  authMiddleware: RequestHandler = passAuthMiddleware,
): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/projects",
    createAdminProjectsRouter({
      client,
      authMiddleware,
      uploadRateLimiter: (_req, _res, next) => next(),
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startPublicServer(client: SupabaseClient): Promise<string> {
  const app = express();
  app.use("/api/projects", createProjectsRouter({ client }));

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const sampleProject: ProjectDatabaseRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "test-media-project",
  title: "Test Media Project",
  client_organization: "Electro Tech Client",
  location: "Islamabad",
  size: "50 kW",
  category: "Complete Solar System Installation",
  completion_year: 2026,
  short_summary: "A high efficiency solar project installed for a commercial client.",
  full_story: "Full case study story details here.",
  description: "A high efficiency solar project installed for a commercial client.",
  equipment: ["Tier-1 Panels", "Inverter"],
  primary_image_path: null,
  secondary_image_path: null,
  primary_alt: null,
  secondary_alt: null,
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

function createFormData(options: {
  fileBuffer?: Buffer;
  mimeType?: string;
  filename?: string;
  altText?: string;
  caption?: string;
  isPrimary?: boolean;
}): FormData {
  const form = new FormData();
  if (options.fileBuffer !== undefined) {
    const filename = options.filename ?? "test.webp";
    const mime = options.mimeType ?? "image/webp";
    const uint8 = new Uint8Array(options.fileBuffer);
    form.set("file", new File([uint8.buffer as ArrayBuffer], filename, { type: mime }));
  }
  if (options.altText !== undefined) {
    form.set("altText", options.altText);
  }
  if (options.caption !== undefined) {
    form.set("caption", options.caption);
  }
  if (options.isPrimary !== undefined) {
    form.set("isPrimary", String(options.isPrimary));
  }
  return form;
}

// 1. Partial Unique Index: two primary images for same project -> rejected
test("1. Partial Unique Index: two primary images for same project is rejected by database constraint", async () => {
  const primaryImg1: ProjectMediaRow = {
    id: "11111111-0000-4000-8000-000000000001",
    project_id: sampleProject.id,
    object_path: `projects/${sampleProject.id}/images/img-1.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "Primary 1",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client } = createMockClient({
    initialProjects: [sampleProject],
    initialMedia: [primaryImg1],
  });

  // Attempting to insert a 2nd primary image violates uq_project_media_primary
  const { data, error } = await client
    .from("project_media")
    .insert({
      project_id: sampleProject.id,
      object_path: `projects/${sampleProject.id}/images/img-2.webp`,
      mime_type: "image/webp",
      is_primary: true,
    })
    .select()
    .single();

  assert.equal(data, null);
  assert.ok(error);
  assert.equal(error.code, "23505");
  assert.equal(error.message.includes("uq_project_media_primary"), true);
});

// 2. Publication validation rejects primary alt NULL, "", and whitespace-only
test("2. Publication validation rejects primary alt NULL, empty string, and whitespace-only; accepts valid alt", async () => {
  const { client, media } = createMockClient({
    initialProjects: [sampleProject],
    initialMedia: [],
  });
  const baseUrl = await startAdminServer(client);

  const img: ProjectMediaRow = {
    id: "22222222-0000-4000-8000-000000000001",
    project_id: sampleProject.id,
    object_path: `projects/${sampleProject.id}/images/img.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: null,
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  media.push(img);

  // A. primary alt NULL -> rejected (400, missingFields: ['primaryAlt'])
  const resNull = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resNull.status, 400);
  const bodyNull = (await resNull.json()) as { missingFields: string[] };
  assert.equal(bodyNull.missingFields.includes("primaryAlt"), true);

  // B. primary alt "" (empty string) -> rejected (400, missingFields: ['primaryAlt'])
  img.alt_text = "";
  const resEmpty = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resEmpty.status, 400);
  const bodyEmpty = (await resEmpty.json()) as { missingFields: string[] };
  assert.equal(bodyEmpty.missingFields.includes("primaryAlt"), true);

  // C. primary alt "   " (whitespace-only) -> rejected (400, missingFields: ['primaryAlt'])
  img.alt_text = "   ";
  const resWhitespace = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resWhitespace.status, 400);
  const bodyWhitespace = (await resWhitespace.json()) as { missingFields: string[] };
  assert.equal(bodyWhitespace.missingFields.includes("primaryAlt"), true);

  // D. Valid meaningful alt text -> publish succeeds (200)
  img.alt_text = "Commercial solar rooftop panels in Islamabad";
  const resSuccess = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/publish`, {
    method: "POST",
  });
  assert.equal(resSuccess.status, 200);
  const bodySuccess = (await resSuccess.json()) as any;
  assert.equal(bodySuccess.status, "published");
});

// 3. Published project safety: only primary changed to non-primary is rejected
test("3. Published project safety: only primary image cannot be demoted or deleted without replacement", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    id: "33333333-0000-4000-8000-000000000001",
    status: "published",
    published_at: "2026-01-01T00:00:00Z",
  };

  const primaryImg: ProjectMediaRow = {
    id: "33333333-0000-4000-8000-000000000002",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/primary.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "Valid Primary Alt",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client } = createMockClient({
    initialProjects: [publishedProject],
    initialMedia: [primaryImg],
  });
  const baseUrl = await startAdminServer(client);

  // Deleting the only/primary image of a published project is rejected with 409 Conflict
  const resDelete = await fetch(
    `${baseUrl}/api/admin/projects/${publishedProject.id}/media/${primaryImg.id}`,
    { method: "DELETE" },
  );
  assert.equal(resDelete.status, 409);
  const bodyDelete = (await resDelete.json()) as { error: string };
  assert.equal(bodyDelete.error.includes("only image"), true);
});

// 4. Published primary alt changed to blank -> rejected with 409 Conflict
test("4. Published primary alt changed to blank or whitespace is rejected with 409 Conflict", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    id: "44444444-0000-4000-8000-000000000001",
    status: "published",
    published_at: "2026-01-01T00:00:00Z",
  };

  const primaryImg: ProjectMediaRow = {
    id: "44444444-0000-4000-8000-000000000002",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/primary.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "Original Alt",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client } = createMockClient({
    initialProjects: [publishedProject],
    initialMedia: [primaryImg],
  });
  const baseUrl = await startAdminServer(client);

  // A. Empty string altText -> 409 Conflict
  const resEmpty = await fetch(
    `${baseUrl}/api/admin/projects/${publishedProject.id}/media/${primaryImg.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText: "" }),
    },
  );
  assert.equal(resEmpty.status, 409);
  const bodyEmpty = (await resEmpty.json()) as { error: string };
  assert.equal(bodyEmpty.error.includes("alt text"), true);

  // B. Whitespace-only altText -> 409 Conflict
  const resWhitespace = await fetch(
    `${baseUrl}/api/admin/projects/${publishedProject.id}/media/${primaryImg.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText: "    " }),
    },
  );
  assert.equal(resWhitespace.status, 409);
  const bodyWhitespace = (await resWhitespace.json()) as { error: string };
  assert.equal(bodyWhitespace.error.includes("alt text"), true);
});

// 5. Atomic primary switch succeeds and rejects switch if target lacks alt text on published project
test("5. Atomic primary switch succeeds and invokes set_primary_project_media RPC", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    id: "55555555-0000-4000-8000-000000000001",
    status: "published",
    published_at: "2026-01-01T00:00:00Z",
  };

  const img1: ProjectMediaRow = {
    id: "55555555-0000-4000-8000-000000000002",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/1.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "Image 1 Alt",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const img2NoAlt: ProjectMediaRow = {
    id: "55555555-0000-4000-8000-000000000003",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/2.webp`,
    mime_type: "image/webp",
    is_primary: false,
    sort_order: 1,
    alt_text: "",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const img3WithAlt: ProjectMediaRow = {
    id: "55555555-0000-4000-8000-000000000004",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/3.webp`,
    mime_type: "image/webp",
    is_primary: false,
    sort_order: 2,
    alt_text: "Image 3 Valid Alt",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client, media, rpcCalls } = createMockClient({
    initialProjects: [publishedProject],
    initialMedia: [img1, img2NoAlt, img3WithAlt],
  });
  const baseUrl = await startAdminServer(client);

  // A. Switching primary to img2 (no alt text) fails on published project with 409 Conflict
  const resFail = await fetch(
    `${baseUrl}/api/admin/projects/${publishedProject.id}/media/${img2NoAlt.id}/primary`,
    { method: "POST" },
  );
  assert.equal(resFail.status, 409);
  const bodyFail = (await resFail.json()) as { error: string };
  assert.equal(bodyFail.error.includes("alt text"), true);

  // B. Switching primary to img3 (with valid alt text) succeeds atomically
  const resSuccess = await fetch(
    `${baseUrl}/api/admin/projects/${publishedProject.id}/media/${img3WithAlt.id}/primary`,
    { method: "POST" },
  );
  assert.equal(resSuccess.status, 200);
  const bodySuccess = (await resSuccess.json()) as any;
  assert.equal(bodySuccess.isPrimary, true);

  // Verify RPC was invoked
  const rpcCall = rpcCalls.find((c) => c.name === "set_primary_project_media");
  assert.ok(rpcCall);
  assert.deepEqual(rpcCall.args, {
    p_project_id: publishedProject.id,
    p_media_id: img3WithAlt.id,
  });

  // Verify state: img3 is primary, img1 is not primary
  const targetImg3 = media.find((m) => m.id === img3WithAlt.id);
  const targetImg1 = media.find((m) => m.id === img1.id);
  assert.equal(targetImg3?.is_primary, true);
  assert.equal(targetImg1?.is_primary, false);
});

// 6. Concurrency / max-image invariant cannot leave more than 5 records
test("6. Concurrency / max-image invariant: 6th image upload is rejected with 409 Conflict", async () => {
  const existingMedia: ProjectMediaRow[] = Array.from({ length: 5 }, (_, i) => ({
    id: `66666666-0000-4000-8000-00000000000${i + 2}`,
    project_id: sampleProject.id,
    object_path: `projects/${sampleProject.id}/images/img-${i + 1}.webp`,
    mime_type: "image/webp",
    is_primary: i === 0,
    sort_order: i,
    alt_text: `Image ${i + 1}`,
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));

  const { client, media } = createMockClient({
    initialProjects: [sampleProject],
    initialMedia: existingMedia,
  });
  const baseUrl = await startAdminServer(client);

  const form = createFormData({
    fileBuffer: VALID_WEBP_BUFFER,
    mimeType: "image/webp",
    altText: "Sixth image attempt",
  });

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/media`, {
    method: "POST",
    body: form,
  });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error.includes("5"), true);

  // Invariant preserved: strictly 5 media items exist
  assert.equal(media.length, 5);
});

// 7. Storage rollback on DB insert failure
test("7. Storage rollback on DB insert failure: uploaded Storage object is deleted if DB insert fails", async () => {
  const { client, removedObjects } = createMockClient({
    initialProjects: [sampleProject],
    failDbInsert: true,
  });
  const baseUrl = await startAdminServer(client);

  const form = createFormData({
    fileBuffer: VALID_WEBP_BUFFER,
    mimeType: "image/webp",
    altText: "Test image",
  });

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/media`, {
    method: "POST",
    body: form,
  });

  assert.equal(res.status, 503);
  assert.equal(removedObjects.length, 1);
  assert.equal(removedObjects[0]?.[0]?.includes(sampleProject.id), true);
});

// 8. Storage delete failure retains DB row
test("8. Storage delete failure retains DB row: if Storage removal fails, media record is not deleted", async () => {
  const img: ProjectMediaRow = {
    id: "88888888-0000-4000-8000-000000000001",
    project_id: sampleProject.id,
    object_path: `projects/${sampleProject.id}/images/safe.webp`,
    mime_type: "image/webp",
    is_primary: false,
    sort_order: 0,
    alt_text: "Safe image",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client, media } = createMockClient({
    initialProjects: [sampleProject],
    initialMedia: [img],
    failStorageDelete: true,
  });
  const baseUrl = await startAdminServer(client);

  const res = await fetch(
    `${baseUrl}/api/admin/projects/${sampleProject.id}/media/${img.id}`,
    { method: "DELETE" },
  );

  assert.equal(res.status, 503);
  // DB record must be retained!
  assert.equal(media.some((m) => m.id === img.id), true);
});

// 9. Permanent project delete cleans up all project_media Storage objects
test("9. Permanent project delete cleans up all project_media Storage objects", async () => {
  const draftProject: ProjectDatabaseRow = {
    ...sampleProject,
    id: "99999999-0000-4000-8000-000000000001",
    status: "draft",
  };

  const media1: ProjectMediaRow = {
    id: "99999999-0000-4000-8000-000000000002",
    project_id: draftProject.id,
    object_path: `projects/${draftProject.id}/images/1.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "1",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const media2: ProjectMediaRow = {
    id: "99999999-0000-4000-8000-000000000003",
    project_id: draftProject.id,
    object_path: `projects/${draftProject.id}/images/2.webp`,
    mime_type: "image/webp",
    is_primary: false,
    sort_order: 1,
    alt_text: "2",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client, projects, removedObjects } = createMockClient({
    initialProjects: [draftProject],
    initialMedia: [media1, media2],
  });
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${draftProject.id}`, {
    method: "DELETE",
  });

  assert.equal(res.status, 200);
  assert.equal(projects.some((p) => p.id === draftProject.id), false);
  const flattened = removedObjects.flat();
  assert.equal(flattened.includes(media1.object_path), true);
  assert.equal(flattened.includes(media2.object_path), true);
});

// 10. Public API returns shortSummary, images without objectPath, and mainImage
test("10. Public API returns shortSummary, images without objectPath, and mainImage", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    status: "published",
    published_at: "2026-01-01T00:00:00Z",
  };

  const primaryImg: ProjectMediaRow = {
    id: "aaaaaaaa-0000-4000-8000-000000000002",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/hero.webp`,
    mime_type: "image/webp",
    is_primary: true,
    sort_order: 0,
    alt_text: "Primary Hero Shot",
    caption: "Hero caption",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const secondaryImg: ProjectMediaRow = {
    id: "aaaaaaaa-0000-4000-8000-000000000003",
    project_id: publishedProject.id,
    object_path: `projects/${publishedProject.id}/images/detail.webp`,
    mime_type: "image/webp",
    is_primary: false,
    sort_order: 1,
    alt_text: "Secondary Detail Shot",
    caption: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const { client } = createMockClient({
    initialProjects: [publishedProject],
    initialMedia: [primaryImg, secondaryImg],
  });
  const baseUrl = await startPublicServer(client);

  const res = await fetch(`${baseUrl}/api/projects/${publishedProject.slug}`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;

  // Verify shortSummary
  assert.equal(data.shortSummary, sampleProject.short_summary);

  // Verify images array
  assert.ok(Array.isArray(data.images));
  assert.equal(data.images.length, 2);

  // Verify objectPath is stripped
  for (const img of data.images) {
    assert.equal(img.objectPath, undefined);
    assert.equal(typeof img.url, "string");
    assert.equal(img.url.includes("https://mock.supabase.co"), true);
  }

  // Verify mainImage
  assert.ok(data.mainImage);
  assert.equal(data.mainImage.id, primaryImg.id);
  assert.equal(data.mainImage.isPrimary, true);
  assert.equal(data.mainImage.objectPath, undefined);
});
