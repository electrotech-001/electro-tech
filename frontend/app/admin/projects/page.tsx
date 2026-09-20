import type { Metadata } from "next";
import { ProjectsListPage } from "@/components/admin/ProjectsListPage";
import { AdminProtectedShell } from "@/components/admin/AdminProtectedShell";

export const metadata: Metadata = {
  title: "Manage Projects | Electro Tech Admin",
  robots: { index: false, follow: false },
};

export default function AdminProjectsRoute() {
  return (
    <AdminProtectedShell>
      <ProjectsListPage />
    </AdminProtectedShell>
  );
}
