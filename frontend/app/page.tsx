import { ElectroTechSite } from "@/components/electro-tech-site";
import { siteConfig } from "@/lib/site-config";

export default function Home() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.siteUrl).replace(/\/+$/, "");

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": ["Organization", "LocalBusiness"],
      name: siteConfig.company,
      url: siteUrl,
      logo: `${siteUrl}/logos/electrotech-icon.png`,
      image: `${siteUrl}/og.png`,
      description: siteConfig.descriptor,
      foundingDate: siteConfig.established,
      telephone: siteConfig.phoneDisplay,
      email: siteConfig.email,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Attock",
        addressRegion: "Punjab",
        addressCountry: "PK",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.company,
      url: siteUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      provider: { "@type": "Organization", name: siteConfig.company, url: siteUrl },
      serviceType: "Solar Energy & Electrical Infrastructure Solutions",
      description: "Solar installation, solar structures, electrical works and CCTV solutions.",
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <ElectroTechSite />
    </>
  );
}
