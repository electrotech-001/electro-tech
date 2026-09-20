import { Router, type RequestHandler } from "express";
import multer from "multer";
import {
  authenticateAdmin as defaultAuthenticateAdmin,
} from "../middleware/authenticate-admin.js";
import {
  deleteProjectImage,
  MAX_PROJECT_IMAGE_FILE_BYTES,
  ProjectImageValidationError,
  uploadProjectImage,
} from "../services/project-images.js";
import {
  deleteProjectMedia,
  listProjectMedia,
  MAX_PROJECT_IMAGE_FILE_BYTES as MAX_PROJECT_MEDIA_FILE_BYTES,
  ProjectMediaValidationError,
  reorderProjectMedia,
  setPrimaryProjectMedia,
  updateProjectMedia,
  uploadProjectMedia,
} from "../services/project-media.js";
import {
  archiveProject,
  createProject,
  deleteProjectWithStorageCleanup,
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
import { createAdminImageUploadRateLimiter } from "../services/rate-limit.js";
import {
  adminProjectStatusFilterSchema,
  createProjectSchema,
  homepageSelectionSchema,
  projectIdSchema,
  projectImageSlotSchema,
  reorderMediaSchema,
  updateMediaSchema,
  updateProjectSchema,
} from "../validation/projects.js";

export type AdminProjectsRouterDependencies = ProjectServiceDependencies & {
  authMiddleware?: RequestHandler;
  uploadRateLimiter?: RequestHandler;
};

export function createAdminProjectsRouter(
  dependencies: AdminProjectsRouterDependencies = {},
) {
  const router = Router();
  const auth = dependencies.authMiddleware ?? defaultAuthenticateAdmin;
  const uploadRateLimiter = dependencies.uploadRateLimiter ?? createAdminImageUploadRateLimiter();

  const projectImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_PROJECT_IMAGE_FILE_BYTES,
      files: 1,
      fields: 1,
      parts: 2,
    },
  });

  const handleImageUpload: RequestHandler = (request, response, next) => {
    projectImageUpload.single("file")(request, response, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          response.status(413).json({
            code: "file_too_large",
            message: `The image must be ${MAX_PROJECT_IMAGE_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
          });
          return;
        }
        response.status(400).json({
          code: "malformed_upload",
          message: "Upload one image file using the 'file' field and specify 'slot'.",
        });
        return;
      }
      if (err) {
        response.status(400).json({
          code: "malformed_upload",
          message: "Malformed image upload.",
        });
        return;
      }
      next();
    });
  };

  const projectMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_PROJECT_MEDIA_FILE_BYTES,
      files: 1,
      fields: 5,
      parts: 6,
    },
  });

  const handleMediaUpload: RequestHandler = (request, response, next) => {
    projectMediaUpload.single("file")(request, response, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          response.status(413).json({
            code: "file_too_large",
            message: `The image must be ${MAX_PROJECT_MEDIA_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
          });
          return;
        }
        response.status(400).json({
          code: "malformed_upload",
          message: "Upload one image file using the 'file' field.",
        });
        return;
      }
      if (err) {
        response.status(400).json({
          code: "malformed_upload",
          message: "Malformed image upload.",
        });
        return;
      }
      next();
    });
  };

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
      const projectIds = validation.data.projectIds;
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
   * GET /api/admin/projects/:id/media
   * Lists all media items (images) for a project.
   */
  router.get("/:id/media", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const media = await listProjectMedia(idValidation.data, dependencies);
      response.status(200).json(media);
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not retrieve project media at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/media
   * Uploads an image to a project.
   */
  router.post("/:id/media", uploadRateLimiter, handleMediaUpload, async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    if (!request.file) {
      response.status(400).json({
        error: "Missing media file.",
        message: "Upload one media file using the 'file' field.",
      });
      return;
    }

    const altText = request.body.altText ? String(request.body.altText) : null;
    const caption = request.body.caption ? String(request.body.caption) : null;
    const isPrimary =
      request.body.isPrimary === true ||
      request.body.isPrimary === "true";

    try {
      const created = await uploadProjectMedia(
        idValidation.data,
        request.file,
        { altText, caption, isPrimary },
        dependencies,
      );
      response.status(201).json(created);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectMediaValidationError) {
        if (error.code === "too_large") {
          response.status(413).json({ error: error.message });
          return;
        }
        if (error.code === "unsupported" || error.code === "mismatch") {
          response.status(415).json({ error: error.message });
          return;
        }
        response.status(400).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not upload media file at this time.",
      });
    }
  });

  /**
   * PATCH /api/admin/projects/:id/media/:mediaId
   * Updates metadata (altText, caption) of a media item.
   */
  router.patch("/:id/media/:mediaId", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    const mediaIdValidation = projectIdSchema.safeParse(request.params.mediaId);

    if (!idValidation.success || !mediaIdValidation.success) {
      response.status(400).json({
        error: "Invalid project ID or media ID.",
      });
      return;
    }

    const bodyValidation = updateMediaSchema.safeParse(request.body);
    if (!bodyValidation.success) {
      response.status(400).json({
        error: "Invalid media update payload.",
        details: bodyValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const updated = await updateProjectMedia(
        idValidation.data,
        mediaIdValidation.data,
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
        message: "Could not update media item at this time.",
      });
    }
  });

  /**
   * DELETE /api/admin/projects/:id/media/:mediaId
   * Deletes a media item from project and storage.
   */
  router.delete("/:id/media/:mediaId", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    const mediaIdValidation = projectIdSchema.safeParse(request.params.mediaId);

    if (!idValidation.success || !mediaIdValidation.success) {
      response.status(400).json({
        error: "Invalid project ID or media ID.",
      });
      return;
    }

    try {
      await deleteProjectMedia(
        idValidation.data,
        mediaIdValidation.data,
        dependencies,
      );
      response.status(200).json({
        ok: true,
        message: "Media deleted successfully.",
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
        message: "Could not delete media at this time.",
      });
    }
  });

  /**
   * PUT /api/admin/projects/:id/media/order
   * Reorders project media items.
   */
  router.put("/:id/media/order", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
      });
      return;
    }

    const bodyValidation = reorderMediaSchema.safeParse(request.body);
    if (!bodyValidation.success) {
      response.status(400).json({
        error: "Invalid reorder payload.",
        details: bodyValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      await reorderProjectMedia(
        idValidation.data,
        bodyValidation.data.mediaIds,
        dependencies,
      );
      response.status(200).json({
        ok: true,
        message: "Media order updated successfully.",
      });
    } catch {
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not reorder media at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/media/:mediaId/primary
   * Sets a specific image as the main project image.
   */
  router.post("/:id/media/:mediaId/primary", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    const mediaIdValidation = projectIdSchema.safeParse(request.params.mediaId);

    if (!idValidation.success || !mediaIdValidation.success) {
      response.status(400).json({
        error: "Invalid project ID or media ID.",
      });
      return;
    }

    try {
      const updated = await setPrimaryProjectMedia(
        idValidation.data,
        mediaIdValidation.data,
        dependencies,
      );
      response.status(200).json(updated);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not set primary media at this time.",
      });
    }
  });

  /**
   * POST /api/admin/projects/:id/images (Legacy backward-compatibility)
   */
  router.post("/:id/images", uploadRateLimiter, handleImageUpload, async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    const slotValidation = projectImageSlotSchema.safeParse(request.body.slot);
    if (!slotValidation.success) {
      response.status(400).json({
        error: "Invalid image slot.",
        details: slotValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    if (!request.file) {
      response.status(400).json({
        error: "Missing image file.",
        message: "Upload one image file using the 'file' field.",
      });
      return;
    }

    try {
      const updated = await uploadProjectImage(
        idValidation.data,
        slotValidation.data,
        request.file,
        dependencies,
      );
      response.status(200).json(updated);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof ProjectImageValidationError) {
        if (error.code === "too_large") {
          response.status(413).json({ error: error.message });
          return;
        }
        if (error.code === "unsupported" || error.code === "mismatch") {
          response.status(415).json({ error: error.message });
          return;
        }
        response.status(400).json({ error: error.message });
        return;
      }
      response.status(503).json({
        error: "Service Unavailable",
        message: "Could not upload project image at this time.",
      });
    }
  });

  /**
   * DELETE /api/admin/projects/:id/images/:slot (Legacy backward-compatibility)
   */
  router.delete("/:id/images/:slot", async (request, response) => {
    const idValidation = projectIdSchema.safeParse(request.params.id);
    if (!idValidation.success) {
      response.status(400).json({
        error: "Invalid project ID.",
        details: idValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    const slotValidation = projectImageSlotSchema.safeParse(request.params.slot);
    if (!slotValidation.success) {
      response.status(400).json({
        error: "Invalid image slot.",
        details: slotValidation.error.issues.map((i) => i.message),
      });
      return;
    }

    try {
      const updated = await deleteProjectImage(
        idValidation.data,
        slotValidation.data,
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
        message: "Could not delete project image at this time.",
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
   * Permanently deletes a project only if it is in draft/archived status.
   * Cleans up Storage assets before deleting the database record.
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
      await deleteProjectWithStorageCleanup(idValidation.data, dependencies);
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
