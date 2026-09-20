import assert from "node:assert/strict";
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

function createMockClient(initialProjects: ProjectDatabaseRow[] = []): {
  client: SupabaseClient;
  projects: ProjectDatabaseRow[];
  uploadedObjects: { path: string; buffer: Buffer; contentType: string }[];
  removedObjects: string[][];
} {
  const projects = initialProjects.map((p) => ({ ...p }));
  const uploadedObjects: { path: string; buffer: Buffer; contentType: string }[] = [];
  const removedObjects: string[][] = [];

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
          upload: async (path: string, buffer: Buffer, options: any) => {
            uploadedObjects.push({ path, buffer, contentType: options.contentType });
            return { data: { path }, error: null };
          },
          remove: async (paths: string[]) => {
            removedObjects.push(paths);
            return { data: paths, error: null };
          },
        };
      },
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
            maybeSingle: async () => {
              return { data: filtered[0] ? { ...filtered[0] } : null, error: null };
            },
            single: async () => {
              return { data: filtered[0] ? { ...filtered[0] } : null, error: null };
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

  return { client, projects, uploadedObjects, removedObjects };
}

async function startAdminServer(
  client: SupabaseClient,
  authMiddleware: RequestHandler = passAuthMiddleware,
): Promise<string> {
  const app = express();
  app.use(
    "/api/admin/projects",
    createAdminProjectsRouter({
      client,
      authMiddleware,
      uploadRateLimiter: (_req, _res, next) => next(), // bypass limiter in test
    }),
  );

  const server = app.listen(0, "127.0.0.1");
  servers.add(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const sampleProject: ProjectDatabaseRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "test-project",
  title: "Test Project",
  location: "Lahore",
  size: "20 kW",
  description: "Test description",
  equipment: ["Panels"],
  primary_image_path: null,
  secondary_image_path: null,
  primary_alt: "Primary Alt",
  secondary_alt: "Secondary Alt",
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
  slot?: string;
  filename?: string;
  fileBuffer?: Buffer;
  mimeType?: string;
  extraField?: { name: string; value: string };
  extraFile?: { name: string; filename: string; buffer: Buffer; mime: string };
}): FormData {
  const form = new FormData();
  if (options.slot !== undefined) {
    form.set("slot", options.slot);
  }
  if (options.extraField) {
    form.set(options.extraField.name, options.extraField.value);
  }
  if (options.fileBuffer !== undefined) {
    const filename = options.filename ?? "image.webp";
    const mime = options.mimeType ?? "image/webp";
    const uint8 = new Uint8Array(options.fileBuffer);
    form.set("file", new File([uint8.buffer as ArrayBuffer], filename, { type: mime }));
  }
  if (options.extraFile) {
    const uint8 = new Uint8Array(options.extraFile.buffer);
    form.set(
      options.extraFile.name,
      new File([uint8.buffer as ArrayBuffer], options.extraFile.filename, {
        type: options.extraFile.mime,
      }),
    );
  }
  return form;
}

// ----------------------------------------------------------------------------
// 1. VALIDATION TESTS
// ----------------------------------------------------------------------------

test("1. Missing file returns 400 Bad Request", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({ slot: "primary" }),
  });
  assert.equal(res.status, 400);
});

test("2. Empty file returns 400 Bad Request", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "test.webp",
      fileBuffer: Buffer.alloc(0),
      mimeType: "image/webp",
    }),
  });
  assert.equal(res.status, 400);
});

test("3. File > 5 MB returns 413 File Too Large", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "large.webp",
      fileBuffer: largeBuffer,
      mimeType: "image/webp",
    }),
  });
  assert.equal(res.status, 413);
});

test("4. Unsupported extension returns 415 Unsupported Media Type", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const unsupportedExts = ["test.gif", "test.svg", "test.bmp", "test.exe", "test.html"];
  for (const filename of unsupportedExts) {
    const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
      method: "POST",
      body: createFormData({
        slot: "primary",
        filename,
        fileBuffer: Buffer.from("some binary content"),
        mimeType: "image/gif",
      }),
    });
    assert.equal(res.status, 415, `Expected ${filename} to return 415`);
  }
});

test("5. Unsupported MIME returns 415", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "test.webp",
      fileBuffer: VALID_WEBP_BUFFER,
      mimeType: "application/pdf",
    }),
  });
  assert.equal(res.status, 415);
});

test("6. Spoofed MIME returns 415", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  // Text file renamed to .jpg
  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "spoofed.jpg",
      fileBuffer: Buffer.from("Hello I am a text file pretending to be JPEG"),
      mimeType: "image/jpeg",
    }),
  });
  assert.equal(res.status, 415);
});

test("7, 8, 9. Invalid magic bytes for JPEG, PNG, and WebP return 415", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  // Corrupt JPEG
  const resJpg = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "corrupt.jpg",
      fileBuffer: Buffer.from([0x00, 0x00, 0x00, 0x00]),
      mimeType: "image/jpeg",
    }),
  });
  assert.equal(resJpg.status, 415);

  // Corrupt PNG
  const resPng = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "corrupt.png",
      fileBuffer: Buffer.from([0x89, 0x50, 0x00, 0x00]),
      mimeType: "image/png",
    }),
  });
  assert.equal(resPng.status, 415);

  // Corrupt WebP (RIFF but not WEBP)
  const resWebp = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "corrupt.webp",
      fileBuffer: Buffer.from("RIFF1234CORRUPT"),
      mimeType: "image/webp",
    }),
  });
  assert.equal(resWebp.status, 415);
});

test("10, 11, 12. Valid WebP, JPEG, and PNG succeed", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  // Valid WebP
  const resWebp = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "valid.webp",
      fileBuffer: VALID_WEBP_BUFFER,
      mimeType: "image/webp",
    }),
  });
  assert.equal(resWebp.status, 200);

  // Valid JPEG
  const resJpg = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "secondary",
      filename: "valid.jpg",
      fileBuffer: VALID_JPEG_BUFFER,
      mimeType: "image/jpeg",
    }),
  });
  assert.equal(resJpg.status, 200);

  // Valid PNG
  const resPng = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "valid.png",
      fileBuffer: VALID_PNG_BUFFER,
      mimeType: "image/png",
    }),
  });
  assert.equal(resPng.status, 200);
});

test("13 & 14. Unexpected field and multiple files return 400", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  // Unexpected extra field
  const resExtra = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "valid.webp",
      fileBuffer: VALID_WEBP_BUFFER,
      extraField: { name: "malicious_field", value: "hacked" },
    }),
  });
  assert.equal(resExtra.status, 400);

  // Multiple files
  const resMulti = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "valid1.webp",
      fileBuffer: VALID_WEBP_BUFFER,
      extraFile: { name: "file2", filename: "valid2.webp", buffer: VALID_WEBP_BUFFER, mime: "image/webp" },
    }),
  });
  assert.equal(resMulti.status, 400);
});

test("15. Invalid slot returns 400", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const invalidSlots = ["cover", "avatar", "third", "PRIMARY", "gallery", ""];
  for (const slot of invalidSlots) {
    const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
      method: "POST",
      body: createFormData({
        slot,
        filename: "valid.webp",
        fileBuffer: VALID_WEBP_BUFFER,
      }),
    });
    assert.equal(res.status, 400, `Expected slot '${slot}' to return 400`);
  }
});

// ----------------------------------------------------------------------------
// 2. UPLOAD & REPLACEMENT TESTS
// ----------------------------------------------------------------------------

test("Upload requires authentication and authorization", async () => {
  const { client } = createMockClient([sampleProject]);
  const form = createFormData({
    slot: "primary",
    filename: "valid.webp",
    fileBuffer: VALID_WEBP_BUFFER,
  });

  // 401 unauthenticated
  const baseUrlUnauth = await startAdminServer(
    client,
    (await import("../src/middleware/authenticate-admin.js")).authenticateAdmin,
  );
  const resUnauth = await fetch(`${baseUrlUnauth}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: form,
  });
  assert.equal(resUnauth.status, 401);

  // 403 unauthorized
  const baseUrlForbid = await startAdminServer(client, (_req, res) => {
    res.status(403).json({ error: "Forbidden" });
  });
  const resForbid = await fetch(`${baseUrlForbid}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: form,
  });
  assert.equal(resForbid.status, 403);
});

test("Upload checks project UUID validity and existence", async () => {
  const { client } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const form = createFormData({
    slot: "primary",
    filename: "valid.webp",
    fileBuffer: VALID_WEBP_BUFFER,
  });

  // 400 invalid UUID
  const resBadId = await fetch(`${baseUrl}/api/admin/projects/not-a-uuid/images`, {
    method: "POST",
    body: form,
  });
  assert.equal(resBadId.status, 400);

  // 404 missing project
  const resMissing = await fetch(
    `${baseUrl}/api/admin/projects/99999999-9999-4999-8999-999999999999/images`,
    {
      method: "POST",
      body: form,
    },
  );
  assert.equal(resMissing.status, 404);
});

test("Upload generates collision-safe path using project UUID and slot without trusting client filename", async () => {
  const { client, uploadedObjects } = createMockClient([sampleProject]);
  const baseUrl = await startAdminServer(client);

  const dangerousFilename = "../../../malicious-script.sh.webp";
  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: dangerousFilename,
      fileBuffer: VALID_WEBP_BUFFER,
    }),
  });

  assert.equal(res.status, 200);
  const updated = (await res.json()) as any;
  assert.equal(uploadedObjects.length, 1);

  const firstUpload = uploadedObjects[0];
  assert.ok(firstUpload);
  const storedPath = firstUpload.path;

  // Format: projects/<project-uuid>/<slot>_<timestamp>_<randomHex>.<extension>
  assert.equal(storedPath.startsWith(`projects/${sampleProject.id}/primary_`), true);
  assert.equal(storedPath.endsWith(".webp"), true);
  assert.equal(storedPath.includes("malicious"), false);

  // DB stores relative object path only
  assert.equal(updated.primaryImagePath, storedPath);
  // Public URL is resolved
  assert.equal(
    updated.primaryImageUrl,
    `https://mock.supabase.co/storage/v1/object/public/project-images/${storedPath}`,
  );
});

test("Image replacement creates new path and deletes old object from Storage", async () => {
  const projectWithImage: ProjectDatabaseRow = {
    ...sampleProject,
    primary_image_path: `projects/${sampleProject.id}/primary_old_123.webp`,
  };

  const { client, uploadedObjects, removedObjects } = createMockClient([projectWithImage]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "replacement.webp",
      fileBuffer: VALID_WEBP_BUFFER,
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(uploadedObjects.length, 1);
  assert.notEqual(uploadedObjects[0]?.path, projectWithImage.primary_image_path);

  // Old object deleted
  assert.equal(removedObjects.length, 1);
  const firstRemoval = removedObjects[0];
  assert.ok(firstRemoval);
  assert.deepEqual(firstRemoval, [projectWithImage.primary_image_path]);
});

// ----------------------------------------------------------------------------
// 3. CONSISTENCY TESTS
// ----------------------------------------------------------------------------

test("If Storage upload succeeds but DB update fails, newly uploaded object is rolled back", async () => {
  const removedObjects: string[][] = [];
  const failingDbClient = {
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
        remove: async (paths: string[]) => {
          removedObjects.push(paths);
          return { data: paths, error: null };
        },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...sampleProject }, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: "DB connection severed" } }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const baseUrl = await startAdminServer(failingDbClient);

  const res = await fetch(`${baseUrl}/api/admin/projects/${sampleProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "test.webp",
      fileBuffer: VALID_WEBP_BUFFER,
    }),
  });

  assert.equal(res.status, 503);
  // Storage rollback was executed
  assert.equal(removedObjects.length, 1);
  const firstRemoval = removedObjects[0];
  assert.ok(firstRemoval);
  assert.equal(firstRemoval[0]?.startsWith(`projects/${sampleProject.id}/primary_`), true);
});

test("Published project image replacement is allowed without creating null intermediate state", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    status: "published",
    primary_image_path: `projects/${sampleProject.id}/primary_old.webp`,
    secondary_image_path: `projects/${sampleProject.id}/secondary_old.webp`,
  };

  const { client, projects } = createMockClient([publishedProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${publishedProject.id}/images`, {
    method: "POST",
    body: createFormData({
      slot: "primary",
      filename: "new-primary.webp",
      fileBuffer: VALID_WEBP_BUFFER,
    }),
  });

  assert.equal(res.status, 200);
  const updated = projects.find((p) => p.id === publishedProject.id);
  assert.ok(updated);
  assert.equal(updated.status, "published");
  assert.notEqual(updated.primary_image_path, null);
  assert.notEqual(updated.primary_image_path, `projects/${sampleProject.id}/primary_old.webp`);
});

test("Published project direct image deletion is rejected with 409 Conflict", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    status: "published",
    primary_image_path: `projects/${sampleProject.id}/primary.webp`,
    secondary_image_path: `projects/${sampleProject.id}/secondary.webp`,
  };

  const { client } = createMockClient([publishedProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${publishedProject.id}/images/primary`, {
    method: "DELETE",
  });

  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error.includes("published"), true);
});

test("Draft project image deletion deletes Storage object and clears DB path", async () => {
  const draftProject: ProjectDatabaseRow = {
    ...sampleProject,
    status: "draft",
    primary_image_path: `projects/${sampleProject.id}/primary.webp`,
  };

  const { client, projects, removedObjects } = createMockClient([draftProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${draftProject.id}/images/primary`, {
    method: "DELETE",
  });

  assert.equal(res.status, 200);
  assert.equal(removedObjects.length, 1);
  const firstRemoval = removedObjects[0];
  assert.ok(firstRemoval);
  assert.deepEqual(firstRemoval, [`projects/${sampleProject.id}/primary.webp`]);

  const updated = projects.find((p) => p.id === draftProject.id);
  assert.equal(updated?.primary_image_path, null);
});

// ----------------------------------------------------------------------------
// 4. PROJECT PERMANENT DELETION UPGRADE TESTS
// ----------------------------------------------------------------------------

test("Permanent delete: published project delete is rejected with 409", async () => {
  const publishedProject: ProjectDatabaseRow = {
    ...sampleProject,
    status: "published",
  };

  const { client } = createMockClient([publishedProject]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${publishedProject.id}`, {
    method: "DELETE",
  });
  assert.equal(res.status, 409);
});

test("Permanent delete: draft project with images removes Storage objects then deletes DB row", async () => {
  const draftWithImages: ProjectDatabaseRow = {
    ...sampleProject,
    status: "draft",
    primary_image_path: `projects/${sampleProject.id}/primary.webp`,
    secondary_image_path: `projects/${sampleProject.id}/secondary.webp`,
  };

  const { client, projects, removedObjects } = createMockClient([draftWithImages]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${draftWithImages.id}`, {
    method: "DELETE",
  });

  assert.equal(res.status, 200);
  // Storage assets removed
  assert.equal(removedObjects.length, 1);
  const firstRemoval = removedObjects[0];
  assert.ok(firstRemoval);
  assert.deepEqual(firstRemoval, [
    `projects/${sampleProject.id}/primary.webp`,
    `projects/${sampleProject.id}/secondary.webp`,
  ]);
  // DB row deleted
  assert.equal(projects.some((p) => p.id === draftWithImages.id), false);
});

test("Permanent delete: archived project with two images removes both Storage objects then deletes DB row", async () => {
  const archivedWithImages: ProjectDatabaseRow = {
    ...sampleProject,
    status: "archived",
    primary_image_path: `projects/${sampleProject.id}/primary.webp`,
    secondary_image_path: `projects/${sampleProject.id}/secondary.webp`,
  };

  const { client, projects, removedObjects } = createMockClient([archivedWithImages]);
  const baseUrl = await startAdminServer(client);

  const res = await fetch(`${baseUrl}/api/admin/projects/${archivedWithImages.id}`, {
    method: "DELETE",
  });

  assert.equal(res.status, 200);
  assert.equal(removedObjects.length, 1);
  const firstRemoval = removedObjects[0];
  assert.ok(firstRemoval);
  assert.deepEqual(firstRemoval, [
    `projects/${sampleProject.id}/primary.webp`,
    `projects/${sampleProject.id}/secondary.webp`,
  ]);
  assert.equal(projects.some((p) => p.id === archivedWithImages.id), false);
});

test("Permanent delete: Storage cleanup failure retains DB record", async () => {
  const draftWithImages: ProjectDatabaseRow = {
    ...sampleProject,
    status: "draft",
    primary_image_path: `projects/${sampleProject.id}/primary.webp`,
  };

  const failingStorageClient = {
    storage: {
      from: () => ({
        remove: async () => ({ data: null, error: { message: "Storage service timeout" } }),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...draftWithImages }, error: null }),
        }),
      }),
      delete: () => {
        assert.fail("DB delete must not be called when Storage cleanup fails!");
      },
    }),
  } as unknown as SupabaseClient;

  const baseUrl = await startAdminServer(failingStorageClient);

  const res = await fetch(`${baseUrl}/api/admin/projects/${draftWithImages.id}`, {
    method: "DELETE",
  });

  assert.equal(res.status, 503);
});
