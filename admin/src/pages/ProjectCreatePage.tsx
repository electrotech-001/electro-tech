import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAdminProject } from "../lib/api.js";
import {
  clearProjectDraft,
  getProjectDraft,
  NEW_PROJECT_DRAFT_KEY,
  saveProjectDraft,
} from "../lib/draft-storage.js";
import {
  PROJECT_CATEGORIES,
  type CreateProjectPayload,
  type ProjectCategory,
} from "../types/project.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProjectCreatePage() {
  const navigate = useNavigate();

  // Restore saved draft from sessionStorage if available
  const [initialDraft] = useState(() => getProjectDraft(NEW_PROJECT_DRAFT_KEY));

  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [autoSlug, setAutoSlug] = useState(initialDraft?.autoSlug ?? true);
  const [slug, setSlug] = useState(initialDraft?.slug ?? "");
  const [clientOrganization, setClientOrganization] = useState(
    initialDraft?.clientOrganization ?? "",
  );
  const [location, setLocation] = useState(initialDraft?.location ?? "");
  const [size, setSize] = useState(initialDraft?.size ?? "");
  const [category, setCategory] = useState<ProjectCategory | "">(
    (initialDraft?.category as ProjectCategory) ?? "",
  );
  const [completionYear, setCompletionYear] = useState<string>(
    initialDraft?.completionYear ? String(initialDraft.completionYear) : "",
  );
  const [shortSummary, setShortSummary] = useState(
    initialDraft?.shortSummary ?? "",
  );
  const [fullStory, setFullStory] = useState(initialDraft?.fullStory ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Determine whether the user has entered any unsaved information
  const isDirty = Boolean(
    title.trim() ||
      slug.trim() ||
      clientOrganization.trim() ||
      location.trim() ||
      size.trim() ||
      category ||
      completionYear ||
      shortSummary.trim() ||
      fullStory.trim(),
  );

  // Persist draft to sessionStorage whenever fields change
  useEffect(() => {
    if (isDirty) {
      saveProjectDraft(NEW_PROJECT_DRAFT_KEY, {
        title,
        slug,
        autoSlug,
        clientOrganization,
        location,
        size,
        category: category || null,
        completionYear: completionYear ? parseInt(completionYear, 10) : null,
        shortSummary,
        fullStory,
      });
    } else {
      clearProjectDraft(NEW_PROJECT_DRAFT_KEY);
    }
  }, [
    isDirty,
    title,
    slug,
    autoSlug,
    clientOrganization,
    location,
    size,
    category,
    completionYear,
    shortSummary,
    fullStory,
  ]);

  // Warn administrator on page reload or tab close if unsaved work exists
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Project title is required.");
      return;
    }

    const payload: CreateProjectPayload = {
      title: trimmedTitle,
      slug: slug.trim() || undefined,
      clientOrganization: clientOrganization.trim() || null,
      location: location.trim() || null,
      size: size.trim() || null,
      category: category ? (category as ProjectCategory) : null,
      completionYear: completionYear ? parseInt(completionYear, 10) : null,
      shortSummary: shortSummary.trim() || null,
      fullStory: fullStory.trim() || null,
    };

    try {
      setIsSubmitting(true);
      const created = await createAdminProject(payload);

      // Clear local draft only on successful creation
      clearProjectDraft(NEW_PROJECT_DRAFT_KEY);

      // Navigate to project edit page where media can be uploaded
      navigate(`/projects/${created.id}/edit`, {
        state: { message: `Project "${created.title}" created successfully as draft.` },
      });
    } catch (err) {
      // Retain draft in sessionStorage upon failure so no work is lost
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1>Create New Project</h1>
            {isDirty && (
              <span className="badge badge-draft" title="You have unsaved changes">
                Unsaved changes
              </span>
            )}
          </div>
          <p>
            Create a new case study in draft status. Photos can be added after saving the project.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/projects" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Section 1: Core Information */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="card-title">1. Core Information</h2>
              <p className="card-desc">
                Basic project identification, client information, system capacity, and classification.
              </p>
            </div>
            <span className="badge badge-draft">Draft</span>
          </div>

          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Project Title <span className="required">*</span>
            </label>
            <input
              id="title"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Attock Commercial Plaza 50 kW Solar"
              required
              maxLength={150}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label htmlFor="slug" className="form-label" style={{ marginBottom: 0 }}>
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
                  disabled={isSubmitting}
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
                id="slug"
                type="text"
                className="form-input"
                style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="attock-commercial-plaza-50kw-solar"
                maxLength={100}
                disabled={isSubmitting}
              />
            </div>
            <span className="form-hint">
              Unique identifier used in the public website URL.
            </span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="clientOrganization" className="form-label">
                Client / Organization
              </label>
              <input
                id="clientOrganization"
                type="text"
                className="form-input"
                value={clientOrganization}
                onChange={(e) => setClientOrganization(e.target.value)}
                placeholder="e.g. Attock Flour Mills Ltd."
                maxLength={150}
                disabled={isSubmitting}
              />
              <span className="form-hint">Client or property name. Required for publishing.</span>
            </div>

            <div className="form-group">
              <label htmlFor="location" className="form-label">
                Location
              </label>
              <input
                id="location"
                type="text"
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Kamra Road, Attock"
                maxLength={150}
                disabled={isSubmitting}
              />
              <span className="form-hint">City / District / Area. Required for publishing.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="size" className="form-label">
                Capacity / Project Size
              </label>
              <input
                id="size"
                type="text"
                className="form-input"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 50 kW On-Grid System"
                maxLength={100}
                disabled={isSubmitting}
              />
              <span className="form-hint">System size or power capacity. Required for publishing.</span>
            </div>

            <div className="form-group">
              <label htmlFor="category" className="form-label">
                Category
              </label>
              <select
                id="category"
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                disabled={isSubmitting}
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
              <label htmlFor="completionYear" className="form-label">
                Completion Year
              </label>
              <input
                id="completionYear"
                type="number"
                min="2000"
                max={new Date().getFullYear() + 1}
                className="form-input"
                value={completionYear}
                onChange={(e) => setCompletionYear(e.target.value)}
                placeholder={String(new Date().getFullYear())}
                disabled={isSubmitting}
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
              <label htmlFor="shortSummary" className="form-label" style={{ marginBottom: 0 }}>
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
              id="shortSummary"
              className="form-textarea"
              value={shortSummary}
              onChange={(e) => setShortSummary(e.target.value)}
              placeholder="Brief 1-2 sentence overview of the installation, generation capacity, and key achievement (10–400 characters). Required for publishing."
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <span className="form-hint">
              Featured on project cards and summaries. Must be between 10 and 400 characters to publish.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="fullStory" className="form-label">
              Full Story / Project Details (Optional)
            </label>
            <textarea
              id="fullStory"
              className="form-textarea"
              value={fullStory}
              onChange={(e) => setFullStory(e.target.value)}
              placeholder="Comprehensive installation narrative: site challenges, engineering design, solar panels, inverters, battery storage, and client benefits..."
              rows={6}
              disabled={isSubmitting}
            />
            <span className="form-hint">
              Detailed technical writeup displayed on the full case study view.
            </span>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
          <Link to="/projects" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? "Creating Project..." : "Create Draft Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
