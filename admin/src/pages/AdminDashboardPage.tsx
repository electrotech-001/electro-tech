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
          <img
            src="/logos/electrotech-horizontal-dark.png"
            alt="Electro Tech"
            className="admin-logo-img"
          />
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
            Projects management interface.
          </p>
        </div>
      </main>
    </div>
  );
}
