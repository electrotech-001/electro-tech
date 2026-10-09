import { notFound } from "next/navigation";
import { ModuleView } from "@/components/billing/ModuleView";
import { billingModules } from "@/lib/billing/modules";

export default async function BillingModulePage({
  params,
}: {
  params: Promise<{ section: string }> | { section: string };
}) {
  const resolved = await Promise.resolve(params);
  const section = resolved.section;
  const module = billingModules[section];
  if (!module) notFound();
  return <ModuleView module={module} />;
}
