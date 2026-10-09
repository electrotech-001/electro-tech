import type { LucideIcon } from "lucide-react";
import {
  FileSignature,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Smartphone,
  SunMedium,
  Users,
  Wallet,
} from "lucide-react";

export type BillingNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type BillingNavGroup = {
  label: string;
  items: BillingNavItem[];
};

export const billingNav: BillingNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/billing", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/billing/quotations", label: "Quotations", icon: FileText },
      { href: "/billing/projects", label: "Projects in Process", icon: SunMedium },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/billing/invoices", label: "Invoices", icon: Receipt },
      { href: "/billing/payments", label: "Receive Payments", icon: Wallet },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/billing/agreements", label: "Agreements", icon: FileSignature },
      { href: "/billing/guarantors", label: "Guarantors", icon: Users },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { href: "/billing/whatsapp", label: "Connection", icon: Smartphone },
      { href: "/billing/templates", label: "Templates", icon: MessageCircle },
    ],
  },
];

export function isBillingNavActive(pathname: string, item: BillingNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
