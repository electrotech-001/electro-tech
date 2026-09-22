import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.siteUrl).replace(/\/+$/, "");
  return [
    {
      url: `${base}/`,
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${base}/projects`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/solar-bill-analyzer`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
