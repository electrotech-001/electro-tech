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
    >
      <div
        className="project-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close project details"
          className="project-modal-close-btn"
        >
          <X size={20} strokeWidth={2.2} />
        </button>

        {/* Main Media Showcase */}
        <div className="project-modal-main-image-wrap">
          <img
            src={activeImageUrl}
            alt={activeImageAlt}
            className="project-modal-main-img"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== "/images/hero-solar-architectural.webp") {
                target.src = "/images/hero-solar-architectural.webp";
              }
            }}
          />

          {project.isFeaturedHomepage && (
            <div className="project-modal-featured-badge">
              Featured
            </div>
          )}
        </div>

        {/* Image Thumbnails Gallery (supports 1 to 5 images) */}
        {sortedImages.length > 0 && (
          <div
            className="project-modal-gallery"
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
                  className={`project-modal-thumb-btn ${isSelected ? "is-selected" : ""}`}
                >
                  <img
                    src={img.url}
                    alt={img.altText || `Thumbnail ${idx + 1}`}
                    className="project-modal-thumb-img"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== "/images/hero-solar-architectural.webp") {
                        target.src = "/images/hero-solar-architectural.webp";
                      }
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Project Information Panel */}
        <div className="project-modal-body">
          {/* Header Row: Category (Left) and Completion Year (Right) */}
          <div className="project-modal-header-meta">
            <span className="project-modal-category">
              {project.category || "Complete Solar System Installation"}
            </span>
            {project.completionYear && (
              <span className="project-modal-year">
                <Calendar size={13} aria-hidden="true" />
                Completed {project.completionYear}
              </span>
            )}
          </div>

          {/* Project Title */}
          <h2 id="project-modal-title" className="project-modal-title">
            {project.title}
          </h2>

          {/* Metadata Panel: Client, Location, Capacity */}
          {(project.clientOrganization || project.location || project.size) && (
            <div className="project-modal-meta-grid">
              {project.clientOrganization && (
                <div className="project-modal-meta-cell">
                  <span className="project-modal-meta-label">Client / Organization</span>
                  <span className="project-modal-meta-val bold">
                    {project.clientOrganization}
                  </span>
                </div>
              )}
              {project.location && (
                <div className="project-modal-meta-cell">
                  <span className="project-modal-meta-label">Location</span>
                  <span className="project-modal-meta-val">
                    {project.location}
                  </span>
                </div>
              )}
              {project.size && (
                <div className="project-modal-meta-cell">
                  <span className="project-modal-meta-label">Capacity / Size</span>
                  <span className="project-modal-meta-val bold">
                    {project.size}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Short Summary */}
          {(project.shortSummary || project.description) && (
            <div className="project-modal-summary">
              <p>
                {project.shortSummary || project.description}
              </p>
            </div>
          )}

          {/* Project Story & Technical Breakdown */}
          {project.fullStory && (
            <div className="project-modal-story-section">
              <div className="project-modal-story-header">
                <h4 className="project-modal-story-title">
                  Project Story &amp; Technical Breakdown
                </h4>
                <button
                  type="button"
                  onClick={() => setIsStoryExpanded((prev) => !prev)}
                  className="project-modal-story-toggle"
                  aria-expanded={isStoryExpanded}
                >
                  {isStoryExpanded ? "Collapse" : "Read Full Story"}
                </button>
              </div>

              {isStoryExpanded && (
                <div className="project-modal-story-content">
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
