"use client";

import { useEffect, useState } from "react";
import { fetchAdminProjects } from "../../lib/admin/api";
import { StatusBadge } from "./StatusBadge";
import type { AdminProject } from "../../types/admin/project";

export function DashboardPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchAdminProjects("all");
        if (mounted) {
          setProjects(data);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load project metrics.",
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const totalCount = projects.length;
  const publishedCount = projects.filter((p) => p.status === "published").length;
  const draftCount = projects.filter((p) => p.status === "draft").length;
  const archivedCount = projects.filter((p) => p.status === "archived").length;

  const recentProjects = [...projects]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1>Projects Overview</h1>
          <p>Monitor, manage, and publish commercial & residential solar installations</p>
        </div>
        <div className="page-actions">
          <a href="/admin/projects/new" className="btn btn-primary">
            + Create Project
          </a>
          <a href="/admin/projects" className="btn btn-secondary">
            View All Projects
          </a>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="loading-container" role="status" aria-live="polite">
          <div className="spinner" />
          <p>Loading dashboard metrics...</p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total Projects</span>
              <span className="stat-value">{totalCount}</span>
              <span className="stat-hint">Across all lifecycles</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Published</span>
              <span className="stat-value" style={{ color: "var(--color-success)" }}>
                {publishedCount}
              </span>
              <span className="stat-hint">Active on public website</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Drafts</span>
              <span className="stat-value" style={{ color: "var(--color-warning)" }}>
                {draftCount}
              </span>
              <span className="stat-hint">Unpublished / in progress</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Archived</span>
              <span className="stat-value" style={{ color: "var(--color-archived)" }}>
                {archivedCount}
              </span>
              <span className="stat-hint">Inactive / hidden from public</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Recently Updated Projects</h2>
                <p className="card-desc">Quick access to recently modified installations</p>
              </div>
              <a href="/admin/projects" className="btn btn-secondary btn-sm">
                See all
              </a>
            </div>

            {recentProjects.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-state-title">No projects found</h3>
                <p className="empty-state-desc">
                  Get started by creating your first solar project record.
                </p>
                <a href="/admin/projects/new" className="btn btn-primary">
                  Create Project
                </a>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "60px" }}>Image</th>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Size</th>
                      <th>Last Updated</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentProjects.map((project) => {
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
                              <div className="table-thumb-placeholder">No img</div>
                            )}
                          </td>
                          <td>
                            <div className="project-title-cell">
                              <a
                                href={`/admin/projects/${project.id}/edit`}
                                className="project-title-link"
                              >
                                {project.title}
                              </a>
                              <span className="project-slug-text">
                                /{project.slug}
                              </span>
                            </div>
                          </td>
                          <td>
                            <StatusBadge
                              status={project.status}
                              isFeaturedHomepage={project.isFeaturedHomepage}
                            />
                          </td>
                          <td>{project.location || "—"}</td>
                          <td>{project.size || "—"}</td>
                          <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </td>
                          <td>
                            <div className="table-actions">
                              <a
                                href={`/admin/projects/${project.id}/preview`}
                                className="btn btn-secondary btn-sm"
                              >
                                Preview
                              </a>
                              <a
                                href={`/admin/projects/${project.id}/edit`}
                                className="btn btn-secondary btn-sm"
                              >
                                Edit
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
