import { z } from "zod";
const plainText = z.string().trim().refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Unsupported control characters.");
export const submitReviewSchema = z.object({
 reviewerName: plainText.pipe(z.string().min(1, "Your name is required.").max(80, "Name must be 80 characters or fewer.")),
 rating: z.number().int("Choose a whole star rating.").min(1, "Choose a rating from 1 to 5.").max(5, "Choose a rating from 1 to 5."),
 reviewText: plainText.pipe(z.string().min(10, "Review must be at least 10 characters.").max(1000, "Review must be 1000 characters or fewer.")),
}).strict();
export const reviewVisibilitySchema = z.object({ isVisible: z.boolean() }).strict();
export const reviewPageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
