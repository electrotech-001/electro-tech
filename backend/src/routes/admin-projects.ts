import { Router, type RequestHandler } from "express";
import {
  authenticateAdmin as defaultAuthenticateAdmin,
} from "../middleware/authenticate-admin.js";
import {
  archiveProject,
  createProject,
  deleteProjectWithoutAssets,
  getAdminProjectById,
  listAdminProjects,
  publishProject,
  replaceHomepageProjects,
  restoreProject,
  unpublishProject,
  updateProject,
  ProjectConflictError,
  ProjectNotFoundError,
  ProjectValidationError,
  type ProjectServiceDependencies,
} from "../services/projects.js";
import {
  adminProjectStatusFilterSchema,
  createProjectSchema,
  homepageSelectionSchema,
  projectIdSchema,
  updateProjectSchema,
} from "../validation/projects.js";

export type AdminProjectsRouterDependencies = ProjectServiceDependencies & {
  authMiddleware?: RequestHandler;
};

export function createAdminProjectsRouter(
  dependencies: AdminProjectsRouterDependencies = {},
) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? defaultAuthenticateAdmin;

  // Protect all admin project routes with authenticateAdmin
  router.use(auth);

  /**
   * PUT /api/admin/projects/homepage
   * Replaces the 3 homepage projects using atomic PostgreSQL function replace_homepage_projects.
   * Declared before /:id routes to avoid route ambiguity.
   */
  router.put("/homepage", async (request, response) => {
    const validation = homepageSelectionSchema.safeParse(request.body);
    if (!validation.success) {
      response.status(400).json({
        error: "Invalid homepage selection payload.",
        details: validation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const projectIds = validation.data.projectIds as [string, string, string];
      const result = await replaceHomepageProjects(projectIds, dependencies);
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not update homepage projects at this time.",
      });
    }
  });

  /**
   * GET /api/admin/projects
   * Returns all projects, optionally filtered by status (draft, published, archived, all).
   */
  router.get("/", async (request, response) => {
    const filterValidation = adminProjectStatusFilterSchema.safeParse(
      request.query.status ?? "all",
    );

    if (!filterValidation.success) {
      response.status(400).json({
        error: "Invalid status filter.",
        details: filterValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const projects = await listAdminProjects(
        { status: filterValidation.data },
        dependencies,
      );
      response.status(200).json(projects);
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not retrieve projects at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects
   * Creates a new project in 'draft' status.
   */
  router.post("/", async (request, response) => {
    const validation = createProjectSchema.safeParse(request.body);
    if (!validation.success) {
      response.status(400).json({
        error: "Invalid project creation payload.",
        details: validation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const created = await createProject(validation.data, dependencies);
      response.status(201).json(created);
    } catch (error) {
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not create project at this time.",
      });
    }
  });

  /**
   * GET /api/admin/projects/:id
   * Retrieves single project detail for admin view.
   */
  router.get("/:id", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const project = await getAdminProjectById(idValidation.data, dependencies);
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      response.status(200).json(project);
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not retrieve project at this time.",
      });
    }
  });

  /**
   * PATCH /api/admin/projects/:id
   * Partially updates editable metadata of a project.
   */
  router.patch("/:id", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    const bodyValidation = updateProjectSchema.safeParse(request.body);
    if (!bodyValidation.success) {
      response.status(400).json({
        error: "Invalid project update payload.",
        details: bodyValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const updated = await updateProject(
        idValidation.data,
        bodyValidation.data,
        dependencies,
      );
      response.status(200).json(updated);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not update project at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/publish
   * Transitions a project from draft to published.
   */
  router.post("/:id/publish", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const published = await publishProject(idValidation.data, dependencies);
      response.status(200).json(published);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectValidationError) {
        response.status(400).json({
          error: error.message,
          missingFields: error.missingFields,
        });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not publish project at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/unpublish
   * Transitions a project from published to draft.
   */
  router.post("/:id/unpublish", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const unpublished = await unpublishProject(idValidation.data, dependencies);
      response.status(200).json(unpublished);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not unpublish project at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/archive
   * Transitions a project to archived.
   */
  router.post("/:id/archive", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const archived = await archiveProject(idValidation.data, dependencies);
      response.status(200).json(archived);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not archive project at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/restore
   * Transitions an archived project back to draft.
   */
  router.post("/:id/restore", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const restored = await restoreProject(idValidation.data, dependencies);
      response.status(200).json(restored);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not restore project at this time.",
      });
    }
  });

  /**
   * DELETE /api/admin/projects/:id
   * Permanently deletes a project only if it is in draft/archived status and has no image assets.
   */
  router.delete("/:id", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      await deleteProjectWithoutAssets(idValidation.data, dependencies);
      response.status(200).json({
        ok: true,
        message: "Project deleted successfully.",
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not delete project at this time.",
      });
    }
  });

  return router;
}
