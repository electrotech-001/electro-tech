import type { Metadata } from "next";
import { LoginPage } from "@/components/admin/LoginPage";

export const metadata: Metadata = {
  title: "Admin Login | Electro Tech",
  robots: { index: false, follow: false },
};

export default function AdminLoginRoute() {
  return <LoginPage />;
}
