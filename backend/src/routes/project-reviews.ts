import express, { Router, type RequestHandler, type Response } from "express";
import { authenticateAdmin } from "../middleware/authenticate-admin.js";
import { createReviewRateLimiter } from "../services/rate-limit.js";
import { ProjectConflictError, ProjectNotFoundError, type ProjectServiceDependencies } from "../services/projects.js";
import { deleteReview, listAdminReviews, listPublicReviews, setReviewVisibility, submitProjectReview } from "../services/project-reviews.js";
import { projectIdSchema } from "../validation/projects.js";
import { reviewPageSchema, reviewVisibilitySchema, submitReviewSchema } from "../validation/project-reviews.js";
function fail(response: Response, error: unknown) {
 if (error instanceof ProjectNotFoundError) return response.status(404).json({ message: error.message });
 if (error instanceof ProjectConflictError) return response.status(409).json({ message: error.message });
 return response.status(503).json({ message: "Reviews are unavailable. Please try again later." });
}
export function createPublicReviewsRouter(deps: ProjectServiceDependencies & { rateLimiter?: RequestHandler } = {}) {
 const router = Router();
 router.get("/:projectId/reviews", async (req, res) => {
 res.setHeader("Cache-Control", "no-store");
 const id = projectIdSchema.safeParse(req.params.projectId);
 const query = reviewPageSchema.safeParse(req.query);
 if (!id.success || !query.success) { res.status(400).json({ message: "Invalid project or page." }); return; }
 try { res.json(await listPublicReviews(id.data, query.data.page, deps)); } catch (error) { fail(res, error); }
 });
 router.post("/:projectId/reviews", deps.rateLimiter ?? createReviewRateLimiter(), express.json({ limit: "8kb" }), async (req, res) => {
 res.setHeader("Cache-Control", "no-store");
 const id = projectIdSchema.safeParse(req.params.projectId);
 const body = submitReviewSchema.safeParse(req.body);
 if (!id.success) { res.status(400).json({ message: "Invalid project." }); return; }
 if (!body.success) { res.status(400).json({ message: body.error.issues[0]?.message ?? "Invalid review.", details: body.error.flatten().fieldErrors }); return; }
 try {
 const result = await submitProjectReview(id.data, body.data, deps);
 res.status(result.duplicate ? 200 : 201).json(result.review);
 } catch (error) { fail(res, error); }
 });
 return router;
}
export function createAdminReviewsRouter(deps: ProjectServiceDependencies & { authMiddleware?: RequestHandler } = {}) {
 const router = Router();
 router.use(["/projects/:projectId/reviews", "/project-reviews/:reviewId"], deps.authMiddleware ?? authenticateAdmin);
 router.use(["/projects/:projectId/reviews", "/project-reviews/:reviewId"], (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
 router.get("/projects/:projectId/reviews", async (req, res) => {
 const id = projectIdSchema.safeParse(req.params.projectId);
 const page = reviewPageSchema.safeParse(req.query);
 if (!id.success || !page.success) { res.status(400).json({ message: "Invalid project or page." }); return; }
 try { res.json(await listAdminReviews(id.data, page.data.page, deps)); } catch (error) { fail(res, error); }
 });
 router.patch("/project-reviews/:reviewId", express.json({ limit: "1kb" }), async (req, res) => {
 const id = projectIdSchema.safeParse(req.params.reviewId);
 const body = reviewVisibilitySchema.safeParse(req.body);
 if (!id.success || !body.success) { res.status(400).json({ message: "Provide a valid review and visibility." }); return; }
 try { res.json(await setReviewVisibility(id.data, body.data.isVisible, deps)); } catch (error) { fail(res, error); }
 });
 router.delete("/project-reviews/:reviewId", async (req, res) => {
 const id = projectIdSchema.safeParse(req.params.reviewId);
 if (!id.success) { res.status(400).json({ message: "Invalid review." }); return; }
 try { await deleteReview(id.data, deps); res.status(204).end(); } catch (error) { fail(res, error); }
 });
 return router;
}
