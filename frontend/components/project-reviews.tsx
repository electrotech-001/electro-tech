"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { fetchProjectReviews, submitProjectReview } from "@/lib/project-reviews";
import type { ReviewPage } from "@/types/project-review";
export function ReviewStars({ rating }: { rating: number }) {
 return <span className="review-stars" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
  {[1, 2, 3, 4, 5].map((star) => <span key={star} className="review-star-cell" aria-hidden="true">
   <Star size={18} /><span className="review-star-fill" style={{ width: Math.max(0, Math.min(1, rating - star + 1)) * 100 + "%" }}><Star size={18} fill="currentColor" /></span>
  </span>)}
 </span>;
}
export function ProjectReviews({ projectId }: { projectId: string }) {
 const [data, setData] = useState<ReviewPage | null>(null);
 const [page, setPage] = useState(1);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState("");
 const [retry, setRetry] = useState(0);
 const [name, setName] = useState("");
 const [rating, setRating] = useState(0);
 const [text, setText] = useState("");
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState("");
 const [success, setSuccess] = useState("");
 const pending = useRef(false);
 const controller = useRef<AbortController | null>(null);
 useEffect(() => {
  const abort = new AbortController();
  controller.current = abort;
  return () => { abort.abort(); };
 }, []);
 useEffect(() => {
  const abort = new AbortController();
  fetchProjectReviews(projectId, page, abort.signal).then((result) => {
   if (!abort.signal.aborted) setData(result);
  }).catch(() => {
   if (!abort.signal.aborted) setLoadError("Could not load reviews. Please try again.");
  }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
  return () => abort.abort();
 }, [projectId, page, retry]);
 async function submit(event: FormEvent) {
  event.preventDefault();
  if (pending.current) return;
  setError(""); setSuccess("");
  if (!name.trim() || name.trim().length > 80) { setError("Enter your name (1–80 characters)."); return; }
  if (!rating) { setError("Choose a rating from 1 to 5 stars."); return; }
  if (text.trim().length < 10 || text.trim().length > 1000) { setError("Review must be between 10 and 1000 characters."); return; }
  pending.current = true; setSubmitting(true);
  try {
   await submitProjectReview(projectId, { reviewerName: name.trim(), rating, reviewText: text.trim() }, controller.current?.signal);
   if (controller.current?.signal.aborted) return;
   setName(""); setRating(0); setText("");
   setSuccess("Thank you! Your review has been submitted.");
   setLoading(true); setLoadError(""); setPage(1); setRetry((value) => value + 1);
  } catch (err) {
   if (!controller.current?.signal.aborted) setError(err instanceof Error ? err.message : "Could not submit your review. Please try again.");
  } finally {
   pending.current = false;
   if (!controller.current?.signal.aborted) setSubmitting(false);
  }
 }
 return <section className="project-reviews" aria-labelledby="customer-reviews-heading">
  <h3 id="customer-reviews-heading" className="project-modal-story-title">Customer Reviews</h3>
  {loading && <p role="status">Loading reviews…</p>}
  {loadError && <div role="alert"><p>{loadError}</p><button type="button" className="review-secondary-button" onClick={() => { setLoading(true); setLoadError(""); setRetry((value) => value + 1); }}>Retry reviews</button></div>}
  {!loading && !loadError && data && <>
   {data.reviewCount > 0 && data.averageRating !== null ? <div className="review-summary">
    <strong>{data.averageRating.toFixed(1)}</strong><ReviewStars rating={data.averageRating} />
    <span>Based on {data.reviewCount} {data.reviewCount === 1 ? "review" : "reviews"}</span>
   </div> : <p>No reviews yet. Be the first to review this project.</p>}
   <div className="review-list">{data.reviews.map((review) => <article key={review.id} className="review-card">
    <div className="review-card-header"><strong>{review.reviewerName}</strong><ReviewStars rating={review.rating} /></div>
    <time dateTime={review.createdAt}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(review.createdAt))}</time>
    <p>{review.reviewText}</p>
   </article>)}</div>
   {(page > 1 || data.hasMore) && <nav className="review-pagination" aria-label="Review pages">
    <button type="button" className="review-secondary-button" disabled={page === 1 || submitting} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous reviews</button>
    <span>Page {page}</span>
    <button type="button" className="review-secondary-button" disabled={!data.hasMore || submitting} onClick={() => { setLoading(true); setPage(page + 1); }}>Next reviews</button>
   </nav>}
  </>}
  <form className="review-form" onSubmit={submit} noValidate aria-labelledby="write-review-heading">
   <h4 id="write-review-heading">Write a Review</h4>
   <fieldset disabled={submitting}>
    <label htmlFor="review-name">Your Name (required)</label>
    <input id="review-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoComplete="name" />
    <fieldset className="review-rating"><legend>Rating (required)</legend>
     <div className="review-rating-options">{[1, 2, 3, 4, 5].map((star) => <label key={star} className="review-rating-option">
      <input type="radio" name="review-rating" value={star} checked={rating === star} onChange={() => setRating(star)} required aria-label={`${star} ${star === 1 ? "star" : "stars"}`} />
      <Star size={26} aria-hidden="true" fill={star <= rating ? "currentColor" : "none"} />
     </label>)}</div>
    </fieldset>
    <label htmlFor="review-text">Review (required)</label>
    <textarea id="review-text" value={text} onChange={(event) => setText(event.target.value)} rows={4} minLength={10} maxLength={1000} required aria-describedby="review-text-hint" />
    <span id="review-text-hint">10–1000 characters · {text.length}/1000</span>
    <button type="submit" className="review-submit-button">{submitting ? "Submitting…" : "Submit Review"}</button>
   </fieldset>
   {error && <p role="alert">{error}</p>}
   {success && <p role="status">{success}</p>}
  </form>
 </section>;
}
