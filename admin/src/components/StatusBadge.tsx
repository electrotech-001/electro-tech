import type { ProjectStatus } from "../types/project.js";

type StatusBadgeProps = {
  status: ProjectStatus;
  isFeaturedHomepage?: boolean;
};

export function StatusBadge({ status, isFeaturedHomepage }: StatusBadgeProps) {
  const getBadgeClass = (s: ProjectStatus) => {
    switch (s) {
      case "published":
        return "badge badge-published";
      case "draft":
        return "badge badge-draft";
      case "archived":
        return "badge badge-archived";
      default:
        return "badge";
    }
  };

  const getLabel = (s: ProjectStatus) => {
    switch (s) {
      case "published":
        return "Published";
      case "draft":
        return "Draft";
      case "archived":
        return "Archived";
      default:
        return s;
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span className={getBadgeClass(status)}>{getLabel(status)}</span>
      {isFeaturedHomepage && (
        <span className="badge badge-featured" title="Featured on website homepage">
          Homepage
        </span>
      )}
    </div>
  );
}
