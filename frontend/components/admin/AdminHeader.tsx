"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./useAuth";

export function AdminHeader() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/admin/login");
  };

  const isDashboardActive = pathname === "/admin";
  const isProjectsActive = pathname === "/admin/projects";
  const isNewProjectActive = pathname === "/admin/projects/new";

  return (
    <header className="admin-header">
      <div style={{ display: "flex", alignItems: "center" }}>
        <a href="/admin" className="admin-header-brand">
          <img
            src="/logos/electrotech-horizontal.png"
            alt="Electro Tech"
            className="admin-logo-img"
          />
          <span className="auth-badge" style={{ marginLeft: "0.25rem" }}>
            Admin
          </span>
        </a>

        <nav className="admin-nav" aria-label="Main Navigation">
          <a
            href="/admin"
            className={`admin-nav-link ${isDashboardActive ? "active" : ""}`}
          >
            Dashboard
          </a>
          <a
            href="/admin/projects"
            className={`admin-nav-link ${isProjectsActive ? "active" : ""}`}
          >
            Projects
          </a>
          <a
            href="/admin/projects/new"
            className={`admin-nav-link ${isNewProjectActive ? "active" : ""}`}
          >
            + New Project
          </a>
        </nav>
      </div>

      <div className="admin-header-user">
        <div className="admin-user-info">
          <div className="admin-user-name">
            {user?.displayName || "Administrator"}
          </div>
          <div className="admin-user-email">{user?.email}</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleSignOut}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
