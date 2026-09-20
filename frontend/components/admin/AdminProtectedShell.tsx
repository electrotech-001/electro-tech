"use client";

import type { ReactNode } from "react";
import { ProtectedRoute } from "./ProtectedRoute";
import { AdminHeader } from "./AdminHeader";

export function AdminProtectedShell({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminHeader />
      <main className="admin-main">{children}</main>
    </ProtectedRoute>
  );
}
