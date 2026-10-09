import type { Metadata } from "next";
import { BillingLoginPage } from "@/components/billing/BillingLoginPage";

export const metadata: Metadata = {
  title: "Billing CMS Login | Electro Tech",
  robots: { index: false, follow: false },
};

export default function BillingLoginRoute() {
  return <BillingLoginPage />;
}
