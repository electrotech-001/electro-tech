/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F5F2",
};

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.siteUrl).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Electro Tech | Solar Energy & Electrical Solutions",
  description: "Electro Tech provides solar system installation, solar structures, electrical works and CCTV solutions for residential, commercial and institutional projects.",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/logos/electrotech-icon.png", sizes: "500x500", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: `${siteUrl}/`,
    siteName: "Electro Tech",
    title: "Powering Progress With Smarter Energy | Electro Tech",
    description: "Solar installation, structures and electrical infrastructure for homes, businesses and institutions.",
    images: [{ url: `${siteUrl}/og.png`, width: 1536, height: 896, alt: "Electro Tech smart solar energy solutions" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Powering Progress With Smarter Energy | Electro Tech",
    description: "Electrical and solar solutions for homes, businesses and institutions.",
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
