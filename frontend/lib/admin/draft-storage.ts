export type ProjectDraftData = {
  title?: string;
  slug?: string;
  autoSlug?: boolean;
  clientOrganization?: string | null;
  location?: string | null;
  size?: string | null;
  category?: string | null;
  completionYear?: number | null;
  shortSummary?: string | null;
  fullStory?: string | null;
  description?: string | null;
  equipment?: string[];
  primaryAlt?: string | null;
  secondaryAlt?: string | null;
  primaryImagePosition?: string;
  secondaryImagePosition?: string;
  projectOrder?: number;
};

export const NEW_PROJECT_DRAFT_KEY = "electrotech-admin:new-project-draft";

export const getEditProjectDraftKey = (projectId: string): string =>
  `electrotech-admin:project-draft:${projectId}`;

/**
 * Saves project draft metadata to sessionStorage.
 * Never stores authentication tokens, passwords, or File binary objects.
 */
export function saveProjectDraft(key: string, data: ProjectDraftData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Safely ignore storage quota or disabled storage in restricted environments
  }
}

/**
 * Retrieves project draft metadata from sessionStorage.
 */
export function getProjectDraft(key: string): ProjectDraftData | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectDraftData;
  } catch {
    return null;
  }
}

/**
 * Clears project draft from sessionStorage upon successful save or discard.
 */
export function clearProjectDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Safely ignore errors
  }
}
