"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  archiveAdminProject,
  deleteAdminProject,
  fetchAdminProjects,
  publishAdminProject,
  restoreAdminProject,
  unpublishAdminProject,
  updateAdminHomepageProjects,
} from "../../lib/admin/api";
import { StatusBadge } from "./StatusBadge";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import type { AdminProject, ProjectStatusFilter } from "../../types/admin/project";

export function ProjectsListPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [activeTab, setActiveTab] = useState<ProjectStatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Deletion modal state
  const [projectToDelete, setProjectToDelete] = useState<AdminProject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // In-flight action tracking
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [isHomepageUpdating, setIsHomepageUpdating] = useState(false);

  const loadProjects = async (filter: ProjectStatusFilter) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchAdminProjects(filter);
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: ProjectStatusFilter) => {
    setActiveTab(tab);
    setSuccessMessage(null);
  };

  // Derive currently featured homepage projects (sorted by homepageOrder 1..3)
  const featuredProjects = projects
    .filter((p) => p.isFeaturedHomepage && p.status === "published" && p.homepageOrder != null)
    .sort((a, b) => (a.homepageOrder ?? 0) - (b.homepageOrder ?? 0));

  const handlePublish = async (project: AdminProject) => {
    try {
      setActionInProgressId(project.id);
      setError(null);
      setSuccessMessage(null);
      const updated = await publishAdminProject(project.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMessage(`"${project.title}" was published successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish project.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleUnpublish = async (project: AdminProject) => {
    try {
      setActionInProgressId(project.id);
      setError(null);
      setSuccessMessage(null);
      const updated = await unpublishAdminProject(project.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMessage(`"${project.title}" was unpublished back to draft.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish project.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleArchive = async (project: AdminProject) => {
    try {
      setActionInProgressId(project.id);
      setError(null);
      setSuccessMessage(null);
      const updated = await archiveAdminProject(project.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMessage(`"${project.title}" was archived.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRestore = async (project: AdminProject) => {
    try {
      setActionInProgressId(project.id);
      setError(null);
      setSuccessMessage(null);
      const updated = await restoreAdminProject(project.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSuccessMessage(`"${project.title}" was restored to draft.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore project.");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      setIsDeleting(true);
      setError(null);
      await deleteAdminProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setSuccessMessage(`"${projectToDelete.title}" was permanently deleted.`);
      setProjectToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Add project to homepage
  const handleAddToHomepage = async (project: AdminProject) => {
    if (project.status !== "published") {
      setError("Only published projects can be featured on the homepage.");
      return;
    }

    try {
      setIsHomepageUpdating(true);
      setActionInProgressId(project.id);
      setError(null);
      setSuccessMessage(null);

      const allProjects = await fetchAdminProjects("all");
      const currentValidFeatured = allProjects
        .filter(
          (p) =>
            p.id !== project.id &&
            p.status === "published" &&
            p.isFeaturedHomepage === true &&
            p.homepageOrder != null,
        )
        .sort((a, b) => (a.homepageOrder ?? 0) - (b.homepageOrder ?? 0));

      if (currentValidFeatured.length >= 3) {
        setError("Maximum 3 projects can be featured on the homepage. Remove one of the current featured projects first.");
        return;
      }

      const nextIds = Array.from(new Set([...currentValidFeatured.map((p) => p.id), project.id]));
      await updateAdminHomepageProjects(nextIds);
      await loadProjects(activeTab);
      setSuccessMessage(`"${project.title}" added to homepage featured projects.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update homepage featured projects.");
    } finally {
      setIsHomepageUpdating(false);
      setActionInProgressId(null);
    }
  };

  // Remove project from homepage
  const handleRemoveFromHomepage = async (projectId: string) => {
    try {
      setIsHomepageUpdating(true);
      setActionInProgressId(projectId);
      setError(null);
      setSuccessMessage(null);

      const allProjects = await fetchAdminProjects("all");
      const currentValidFeatured = allProjects
        .filter(
          (p) =>
            p.id !== projectId &&
            p.status === "published" &&
            p.isFeaturedHomepage === true &&
            p.homepageOrder != null,
        )
        .sort((a, b) => (a.homepageOrder ?? 0) - (b.homepageOrder ?? 0));

      const nextIds = currentValidFeatured.map((p) => p.id);
      await updateAdminHomepageProjects(nextIds);
      await loadProjects(activeTab);
      setSuccessMessage("Project removed from homepage featured projects.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update homepage featured projects.");
    } finally {
      setIsHomepageUpdating(false);
      setActionInProgressId(null);
    }
  };

  // Move project up or down in homepage order
  const handleMoveFeatured = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= featuredProjects.length) return;

    try {
      setIsHomepageUpdating(true);
      setError(null);
      setSuccessMessage(null);

      const nextList = [...featuredProjects];
      const temp = nextList[index];
      nextList[index] = nextList[targetIndex];
      nextList[targetIndex] = temp;

      const nextIds = nextList.map((p) => p.id);
      await updateAdminHomepageProjects(nextIds);
      await loadProjects(activeTab);
      setSuccessMessage("Homepage featured projects order updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder homepage projects.");
    } finally {
      setIsHomepageUpdating(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Projects Directory</h1>
          <p>Create, update, preview, and configure lifecycle states for all projects</p>
        </div>
        <div className="page-actions">
          <Link href="/admin/projects/new" className="btn btn-primary">
            + New Project
          </Link>
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

      {/* HOMEPAGE FEATURED PROJECTS ORDERING SECTION */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Homepage Featured Projects ({featuredProjects.length}/3)</h2>
            <p className="card-desc" style={{ margin: "4px 0 0" }}>
              Up to 3 published projects can be showcased on the public homepage. Reorder or remove them below.
            </p>
          </div>
        </div>

        {featuredProjects.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: "0.5rem 0" }}>
            No projects are currently featured on the homepage. Click <strong>Feature on Homepage</strong> on any published project in the directory below to add it.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
            {featuredProjects.map((proj, idx) => (
              <div
                key={proj.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--surface-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "var(--accent)",
                      color: "var(--dark)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>
                      {proj.title}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {proj.category || "General Solar"} • /projects/{proj.slug}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveFeatured(idx, "up")}
                    disabled={idx === 0 || isHomepageUpdating}
                    title="Move up"
                    aria-label={`Move ${proj.title} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveFeatured(idx, "down")}
                    disabled={idx === featuredProjects.length - 1 || isHomepageUpdating}
                    title="Move down"
                    aria-label={`Move ${proj.title} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => handleRemoveFromHomepage(proj.id)}
                    disabled={isHomepageUpdating}
                    title="Remove from homepage"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tabs-container" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => handleTabChange("all")}
        >
          All Projects
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "published"}
          className={`tab-btn ${activeTab === "published" ? "active" : ""}`}
          onClick={() => handleTabChange("published")}
        >
          Published
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "draft"}
          className={`tab-btn ${activeTab === "draft" ? "active" : ""}`}
          onClick={() => handleTabChange("draft")}
        >
          Drafts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "archived"}
          className={`tab-btn ${activeTab === "archived" ? "active" : ""}`}
          onClick={() => handleTabChange("archived")}
        >
          Archived
        </button>
      </div>

      {isLoading ? (
        <div className="loading-container" role="status" aria-live="polite">
          <div className="spinner" />
          <p>Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3 className="empty-state-title">No projects found</h3>
            <p className="empty-state-desc">
              {activeTab === "all"
                ? "No projects have been created yet."
                : `There are currently no ${activeTab} projects.`}
            </p>
            <Link href="/admin/projects/new" className="btn btn-primary">
              Create Project
            </Link>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table" aria-label="Projects Table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>Media</th>
                <th>Title &amp; Slug</th>
                <th>Category</th>
                <th>Client / Location</th>
                <th>Size / Year</th>
                <th>Status</th>
                <th>Homepage</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const isOperating = actionInProgressId === project.id || isHomepageUpdating;
                const thumbUrl =
                  project.mainMedia?.publicUrl ||
                  project.primaryImageUrl ||
                  project.media?.find((m) => m.isPrimary)?.publicUrl ||
                  project.media?.[0]?.publicUrl;

                return (
                  <tr key={project.id}>
                    <td>
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={project.primaryAlt || project.title}
                          className="table-thumb"
                        />
                      ) : (
                        <div className="table-thumb-placeholder">No media</div>
                      )}
                    </td>
                    <td>
                      <div className="project-title-cell">
                        <Link
                          href={`/admin/projects/${project.id}/edit`}
                          className="project-title-link"
                        >
                          {project.title}
                        </Link>
                        <span className="project-slug-text">
                          /projects/{project.slug}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {project.category || "—"}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: "0.85rem" }}>
                        <div style={{ fontWeight: 500 }}>{project.clientOrganization || "—"}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                          {project.location || "—"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: "0.85rem" }}>
                        <div>{project.size || "—"}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                          {project.completionYear ? `Completed ${project.completionYear}` : "—"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        status={project.status}
                        isFeaturedHomepage={project.isFeaturedHomepage}
                      />
                    </td>
                    <td>
                      {project.isFeaturedHomepage ? (
                        <span className="badge badge-featured">
                          Featured (#{project.homepageOrder})
                        </span>
                      ) : project.status === "published" ? (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Not Featured
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link
                          href={`/admin/projects/${project.id}/preview`}
                          className="btn btn-secondary btn-sm"
                          title="Preview public presentation"
                        >
                          Preview
                        </Link>
                        <Link
                          href={`/admin/projects/${project.id}/edit`}
                          className="btn btn-secondary btn-sm"
                          title="Edit project"
                        >
                          Edit
                        </Link>

                        {/* Homepage Feature Toggle */}
                        {project.status === "published" ? (
                          project.isFeaturedHomepage ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleRemoveFromHomepage(project.id)}
                              disabled={isOperating}
                              title="Remove from homepage"
                            >
                              Remove from Homepage
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleAddToHomepage(project)}
                              disabled={isOperating}
                              title="Feature on homepage"
                            >
                              Feature on Homepage
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={true}
                            title="Only published projects can be featured on the homepage"
                          >
                            Feature on Homepage
                          </button>
                        )}

                        {/* Lifecycle quick buttons */}
                        {project.status === "draft" && (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => handlePublish(project)}
                            disabled={isOperating}
                            title="Publish project"
                          >
                            Publish
                          </button>
                        )}

                        {project.status === "published" && (
                          <button
                            type="button"
                            className="btn btn-warning btn-sm"
                            onClick={() => handleUnpublish(project)}
                            disabled={isOperating}
                            title="Unpublish back to draft"
                          >
                            Unpublish
                          </button>
                        )}

                        {project.status !== "archived" && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleArchive(project)}
                            disabled={isOperating}
                            title="Archive project"
                          >
                            Archive
                          </button>
                        )}

                        {project.status === "archived" && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRestore(project)}
                            disabled={isOperating}
                            title="Restore to draft"
                          >
                            Restore
                          </button>
                        )}

                        {/* Delete button: only draft or archived */}
                        {(project.status === "draft" || project.status === "archived") && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => setProjectToDelete(project)}
                            disabled={isOperating}
                            title="Permanently delete project"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {projectToDelete && (
        <DeleteConfirmModal
          isOpen={true}
          projectTitle={projectToDelete.title}
          onConfirm={handleConfirmDelete}
          onCancel={() => setProjectToDelete(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
