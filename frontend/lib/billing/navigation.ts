import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FilePlus,
  FileSignature,
  FileText,
  ScrollText,
  IdCard,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  BadgePercent,
  CircleCheck,
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
    label: "Direct Invoices",
    items: [
      { href: "/billing/direct-invoices", label: "Direct Invoices", icon: FilePlus, exact: true },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/billing/profiles", label: "Customer Profiles", icon: IdCard },
      { href: "/billing/ledger", label: "Payment Ledger", icon: BookOpen },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/billing/invoices", label: "Pending Invoices", icon: Receipt, exact: true },
      { href: "/billing/invoices/completed", label: "Completed Invoices", icon: CircleCheck },
      { href: "/billing/payments", label: "Receive Payments", icon: Wallet },
      { href: "/billing/discounts", label: "Discounts", icon: BadgePercent },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/billing/agreements", label: "Agreements", icon: FileSignature },
      { href: "/billing/guarantors", label: "Guarantors", icon: Users },
      { href: "/billing/terms", label: "Terms & Conditions", icon: ScrollText },
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
