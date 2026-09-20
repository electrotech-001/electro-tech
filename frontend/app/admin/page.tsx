import type { Metadata } from "next";
import { DashboardPage } from "@/components/admin/DashboardPage";
import { AdminProtectedShell } from "@/components/admin/AdminProtectedShell";

export const metadata: Metadata = {
  title: "Admin Dashboard | Electro Tech",
  robots: { index: false, follow: false },
};

export default function AdminDashboardRoute() {
  return (
    <AdminProtectedShell>
      <DashboardPage />
    </AdminProtectedShell>
  );
}
