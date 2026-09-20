import { useState, useRef, type ChangeEvent } from "react";
import type { ProjectImageSlot } from "../../types/admin/project";

type ImageSlotManagerProps = {
  slot: ProjectImageSlot;
  imageUrl: string | null;
  altText?: string | null;
  position?: string;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
  disabled?: boolean;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function ImageSlotManager({
  slot,
  imageUrl,
  altText,
  position = "center",
  onUpload,
  onDelete,
  disabled = false,
}: ImageSlotManagerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const slotLabel = slot === "primary" ? "Primary Image" : "Secondary Image";
  const slotHint =
    slot === "primary"
      ? "Required for publishing. Displayed in project card grid."
      : "Optional. Displayed when project card is expanded.";

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate size on client before uploading
    if (file.size > MAX_FILE_BYTES) {
      setError("File exceeds the 5 MB size limit.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate type on client
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are allowed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setIsUploading(true);
      await onUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!imageUrl || isDeleting) return;
    setError(null);

    try {
      setIsDeleting(true);
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="image-slot-card">
      <div className="image-slot-header">
        <div>
          <h4 className="image-slot-title">{slotLabel}</h4>
          <p className="form-hint">{slotHint}</p>
        </div>
        {imageUrl ? (
          <span className="badge badge-published">Uploaded</span>
        ) : (
          <span className="badge badge-draft">Empty</span>
        )}
      </div>

      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="image-preview-box">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={altText || `${slotLabel} preview`}
            className="image-preview-img"
            style={{ objectPosition: position }}
          />
        ) : (
          <div className="image-preview-empty">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span>No image uploaded</span>
          </div>
        )}
      </div>

      <div className="image-slot-actions">
        <div className="image-upload-row">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="image-file-input"
            id={`file-input-${slot}`}
            disabled={disabled || isUploading || isDeleting}
          />

          <label
            htmlFor={`file-input-${slot}`}
            className={`btn btn-secondary ${disabled || isUploading ? "disabled" : ""}`}
            style={{ cursor: disabled || isUploading ? "not-allowed" : "pointer", flex: 1 }}
          >
            {isUploading ? (
              <>
                <span className="spinner-sm" /> Uploading...
              </>
            ) : imageUrl ? (
              "Replace Image"
            ) : (
              "Upload Image"
            )}
          </label>

          {imageUrl && (
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={handleDelete}
              disabled={disabled || isUploading || isDeleting}
              aria-label={`Delete ${slotLabel}`}
            >
              {isDeleting ? <span className="spinner-sm" /> : "Delete"}
            </button>
          )}
        </div>
        <p className="form-hint" style={{ textAlign: "center" }}>
          JPEG, PNG, or WebP &bull; Max 5 MB
        </p>
      </div>
    </div>
  );
}
