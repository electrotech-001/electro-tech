import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsDirectoryPage from "@/app/projects/page";
import type { PublicProject } from "@/types/project";

vi.mock("@/lib/projects", () => ({
  fetchHomepageProjects: vi.fn(),
  fetchAllPublishedProjects: vi.fn(),
}));

import { fetchAllPublishedProjects } from "@/lib/projects";

const mockAllPublishedProjects: PublicProject[] = [
  {
    id: "proj-1",
    slug: "commercial-rooftop-solar",
    title: "Commercial Rooftop Solar Phase 1",
    clientOrganization: "Attock Flour Mills Ltd.",
    location: "Kamra Road, Attock",
    size: "50 kW On-Grid",
    category: "Complete Solar System Installation",
    completionYear: 2026,
    shortSummary: "50 kW commercial rooftop solar installation in Attock.",
    fullStory: "Comprehensive commercial installation details...",
    description: "50 kW commercial solar array.",
    equipment: ["Inverter 50kW", "Tier 1 Solar Panels", "Distribution Board"],
    status: "published",
    isFeaturedHomepage: true,
    homepageOrder: 1,
    publishedAt: "2026-09-01T10:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    images: [
      {
        id: "img-1",
        url: "/images/projects/darul-islam-colony-attock-01.webp",
        altText: "Commercial Rooftop Array",
        caption: "Installed 2026",
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    mainImage: {
      id: "img-1",
      url: "/images/projects/darul-islam-colony-attock-01.webp",
      altText: "Commercial Rooftop Array",
      caption: "Installed 2026",
      isPrimary: true,
      sortOrder: 0,
    },
  },
  {
    id: "proj-2",
    slug: "residential-hybrid-solar",
    title: "Residential Hybrid Solar",
    clientOrganization: "Kamra Residence",
    location: "Kamra, Attock",
    size: "15 kW Hybrid",
    category: "Complete Solar System Installation",
    completionYear: 2025,
    shortSummary: "15 kW hybrid setup with battery storage in Kamra.",
    fullStory: null,
    description: "15 kW hybrid setup with battery storage.",
    equipment: ["Hybrid Inverter 15kW", "Lithium Battery 10kWh"],
    status: "published",
    isFeaturedHomepage: false,
    homepageOrder: null,
    publishedAt: "2026-09-02T10:00:00Z",
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
    images: [
      {
        id: "img-3",
        url: "/images/projects/she-shelter-girls-hostel-attock-01.webp",
        altText: "Rooftop Hybrid Solar",
        caption: null,
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    mainImage: {
      id: "img-3",
      url: "/images/projects/she-shelter-girls-hostel-attock-01.webp",
      altText: "Rooftop Hybrid Solar",
      caption: null,
      isPrimary: true,
      sortOrder: 0,
    },
  },
];

describe("ProjectsDirectoryPage (/projects)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the directory page with header, hero intro, and published projects", async () => {
    vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

    render(<ProjectsDirectoryPage />);

    // Check loading indicator first
    expect(screen.getByLabelText(/loading projects directory/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Projects Directory")).toBeDefined();
      expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });

    // Check metadata details and client organization
    expect(screen.getByText("Attock Flour Mills Ltd.")).toBeDefined();
    expect(screen.getByText("Kamra Residence")).toBeDefined();
    expect(screen.getByText("Kamra Road, Attock")).toBeDefined();
    expect(screen.getByText("50 kW On-Grid")).toBeDefined();
    expect(screen.getByText("2026")).toBeDefined();
    expect(screen.getByText("2025")).toBeDefined();

    // Equipment must NOT be displayed on public directory
    expect(screen.queryByText("Distribution Board")).toBeNull();

    // Check Home navigation link and request quote CTA
    expect(screen.getAllByText("Home").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/request a solar quote/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state when no published projects exist", async () => {
    vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce([]);

    render(<ProjectsDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("No Published Projects")).toBeDefined();
      expect(screen.getByText("Return to Home")).toBeDefined();
    });
  });

  it("renders error state when API call fails", async () => {
    vi.mocked(fetchAllPublishedProjects).mockRejectedValueOnce(new Error("Database connection lost"));

    render(<ProjectsDirectoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to Load Projects")).toBeDefined();
      expect(screen.getByText("Database connection lost")).toBeDefined();
      expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
    });
  });

  it("renders navbar navigation links with correct destinations and active state", async () => {
    vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

    const { container } = render(<ProjectsDirectoryPage />);

    // Desktop nav
    const desktopNav = container.querySelector("nav.desktop-nav-projects");
    expect(desktopNav).toBeDefined();

    const expectedTargets = [
      { label: "Home", href: "/" },
      { label: "About", href: "/#about" },
      { label: "Services", href: "/#services" },
      { label: "Projects", href: "/projects", active: true },
      { label: "Process", href: "/#process" },
      { label: "Contact", href: "/#contact" },
    ];

    const desktopAnchors = Array.from(desktopNav?.querySelectorAll("a") ?? []);
    for (const expected of expectedTargets) {
      const anchor = desktopAnchors.find((a) => a.textContent?.trim() === expected.label);
      expect(anchor).toBeDefined();
      expect(anchor?.getAttribute("href")).toBe(expected.href);
      if (expected.active) {
        expect(anchor?.style.fontWeight).toBe("600");
      }
    }

    // Header structure matching homepage
    const header = container.querySelector("header.site-header");
    expect(header).toBeDefined();
    const headerInner = container.querySelector(".header-inner");
    expect(headerInner).toBeDefined();

    // Logo anchor
    const logoAnchor = container.querySelector("header a.brand");
    expect(logoAnchor?.getAttribute("href")).toBe("/");

    // Menu button
    const menuButton = container.querySelector("button.menu-button");
    expect(menuButton).toBeDefined();
  });

  it("renders both Request a Solar Quote CTA buttons with href='/#contact' as semantic anchors", async () => {
    vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

    const { container } = render(<ProjectsDirectoryPage />);

    // 1. Desktop navbar CTA button (header-pill-cta matching homepage)
    const navbarCta = container.querySelector("header a.header-pill-cta");
    expect(navbarCta).toBeDefined();
    expect(navbarCta?.tagName.toLowerCase()).toBe("a");
    expect(navbarCta?.getAttribute("href")).toBe("/#contact");
    expect(navbarCta?.textContent).toContain("Request a Solar Quote");

    // 2. Bottom CTA section button
    const ctaSection = container.querySelector("section:has(.eyebrow)");
    const allCtaButtons = Array.from(container.querySelectorAll("a.button.button-dark"));
    const bottomCta = allCtaButtons.find((btn) => btn.closest("section") !== null && btn.textContent?.includes("Request a Solar Quote") && !btn.closest("nav") && !btn.classList.contains("header-pill-cta"));
    expect(bottomCta).toBeDefined();
    expect(bottomCta?.tagName.toLowerCase()).toBe("a");
    expect(bottomCta?.getAttribute("href")).toBe("/#contact");
    expect(bottomCta?.textContent).toContain("Request a Solar Quote");
  });
});
