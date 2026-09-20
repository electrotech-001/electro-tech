import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAdminProjectById } from "../lib/api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { AdminProject, ProjectImageItem } from "../types/project.js";

export function ProjectPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<AdminProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id) return;
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchAdminProjectById(id);
        if (mounted) {
          setProject(data);
          const images = data.images || [];
          const primaryIdx = images.findIndex((img) => img.isPrimary);
          setSelectedImageIndex(primaryIdx >= 0 ? primaryIdx : 0);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load project.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (isLoading) {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Loading project preview...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Project Not Found</h2>
          <p className="empty-state-desc">The project could not be found.</p>
          <Link to="/projects" className="btn btn-primary">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const images: ProjectImageItem[] = project.images || [];
  const activeImage = images[selectedImageIndex] || project.mainImage || images[0] || null;
  const activeImageUrl = activeImage?.url || null;
  const activeAlt = activeImage?.altText || project.title;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <Link to={`/projects/${project.id}/edit`} className="btn btn-secondary btn-sm">
              &larr; Back to Editor
            </Link>
            <StatusBadge
              status={project.status}
              isFeaturedHomepage={project.isFeaturedHomepage}
            />
          </div>
          <h1>Public Presentation Preview</h1>
          <p>
            Simulates the interactive case study card as presented to visitors on the Electro Tech website.
          </p>
        </div>

        <div className="page-actions">
          <Link to={`/projects/${project.id}/edit`} className="btn btn-primary">
            Edit Details
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Website Preview Container */}
      <div className="preview-container" style={{ maxWidth: "880px", margin: "0 auto" }}>
        <article
          className={`preview-card ${isExpanded ? "expanded" : ""}`}
          style={{
            background: "var(--surface, #FFFFFF)",
            border: "1px solid var(--border, #E6E4DF)",
            borderRadius: "var(--radius-md, 14px)",
            overflow: "hidden",
            boxShadow: "var(--shadow-card, 0 4px 20px rgba(17, 17, 15, 0.05))",
          }}
        >
          {/* Main Media Showcase */}
          <div
            className="preview-image-box"
            style={{
              position: "relative",
              height: "380px",
              backgroundColor: "var(--surface-subtle, #EFECE6)",
              overflow: "hidden",
            }}
          >
            {activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt={activeAlt}
                className="preview-image"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted, #6F706B)",
                  fontSize: "0.9rem",
                }}
              >
                No images uploaded
              </div>
            )}
          </div>

          {/* Media Thumbnails Strip */}
          {images.length > 1 && (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--surface-subtle, #EFECE6)",
                borderBottom: "1px solid var(--border, #E6E4DF)",
                overflowX: "auto",
              }}
            >
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  style={{
                    width: "72px",
                    height: "48px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: idx === selectedImageIndex ? "2px solid var(--accent, #F5C400)" : "1px solid var(--border, #E6E4DF)",
                    padding: 0,
                    cursor: "pointer",
                    backgroundColor: "var(--surface, #FFFFFF)",
                    position: "relative",
                    flexShrink: 0,
                  }}
                  title={img.altText || `Image ${idx + 1}`}
                >
                  <img
                    src={img.url}
                    alt={img.altText || `Thumbnail ${idx + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Case Study Content */}
          <div className="preview-info" style={{ padding: "1.75rem" }}>
            {/* Category & Status */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--accent, #F5C400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {project.category || "Solar Installation"}
              </span>
              {project.completionYear && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #6F706B)" }}>
                  Completed {project.completionYear}
                </span>
              )}
            </div>

            <h3 className="preview-title" style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "var(--text, #111111)" }}>
              <span>{project.title}</span>
            </h3>

            {/* Metadata Pills */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
                padding: "1rem",
                backgroundColor: "var(--surface-subtle, #EFECE6)",
                borderRadius: "var(--radius-sm, 8px)",
                border: "1px solid var(--border, #E6E4DF)",
                marginBottom: "1.25rem",
              }}
            >
              {project.clientOrganization && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted, #6F706B)", textTransform: "uppercase", fontWeight: 600 }}>
                    Client / Organization
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text, #111111)", fontWeight: 500 }}>
                    {project.clientOrganization}
                  </div>
                </div>
              )}

              {project.location && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted, #6F706B)", textTransform: "uppercase", fontWeight: 600 }}>
                    Location
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text, #111111)", fontWeight: 500 }}>
                    {project.location}
                  </div>
                </div>
              )}

              {project.size && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted, #6F706B)", textTransform: "uppercase", fontWeight: 600 }}>
                    Capacity / Size
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "var(--text, #111111)", fontWeight: 600 }}>
                    {project.size}
                  </div>
                </div>
              )}
            </div>

            {/* Short Summary */}
            {project.shortSummary ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <p style={{ fontSize: "1rem", color: "var(--text, #111111)", lineHeight: 1.6, fontWeight: 400 }}>
                  {project.shortSummary}
                </p>
              </div>
            ) : project.description ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <p style={{ fontSize: "0.95rem", color: "var(--text-muted, #6F706B)", lineHeight: 1.6 }}>
                  {project.description}
                </p>
              </div>
            ) : null}

            {/* Full Story Section */}
            {project.fullStory && (
              <div style={{ borderTop: "1px solid var(--border, #E6E4DF)", paddingTop: "1.25rem", marginTop: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text, #111111)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
                    Project Story &amp; Technical Breakdown
                  </h4>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                  >
                    {isExpanded ? "Collapse" : "Read Full Story"}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ fontSize: "0.9rem", color: "var(--text-muted, #6F706B)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {project.fullStory}
                  </div>
                )}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
