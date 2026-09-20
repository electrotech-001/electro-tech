export type ProjectStatus = "draft" | "published" | "archived";
export type ProjectImageSlot = "primary" | "secondary";
export type ProjectStatusFilter = "all" | "draft" | "published" | "archived";

export const PROJECT_CATEGORIES = [
  "Complete Solar System Installation",
  "Solar Structures",
  "Security Systems (CCTV)",
  "Electrical Works",
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export type ProjectImage = {
  id: string;
  url: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type ProjectImageItem = {
  id: string;
  projectId: string;
  objectPath?: string;
  url: string;
  publicUrl?: string;
  mimeType: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMediaItem = ProjectImageItem;

export type AdminProject = {
  id: string;
  slug: string;
  title: string;
  clientOrganization: string | null;
  location: string | null;
  size: string | null;
  category: ProjectCategory | null;
  completionYear: number | null;
  shortSummary: string | null;
  fullStory: string | null;
  description: string | null;
  equipment?: string[];
  primaryImagePath: string | null;
  secondaryImagePath: string | null;
  primaryImageUrl: string | null;
  secondaryImageUrl: string | null;
  primaryAlt: string | null;
  secondaryAlt: string | null;
  primaryImagePosition: string;
  secondaryImagePosition: string;
  status: ProjectStatus;
  isFeaturedHomepage: boolean;
  homepageOrder: number | null;
  projectOrder?: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: ProjectImageItem[];
  mainImage: ProjectImageItem | null;
  media: ProjectImageItem[];
  mainMedia: ProjectImageItem | null;
};

export type CreateProjectPayload = {
  title: string;
  slug?: string;
  clientOrganization?: string | null;
  location?: string | null;
  size?: string | null;
  category?: ProjectCategory | null;
  completionYear?: number | null;
  shortSummary?: string | null;
  fullStory?: string | null;
  description?: string | null;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;
