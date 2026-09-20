import type { Metadata } from "next";
import { ProjectCreatePage } from "@/components/admin/ProjectCreatePage";
import { AdminProtectedShell } from "@/components/admin/AdminProtectedShell";

export const metadata: Metadata = {
  title: "Create Project | Electro Tech Admin",
  robots: { index: false, follow: false },
};

export default function AdminProjectCreateRoute() {
  return (
    <AdminProtectedShell>
      <ProjectCreatePage />
    </AdminProtectedShell>
  );
}
