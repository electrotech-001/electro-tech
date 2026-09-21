"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Calendar,
  X,
  Building2,
  MapPin,
  Zap,
} from "lucide-react";
import type { PublicProject, PublicProjectImage } from "@/types/project";

export interface ProjectDetailModalProps {
  project: PublicProject | null;
  onClose: () => void;
}

export function ProjectDetailModal({ project, onClose }: ProjectDetailModalProps) {
  // Sort normalized images by sortOrder ASC
  const sortedImages = useMemo(() => {
    if (!project) return [];
    const list: PublicProjectImage[] =
      project.images && project.images.length > 0
        ? project.images
        : project.mainImage
        ? [project.mainImage]
        : [];

    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [project]);

  // Initial selected image index: find isPrimary === true, otherwise 0
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [isStoryExpanded, setIsStoryExpanded] = useState<boolean>(true);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Sync state whenever the project changes
  useEffect(() => {
    if (!project) return;
    const primaryIdx = sortedImages.findIndex((img) => img.isPrimary);
    setSelectedImageIndex(primaryIdx >= 0 ? primaryIdx : 0);
    setIsStoryExpanded(true);
  }, [project, sortedImages]);

  // Accessibility: Focus close button on mount
  useEffect(() => {
    if (project && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [project]);

  // Lock background page scroll while open, restore previous state on unmount
  useEffect(() => {
    if (!project) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [project]);

  // Close on Escape key press
  useEffect(() => {
    if (!project) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [project, onClose]);

  if (!project) return null;

  const activeImage = sortedImages[selectedImageIndex] || sortedImages[0] || null;
  const activeImageUrl = activeImage?.url || "/images/hero-solar-architectural.webp";
  const activeImageAlt = activeImage?.altText || project.title;

  return (
    <div
      className="project-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(17, 17, 15, 0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
      }}
    >
      <div
        className="project-modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "90vh",
          backgroundColor: "var(--surface, #FFFFFF)",
          borderRadius: "var(--radius-md, 14px)",
          border: "1px solid var(--border, #E6E4DF)",
          boxShadow: "0 20px 50px rgba(17, 17, 15, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          margin: "auto",
        }}
      >
        {/* Floating Close Button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close project details"
          className="project-modal-close-btn"
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            zIndex: 30,
            width: "38px",
            height: "38px",
            borderRadius: "9999px",
            backgroundColor: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid var(--border, #E6E4DF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--dark, #11110F)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.12)",
            transition: "background-color 0.15s, transform 0.15s",
          }}
        >
          <X size={20} strokeWidth={2.2} />
        </button>

        {/* Main Media Showcase */}
        <div
          className="project-modal-main-image-wrap"
          style={{
            position: "relative",
            width: "100%",
            height: "clamp(260px, 44vh, 440px)",
            backgroundColor: "var(--surface-subtle, #EFECE6)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src={activeImageUrl}
            alt={activeImageAlt}
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== "/images/hero-solar-architectural.webp") {
                target.src = "/images/hero-solar-architectural.webp";
              }
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />

          {project.isFeaturedHomepage && (
            <div
              style={{
                position: "absolute",
                top: "14px",
                left: "14px",
                backgroundColor: "var(--accent, #F5C400)",
                color: "var(--dark, #11110F)",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: "9999px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              }}
            >
              Featured
            </div>
          )}
        </div>

        {/* Image Thumbnails Gallery (supports 1 to 5 images) */}
        {sortedImages.length > 0 && (
          <div
            className="project-modal-gallery"
            style={{
              display: "flex",
              gap: "10px",
              padding: "12px 24px",
              backgroundColor: "var(--surface-subtle, #EFECE6)",
              borderBottom: "1px solid var(--border, #E6E4DF)",
              overflowX: "auto",
              flexShrink: 0,
            }}
            aria-label="Project images gallery"
          >
            {sortedImages.map((img, idx) => {
              const isSelected = idx === selectedImageIndex;
              return (
                <button
                  key={img.id || idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  aria-label={`View image ${idx + 1}: ${img.altText || project.title}`}
                  aria-pressed={isSelected}
                  style={{
                    width: "72px",
                    height: "48px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: isSelected
                      ? "2px solid var(--accent, #F5C400)"
                      : "1px solid var(--border, #E6E4DF)",
                    padding: 0,
                    cursor: "pointer",
                    backgroundColor: "var(--surface, #FFFFFF)",
                    position: "relative",
                    flexShrink: 0,
                    outline: isSelected ? "1px solid var(--accent, #F5C400)" : "none",
                    boxShadow: isSelected ? "0 0 0 2px rgba(245, 196, 0, 0.3)" : "none",
                    transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
                  }}
                >
                  <img
                    src={img.url}
                    alt={img.altText || `Thumbnail ${idx + 1}`}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== "/images/hero-solar-architectural.webp") {
                        target.src = "/images/hero-solar-architectural.webp";
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Project Information Panel */}
        <div
          className="project-modal-body"
          style={{
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
          {/* Header Row: Category (Left) and Completion Year (Right) */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--accent-hover, #D4A017)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {project.category || "Complete Solar System Installation"}
            </span>
            {project.completionYear && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "0.82rem",
                  fontWeight: 500,
                  color: "var(--text-muted, #6F706B)",
                }}
              >
                <Calendar size={13} aria-hidden="true" />
                Completed {project.completionYear}
              </span>
            )}
          </div>

          {/* Project Title */}
          <h2
            id="project-modal-title"
            style={{
              fontSize: "clamp(1.4rem, 2.4vw, 1.85rem)",
              fontWeight: 700,
              color: "var(--text, #111111)",
              lineHeight: 1.25,
              marginBottom: "16px",
              letterSpacing: "-0.02em",
            }}
          >
            {project.title}
          </h2>

          {/* Metadata Panel: Client, Location, Capacity */}
          {(project.clientOrganization || project.location || project.size) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                padding: "14px 18px",
                backgroundColor: "var(--surface-subtle, #EFECE6)",
                borderRadius: "var(--radius-sm, 8px)",
                border: "1px solid var(--border, #E6E4DF)",
                marginBottom: "20px",
              }}
            >
              {project.clientOrganization && (
                <div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #6F706B)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "3px",
                    }}
                  >
                    Client / Organization
                  </div>
                  <div
                    style={{
                      fontSize: "0.92rem",
                      fontWeight: 600,
                      color: "var(--text, #111111)",
                    }}
                  >
                    {project.clientOrganization}
                  </div>
                </div>
              )}
              {project.location && (
                <div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #6F706B)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "3px",
                    }}
                  >
                    Location
                  </div>
                  <div
                    style={{
                      fontSize: "0.92rem",
                      fontWeight: 500,
                      color: "var(--text, #111111)",
                    }}
                  >
                    {project.location}
                  </div>
                </div>
              )}
              {project.size && (
                <div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "var(--text-muted, #6F706B)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "3px",
                    }}
                  >
                    Capacity / Size
                  </div>
                  <div
                    style={{
                      fontSize: "0.92rem",
                      fontWeight: 700,
                      color: "var(--text, #111111)",
                    }}
                  >
                    {project.size}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Short Summary */}
          {(project.shortSummary || project.description) && (
            <div style={{ marginBottom: project.fullStory ? "20px" : "0" }}>
              <p
                style={{
                  fontSize: "0.96rem",
                  color: "var(--text, #111111)",
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {project.shortSummary || project.description}
              </p>
            </div>
          )}

          {/* Project Story & Technical Breakdown */}
          {project.fullStory && (
            <div
              style={{
                borderTop: "1px solid var(--border, #E6E4DF)",
                paddingTop: "18px",
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: isStoryExpanded ? "12px" : "0",
                }}
              >
                <h4
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text, #111111)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: 0,
                  }}
                >
                  Project Story &amp; Technical Breakdown
                </h4>
                <button
                  type="button"
                  onClick={() => setIsStoryExpanded((prev) => !prev)}
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "var(--surface-subtle, #EFECE6)",
                    border: "1px solid var(--border, #E6E4DF)",
                    color: "var(--text, #111111)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "background-color 0.15s ease",
                  }}
                  aria-expanded={isStoryExpanded}
                >
                  {isStoryExpanded ? "Collapse" : "Read Full Story"}
                </button>
              </div>

              {isStoryExpanded && (
                <div
                  style={{
                    fontSize: "0.92rem",
                    color: "var(--text-muted, #6F706B)",
                    lineHeight: 1.75,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {project.fullStory}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
