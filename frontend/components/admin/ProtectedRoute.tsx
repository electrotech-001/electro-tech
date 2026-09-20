"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const fromQuery =
        pathname && pathname !== "/admin"
          ? `?from=${encodeURIComponent(pathname)}`
          : "";
      router.replace(`/admin/login${fromQuery}`);
    }
  }, [status, pathname, router]);

  if (status === "loading") {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Verifying admin session...</p>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="loading-container" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
