import { useAuth } from "../auth/useAuth.js";

export function AdminDashboardPage() {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="app-container">
      <header className="admin-header">
        <div className="admin-header-brand">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0284c7"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className="admin-header-title">Electro Tech Admin</span>
          <span className="admin-header-badge">Portal</span>
        </div>

        <div className="admin-header-user">
          <div className="admin-user-info">
            <div className="admin-user-name">{user?.displayName || "Administrator"}</div>
            <div className="admin-user-email">{user?.email}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSignOut}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-card">
          <h2 className="admin-card-title">Project Management</h2>
          <p className="admin-card-desc">
            Coming in the next implementation phase.
          </p>
        </div>
      </main>
    </div>
  );
}
