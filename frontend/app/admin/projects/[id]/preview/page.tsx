import type { Metadata } from "next";
import { ProjectPreviewPage } from "@/components/admin/ProjectPreviewPage";
import { AdminProtectedShell } from "@/components/admin/AdminProtectedShell";

export const metadata: Metadata = {
  title: "Preview Project | Electro Tech Admin",
  robots: { index: false, follow: false },
};

export default async function AdminProjectPreviewRoute({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = (await Promise.resolve(params)) ?? {};
  const projectId =
    typeof resolvedParams === "object" && resolvedParams !== null
      ? (resolvedParams as { id?: string }).id
      : undefined;

  return (
    <AdminProtectedShell>
      <ProjectPreviewPage projectId={projectId} />
    </AdminProtectedShell>
  );
}
