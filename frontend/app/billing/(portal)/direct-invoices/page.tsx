import { redirect } from "next/navigation";

export default function DirectInvoicesPage() {
  redirect("/billing/invoices");
}
