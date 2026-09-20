import { z } from "zod";

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
    "Invalid project ID. Must be a valid UUID.",
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
    location: z.string().trim().max(150, "Location cannot exceed 150 characters").nullable().optional(),
    size: z.string().trim().max(100, "Size cannot exceed 100 characters").nullable().optional(),
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
    location: z.string().trim().max(150, "Location cannot exceed 150 characters").nullable().optional(),
    size: z.string().trim().max(100, "Size cannot exceed 100 characters").nullable().optional(),
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
      .length(3, "Exactly 3 project IDs are required for homepage selection")
      .refine((ids) => new Set(ids).size === 3, {
        message: "All 3 project IDs must be unique",
      }),
  })
  .strict();

export const publicProjectsQuerySchema = z
  .object({
    featured: z.literal("home").optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type HomepageSelectionInput = z.infer<typeof homepageSelectionSchema>;
export type AdminProjectStatusFilter = z.infer<typeof adminProjectStatusFilterSchema>;
