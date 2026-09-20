import { randomBytes } from "node:crypto";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.js";
import {
  toAdminProject,
  ProjectConflictError,
  ProjectNotFoundError,
  type AdminProjectResponse,
  type ProjectDatabaseRow,
} from "./projects.js";
import type { ProjectImageSlot } from "../validation/projects.js";

export const PROJECT_IMAGES_BUCKET = "project-images";
export const MAX_PROJECT_IMAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ValidProjectImageMimeType = "image/webp" | "image/jpeg" | "image/png";

const ALLOWED_EXTENSIONS_MAP: Readonly<Record<string, ValidProjectImageMimeType>> = Object.freeze({
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
});

const PERMITTED_BROWSER_MIMES: Readonly<Record<ValidProjectImageMimeType, ReadonlySet<string>>> = Object.freeze({
  "image/webp": new Set(["image/webp", "application/octet-stream", ""]),
  "image/jpeg": new Set(["image/jpeg", "image/jpg", "image/pjpeg", "application/octet-stream", ""]),
  "image/png": new Set(["image/png", "image/x-png", "application/octet-stream", ""]),
});

export class ProjectImageValidationError extends Error {
  constructor(
    public readonly code: "empty" | "too_large" | "unsupported" | "mismatch",
    message: string,
  ) {
    super(message);
    this.name = "ProjectImageValidationError";
  }
}

/**
 * Detects the image MIME type from the buffer's magic-byte signatures.
 * Supports JPEG, PNG, and WebP (RIFF....WEBP).
 */
export function detectImageMimeType(buffer: Buffer): ValidProjectImageMimeType | null {
  // JPEG signature: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  // WebP signature: Begins with "RIFF" (bytes 0-3) and has "WEBP" at bytes 8-11
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Validates uploaded project image file:
 * - Non-empty buffer
 * - Size <= 5 MB
 * - Extension matching .webp, .jpg, .jpeg, or .png
 * - Magic-byte signature matches expected extension
 * - Browser MIME type compatibility
 * - Rejects SVGs, HTML, executables, or spoofed files
 */
export function validateProjectImageFile(file: Express.Multer.File): {
  buffer: Buffer;
  mimeType: ValidProjectImageMimeType;
  extension: string;
} {
  if (!file || !file.buffer || file.buffer.length === 0 || file.size === 0) {
    throw new ProjectImageValidationError("empty", "The uploaded image is empty.");
  }

  if (file.buffer.length > MAX_PROJECT_IMAGE_FILE_BYTES) {
    throw new ProjectImageValidationError(
      "too_large",
      `The image must be ${MAX_PROJECT_IMAGE_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
    );
  }

  const rawExt = path.extname(file.originalname || "").toLowerCase();
  const expectedMime = ALLOWED_EXTENSIONS_MAP[rawExt];
  if (!expectedMime) {
    throw new ProjectImageValidationError(
      "unsupported",
      "Upload a WebP, JPEG, or PNG image. SVG, HTML, and other file types are not supported.",
    );
  }

  const signatureMime = detectImageMimeType(file.buffer);
  if (!signatureMime || signatureMime !== expectedMime) {
    throw new ProjectImageValidationError(
      "mismatch",
      "The image file type does not match its actual contents.",
    );
  }

  const browserMime = file.mimetype?.trim().toLowerCase() ?? "";
  const allowedBrowserMimes = PERMITTED_BROWSER_MIMES[expectedMime];
  if (browserMime && !allowedBrowserMimes.has(browserMime)) {
    throw new ProjectImageValidationError(
      "mismatch",
      "The image file type does not match its actual contents.",
    );
  }

  const normalizedExt = signatureMime === "image/jpeg" ? "jpg" : signatureMime === "image/png" ? "png" : "webp";

  return {
    buffer: file.buffer,
    mimeType: signatureMime,
    extension: normalizedExt,
  };
}

/**
 * Builds an isolated, collision-safe Storage object path.
 * Format: projects/<project-uuid>/<slot>_<timestamp>_<randomHex>.<extension>
 * Never uses the client-supplied filename.
 */
export function buildProjectImageStoragePath(
  projectId: string,
  slot: ProjectImageSlot,
  extension: string,
): string {
  const timestamp = Date.now();
  const randomHex = randomBytes(4).toString("hex");
  return `projects/${projectId}/${slot}_${timestamp}_${randomHex}.${extension}`;
}

export type ProjectImageServiceDependencies = {
  client?: SupabaseClient;
  publicUrlBase?: string;
};

/**
 * Uploads or replaces a project image in the specified slot ('primary' or 'secondary').
 *
 * Consistency Protocol:
 * 1. Validate file bytes and signatures.
 * 2. Verify project exists.
 * 3. Upload new object to Storage.
 * 4. Update database field (primary_image_path or secondary_image_path) directly to new path.
 * 5. If DB update fails: rollback newly uploaded Storage object to prevent orphaned files.
 * 6. If DB update succeeds and there was an old object: delete old object from Storage.
 * 7. Return updated normalized admin project data.
 */
export async function uploadProjectImage(
  projectId: string,
  slot: ProjectImageSlot,
  file: Express.Multer.File,
  dependencies: ProjectImageServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const validated = validateProjectImageFile(file);
  const supabase = dependencies.client ?? getSupabaseClient();

  // Verify project exists
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!project) {
    throw new ProjectNotFoundError("Project not found");
  }

  const dbColumn = slot === "primary" ? "primary_image_path" : "secondary_image_path";
  const oldPath: string | null = (project as any)[dbColumn];
  const newPath = buildProjectImageStoragePath(projectId, slot, validated.extension);

  // 1. Upload new object to Storage
  const { error: uploadError } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(newPath, validated.buffer, {
      contentType: validated.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Failed to upload image to storage.");
  }

  // 2. Update database record with new path
  const { data: updated, error: dbError } = await supabase
    .from("projects")
    .update({ [dbColumn]: newPath })
    .eq("id", projectId)
    .select()
    .single();

  if (dbError) {
    // Rollback newly uploaded Storage object so it does not become orphaned
    await supabase.storage
      .from(PROJECT_IMAGES_BUCKET)
      .remove([newPath])
      .catch(() => {});

    throw new Error("Database query failed.");
  }

  // 3. Delete old object from Storage if replacement succeeded
  if (oldPath && oldPath !== newPath) {
    await supabase.storage
      .from(PROJECT_IMAGES_BUCKET)
      .remove([oldPath])
      .catch(() => {});
  }

  return toAdminProject(
    updated as ProjectDatabaseRow,
    dependencies.publicUrlBase ?? dependencies.client,
  );
}

/**
 * Deletes an image from the specified slot ('primary' or 'secondary').
 *
 * Requirements:
 * - Reject with 409 Conflict if the project is currently published (publication requires both images).
 * - Remove Storage object.
 * - Set corresponding database image path to null.
 * - Return updated normalized admin project data.
 */
export async function deleteProjectImage(
  projectId: string,
  slot: ProjectImageSlot,
  dependencies: ProjectImageServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!project) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (project.status === "published") {
    throw new ProjectConflictError(
      "Cannot delete image from a published project. Unpublish the project first.",
    );
  }

  const dbColumn = slot === "primary" ? "primary_image_path" : "secondary_image_path";
  const currentPath: string | null = (project as any)[dbColumn];

  if (!currentPath) {
    // Idempotent success: no image currently in slot
    return toAdminProject(
      project as ProjectDatabaseRow,
      dependencies.publicUrlBase ?? dependencies.client,
    );
  }

  // 1. Delete object from Storage
  const { error: storageError } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .remove([currentPath]);

  if (storageError) {
    throw new Error("Failed to delete image from storage.");
  }

  // 2. Clear database field
  const { data: updated, error: dbError } = await supabase
    .from("projects")
    .update({ [dbColumn]: null })
    .eq("id", projectId)
    .select()
    .single();

  if (dbError) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(
    updated as ProjectDatabaseRow,
    dependencies.publicUrlBase ?? dependencies.client,
  );
}

/**
 * Cleans up all Storage assets associated with a project (both primary and secondary).
 * Uses a single .remove([paths]) call where possible.
 */
export async function cleanupProjectStorage(
  project: ProjectDatabaseRow,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? getSupabaseClient();
  const paths = [project.primary_image_path, project.secondary_image_path].filter(
    (p): p is string => Boolean(p && p.trim()),
  );

  if (paths.length === 0) {
    return;
  }

  const { error } = await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove(paths);
  if (error) {
    throw new Error("Failed to delete project assets from storage.");
  }
}
