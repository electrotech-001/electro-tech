import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing CMS | Electro Tech",
  description: "Electro Tech billing sign-in for quotations, invoices and projects.",
  robots: { index: false, follow: false },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
