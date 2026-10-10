import { CustomerProfilePage } from "@/components/billing/CustomerProfilePage";

export default async function BillingCustomerProfilePage({
  params,
}: {
  params: Promise<{ cnic: string }> | { cnic: string };
}) {
  const resolved = await Promise.resolve(params);
  return <CustomerProfilePage cnicKey={resolved.cnic} />;
}
