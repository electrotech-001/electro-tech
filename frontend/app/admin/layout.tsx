import type { Metadata } from "next";
import { AdminRootWrapper } from "@/components/admin/AdminRootWrapper";

export const metadata: Metadata = {
  title: "Admin Portal | Electro Tech",
  description: "Electro Tech Internal Project and Content Administration Portal",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminRootWrapper>{children}</AdminRootWrapper>;
}
