"use client";
import { useEffect, useRef, useState } from "react";
import { deleteAdminReview, fetchAdminProjectReviews, setAdminReviewVisibility } from "../../lib/admin/api";
import type { AdminProjectReview } from "../../types/project-review";
export function ProjectReviewsManager({ projectId }: { projectId: string }) {
 const [reviews, setReviews] = useState<AdminProjectReview[]>([]);
 const [page, setPage] = useState(1);
 const [hasMore, setHasMore] = useState(false);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [feedback, setFeedback] = useState("");
 const [retry, setRetry] = useState(0);
 const [confirm, setConfirm] = useState<string | null>(null);
 const pending = useRef(false);
 useEffect(() => {
  let active = true;
  fetchAdminProjectReviews(projectId, page).then((data) => {
   if (active) { setReviews(data.reviews); setHasMore(data.hasMore); }
  }).catch(() => { if (active) setError("Could not load reviews. Please try again."); })
  .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [projectId, page, retry]);
 async function act(review: AdminProjectReview, deleting = false) {
  if (pending.current) return;
  pending.current = true; setBusy(true); setError(""); setFeedback("");
  try {
   if (deleting) {
    await deleteAdminReview(review.id); setConfirm(null);
    setFeedback("Review permanently deleted.");
    setLoading(true);
    if (reviews.length === 1 && page > 1) setPage(page - 1);
    else setRetry((value) => value + 1);
   } else {
    const updated = await setAdminReviewVisibility(review.id, !review.isVisible);
    setReviews((items) => items.map((item) => item.id === updated.id ? updated : item));
    setFeedback(updated.isVisible ? "Review is now visible." : "Review hidden.");
   }
  } catch (err) { setError(err instanceof Error ? err.message : "Could not update review."); }
  finally { pending.current = false; setBusy(false); }
 }
 return <section className="card admin-project-reviews" aria-labelledby="admin-reviews-heading">
  <h2 id="admin-reviews-heading" className="card-title">Reviews</h2>
  <p className="card-desc">Manage customer reviews for this project.</p>
  {loading && <p role="status">Loading reviews…</p>}
  {error && <div className="alert-banner alert-danger" role="alert">{error}<button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Retry reviews</button></div>}
  {feedback && <p role="status">{feedback}</p>}
  {!loading && !error && !reviews.length && <p>No reviews yet.</p>}
  {!loading && reviews.map((review) => <article key={review.id} className="admin-review-card">
   <div className="admin-review-header"><strong>{review.reviewerName}</strong><span>{review.rating}/5 stars</span>
    <span className={`badge ${review.isVisible ? "badge-published" : "badge-draft"}`}>{review.isVisible ? "Visible" : "Hidden"}</span>
   </div>
   <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}</time>
   <p className="admin-review-text">{review.reviewText}</p>
   <div className="admin-review-actions">
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => act(review)}>{review.isVisible ? "Hide" : "Show"}</button>
    <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => setConfirm(review.id)}>Delete permanently</button>
   </div>
   {confirm === review.id && <div className="admin-review-confirm" role="group" aria-label="Confirm permanent review deletion">
    <p>Permanently delete the review by {review.reviewerName}? This cannot be undone.</p>
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act(review, true)}>{busy ? "Deleting…" : "Confirm permanent deletion"}</button>
   </div>}
  </article>)}
  {!loading && (page > 1 || hasMore) && <nav className="admin-review-actions" aria-label="Admin review pages">
   <button type="button" className="btn btn-secondary" disabled={busy || page === 1} onClick={() => { setLoading(true); setPage(page - 1); setConfirm(null); }}>Previous</button>
   <span>Page {page}</span>
   <button type="button" className="btn btn-secondary" disabled={busy || !hasMore} onClick={() => { setLoading(true); setPage(page + 1); setConfirm(null); }}>Next</button>
  </nav>}
 </section>;
}
