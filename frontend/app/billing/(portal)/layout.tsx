"use client";

import { BillingShell } from "@/components/billing/BillingShell";
import type { ReactNode } from "react";

export default function BillingPortalLayout({ children }: { children: ReactNode }) {
  return <BillingShell>{children}</BillingShell>;
}
