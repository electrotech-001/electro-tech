import type { Metadata } from "next";
import { SolarBillAnalyzer } from "@/components/solar-bill-analyzer";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Solar Bill Analyzer | Electro Tech",
  description: "Upload or manually enter electricity consumption to receive a preliminary deterministic solar system recommendation for Pakistan.",
  alternates: { canonical: "/solar-bill-analyzer" },
  openGraph: {
    title: "Solar Bill Analyzer | Electro Tech",
    description: "Upload or manually enter electricity consumption to receive a preliminary deterministic solar system recommendation for Pakistan.",
    url: `${siteConfig.siteUrl}/solar-bill-analyzer`,
  },
};

export default function SolarBillAnalyzerPage() {
  return <SolarBillAnalyzer />;
}
