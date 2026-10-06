import { apiUrl } from "./api-origin";
import type { ProjectReview, ReviewPage, SubmitReviewPayload } from "../types/project-review";
async function reviewFetch<T>(path: string, options: RequestInit): Promise<T> {
 const response = await fetch(apiUrl(path), { ...options, cache: "no-store" });
 const data = await response.json();
 if (!response.ok) throw new Error(data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "Reviews are unavailable. Please try again.");
 return data as T;
}
export function fetchProjectReviews(projectId: string, page = 1, signal?: AbortSignal) {
 return reviewFetch<ReviewPage>(`/api/projects/${encodeURIComponent(projectId)}/reviews?page=${page}`, { signal });
}
export function submitProjectReview(projectId: string, input: SubmitReviewPayload, signal?: AbortSignal) {
 return reviewFetch<ProjectReview>(`/api/projects/${encodeURIComponent(projectId)}/reviews`, {
 method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
 });
}
