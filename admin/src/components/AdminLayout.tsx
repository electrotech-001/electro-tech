import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

export function AdminLayout() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="app-container">
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center" }}>
          <NavLink to="/" className="admin-header-brand">
            <img
              src="/logos/electrotech-horizontal.png"
              alt="Electro Tech"
              className="admin-logo-img"
            />
            <span className="auth-badge" style={{ marginLeft: "0.25rem" }}>
              Admin
            </span>
          </NavLink>

          <nav className="admin-nav" aria-label="Main Navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `admin-nav-link ${isActive ? "active" : ""}`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/projects"
              end
              className={({ isActive }) =>
                `admin-nav-link ${isActive ? "active" : ""}`
              }
            >
              Projects
            </NavLink>
            <NavLink
              to="/projects/new"
              className={({ isActive }) =>
                `admin-nav-link ${isActive ? "active" : ""}`
              }
            >
              + New Project
            </NavLink>
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

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
