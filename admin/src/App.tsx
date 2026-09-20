import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.js";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { AdminLayout } from "./components/AdminLayout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ProjectCreatePage } from "./pages/ProjectCreatePage.js";
import { ProjectEditPage } from "./pages/ProjectEditPage.js";
import { ProjectPreviewPage } from "./pages/ProjectPreviewPage.js";
import { ProjectsListPage } from "./pages/ProjectsListPage.js";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/new" element={<ProjectCreatePage />} />
            <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
            <Route path="/projects/:id/preview" element={<ProjectPreviewPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
