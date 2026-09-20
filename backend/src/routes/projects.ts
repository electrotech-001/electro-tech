import { Router } from "express";
import {
  getPublishedProjectBySlug,
  listPublishedProjects,
  type ProjectServiceDependencies,
} from "../services/projects.js";
import {
  projectSlugSchema,
  publicProjectsQuerySchema,
} from "../validation/projects.js";

export function createProjectsRouter(dependencies: ProjectServiceDependencies = {}) {
  const router = Router();

  /**
   * GET /api/projects
   * Returns published projects.
   * Supports ?featured=home to return up to 3 homepage-featured projects.
   */
  router.get("/", async (request, response) => {
    const queryValidation = publicProjectsQuerySchema.safeParse(request.query);
    if (!queryValidation.success) {
      response.status(400).json({
        error: "Invalid query parameters.",
        details: queryValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const isFeatured = queryValidation.data.featured === "home";
      const projects = await listPublishedProjects(
        { featured: isFeatured },
        dependencies,
      );

      response.setHeader("Cache-Control", "no-cache");
      response.status(200).json(projects);
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not retrieve projects at this time.",
      });
    }
  });

  /**
   * GET /api/projects/:slug
   * Returns a single published project by its slug.
   * Returns 404 for draft, archived, or nonexistent projects without leaking status.
   */
  router.get("/:slug", async (request, response) => {
    const slugValidation = projectSlugSchema.safeParse(request.params.slug);
    if (!slugValidation.success) {
      response.status(400).json({
        error: "Invalid project slug.",
        details: slugValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const project = await getPublishedProjectBySlug(
        slugValidation.data,
        dependencies,
      );

      if (!project) {
        response.status(404).json({
          error: "Project not found",
        });
        return;
      }

      response.setHeader("Cache-Control", "no-cache");
      response.status(200).json(project);
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not retrieve project at this time.",
      });
    }
  });

  return router;
}
