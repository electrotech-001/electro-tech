import type { Metadata } from "next";
import { ProjectsDirectory } from "@/components/projects-directory";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Projects Directory | ${siteConfig.company}`,
  description:
    "Explore our complete portfolio of solar installations, hybrid storage systems, and electrical infrastructure across Attock and surrounding regions.",
};

export default function ProjectsPage() {
  return <ProjectsDirectory />;
}
