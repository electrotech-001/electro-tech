import { apiUrl } from "./api-origin";
import type { PublicProject } from "../types/project";

export async function fetchHomepageProjects(): Promise<PublicProject[]> {
  const url = apiUrl("/api/projects?featured=home");
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch homepage projects: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchAllPublishedProjects(): Promise<PublicProject[]> {
  const url = apiUrl("/api/projects");
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
