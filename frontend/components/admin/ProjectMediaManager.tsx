import { useState, useRef, type ChangeEvent } from "react";
import type { ProjectImageItem, ProjectStatus } from "../../types/admin/project";
import {
  uploadAdminProjectMedia,
  updateAdminProjectMedia,
  deleteAdminProjectMedia,
  reorderAdminProjectMedia,
  setAdminProjectMediaPrimary,
  ApiError,
} from "../../lib/admin/api";

type ProjectMediaManagerProps = {
  projectId: string;
  media: ProjectImageItem[];
  projectStatus: ProjectStatus;
  onMediaChange: () => Promise<void> | void;
  disabled?: boolean;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_COUNT = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PendingUploadItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

export function ProjectMediaManager({
  projectId,
  media,
  projectStatus,
  onMediaChange,
  disabled = false,
}: ProjectMediaManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<PendingUploadItem[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [editAltText, setEditAltText] = useState("");
  const [editCaption, setEditCaption] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedImages = [...media].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalOccupied = sortedImages.length + pendingQueue.length;
  const isAtLimit = totalOccupied >= MAX_IMAGE_COUNT;
  const remainingCapacity = MAX_IMAGE_COUNT - sortedImages.length - pendingQueue.length;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setSuccess(null);

    const maxAllowed = MAX_IMAGE_COUNT - sortedImages.length - pendingQueue.length;
    if (maxAllowed <= 0) {
      setError(
        `This project already has ${sortedImages.length} image${sortedImages.length === 1 ? "" : "s"} (maximum ${MAX_IMAGE_COUNT}). Cannot add more.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (files.length > maxAllowed) {
      setError(
        `This project already has ${sortedImages.length} image${sortedImages.length === 1 ? "" : "s"}. You can add up to ${maxAllowed} more.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    const newItems: PendingUploadItem[] = [];

    for (const file of files) {
      if (!validMimes.includes(file.type)) {
        setError(`"${file.name}" has an unsupported format. Allowed: JPEG, PNG, or WebP.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        setError(`"${file.name}" exceeds 5 MB limit (${formatBytes(file.size)}).`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        status: "waiting",
      });
    }

    setPendingQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFromQueue = (id: string) => {
    setPendingQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUploadQueue = async () => {
    const waitingItems = pendingQueue.filter(
      (item) => item.status === "waiting" || item.status === "error",
    );
    if (waitingItems.length === 0 || isUploading) return;

    setError(null);
    setSuccess(null);
    setIsUploading(true);

    let currentImageCount = sortedImages.length;
    let anyError = false;

    for (const item of waitingItems) {
      setPendingQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "uploading", error: undefined } : q,
        ),
      );

      const isFirst = currentImageCount === 0;
      const defaultAlt = isFirst ? "Project primary image" : "";

      try {
        await uploadAdminProjectMedia(projectId, item.file, {
          altText: defaultAlt || undefined,
          isPrimary: isFirst,
        });

        currentImageCount += 1;
        setPendingQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
        );
      } catch (err) {
        anyError = true;
        const msg = err instanceof Error ? err.message : "Upload failed";
        setPendingQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "error", error: msg } : q)),
        );
        setError(`Upload failed for "${item.name}": ${msg}`);
      }
    }

    setIsUploading(false);
    await onMediaChange();

    // Remove successfully uploaded files from queue
    setPendingQueue((prev) => prev.filter((item) => item.status !== "done"));

    if (!anyError) {
      setSuccess("All selected images uploaded successfully.");
    }
  };

  const handleSetPrimary = async (item: ProjectImageItem) => {
    if (item.isPrimary || disabled) return;
    setError(null);
    setSuccess(null);

    try {
      setActionLoadingId(item.id);
      await setAdminProjectMediaPrimary(projectId, item.id);
      setSuccess("Main project image updated.");
      await onMediaChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary image.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (item: ProjectImageItem) => {
    if (disabled) return;
    if (projectStatus === "published") {
      if (sortedImages.length <= 1) {
        setError("Cannot delete the only image of a published project. Unpublish the project or upload another image first.");
        return;
      }
      if (item.isPrimary) {
        setError("Cannot delete the primary image of a published project. Designate another image as main before deleting this one.");
        return;
      }
    }

    if (!window.confirm("Are you sure you want to delete this image?")) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      setActionLoadingId(item.id);
      await deleteAdminProjectMedia(projectId, item.id);
      setSuccess("Image deleted successfully.");
      await onMediaChange();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to delete image.");
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedImages.length || disabled) return;

    const reordered = [...sortedImages];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const mediaIds = reordered.map((m) => m.id);

    setError(null);
    setSuccess(null);

    try {
      setActionLoadingId("reorder");
      await reorderAdminProjectMedia(projectId, mediaIds);
      await onMediaChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder images.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const startEditing = (item: ProjectImageItem) => {
    setEditingMediaId(item.id);
    setEditAltText(item.altText || "");
    setEditCaption(item.caption || "");
  };

  const cancelEditing = () => {
    setEditingMediaId(null);
    setEditAltText("");
    setEditCaption("");
  };

  const handleSaveMetadata = async (item: ProjectImageItem) => {
    setError(null);
    setSuccess(null);

    try {
      setActionLoadingId(item.id);
      await updateAdminProjectMedia(projectId, item.id, {
        altText: editAltText.trim() || null,
        caption: editCaption.trim() || null,
      });
      setSuccess("Image details updated.");
      setEditingMediaId(null);
      await onMediaChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update image details.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="project-media-manager">
      <div className="media-manager-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Project Images ({sortedImages.length} / {MAX_IMAGE_COUNT})
          </h3>
          <p className="form-hint">
            Upload 1 to 5 images (JPEG, PNG, WebP &le; 5 MB). At least 1 image is required for publishing.
            {remainingCapacity > 0
              ? ` Remaining capacity: ${remainingCapacity} image${remainingCapacity === 1 ? "" : "s"}.`
              : " Maximum capacity reached."}
          </p>
        </div>
        {!isAtLimit && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: "none" }}
              id="image-upload-input"
              disabled={disabled || isUploading}
            />
            <label
              htmlFor="image-upload-input"
              className={`btn btn-primary ${disabled || isUploading ? "disabled" : ""}`}
              style={{ cursor: disabled || isUploading ? "not-allowed" : "pointer" }}
            >
              {isUploading ? (
                <>
                  <span className="spinner-sm" /> Uploading...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Add Images
                </>
              )}
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-banner alert-success" role="status">
          <span>{success}</span>
        </div>
      )}

      {/* Pending Upload Queue */}
      {pendingQueue.length > 0 && (
        <div
          className="pending-queue-card"
          style={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.85rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)" }}>
                Selected Images ({pendingQueue.length})
              </h4>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                Ready to be uploaded to project storage.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleUploadQueue}
              disabled={isUploading || pendingQueue.every((q) => q.status === "done")}
            >
              {isUploading ? (
                <>
                  <span className="spinner-sm" /> Uploading...
                </>
              ) : (
                `Upload ${pendingQueue.length} Image${pendingQueue.length === 1 ? "" : "s"}`
              )}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {pendingQueue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 0.85rem",
                  backgroundColor: "var(--surface-subtle)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.85rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", overflow: "hidden" }}>
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--text)",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      maxWidth: "240px",
                    }}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    {formatBytes(item.size)}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {item.status === "waiting" && (
                    <span className="badge badge-draft">Waiting</span>
                  )}
                  {item.status === "uploading" && (
                    <span className="badge badge-featured">
                      <span className="spinner-sm" style={{ width: "10px", height: "10px" }} /> Uploading
                    </span>
                  )}
                  {item.status === "done" && (
                    <span className="badge badge-published">Uploaded</span>
                  )}
                  {item.status === "error" && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                      }}
                      title={item.error}
                    >
                      Failed
                    </span>
                  )}

                  {item.status !== "uploading" && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRemoveFromQueue(item.id)}
                      disabled={isUploading}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      aria-label={`Remove ${item.name}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedImages.length === 0 ? (
        <div className="empty-state" style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-lg)", padding: "2.5rem 1.5rem" }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 1rem", display: "block" }}
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <h4 className="empty-state-title">No Images Uploaded Yet</h4>
          <p className="empty-state-desc">
            Upload high-resolution project photography. At least one image is required to publish this project.
          </p>
          <label
            htmlFor="image-upload-input"
            className="btn btn-secondary"
            style={{ cursor: "pointer", display: "inline-flex" }}
          >
            Select Images
          </label>
        </div>
      ) : (
        <div className="media-list" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sortedImages.map((item, index) => {
            const isEditing = editingMediaId === item.id;
            const isLoading = actionLoadingId === item.id || actionLoadingId === "reorder";

            return (
              <div
                key={item.id}
                className="media-card"
                style={{
                  backgroundColor: "var(--surface)",
                  border: item.isPrimary
                    ? "2px solid var(--accent)"
                    : "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1rem",
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: "1.25rem",
                  alignItems: "center",
                  boxShadow: "var(--shadow-subtle)",
                }}
              >
                {/* Image Preview Box */}
                <div
                  style={{
                    width: "140px",
                    height: "95px",
                    backgroundColor: "var(--background)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--border)",
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.altText || "Project image"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>

                {/* Image Information & Inline Edit */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    {item.isPrimary ? (
                      <span className="badge badge-featured">Main Image</span>
                    ) : (
                      <span className="badge badge-draft">Order #{item.sortOrder + 1}</span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {item.mimeType}
                    </span>
                  </div>

                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "2px" }}>
                          Alt Text {item.isPrimary && <span className="required" style={{ color: "var(--color-danger)" }}>*</span>}
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                          value={editAltText}
                          onChange={(e) => setEditAltText(e.target.value)}
                          placeholder="Descriptive alt text for accessibility"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "2px" }}>
                          Caption (optional)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          placeholder="Optional caption displayed with image"
                        />
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveMetadata(item)}
                          disabled={isLoading}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={cancelEditing}
                          disabled={isLoading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        {item.altText ? `Alt: "${item.altText}"` : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No alt text provided</span>}
                      </p>
                      {item.caption && (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          Caption: {item.caption}
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: "0.4rem", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => startEditing(item)}
                        disabled={disabled || isLoading}
                      >
                        Edit Details
                      </button>
                    </div>
                  )}
                </div>

                {/* Image Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
                  {!item.isPrimary && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetPrimary(item)}
                      disabled={disabled || isLoading}
                      title="Designate as the main project card image"
                    >
                      Set as Main
                    </button>
                  )}

                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMove(index, "up")}
                      disabled={disabled || isLoading || index === 0}
                      aria-label="Move Up"
                      title="Move up"
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMove(index, "down")}
                      disabled={disabled || isLoading || index === sortedImages.length - 1}
                      aria-label="Move Down"
                      title="Move down"
                    >
                      &darr;
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleDelete(item)}
                      disabled={disabled || isLoading}
                      aria-label="Delete Image"
                      title="Delete image"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
