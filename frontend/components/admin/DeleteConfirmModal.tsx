import { useEffect } from "react";

type DeleteConfirmModalProps = {
  isOpen: boolean;
  projectTitle: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDeleting: boolean;
};

export function DeleteConfirmModal({
  isOpen,
  projectTitle,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title" className="modal-title">
          Delete Project
        </h3>
        <p className="modal-body">
          Are you sure you want to permanently delete <strong>{projectTitle}</strong>?
          <br />
          <br />
          This will permanently remove the project record and delete all associated image assets
          from storage. <strong>This action cannot be undone.</strong>
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="spinner-sm" /> Deleting...
              </>
            ) : (
              "Permanently Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
