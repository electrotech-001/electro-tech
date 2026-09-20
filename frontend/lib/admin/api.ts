import { apiUrl } from "../api-origin";
import { supabase } from "./supabase";
import type {
  AdminProject,
  CreateProjectPayload,
  ProjectImageSlot,
  ProjectMediaItem,
  ProjectStatusFilter,
  UpdateProjectPayload,
} from "../../types/admin/project";

export class ApiError extends Error {
  status: number;
  data: unknown;
  missingFields?: string[];

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as Record<string, unknown>).missingFields)
    ) {
      this.missingFields = (data as Record<string, unknown>).missingFields as string[];
    }
  }
}

export type AdminMeResponse = {
  user: {
    userId: string;
    email: string;
    displayName: string;
  };
};

/**
 * Executes an authenticated request to the Express backend API.
 * Automatically attaches the current Supabase session JWT in the Authorization header.
 */
export async function adminApiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    !headers.has("Content-Type") &&
    options.body &&
    typeof options.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  const url = apiUrl(path);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (typeof obj.message === "string") {
        message = obj.message;
      } else if (typeof obj.error === "string") {
        message = obj.error;
      }
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

/**
 * Fetches the currently authenticated administrator profile from the backend.
 */
export async function fetchAdminMe(): Promise<AdminMeResponse> {
  return adminApiFetch<AdminMeResponse>("/api/admin/me");
}

/**
 * Lists all projects with optional status filter.
 */
export async function fetchAdminProjects(
  status: ProjectStatusFilter = "all",
): Promise<AdminProject[]> {
  const query = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return adminApiFetch<AdminProject[]>(`/api/admin/projects${query}`);
}

/**
 * Retrieves a single project by ID for editing/previewing.
 */
export async function fetchAdminProjectById(id: string): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}`);
}

/**
 * Creates a new project in 'draft' status.
 */
export async function createAdminProject(
  data: CreateProjectPayload,
): Promise<AdminProject> {
  return adminApiFetch<AdminProject>("/api/admin/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Partially updates project metadata.
 */
export async function updateAdminProject(
  id: string,
  data: UpdateProjectPayload,
): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Transitions a project from draft to published.
 */
export async function publishAdminProject(id: string): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}/publish`, {
    method: "POST",
  });
}

/**
 * Transitions a project from published to draft.
 */
export async function unpublishAdminProject(id: string): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}/unpublish`, {
    method: "POST",
  });
}

/**
 * Transitions a project to archived.
 */
export async function archiveAdminProject(id: string): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}/archive`, {
    method: "POST",
  });
}

/**
 * Restores an archived project back to draft.
 */
export async function restoreAdminProject(id: string): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}/restore`, {
    method: "POST",
  });
}

/**
 * Permanently deletes a project (draft or archived only).
 */
export async function deleteAdminProject(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  return adminApiFetch<{ ok: boolean; message: string }>(
    `/api/admin/projects/${id}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Uploads or replaces an image in the specified slot ('primary' or 'secondary').
 */
export async function uploadAdminProjectImage(
  id: string,
  slot: ProjectImageSlot,
  file: File,
): Promise<AdminProject> {
  const formData = new FormData();
  formData.append("slot", slot);
  formData.append("file", file);

  return adminApiFetch<AdminProject>(`/api/admin/projects/${id}/images`, {
    method: "POST",
    body: formData,
  });
}

/**
 * Deletes an image from the specified slot ('primary' or 'secondary').
 */
export async function deleteAdminProjectImage(
  id: string,
  slot: ProjectImageSlot,
): Promise<AdminProject> {
  return adminApiFetch<AdminProject>(
    `/api/admin/projects/${id}/images/${slot}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Uploads an image (JPEG, PNG, WebP) for a project.
 */
export async function uploadAdminProjectMedia(
  projectId: string,
  file: File,
  options: {
    altText?: string | null;
    caption?: string | null;
    isPrimary?: boolean;
  } = {},
): Promise<ProjectMediaItem> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.altText !== undefined && options.altText !== null) {
    formData.append("altText", options.altText);
  }
  if (options.caption !== undefined && options.caption !== null) {
    formData.append("caption", options.caption);
  }
  if (options.isPrimary !== undefined) {
    formData.append("isPrimary", String(options.isPrimary));
  }

  return adminApiFetch<ProjectMediaItem>(`/api/admin/projects/${projectId}/media`, {
    method: "POST",
    body: formData,
  });
}

/**
 * Updates metadata (altText, caption) for a media item.
 */
export async function updateAdminProjectMedia(
  projectId: string,
  mediaId: string,
  data: {
    altText?: string | null;
    caption?: string | null;
  },
): Promise<ProjectMediaItem> {
  return adminApiFetch<ProjectMediaItem>(
    `/api/admin/projects/${projectId}/media/${mediaId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Deletes a media item from project and storage.
 */
export async function deleteAdminProjectMedia(
  projectId: string,
  mediaId: string,
): Promise<{ ok: boolean; message: string }> {
  return adminApiFetch<{ ok: boolean; message: string }>(
    `/api/admin/projects/${projectId}/media/${mediaId}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Reorders media items by sort_order.
 */
export async function reorderAdminProjectMedia(
  projectId: string,
  mediaIds: string[],
): Promise<{ ok: boolean; message: string }> {
  return adminApiFetch<{ ok: boolean; message: string }>(
    `/api/admin/projects/${projectId}/media/order`,
    {
      method: "PUT",
      body: JSON.stringify({ mediaIds }),
    },
  );
}

/**
 * Sets a media item as the primary project image.
 */
export async function setAdminProjectMediaPrimary(
  projectId: string,
  mediaId: string,
): Promise<ProjectMediaItem> {
  return adminApiFetch<ProjectMediaItem>(
    `/api/admin/projects/${projectId}/media/${mediaId}/primary`,
    {
      method: "POST",
    },
  );
}

/**
 * Updates homepage featured projects (0 to 3 project IDs).
 */
export async function updateAdminHomepageProjects(
  projectIds: string[],
): Promise<AdminProject[]> {
  return adminApiFetch<AdminProject[]>("/api/admin/projects/homepage", {
    method: "PUT",
    body: JSON.stringify({ projectIds }),
  });
}
