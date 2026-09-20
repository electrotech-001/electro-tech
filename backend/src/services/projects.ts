import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.js";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../validation/projects.js";

export type ProjectDatabaseRow = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  size: string | null;
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
};

export type PublicProjectResponse = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  size: string | null;
  description: string | null;
  equipment: string[];
  primaryImageUrl: string | null;
  secondaryImageUrl: string | null;
  primaryAlt: string | null;
  secondaryAlt: string | null;
  primaryImagePosition: string;
  secondaryImagePosition: string;
  publishedAt: string | null;
};

export type AdminProjectResponse = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  size: string | null;
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
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    location: row.location,
    size: row.size,
    description: row.description,
    equipment: row.equipment,
    primaryImageUrl: resolveProjectImageUrl(row.primary_image_path, clientOrUrl),
    secondaryImageUrl: resolveProjectImageUrl(row.secondary_image_path, clientOrUrl),
    primaryAlt: row.primary_alt,
    secondaryAlt: row.secondary_alt,
    primaryImagePosition: row.primary_image_position,
    secondaryImagePosition: row.secondary_image_position,
    publishedAt: row.published_at,
  };
}

/**
 * Maps a database row to a comprehensive admin project response.
 */
export function toAdminProject(
  row: ProjectDatabaseRow,
  clientOrUrl?: SupabaseClient | string,
): AdminProjectResponse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    location: row.location,
    size: row.size,
    description: row.description,
    equipment: row.equipment,
    primaryImagePath: row.primary_image_path,
    secondaryImagePath: row.secondary_image_path,
    primaryImageUrl: resolveProjectImageUrl(row.primary_image_path, clientOrUrl),
    secondaryImageUrl: resolveProjectImageUrl(row.secondary_image_path, clientOrUrl),
    primaryAlt: row.primary_alt,
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
    .select("*")
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
    .select("*")
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
  let query = supabase.from("projects").select("*");

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
    .select("*")
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

  const insertPayload = {
    title: input.title.trim(),
    slug,
    location: input.location ? input.location.trim() : null,
    size: input.size ? input.size.trim() : null,
    description: input.description ? input.description.trim() : null,
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
    .select()
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
  if (input.location !== undefined) {
    updatePayload.location = input.location ? input.location.trim() : null;
  }
  if (input.size !== undefined) {
    updatePayload.size = input.size ? input.size.trim() : null;
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
    .select()
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
 * Validates that all required publication fields are present.
 */
export async function publishProject(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse> {
  const supabase = dependencies.client ?? getSupabaseClient();

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

  if (current.status === "published") {
    return toAdminProject(current as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
  }

  if (current.status === "archived") {
    throw new ProjectConflictError("Archived project must be restored to draft before publishing.");
  }

  // Validate required publication fields
  const missingFields: string[] = [];
  if (!current.title || !current.title.trim()) missingFields.push("title");
  if (!current.location || !current.location.trim()) missingFields.push("location");
  if (!current.size || !current.size.trim()) missingFields.push("size");
  if (!current.description || !current.description.trim()) missingFields.push("description");
  if (!current.primary_image_path || !current.primary_image_path.trim()) missingFields.push("primaryImagePath");
  if (!current.secondary_image_path || !current.secondary_image_path.trim()) missingFields.push("secondaryImagePath");
  if (!current.primary_alt || !current.primary_alt.trim()) missingFields.push("primaryAlt");
  if (!current.secondary_alt || !current.secondary_alt.trim()) missingFields.push("secondaryAlt");

  if (missingFields.length > 0) {
    throw new ProjectValidationError("Cannot publish project: missing required publication fields", missingFields);
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "published" })
    .eq("id", id)
    .select()
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
    .select("*")
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
    .select()
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
    .select("*")
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
    .select()
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
    .select("*")
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
    .select()
    .single();

  if (error) {
    throw new Error("Database query failed.");
  }

  return toAdminProject(data as ProjectDatabaseRow, dependencies.publicUrlBase ?? dependencies.client);
}

/**
 * Atomically assigns exactly 3 published projects to the homepage using the
 * replace_homepage_projects PostgreSQL function.
 */
export async function replaceHomepageProjects(
  projectIds: [string, string, string],
  dependencies: ProjectServiceDependencies = {},
): Promise<AdminProjectResponse[]> {
  const supabase = dependencies.client ?? getSupabaseClient();

  const { error } = await supabase.rpc("replace_homepage_projects", {
    p_project_ids: projectIds,
  });

  if (error) {
    throw new ProjectConflictError("All 3 homepage projects must exist and be published.");
  }

  const { data, error: fetchError } = await supabase
    .from("projects")
    .select("*")
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
 * Permanently deletes a project only if it is in 'draft' or 'archived' status
 * AND contains no stored image paths (Phase 3D safety requirement).
 */
export async function deleteProjectWithoutAssets(
  id: string,
  dependencies: ProjectServiceDependencies = {},
): Promise<void> {
  const supabase = dependencies.client ?? getSupabaseClient();

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

  if (current.status === "published") {
    throw new ProjectConflictError("Cannot delete a published project. Unpublish or archive it first.");
  }

  if (current.primary_image_path || current.secondary_image_path) {
    throw new ProjectConflictError(
      "Cannot delete project with existing assets. Project image assets must be removed before permanent deletion.",
    );
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    throw new Error("Database query failed.");
  }
}
