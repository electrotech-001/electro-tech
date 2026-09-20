import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../validation/projects.js";
import {
  toProjectMediaResponse,
  type ProjectMediaResponse,
  type ProjectMediaRow,
} from "./project-media.js";

export type ProjectDatabaseRow = {
  id: string;
  slug: string;
  title: string;
  client_organization?: string | null;
  location: string | null;
  size: string | null;
  category?: string | null;
  completion_year?: number | null;
  short_summary?: string | null;
  full_story?: string | null;
  description: string | null;
  equipment: string[];
  primary_image_path: string | null;
  secondary_image_path: string | null;
  primary_alt: string | null;
  secondary_alt: string | null;
  primary_image_position: string;
  secondary_image_position: string;
  status: "draft" | "published" | "archived";
  is_featured_homepage: boolean;
  homepage_order: number | null;
  project_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  project_media?: ProjectMediaRow[];
};

export type PublicProjectImage = {
  id: string;
  url: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type PublicProjectResponse = {
  id: string;
  slug: string;
  title: string;
  clientOrganization: string | null;
  location: string | null;
  size: string | null;
  category: string | null;
  completionYear: number | null;
  shortSummary: string | null;
  fullStory: string | null;
  description: string | null;
  equipment: string[];
  primaryImageUrl: string | null;
  secondaryImageUrl: string | null;
  primaryAlt: string | null;
  secondaryAlt: string | null;
  primaryImagePosition: string;
  secondaryImagePosition: string;
  publishedAt: string | null;
  images: PublicProjectImage[];
  mainImage: PublicProjectImage | null;
  media: ProjectMediaResponse[];
  mainMedia: ProjectMediaResponse | null;
};

export type AdminProjectResponse = {
  id: string;
  slug: string;
  title: string;
  clientOrganization: string | null;
  location: string | null;
  size: string | null;
  category: string | null;
  completionYear: number | null;
  shortSummary: string | null;
  fullStory: string | null;
  description: string | null;
  equipment: string[];
  primaryImagePath: string | null;
  secondaryImagePath: string | null;
  primaryImageUrl: string | null;
  secondaryImageUrl: string | null;
  primaryAlt: string | null;
  secondaryAlt: string | null;
  primaryImagePosition: string;
  secondaryImagePosition: string;
  status: "draft" | "published" | "archived";
  isFeaturedHomepage: boolean;
  homepageOrder: number | null;
  projectOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  media: ProjectMediaResponse[];
  mainMedia: ProjectMediaResponse | null;
  images: ProjectMediaResponse[];
  mainImage: ProjectMediaResponse | null;
};

export class ProjectNotFoundError extends Error {
  constructor(message = "Project not found") {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectConflictError";
  }
}

export class ProjectValidationError extends Error {
  public missingFields: string[];

  constructor(message: string, missingFields: string[] = []) {
    super(message);
    this.name = "ProjectValidationError";
    this.missingFields = missingFields;
  }
}

/**
 * Resolves a public URL for a Storage object path in the 'project-images' bucket.
 * Returns null if the path is null, undefined, or empty.
 */
export function resolveProjectImageUrl(
  path: string | null | undefined,
  clientOrUrl?: SupabaseClient | string,
): string | null {
  if (!path || !path.trim()) {
    return null;
  }
  const cleanPath = path.trim().replace(/^\/+/, "");
  if (typeof clientOrUrl === "string") {
    const base = clientOrUrl.replace(/\/+$/, "");
    return `${base}/storage/v1/object/public/project-images/${cleanPath}`;
  }
  if (clientOrUrl) {
    return clientOrUrl.storage.from("project-images").getPublicUrl(cleanPath).data.publicUrl;
  }
  const supabase = getSupabaseClient();
  return supabase.storage.from("project-images").getPublicUrl(cleanPath).data.publicUrl;
}

export const resolvePublicImageUrl = resolveProjectImageUrl;

/**
 * Generates a URL-friendly lowercase kebab-case slug from a title.
 */
export function generateSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "project";
}

/**
 * Maps a database row to a public project response, excluding internal/admin fields.
 */
export function toPublicProject(
  row: ProjectDatabaseRow,
  clientOrUrl?: SupabaseClient | string,
): PublicProjectResponse {
  const mediaList = (row.project_media || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => toProjectMediaResponse(m, clientOrUrl));

  const primaryMedia =
    mediaList.find((m) => m.isPrimary) ||
    mediaList[0] ||
    null;

  const publicImages: PublicProjectImage[] = mediaList.map((m) => ({
    id: m.id,
    url: m.url,
    altText: m.altText,
    caption: m.caption,
    isPrimary: m.isPrimary,
    sortOrder: m.sortOrder,
  }));

  const publicMainImage: PublicProjectImage | null = primaryMedia
    ? {
        id: primaryMedia.id,
        url: primaryMedia.url,
        altText: primaryMedia.altText,
        caption: primaryMedia.caption,
        isPrimary: primaryMedia.isPrimary,
        sortOrder: primaryMedia.sortOrder,
      }
    : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    clientOrganization: row.client_organization ?? null,
    location: row.location,
    size: row.size,
    category: row.category ?? null,
    completionYear: row.completion_year ?? null,
    shortSummary: row.short_summary ?? (row.description ? row.description.slice(0, 400) : null),
    fullStory: row.full_story ?? null,
    description: row.description,
    equipment: row.equipment,
    primaryImageUrl: primaryMedia ? primaryMedia.url : resolveProjectImageUrl(row.primary_image_path, clientOrUrl),
    secondaryImageUrl: resolveProjectImageUrl(row.secondary_image_path, clientOrUrl),
    primaryAlt: primaryMedia?.altText || row.primary_alt,
    secondaryAlt: row.secondary_alt,
    primaryImagePosition: row.primary_image_position,
    secondaryImagePosition: row.secondary_image_position,
    publishedAt: row.published_at,
    media: mediaList,
    mainMedia: primaryMedia,
    images: publicImages,
    mainImage: publicMainImage,
  };
}

/**
 * Maps a database row to a comprehensive admin project response.
 */
export function toAdminProject(
  row: ProjectDatabaseRow,
  clientOrUrl?: SupabaseClient | string,
): AdminProjectResponse {
  const mediaList = (row.project_media || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => toProjectMediaResponse(m, clientOrUrl));

  const primaryMedia =
    mediaList.find((m) => m.isPrimary) ||
    mediaList[0] ||
    null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    clientOrganization: row.client_organization ?? null,
    location: row.location,
    size: row.size,
    category: row.category ?? null,
    completionYear: row.completion_year ?? null,
    shortSummary: row.short_summary ?? (row.description ? row.description.slice(0, 400) : null),
    fullStory: row.full_story ?? null,
    description: row.description,
    equipment: row.equipment,
    primaryImagePath: row.primary_image_path,
    secondaryImagePath: row.secondary_image_path,
    primaryImageUrl: primaryMedia ? primaryMedia.url : resolveProjectImageUrl(row.primary_image_path, clientOrUrl),
    secondaryImageUrl: resolveProjectImageUrl(row.secondary_image_path, clientOrUrl),
    primaryAlt: primaryMedia?.altText || row.primary_alt,
    secondaryAlt: row.secondary_alt,
    primaryImagePosition: row.primary_image_position,
    secondaryImagePosition: row.secondary_image_position,
    status: row.status,
    isFeaturedHomepage: row.is_featured_homepage,
    homepageOrder: row.homepage_order,
    projectOrder: row.project_order,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: mediaList,
    mainMedia: primaryMedia,
    images: mediaList,
    mainImage: primaryMedia,
  };
}

export type ProjectServiceDependencies = {
  client?: SupabaseClient;
  publicUrlBase?: string;
};

/**
 * List published projects for public consumption.
 * When featured is true, returns at most 3 homepage projects ordered by homepage_order.
 */
export async function listPublishedProjects(
  options: { featured?: boolean } = {},
  dependencies: ProjectServiceDependencies = {},
): Promise<PublicProjectResponse[]> {
  const supabase = dependencies.client ?? getSupabaseClient();
  let query = supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("status", "published");

  if (options.featured) {
    query = query
      .eq("is_featured_homepage", true)
      .order("homepage_order", { ascending: true })
      .limit(3);
  } else {
    query = query
      .order("project_order", { ascending: true })
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Database query failed.");
  }

  return (data as ProjectDatabaseRow[]).map((row) =>
    toPublicProject(row, dependencies.publicUrlBase ?? dependencies.client),
  );
}

/**
 * Retrieve a single published project by its slug for public consumption.
 * Returns null if the project does not exist or is not published.
 */
export async function getPublishedProjectBySlug(
  slug: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<PublicProjectResponse | null> {
  const supabase = dependencies.client ?? getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error("Database query failed.");
  }

  if (!data) {
    return null;
  }

  return toPublicProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * List all projects for the admin dashboard, optionally filtered by status.
 */
export async function listAdminProjects(
  options: { status?: "draft" | "published" | "archived" | "all" } = {},
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse[]> {
  const supabase = dependencies.client ?? getSupabaseClient();
  let query = supabase.from("projects").select("*, project_media(*)");

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  query = query
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    throw new Error("Database query failed.");
  }

  return (data as ProjectDatabaseRow[]).map((row) =>
    toAdminProject(row, dependencies.publicUrlBase ?? dependencies.client),
  );
}

/**
 * Retrieve a project by its UUID for admin management.
 */
export async function getAdminProjectById(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse | null> {
  const supabase = dependencies.client ?? getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Database query failed.");
  }

  if (!data) {
    return null;
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Creates a new project in 'draft' status.
 */
export async function createProject(
  input: CreateProjectInput,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();
  const slug = input.slug ? input.slug.trim().toLowerCase() : generateSlug(input.title);

  // Check for slug collision
  const { data: existing, error: checkError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (checkError) {
    throw new Error("Database query failed.");
  }

  if (existing) {
    throw new ProjectConflictError("Project slug already exists");
  }

  const shortSummary = input.shortSummary ? input.shortSummary.trim() : null;
  const description = input.description ? input.description.trim() : shortSummary;

  const insertPayload = {
    title: input.title.trim(),
    slug,
    client_organization: input.clientOrganization ? input.clientOrganization.trim() : null,
    location: input.location ? input.location.trim() : null,
    size: input.size ? input.size.trim() : null,
    category: input.category || null,
    completion_year: input.completionYear ?? null,
    short_summary: shortSummary,
    full_story: input.fullStory ? input.fullStory.trim() : null,
    description,
    equipment: input.equipment ?? [],
    primary_alt: input.primaryAlt ? input.primaryAlt.trim() : null,
    secondary_alt: input.secondaryAlt ? input.secondaryAlt.trim() : null,
    primary_image_position: input.primaryImagePosition ?? "center",
    secondary_image_position: input.secondaryImagePosition ?? "center",
    project_order: input.projectOrder ?? 0,
    status: "draft" as const,
  };

  const { data, error } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select("*, project_media(*)")
    .single();

  if (error) {
    if (error.code === "23505" || error.message?.toLowerCase().includes("unique")) {
      throw new ProjectConflictError("Project slug already exists");
    }
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Updates editable metadata of an existing project.
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  // Verify project exists
  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  const updatePayload: Record<string, unknown> = {};

  if (input.title !== undefined) {
    updatePayload.title = input.title.trim();
  }
  if (input.slug !== undefined) {
    const newSlug = input.slug.trim().toLowerCase();
    if (newSlug !== current.slug) {
      const { data: slugCheck, error: slugCheckError } = await supabase
        .from("projects")
        .select("id")
        .eq("slug", newSlug)
        .maybeSingle();

      if (slugCheckError) {
        throw new Error("Database query failed.");
      }
      if (slugCheck) {
        throw new ProjectConflictError("Project slug already exists");
      }
      updatePayload.slug = newSlug;
    }
  }
  if (input.clientOrganization !== undefined) {
    updatePayload.client_organization = input.clientOrganization ? input.clientOrganization.trim() : null;
  }
  if (input.location !== undefined) {
    updatePayload.location = input.location ? input.location.trim() : null;
  }
  if (input.size !== undefined) {
    updatePayload.size = input.size ? input.size.trim() : null;
  }
  if (input.category !== undefined) {
    updatePayload.category = input.category || null;
  }
  if (input.completionYear !== undefined) {
    updatePayload.completion_year = input.completionYear ?? null;
  }
  if (input.shortSummary !== undefined) {
    updatePayload.short_summary = input.shortSummary ? input.shortSummary.trim() : null;
    if (input.description === undefined) {
      updatePayload.description = updatePayload.short_summary;
    }
  }
  if (input.fullStory !== undefined) {
    updatePayload.full_story = input.fullStory ? input.fullStory.trim() : null;
  }
  if (input.description !== undefined) {
    updatePayload.description = input.description ? input.description.trim() : null;
  }
  if (input.equipment !== undefined) {
    updatePayload.equipment = input.equipment;
  }
  if (input.primaryAlt !== undefined) {
    updatePayload.primary_alt = input.primaryAlt ? input.primaryAlt.trim() : null;
  }
  if (input.secondaryAlt !== undefined) {
    updatePayload.secondary_alt = input.secondaryAlt ? input.secondaryAlt.trim() : null;
  }
  if (input.primaryImagePosition !== undefined) {
    updatePayload.primary_image_position = input.primaryImagePosition;
  }
  if (input.secondaryImagePosition !== undefined) {
    updatePayload.secondary_image_position = input.secondaryImagePosition;
  }
  if (input.projectOrder !== undefined) {
    updatePayload.project_order = input.projectOrder;
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", id)
    .select("*, project_media(*)")
    .single();

  if (error) {
    if (error.code === "23505" || error.message?.toLowerCase().includes("unique")) {
      throw new ProjectConflictError("Project slug already exists");
    }
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Transitions a project from 'draft' to 'published'.
 * Validates that all required publication fields and media requirements are present.
 */
export async function publishProject(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (current.status === "published") {
    return toAdminProject(current as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
  }

  if (current.status === "archived") {
    throw new ProjectConflictError("Archived project must be restored to draft before publishing.");
  }

  // Validate required publication fields
  const missingFields: string[] = [];
  if (!current.title || !current.title.trim()) missingFields.push("title");
  if (!current.slug || !current.slug.trim()) missingFields.push("slug");
  if (!current.location || !current.location.trim()) missingFields.push("location");
  if (!current.size || !current.size.trim()) missingFields.push("size");
  if (!current.client_organization || !current.client_organization.trim()) missingFields.push("clientOrganization");
  if (!current.category || !current.category.trim()) missingFields.push("category");
  if (!current.completion_year) missingFields.push("completionYear");

  const summary = current.short_summary || current.description;
  if (!summary || summary.trim().length < 10) {
    missingFields.push("shortSummary");
  }

  // Validate media requirements: at least 1 image is required, exactly 1 primary, non-empty alt on primary
  const mediaList = current.project_media || [];
  const hasLegacyImage = Boolean(current.primary_image_path && current.primary_image_path.trim());

  if (mediaList.length === 0 && !hasLegacyImage) {
    missingFields.push("primaryImagePath");
    missingFields.push("image");
  } else if (mediaList.length > 0) {
    const primaryImage = mediaList.find((m: ProjectMediaRow) => m.is_primary);
    if (!primaryImage) {
      missingFields.push("primaryImage");
    } else if (!primaryImage.alt_text || !primaryImage.alt_text.trim()) {
      missingFields.push("primaryAlt");
    }
  } else if (hasLegacyImage && (!current.primary_alt || !current.primary_alt.trim())) {
    missingFields.push("primaryAlt");
  }

  if (missingFields.length > 0) {
    throw new ProjectValidationError("Cannot publish project: missing required publication fields", missingFields);
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, project_media(*)")
    .single();

  if (error) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Transitions a project from 'published' to 'draft'.
 * Automatically clears homepage featured assignment via database invariants.
 */
export async function unpublishProject(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (current.status === "draft") {
    return toAdminProject(current as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
  }

  if (current.status === "archived") {
    throw new ProjectConflictError("Archived project cannot be unpublished directly.");
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "draft" })
    .eq("id", id)
    .select("*, project_media(*)")
    .single();

  if (error) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Transitions a project to 'archived'.
 * Automatically clears homepage featured assignment via database invariants.
 */
export async function archiveProject(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (current.status === "archived") {
    return toAdminProject(current as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", id)
    .select("*, project_media(*)")
    .single();

  if (error) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Transitions a project from 'archived' to 'draft'.
 */
export async function restoreProject(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (current.status === "draft") {
    return toAdminProject(current as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
  }

  if (current.status === "published") {
    throw new ProjectConflictError("Only archived projects can be restored to draft.");
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "draft" })
    .eq("id", id)
    .select("*, project_media(*)")
    .single();

  if (error) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Atomically assigns 0 to 3 published projects to the homepage using the
 * replace_homepage_projects PostgreSQL function.
 */
export async function replaceHomepageProjects(
  projectIds: string[],
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse[]> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { error } = await supabase.rpc("replace_homepage_projects", {
    p_project_ids: projectIds,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("not exist")) {
      throw new ProjectConflictError("One or more selected projects do not exist.");
    }
    if (msg.includes("published")) {
      throw new ProjectConflictError("All homepage projects must be published.");
    }
    if (msg.includes("distinct")) {
      throw new ProjectConflictError("All homepage project IDs must be distinct.");
    }
    if (msg.includes("0 to 3") || msg.includes("max 3")) {
      throw new ProjectConflictError("At most 3 projects can be featured on the homepage.");
    }
    throw new ProjectConflictError("All homepage projects must exist and be published (max 3).");
  }

  const { data, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("is_featured_homepage", true)
    .order("homepage_order", { ascending: true });

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  return (data as ProjectDatabaseRow[]).map((row) =>
    toAdminProject(row, dependencies.publicUrlBase ?? dependencies.client),
  );
}

/**
 * Permanently deletes a project only if it is in 'draft' or 'archived' status.
 * Synchronously cleans up all associated Storage assets (from project_media and legacy columns).
 * If Storage cleanup fails, the database record is retained to prevent orphaned files.
 */
export async function deleteProjectWithStorageCleanup(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<void> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("*, project_media(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error("Database query failed.");
  }

  if (!current) {
    throw new ProjectNotFoundError("Project not found");
  }

  if (current.status === "published") {
    throw new ProjectConflictError("Cannot delete a published project. Unpublish or archive it first.");
  }

  // 1. Gather all Storage object paths from project_media and legacy fields
  const mediaPaths = (current.project_media || []).map((m: ProjectMediaRow) => m.object_path).filter(Boolean);
  const legacyPaths = [current.primary_image_path, current.secondary_image_path].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  const allPaths = Array.from(new Set([...mediaPaths, ...legacyPaths]));

  if (allPaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("project-images")
      .remove(allPaths);

    if (storageError) {
      throw new Error("Failed to delete project assets from storage.");
    }
  }

  // 2. Delete database row only after Storage cleanup succeeds
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    throw new Error("Database query failed.");
  }
}

export const deleteProjectWithoutAssets = deleteProjectWithStorageCleanup;
