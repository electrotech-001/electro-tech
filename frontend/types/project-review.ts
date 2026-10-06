export type ProjectReview = {
 id: string; projectId: string; reviewerName: string; rating: number; reviewText: string; createdAt: string;
};
export type AdminProjectReview = ProjectReview & { isVisible: boolean; updatedAt: string };
export type ReviewPage = { reviews: ProjectReview[]; reviewCount: number; averageRating: number | null; hasMore: boolean };
export type AdminReviewPage = { reviews: AdminProjectReview[]; hasMore: boolean };
export type SubmitReviewPayload = { reviewerName: string; rating: number; reviewText: string };
