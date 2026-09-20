"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import "./admin.css";

export function AdminRootWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="app-container">{children}</div>
    </AuthProvider>
  );
}
