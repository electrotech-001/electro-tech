import { randomUUID } from "node:crypto";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.js";
import {
  ProjectConflictError,
  ProjectNotFoundError,
  resolvePublicImageUrl,
  type ProjectServiceDependencies,
} from "./projects.js";

export const PROJECT_IMAGES_BUCKET = "project-images";
export const MAX_PROJECT_IMAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PROJECT_IMAGE_COUNT = 5;

export type ValidImageMimeType = "image/webp" | "image/jpeg" | "image/png";

const ALLOWED_IMAGE_EXTENSIONS: Readonly<Record<string, ValidImageMimeType>> = Object.freeze({
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
});

export class ProjectMediaValidationError extends Error {
  constructor(
    public readonly code: "empty" | "too_large" | "unsupported" | "mismatch",
    message: string,
  ) {
    super(message);
    this.name = "ProjectMediaValidationError";
  }
}

export type ProjectMediaRow = {
  id: string;
  project_id: string;
  object_path: string;
  mime_type: string;
  alt_text: string | null;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectMediaResponse = {
  id: string;
  projectId: string;
  objectPath: string;
  url: string;
  mimeType: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export function toProjectMediaResponse(
  row: ProjectMediaRow,
  clientOrUrlOrDeps?: SupabaseClient | string | ProjectServiceDependencies,
): ProjectMediaResponse {
  let clientOrUrl: SupabaseClient | string | undefined;
  if (
    clientOrUrlOrDeps &&
    typeof clientOrUrlOrDeps === "object" &&
    ("client" in clientOrUrlOrDeps || "publicUrlBase" in clientOrUrlOrDeps)
  ) {
    clientOrUrl =
      (clientOrUrlOrDeps as ProjectServiceDependencies).client ||
      (clientOrUrlOrDeps as ProjectServiceDependencies).publicUrlBase;
  } else if (
    typeof clientOrUrlOrDeps === "string" ||
    (clientOrUrlOrDeps &&
      typeof clientOrUrlOrDeps === "object" &&
      "storage" in clientOrUrlOrDeps)
  ) {
    clientOrUrl = clientOrUrlOrDeps as SupabaseClient | string;
  }
  const url = resolvePublicImageUrl(row.object_path, clientOrUrl) || "";
  return {
    id: row.id,
    projectId: row.project_id,
    objectPath: row.object_path,
    url,
    mimeType: row.mime_type,
    altText: row.alt_text,
    caption: row.caption,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Detects the MIME type from the buffer's magic-byte signatures.
 * Supports JPEG, PNG, and WebP only.
 */
export function detectImageMimeType(buffer: Buffer): ValidImageMimeType | null {
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
 * Validates uploaded project image file (JPEG, PNG, WebP up to 5 MB).
 */
export function validateProjectImageFile(file: Express.Multer.File): {
  buffer: Buffer;
  mimeType: ValidImageMimeType;
  extension: string;
} {
  if (!file || !file.buffer || file.buffer.length === 0 || file.size === 0) {
    throw new ProjectMediaValidationError("empty", "The uploaded file is empty.");
  }

  const rawExt = path.extname(file.originalname || "").toLowerCase();
  const expectedMime = ALLOWED_IMAGE_EXTENSIONS[rawExt];
  if (!expectedMime) {
    throw new ProjectMediaValidationError(
      "unsupported",
      "Upload a JPEG, PNG, or WebP image. Videos, SVG, HTML, and other file types are not supported.",
    );
  }

  if (file.buffer.length > MAX_PROJECT_IMAGE_FILE_BYTES) {
    throw new ProjectMediaValidationError(
      "too_large",
      "The image must be 5 MB or smaller.",
    );
  }

  const signatureMime = detectImageMimeType(file.buffer);
  if (!signatureMime || signatureMime !== expectedMime) {
    throw new ProjectMediaValidationError(
      "mismatch",
      "The file type does not match its actual contents.",
    );
  }

  const extension = rawExt.replace(".", "");

  return {
    buffer: file.buffer,
    mimeType: signatureMime,
    extension,
  };
}

/**
 * Uploads an image to Supabase Storage and inserts a row into public.project_media.
 */
export async function uploadProjectMedia(
  projectId: string,
  file: Express.Multer.File,
  options: {
    altText?: string | null;
    caption?: string | null;
    isPrimary?: boolean;
  } = {},
  dependencies: ProjectServiceDependencies = {},
): Promise<ProjectMediaResponse> {
  const validated = validateProjectImageFile(file);
  const supabase = dependencies.client ?? getSupabaseClient();

  // 1. Verify project exists
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error("Database query failed.");
  }
  if (!project) {
    throw new ProjectNotFoundError("Project not found");
  }

  // 2. Enforce maximum 5 images per project
  const { data: existingMedia, error: countError } = await supabase
    .from("project_media")
    .select("id, is_primary, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (countError) {
    throw new Error("Database query failed.");
  }

  if (existingMedia && existingMedia.length >= MAX_PROJECT_IMAGE_COUNT) {
    throw new ProjectConflictError(
      `A project can have a maximum of ${MAX_PROJECT_IMAGE_COUNT} images.`,
    );
  }

  // 3. Decide is_primary:
  // If explicitly requested, or if this is the first image for the project, make it primary
  const hasExistingPrimary = existingMedia?.some((m) => m.is_primary);
  const isPrimary = options.isPrimary === true || !hasExistingPrimary;

  // 4. Generate collision-safe Storage path
  const mediaId = randomUUID();
  const storagePath = `projects/${projectId}/images/${mediaId}.${validated.extension}`;

  // 5. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .upload(storagePath, validated.buffer, {
      contentType: validated.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Failed to upload image file to storage.");
  }

  // 6. If setting as primary, clear is_primary on existing primary media
  if (isPrimary && hasExistingPrimary) {
    await supabase
      .from("project_media")
      .update({ is_primary: false })
      .eq("project_id", projectId)
      .eq("is_primary", true);
  }

  // 7. Insert into public.project_media
  const sortOrder = existingMedia ? existingMedia.length : 0;
  const { data: inserted, error: insertError } = await supabase
    .from("project_media")
    .insert({
      id: mediaId,
      project_id: projectId,
      object_path: storagePath,
      mime_type: validated.mimeType,
      alt_text: options.altText || null,
      caption: options.caption || null,
      is_primary: isPrimary,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (insertError) {
    // Rollback Storage upload if DB insert fails
    await supabase.storage
      .from(PROJECT_IMAGES_BUCKET)
      .remove([storagePath])
      .catch(() => {});

    throw new Error("Database query failed.");
  }

  return toProjectMediaResponse(inserted as ProjectMediaRow, dependencies);
}

/**
 * Updates metadata (alt_text, caption) for a project media item.
 */
export async function updateProjectMedia(
  projectId: string,
  mediaId: string,
  data: { altText?: string | null | undefined; caption?: string | null | undefined },
  dependencies: ProjectServiceDependencies = {},
): Promise<ProjectMediaResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  // If project is published and this is the primary image, verify altText is not being cleared
  const { data: project } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .maybeSingle();

  const { data: currentMedia } = await supabase
    .from("project_media")
    .select("is_primary")
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!currentMedia) {
    throw new ProjectNotFoundError("Media item not found");
  }

  if (
    project?.status === "published" &&
    currentMedia.is_primary &&
    data.altText !== undefined &&
    (!data.altText || !data.altText.trim())
  ) {
    throw new ProjectConflictError(
      "The primary image of a published project must have non-empty alt text.",
    );
  }

  const updatePayload: Record<string, unknown> = {};
  if (data.altText !== undefined) updatePayload.alt_text = data.altText;
  if (data.caption !== undefined) updatePayload.caption = data.caption;

  const { data: updated, error } = await supabase
    .from("project_media")
    .update(updatePayload)
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error || !updated) {
    throw new ProjectNotFoundError("Media item not found");
  }

  return toProjectMediaResponse(updated as ProjectMediaRow, dependencies);
}

/**
 * Deletes a media item from Storage and database.
 * Prevents deleting the only image or primary image of a published project without replacement.
 */
export async function deleteProjectMedia(
  projectId: string,
  mediaId: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<void> {
  const supabase = dependencies.client ?? getSupabaseClient();

  // 1. Fetch project status and media item
  const { data: project } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    throw new ProjectNotFoundError("Project not found");
  }

  const { data: targetMedia } = await supabase
    .from("project_media")
    .select("*")
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!targetMedia) {
    throw new ProjectNotFoundError("Media item not found");
  }

  // 2. Published project protections
  if (project.status === "published") {
    const { data: images } = await supabase
      .from("project_media")
      .select("id, is_primary")
      .eq("project_id", projectId);

    if (images && images.length <= 1) {
      throw new ProjectConflictError(
        "Cannot delete the only image of a published project. Unpublish the project first.",
      );
    }

    if (targetMedia.is_primary) {
      throw new ProjectConflictError(
        "Cannot delete the primary image of a published project without assigning another primary image first.",
      );
    }
  }

  // 3. Remove object from Supabase Storage first
  const { error: storageError } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .remove([targetMedia.object_path]);

  if (storageError) {
    // If Storage deletion fails, retain DB row and throw error
    throw new Error("Failed to delete image from storage.");
  }

  // 4. Delete row from database
  const { error: dbError } = await supabase
    .from("project_media")
    .delete()
    .eq("id", mediaId)
    .eq("project_id", projectId);

  if (dbError) {
    throw new Error("Failed to delete media record from database.");
  }

  // 5. If the deleted media was primary on an unpublished project, promote next available image
  if (targetMedia.is_primary) {
    const { data: remainingImages } = await supabase
      .from("project_media")
      .select("id")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (remainingImages && remainingImages.length > 0 && remainingImages[0]) {
      await supabase
        .from("project_media")
        .update({ is_primary: true })
        .eq("id", remainingImages[0].id);
    }
  }
}

/**
 * Sets a specific image as the primary/main project image.
 */
export async function setPrimaryProjectMedia(
  projectId: string,
  mediaId: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<ProjectMediaResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: media } = await supabase
    .from("project_media")
    .select("*")
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!media) {
    throw new ProjectNotFoundError("Media item not found");
  }

  // Check if project is published: target primary image must have non-empty alt text
  const { data: project } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .maybeSingle();

  if (project?.status === "published" && (!media.alt_text || !media.alt_text.trim())) {
    throw new ProjectConflictError(
      "Cannot set an image without alt text as primary on a published project.",
    );
  }

  // 1. If available, call atomic database RPC
  if (typeof supabase.rpc === "function") {
    const { data: rpcData, error: rpcError } = await supabase.rpc("set_primary_project_media", {
      p_project_id: projectId,
      p_media_id: mediaId,
    });

    if (!rpcError && rpcData) {
      return toProjectMediaResponse(rpcData as ProjectMediaRow, dependencies);
    }

    if (rpcError && rpcError.code !== "42883") {
      if (rpcError.message?.toLowerCase().includes("alt text") || rpcError.code === "check_violation") {
        throw new ProjectConflictError(rpcError.message);
      }
      if (rpcError.code === "P0002" || rpcError.message?.toLowerCase().includes("not found")) {
        throw new ProjectNotFoundError("Media item not found");
      }
      throw new Error(`Failed to set primary media: ${rpcError.message}`);
    }
  }

  // 2. Direct sequence: clear existing primary first, then set new primary
  await supabase
    .from("project_media")
    .update({ is_primary: false })
    .eq("project_id", projectId)
    .eq("is_primary", true);

  const { data: updated, error } = await supabase
    .from("project_media")
    .update({ is_primary: true })
    .eq("id", mediaId)
    .select()
    .single();

  if (error || !updated) {
    throw new Error("Failed to set primary media.");
  }

  return toProjectMediaResponse(updated as ProjectMediaRow, dependencies);
}

/**
 * Reorders project media by updating sort_order for each ID in the array.
 */
export async function reorderProjectMedia(
  projectId: string,
  mediaIds: string[],
  dependencies: ProjectServiceDependencies = {},
): Promise<void> {
  const supabase = dependencies.client ?? getSupabaseClient();

  for (let i = 0; i < mediaIds.length; i++) {
    await supabase
      .from("project_media")
      .update({ sort_order: i })
      .eq("id", mediaIds[i])
      .eq("project_id", projectId);
  }
}

/**
 * Retrieves all media items for a project, ordered by sort_order.
 */
export async function listProjectMedia(
  projectId: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<ProjectMediaResponse[]> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data, error } = await supabase
    .from("project_media")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Database query failed.");
  }

  return (data || []).map((row) => toProjectMediaResponse(row as ProjectMediaRow, dependencies));
}
