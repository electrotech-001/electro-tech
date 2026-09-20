export type PublicProjectImage = {
  id: string;
  url: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type PublicProject = {
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
  status: "published";
  isFeaturedHomepage: boolean;
  homepageOrder: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: PublicProjectImage[];
  mainImage: PublicProjectImage | null;
};
