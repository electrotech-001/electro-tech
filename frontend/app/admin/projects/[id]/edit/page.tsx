import type { Metadata } from "next";
import { ProjectEditPage } from "@/components/admin/ProjectEditPage";
import { AdminProtectedShell } from "@/components/admin/AdminProtectedShell";

export const metadata: Metadata = {
  title: "Edit Project | Electro Tech Admin",
  robots: { index: false, follow: false },
};

export default async function AdminProjectEditRoute({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  return (
    <AdminProtectedShell>
      <ProjectEditPage projectId={resolvedParams.id} />
    </AdminProtectedShell>
  );
}
