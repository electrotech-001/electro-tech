"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  archiveAdminProject,
  deleteAdminProject,
  fetchAdminProjectById,
  fetchAdminProjects,
  publishAdminProject,
  restoreAdminProject,
  unpublishAdminProject,
  updateAdminHomepageProjects,
  updateAdminProject,
  ApiError,
} from "../../lib/admin/api";
import { StatusBadge } from "./StatusBadge";
import { ProjectMediaManager } from "./ProjectMediaManager";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import {
  clearProjectDraft,
  getEditProjectDraftKey,
  getProjectDraft,
  saveProjectDraft,
} from "../../lib/admin/draft-storage";
import {
  PROJECT_CATEGORIES,
  type AdminProject,
  type ProjectCategory,
  type UpdateProjectPayload,
} from "../../types/admin/project";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProjectEditPage({ projectId }: { projectId?: string }) {
  const params = useParams();
  const pathnameFallback =
    typeof window !== "undefined"
      ? window.location.pathname.match(/\/admin\/projects\/([^/]+)\/(?:edit|preview)/)?.[1]
      : undefined;
  const paramId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : undefined;
  const rawId = (typeof projectId === "string" && projectId.trim()) || paramId || pathnameFallback;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const router = useRouter();

  const [project, setProject] = useState<AdminProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOperatingLifecycle, setIsOperatingLifecycle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [autoSlug, setAutoSlug] = useState(false);
  const [slug, setSlug] = useState("");
  const [clientOrganization, setClientOrganization] = useState("");
  const [locationField, setLocationField] = useState("");
  const [size, setSize] = useState("");
  const [category, setCategory] = useState<ProjectCategory | "">("");
  const [completionYear, setCompletionYear] = useState<string>("");
  const [shortSummary, setShortSummary] = useState("");
  const [fullStory, setFullStory] = useState("");

  const loadProject = async (projId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchAdminProjectById(projId);
      setProject(data);

      // Check if there is an unsaved local draft for this specific project
      const draft = getProjectDraft(getEditProjectDraftKey(projId));

      if (draft) {
        setTitle(draft.title !== undefined ? draft.title : data.title);
        setAutoSlug(draft.autoSlug !== undefined ? draft.autoSlug : false);
        setSlug(draft.slug !== undefined ? draft.slug : data.slug);
        setClientOrganization(
          draft.clientOrganization !== undefined
            ? (draft.clientOrganization || "")
            : (data.clientOrganization || ""),
        );
        setLocationField(
          draft.location !== undefined ? (draft.location || "") : (data.location || ""),
        );
        setSize(draft.size !== undefined ? (draft.size || "") : (data.size || ""));
        setCategory(
          draft.category !== undefined
            ? (draft.category as ProjectCategory) || ""
            : (data.category as ProjectCategory) || "",
        );
        setCompletionYear(
          draft.completionYear !== undefined
            ? draft.completionYear ? String(draft.completionYear) : ""
            : data.completionYear ? String(data.completionYear) : "",
        );
        setShortSummary(
          draft.shortSummary !== undefined ? (draft.shortSummary || "") : (data.shortSummary || ""),
        );
        setFullStory(
          draft.fullStory !== undefined ? (draft.fullStory || "") : (data.fullStory || ""),
        );
      } else {
        // Baseline from server
        setTitle(data.title);
        setAutoSlug(false);
        setSlug(data.slug);
        setClientOrganization(data.clientOrganization || "");
        setLocationField(data.location || "");
        setSize(data.size || "");
        setCategory((data.category as ProjectCategory) || "");
        setCompletionYear(data.completionYear ? String(data.completionYear) : "");
        setShortSummary(data.shortSummary || "");
        setFullStory(data.fullStory || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProjectMedia = async (projectId: string) => {
    try {
      const data = await fetchAdminProjectById(projectId);
      setProject(data);
    } catch (err) {
      console.error("Failed to refresh project data:", err);
    }
  };

  useEffect(() => {
    if (id) {
      loadProject(id);
    }
  }, [id]);

  // Handle title changes and auto-slug generation
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (autoSlug) {
      setSlug(slugify(newTitle));
    }
  };

  // Handle manual slug changes
  const handleSlugChange = (newSlug: string) => {
    setAutoSlug(false);
    setSlug(newSlug.toLowerCase());
  };

  // Compute dirty state against server baseline
  const isDirty = Boolean(
    project &&
      (title !== project.title ||
        slug !== project.slug ||
        clientOrganization !== (project.clientOrganization || "") ||
        locationField !== (project.location || "") ||
        size !== (project.size || "") ||
        category !== (project.category || "") ||
        completionYear !== (project.completionYear ? String(project.completionYear) : "") ||
        shortSummary !== (project.shortSummary || "") ||
        fullStory !== (project.fullStory || "")),
  );

  // Auto-save local draft to sessionStorage whenever fields differ from server
  useEffect(() => {
    if (!id || !project) return;

    if (isDirty) {
      saveProjectDraft(getEditProjectDraftKey(id), {
        title,
        slug,
        autoSlug,
        clientOrganization,
        location: locationField,
        size,
        category: category || null,
        completionYear: completionYear ? parseInt(completionYear, 10) : null,
        shortSummary,
        fullStory,
      });
    } else {
      clearProjectDraft(getEditProjectDraftKey(id));
    }
  }, [
    id,
    project,
    isDirty,
    title,
    slug,
    autoSlug,
    clientOrganization,
    locationField,
    size,
    category,
    completionYear,
    shortSummary,
    fullStory,
  ]);

  // Warn administrator on browser reload or tab close if unsaved work exists
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSaveMetadata = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || isSaving) return;

    setError(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Project title cannot be empty.");
      return;
    }

    const payload: UpdateProjectPayload = {
      title: trimmedTitle,
      slug: slug.trim() || undefined,
      clientOrganization: clientOrganization.trim() || null,
      location: locationField.trim() || null,
      size: size.trim() || null,
      category: category ? (category as ProjectCategory) : null,
      completionYear: completionYear ? parseInt(completionYear, 10) : null,
      shortSummary: shortSummary.trim() || null,
      fullStory: fullStory.trim() || null,
    };

    try {
      setIsSaving(true);
      const updated = await updateAdminProject(id, payload);
      setProject(updated);

      // Clear stored draft upon successful save
      clearProjectDraft(getEditProjectDraftKey(id));

      setSuccessMessage("Project details updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project details.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id || isOperatingLifecycle) return;
    setError(null);
    setSuccessMessage(null);

    try {
      setIsOperatingLifecycle(true);
      const updated = await publishAdminProject(id);
      setProject(updated);
      setSuccessMessage(`"${updated.title}" is now published on the public website.`);
    } catch (err) {
      if (err instanceof ApiError && err.missingFields) {
        setError(
          `Cannot publish: ${err.message}. Missing required items: ${err.missingFields.join(", ")}.`,
        );
      } else {
        setError(err instanceof Error ? err.message : "Failed to publish project.");
      }
    } finally {
      setIsOperatingLifecycle(false);
    }
  };

  const handleUnpublish = async () => {
    if (!id || isOperatingLifecycle) return;
    setError(null);
    setSuccessMessage(null);

    try {
      setIsOperatingLifecycle(true);
      const updated = await unpublishAdminProject(id);
      setProject(updated);
      setSuccessMessage(`"${updated.title}" was unpublished and returned to draft.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish project.");
    } finally {
      setIsOperatingLifecycle(false);
    }
  };

  const handleArchive = async () => {
    if (!id || isOperatingLifecycle) return;
    setError(null);
    setSuccessMessage(null);

    try {
      setIsOperatingLifecycle(true);
      const updated = await archiveAdminProject(id);
      setProject(updated);
      setSuccessMessage(`"${updated.title}" was moved to archive.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project.");
    } finally {
      setIsOperatingLifecycle(false);
    }
  };

  const handleRestore = async () => {
    if (!id || isOperatingLifecycle) return;
    setError(null);
    setSuccessMessage(null);

    try {
      setIsOperatingLifecycle(true);
      const updated = await restoreAdminProject(id);
      setProject(updated);
      setSuccessMessage(`"${updated.title}" was restored to draft status.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore project.");
    } finally {
      setIsOperatingLifecycle(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !project || isDeleting) return;

    try {
      setIsDeleting(true);
      setError(null);
      await deleteAdminProject(id);
      clearProjectDraft(getEditProjectDraftKey(id));
      router.push("/admin/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const [isOperatingHomepage, setIsOperatingHomepage] = useState(false);

  const handleToggleHomepageFeature = async () => {
    if (!project || isOperatingHomepage) return;

    if (project.status !== "published") {
      setError("Publish this project before featuring it on the homepage.");
      return;
    }

    try {
      setIsOperatingHomepage(true);
      setError(null);
      setSuccessMessage(null);

      // Fetch all projects to inspect current homepage assignments
      const allProjects = await fetchAdminProjects("all");

      // Build current featured list ONLY from projects satisfying:
      // status === "published" && isFeaturedHomepage === true && homepageOrder != null
      // Exclude current project to prevent accidental duplication
      const currentValidFeatured = allProjects
        .filter(
          (p) =>
            p.id !== project.id &&
            p.status === "published" &&
            p.isFeaturedHomepage === true &&
            p.homepageOrder != null,
        )
        .sort((a, b) => (a.homepageOrder ?? 0) - (b.homepageOrder ?? 0));

      if (project.isFeaturedHomepage) {
        // Remove from homepage: send all other valid featured project IDs
        const nextIds = currentValidFeatured.map((p) => p.id);
        await updateAdminHomepageProjects(nextIds);

        // Immediately refetch project from server to synchronize state
        const refreshed = await fetchAdminProjectById(project.id);
        setProject(refreshed);
        setSuccessMessage(`"${refreshed.title}" removed from homepage featured projects.`);
      } else {
        // Feature on homepage
        if (currentValidFeatured.length >= 3) {
          setError("Maximum 3 projects can be featured on the homepage. Remove one of the current featured projects first.");
          return;
        }

        // Deduplicate before sending
        const nextIds = Array.from(new Set([...currentValidFeatured.map((p) => p.id), project.id]));
        await updateAdminHomepageProjects(nextIds);

        // Immediately refetch project from server to synchronize state
        const refreshed = await fetchAdminProjectById(project.id);
        setProject(refreshed);
        setSuccessMessage(`"${refreshed.title}" is now featured on the homepage (Position #${refreshed.homepageOrder ?? nextIds.length}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update homepage featured status.");
    } finally {
      setIsOperatingHomepage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Loading project details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Project Not Found</h2>
          <p className="empty-state-desc">The requested project ID does not exist.</p>
          <a href="/admin/projects" className="btn btn-primary">
            Back to Projects
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <a href="/admin/projects" className="btn btn-secondary btn-sm">
              &larr; Projects
            </a>
            <StatusBadge
              status={project.status}
              isFeaturedHomepage={project.isFeaturedHomepage}
            />
            {isDirty && (
              <span className="badge badge-draft" title="You have unsaved changes">
                Unsaved changes
              </span>
            )}
          </div>
          <h1>{project.title}</h1>
          <p>
            Slug: <code style={{ color: "var(--accent, #F5C400)" }}>/projects/{project.slug}</code> &bull; Last updated {new Date(project.updatedAt).toLocaleString()}
          </p>
        </div>

        <div className="page-actions">
          <a
            href={`/admin/projects/${project.id}/preview`}
            className="btn btn-secondary"
            title="Preview how this project looks on public site"
          >
            Preview Site Card
          </a>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert-banner alert-success" role="alert">
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveMetadata}>
        {/* Section 1: Core Information */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="card-title">1. Core Information</h2>
              <p className="card-desc">
                Basic project identification, client information, system capacity, and classification.
              </p>
            </div>
            <StatusBadge status={project.status} isFeaturedHomepage={project.isFeaturedHomepage} />
          </div>

          <div className="form-group">
            <label htmlFor="edit-title" className="form-label">
              Project Title <span className="required">*</span>
            </label>
            <input
              id="edit-title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
              maxLength={150}
              disabled={isSaving}
            />
          </div>

          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label htmlFor="edit-slug" className="form-label" style={{ marginBottom: 0 }}>
                URL Slug
              </label>
              <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoSlug}
                  onChange={(e) => {
                    setAutoSlug(e.target.checked);
                    if (e.target.checked && title) {
                      setSlug(slugify(title));
                    }
                  }}
                  disabled={isSaving}
                />
                Auto-generate from title
              </label>
            </div>
            <div className="input-wrapper" style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  backgroundColor: "var(--bg-surface-raised)",
                  color: "var(--text-muted)",
                  padding: "0.65rem 0.85rem",
                  border: "1px solid var(--border-default)",
                  borderRight: "none",
                  borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                  fontSize: "0.9rem",
                  fontFamily: "monospace",
                }}
              >
                /projects/
              </span>
              <input
                id="edit-slug"
                type="text"
                className="form-input"
                style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={100}
                disabled={isSaving}
              />
            </div>
            <span className="form-hint">
              Unique slug for public website routing. Changing this alters published URLs.
            </span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-clientOrganization" className="form-label">
                Client / Organization
              </label>
              <input
                id="edit-clientOrganization"
                type="text"
                className="form-input"
                value={clientOrganization}
                onChange={(e) => setClientOrganization(e.target.value)}
                placeholder="e.g. Attock Flour Mills Ltd."
                maxLength={150}
                disabled={isSaving}
              />
              <span className="form-hint">Client or property name. Required for publishing.</span>
            </div>

            <div className="form-group">
              <label htmlFor="edit-location" className="form-label">
                Location
              </label>
              <input
                id="edit-location"
                type="text"
                className="form-input"
                value={locationField}
                onChange={(e) => setLocationField(e.target.value)}
                placeholder="e.g. Kamra Road, Attock"
                maxLength={150}
                disabled={isSaving}
              />
              <span className="form-hint">City / District / Area. Required for publishing.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="edit-size" className="form-label">
                Capacity / Project Size
              </label>
              <input
                id="edit-size"
                type="text"
                className="form-input"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 50 kW On-Grid System"
                maxLength={100}
                disabled={isSaving}
              />
              <span className="form-hint">System size or capacity. Required for publishing.</span>
            </div>

            <div className="form-group">
              <label htmlFor="edit-category" className="form-label">
                Category
              </label>
              <select
                id="edit-category"
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                disabled={isSaving}
              >
                <option value="">-- Select Category --</option>
                {PROJECT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <span className="form-hint">Must be one of the approved categories. Required for publishing.</span>
            </div>

            <div className="form-group">
              <label htmlFor="edit-completionYear" className="form-label">
                Completion Year
              </label>
              <input
                id="edit-completionYear"
                type="number"
                min="2000"
                max={new Date().getFullYear() + 1}
                className="form-input"
                value={completionYear}
                onChange={(e) => setCompletionYear(e.target.value)}
                placeholder={String(new Date().getFullYear())}
                disabled={isSaving}
              />
              <span className="form-hint">4-digit year completed. Required for publishing.</span>
            </div>
          </div>
        </div>

        {/* Section 2: Project Narrative & Summary */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="card-title">2. Project Narrative &amp; Summary</h2>
              <p className="card-desc">
                Concise case-study summary and comprehensive technical breakdown.
              </p>
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label htmlFor="edit-shortSummary" className="form-label" style={{ marginBottom: 0 }}>
                Short Summary
              </label>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color:
                    shortSummary.length > 400
                      ? "var(--color-danger)"
                      : shortSummary.length > 0 && shortSummary.length < 10
                        ? "var(--color-warning)"
                        : "var(--text-muted)",
                }}
              >
                {shortSummary.length} / 400 characters
              </span>
            </div>
            <textarea
              id="edit-shortSummary"
              className="form-textarea"
              value={shortSummary}
              onChange={(e) => setShortSummary(e.target.value)}
              placeholder="Brief 1-2 sentence overview of the installation, generation capacity, and key achievement (10–400 characters). Required for publishing."
              rows={3}
              maxLength={500}
              disabled={isSaving}
            />
            <span className="form-hint">
              Featured on project cards and summaries. Must be between 10 and 400 characters to publish.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="edit-fullStory" className="form-label">
              Full Story / Project Details (Optional)
            </label>
            <textarea
              id="edit-fullStory"
              className="form-textarea"
              value={fullStory}
              onChange={(e) => setFullStory(e.target.value)}
              placeholder="Comprehensive installation narrative: site challenges, engineering design, solar panels, inverters, battery storage, and client benefits..."
              rows={6}
              disabled={isSaving}
            />
            <span className="form-hint">
              Detailed technical writeup displayed on the full case study view.
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || !title.trim()}
            >
              {isSaving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </div>
      </form>

      {/* Section 3: Media & Uploads */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h2 className="card-title">3. Media &amp; Uploads</h2>
            <p className="card-desc">
              Manage project photography. Streamed directly into Supabase Storage.
            </p>
          </div>
        </div>

        <ProjectMediaManager
          projectId={project.id}
          media={project.images || []}
          projectStatus={project.status}
          onMediaChange={() => refreshProjectMedia(project.id)}
          disabled={isSaving || isOperatingLifecycle}
        />
      </div>

      {/* Section 4: Status & Actions */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h2 className="card-title">4. Status &amp; Actions</h2>
            <p className="card-desc">
              Manage project publication lifecycle, archiving, and deletion.
            </p>
          </div>
          <StatusBadge status={project.status} isFeaturedHomepage={project.isFeaturedHomepage} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              backgroundColor: "var(--surface-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}>
                Publication Status: <span style={{ textTransform: "capitalize" }}>{project.status}</span>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                {project.status === "published"
                  ? "This project is live and visible on the public website."
                  : project.status === "draft"
                    ? "Draft projects are private. At least 1 image and all core fields are required before publishing."
                    : "Archived projects are hidden from the public website and homepage."}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {project.status === "draft" && (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handlePublish}
                  disabled={isOperatingLifecycle}
                >
                  {isOperatingLifecycle ? <span className="spinner-sm" /> : "Publish to Website"}
                </button>
              )}

              {project.status === "published" && (
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleUnpublish}
                  disabled={isOperatingLifecycle}
                >
                  {isOperatingLifecycle ? <span className="spinner-sm" /> : "Unpublish (to Draft)"}
                </button>
              )}

              {project.status !== "archived" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleArchive}
                  disabled={isOperatingLifecycle}
                >
                  Archive Project
                </button>
              )}

              {project.status === "archived" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRestore}
                  disabled={isOperatingLifecycle}
                >
                  Restore to Draft
                </button>
              )}
            </div>
          </div>

          {/* Homepage Feature Section */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              backgroundColor: "var(--surface-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}>
                Homepage Feature:{" "}
                {project.isFeaturedHomepage ? (
                  <span className="badge badge-featured">Featured (#{project.homepageOrder})</span>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 400 }}>
                    Not Featured
                  </span>
                )}
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                {project.status === "published"
                  ? project.isFeaturedHomepage
                    ? "This project is currently showcased on the public homepage."
                    : "Showcase this published project in the homepage featured section (up to 3 total)."
                  : "Publish this project before featuring it on the homepage."}
              </p>
            </div>

            <div>
              {project.status === "published" ? (
                project.isFeaturedHomepage ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleToggleHomepageFeature}
                    disabled={isOperatingHomepage || isOperatingLifecycle}
                  >
                    {isOperatingHomepage ? <span className="spinner-sm" /> : "Remove from Homepage"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleToggleHomepageFeature}
                    disabled={isOperatingHomepage || isOperatingLifecycle}
                  >
                    {isOperatingHomepage ? <span className="spinner-sm" /> : "Feature on Homepage"}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={true}
                  title="Publish this project before featuring it on the homepage."
                >
                  Feature on Homepage
                </button>
              )}
            </div>
          </div>

          {(project.status === "draft" || project.status === "archived") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.25rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(220, 38, 38, 0.25)",
                backgroundColor: "rgba(220, 38, 38, 0.04)",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--color-danger)" }}>
                  Danger Zone
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                  Permanently delete this project and all associated media from storage.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setShowDeleteModal(true)}
                disabled={isOperatingLifecycle}
              >
                Delete Project
              </button>
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && project && (
        <DeleteConfirmModal
          isOpen={true}
          projectTitle={project.title}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
