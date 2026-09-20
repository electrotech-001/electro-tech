import { z } from "zod";

export const PROJECT_CATEGORIES = [
  "Complete Solar System Installation",
  "Solar Structures",
  "Security Systems (CCTV)",
  "Electrical Works",
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

const VALID_POSITION_KEYWORDS = new Set(["left", "center", "right", "top", "bottom"]);
const PERCENTAGE_REGEX = /^(?:100|[1-9]?\d)%$/;

function isValidPositionToken(token: string): boolean {
  return VALID_POSITION_KEYWORDS.has(token.toLowerCase()) || PERCENTAGE_REGEX.test(token);
}

export const imagePositionSchema = z
  .string()
  .trim()
  .max(50, "Image position cannot exceed 50 characters")
  .refine(
    (value) => {
      if (!value) return false;
      // Reject dangerous CSS constructs immediately
      if (/[;{}()<>]|calc|var|url/i.test(value)) {
        return false;
      }
      const tokens = value.split(/\s+/);
      if (tokens.length < 1 || tokens.length > 2) {
        return false;
      }
      return tokens.every((t) => isValidPositionToken(t));
    },
    {
      message:
        "Invalid image position. Must be 1 or 2 tokens containing standard keywords (left, center, right, top, bottom) or percentages (0%-100%).",
    },
  );

export const projectIdSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID.",
  );

export const projectSlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(100, "Slug cannot exceed 100 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase alphanumeric characters and hyphens, and cannot start or end with a hyphen.",
  );

export const equipmentSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Equipment item cannot be empty")
      .max(200, "Equipment item cannot exceed 200 characters"),
  )
  .max(20, "Equipment list cannot exceed 20 items");

export const createProjectSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(150, "Title cannot exceed 150 characters"),
    slug: projectSlugSchema.optional(),
    clientOrganization: z
      .string()
      .trim()
      .max(150, "Client / Organization cannot exceed 150 characters")
      .nullable()
      .optional(),
    location: z
      .string()
      .trim()
      .max(150, "Location cannot exceed 150 characters")
      .nullable()
      .optional(),
    size: z
      .string()
      .trim()
      .max(100, "Capacity / Project size cannot exceed 100 characters")
      .nullable()
      .optional(),
    category: z.enum(PROJECT_CATEGORIES, {
      message:
        "Invalid category. Allowed values: 'Complete Solar System Installation', 'Solar Structures', 'Security Systems (CCTV)', 'Electrical Works'.",
    }).nullable().optional(),
    completionYear: z
      .number()
      .int("Completion year must be an integer")
      .min(1900, "Completion year must be 1900 or later")
      .max(2100, "Completion year cannot exceed 2100")
      .nullable()
      .optional(),
    shortSummary: z
      .string()
      .trim()
      .min(10, "Short summary must be at least 10 characters")
      .max(400, "Short summary cannot exceed 400 characters")
      .nullable()
      .optional(),
    fullStory: z.string().trim().nullable().optional(),
    // Legacy fields supported for backward compatibility
    description: z.string().trim().nullable().optional(),
    equipment: equipmentSchema.optional(),
    primaryAlt: z.string().trim().max(255, "Primary alt text cannot exceed 255 characters").nullable().optional(),
    secondaryAlt: z.string().trim().max(255, "Secondary alt text cannot exceed 255 characters").nullable().optional(),
    primaryImagePosition: imagePositionSchema.optional(),
    secondaryImagePosition: imagePositionSchema.optional(),
    projectOrder: z.number().int("Project order must be an integer").min(0, "Project order must be non-negative").optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .max(150, "Title cannot exceed 150 characters")
      .optional(),
    slug: projectSlugSchema.optional(),
    clientOrganization: z
      .string()
      .trim()
      .max(150, "Client / Organization cannot exceed 150 characters")
      .nullable()
      .optional(),
    location: z
      .string()
      .trim()
      .max(150, "Location cannot exceed 150 characters")
      .nullable()
      .optional(),
    size: z
      .string()
      .trim()
      .max(100, "Capacity / Project size cannot exceed 100 characters")
      .nullable()
      .optional(),
    category: z.enum(PROJECT_CATEGORIES, {
      message:
        "Invalid category. Allowed values: 'Complete Solar System Installation', 'Solar Structures', 'Security Systems (CCTV)', 'Electrical Works'.",
    }).nullable().optional(),
    completionYear: z
      .number()
      .int("Completion year must be an integer")
      .min(1900, "Completion year must be 1900 or later")
      .max(2100, "Completion year cannot exceed 2100")
      .nullable()
      .optional(),
    shortSummary: z
      .string()
      .trim()
      .min(10, "Short summary must be at least 10 characters")
      .max(400, "Short summary cannot exceed 400 characters")
      .nullable()
      .optional(),
    fullStory: z.string().trim().nullable().optional(),
    // Legacy fields supported for backward compatibility
    description: z.string().trim().nullable().optional(),
    equipment: equipmentSchema.optional(),
    primaryAlt: z.string().trim().max(255, "Primary alt text cannot exceed 255 characters").nullable().optional(),
    secondaryAlt: z.string().trim().max(255, "Secondary alt text cannot exceed 255 characters").nullable().optional(),
    primaryImagePosition: imagePositionSchema.optional(),
    secondaryImagePosition: imagePositionSchema.optional(),
    projectOrder: z.number().int("Project order must be an integer").min(0, "Project order must be non-negative").optional(),
  })
  .strict();

export const adminProjectStatusFilterSchema = z
  .enum(["draft", "published", "archived", "all"])
  .default("all");

export const homepageSelectionSchema = z
  .object({
    projectIds: z
      .array(projectIdSchema)
      .max(3, "At most 3 project IDs can be featured on the homepage")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "All project IDs must be unique",
      }),
  })
  .strict();

export const publicProjectsQuerySchema = z
  .object({
    featured: z.literal("home").optional(),
  })
  .strict();

export const projectImageSlotSchema = z.enum(["primary", "secondary"], {
  message: "Invalid image slot. Allowed values: 'primary', 'secondary'.",
});

export const updateMediaSchema = z
  .object({
    altText: z
      .string()
      .trim()
      .max(255, "Alt text cannot exceed 255 characters")
      .nullable()
      .optional(),
    caption: z
      .string()
      .trim()
      .max(255, "Caption cannot exceed 255 characters")
      .nullable()
      .optional(),
  })
  .strict();

export const reorderMediaSchema = z
  .object({
    mediaIds: z
      .array(projectIdSchema)
      .min(1, "At least one media ID is required")
      .max(5, "Cannot reorder more than 5 media items")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Media IDs must be unique",
      }),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type HomepageSelectionInput = z.infer<typeof homepageSelectionSchema>;
export type AdminProjectStatusFilter = z.infer<typeof adminProjectStatusFilterSchema>;
export type ProjectImageSlot = z.infer<typeof projectImageSlotSchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type ReorderMediaInput = z.infer<typeof reorderMediaSchema>;
