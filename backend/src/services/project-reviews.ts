import { getSupabaseClient } from "./supabase.js";
import { ProjectConflictError, ProjectNotFoundError, type ProjectServiceDependencies } from "./projects.js";
import type { SubmitReviewInput } from "../validation/project-reviews.js";
export type ReviewRow = {
 id: string; project_id: string; reviewer_name: string; rating: number;
 review_text: string; created_at: string; is_visible?: boolean; updated_at?: string;
};
export function toPublicReview(row: ReviewRow) {
 return { id: row.id, projectId: row.project_id, reviewerName: row.reviewer_name,
 rating: row.rating, reviewText: row.review_text, createdAt: row.created_at };
}
function toAdminReview(row: ReviewRow) {
 return { ...toPublicReview(row), isVisible: row.is_visible, updatedAt: row.updated_at };
}
export async function listPublicReviews(projectId: string, page: number, deps: ProjectServiceDependencies = {}) {
 const client = deps.client ?? getSupabaseClient();
 const { data, error } = await client.rpc("get_public_project_reviews", { p_project_id: projectId, p_page: page });
 if (error) throw new Error("Could not retrieve reviews.");
 if (!data) throw new ProjectNotFoundError();
 return { reviews: (data.reviews as ReviewRow[]).map(toPublicReview),
 reviewCount: data.reviewCount as number, averageRating: data.averageRating as number | null, hasMore: data.hasMore as boolean };
}
export async function submitProjectReview(projectId: string, input: SubmitReviewInput, deps: ProjectServiceDependencies = {}) {
 const client = deps.client ?? getSupabaseClient();
 const { data, error } = await client.rpc("submit_project_review", {
 p_project_id: projectId, p_reviewer_name: input.reviewerName, p_rating: input.rating, p_review_text: input.reviewText,
 });
 if (error) throw new Error("Could not submit review.");
 if (!data) throw new ProjectNotFoundError();
 if (data.hiddenDuplicate) throw new ProjectConflictError("This review has already been submitted.");
 return { review: toPublicReview(data.review as ReviewRow), duplicate: data.duplicate as boolean };
}
export async function listAdminReviews(projectId: string, page: number, deps: ProjectServiceDependencies = {}) {
 const client = deps.client ?? getSupabaseClient();
 const { data: project, error: projectError } = await client.from("projects").select("id").eq("id", projectId).maybeSingle();
 if (projectError) throw new Error("Could not retrieve project.");
 if (!project) throw new ProjectNotFoundError();
 const { data, error } = await client.from("project_reviews").select("*").eq("project_id", projectId)
 .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20);
 if (error) throw new Error("Could not retrieve reviews.");
 return { reviews: (data as ReviewRow[]).slice(0, 20).map(toAdminReview), hasMore: data.length > 20 };
}
export async function setReviewVisibility(reviewId: string, isVisible: boolean, deps: ProjectServiceDependencies = {}) {
 const client = deps.client ?? getSupabaseClient();
 const { data, error } = await client.from("project_reviews").update({ is_visible: isVisible }).eq("id", reviewId).select("*").maybeSingle();
 if (error) throw new Error("Could not update review.");
 if (!data) throw new ProjectNotFoundError("Review not found.");
 return toAdminReview(data as ReviewRow);
}
export async function deleteReview(reviewId: string, deps: ProjectServiceDependencies = {}) {
 const client = deps.client ?? getSupabaseClient();
 const { data, error } = await client.from("project_reviews").delete().eq("id", reviewId).select("id").maybeSingle();
 if (error) throw new Error("Could not delete review.");
 if (!data) throw new ProjectNotFoundError("Review not found.");
}
