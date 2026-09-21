import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  describe("Project Detail Modal Overlay", () => {
    it("opens modal dialog when project card is clicked, displaying full project details and locking scroll", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      const { container } = render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      // Initially no dialog
      expect(screen.queryByRole("dialog")).toBeNull();

      // Click card
      const card = screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i);
      fireEvent.click(card);

      // Dialog is open with accessibility attributes
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("project-modal-title");

      const dialogScope = within(dialog);

      // Verify title, category, year
      const modalTitle = container.querySelector("#project-modal-title");
      expect(modalTitle?.textContent).toBe("Commercial Rooftop Solar Phase 1");
      expect(dialogScope.getByText("Completed 2026")).toBeDefined();

      // Verify metadata panel
      expect(dialogScope.getByText("Client / Organization")).toBeDefined();
      expect(dialogScope.getByText("Attock Flour Mills Ltd.")).toBeDefined();
      expect(dialogScope.getByText("Location")).toBeDefined();
      expect(dialogScope.getByText("Kamra Road, Attock")).toBeDefined();
      expect(dialogScope.getByText("Capacity / Size")).toBeDefined();
      expect(dialogScope.getByText("50 kW On-Grid")).toBeDefined();

      // Verify short summary
      expect(dialogScope.getByText("50 kW commercial rooftop solar installation in Attock.")).toBeDefined();

      // Verify full story & technical breakdown
      expect(dialogScope.getByText("Project Story & Technical Breakdown")).toBeDefined();
      expect(dialogScope.getByText("Comprehensive commercial installation details...")).toBeDefined();

      // Verify scroll lock
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("supports keyboard opening via Enter or Space key on project card", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      const card = screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i);

      // Press Enter
      fireEvent.keyDown(card, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeDefined();

      // Close modal
      const closeBtn = screen.getByLabelText(/Close project details/i);
      fireEvent.click(closeBtn);
      expect(screen.queryByRole("dialog")).toBeNull();

      // Press Space
      fireEvent.keyDown(card, { key: " " });
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    it("renders image thumbnails and switches main image on thumbnail click for multi-image project", async () => {
      const multiImageProject: PublicProject = {
        ...mockAllPublishedProjects[0],
        id: "proj-multi-2",
        title: "Two-Image Solar Project",
        images: [
          {
            id: "img-b",
            url: "https://example.com/panel-angle.webp",
            altText: "Panel Angle View",
            caption: null,
            isPrimary: false,
            sortOrder: 1,
          },
          {
            id: "img-a",
            url: "https://example.com/main-view.webp",
            altText: "Main Rooftop View",
            caption: null,
            isPrimary: true,
            sortOrder: 0,
          },
        ],
        mainImage: {
          id: "img-a",
          url: "https://example.com/main-view.webp",
          altText: "Main Rooftop View",
          caption: null,
          isPrimary: true,
          sortOrder: 0,
        },
      };

      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce([multiImageProject]);

      const { container } = render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Two-Image Solar Project")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Two-Image Solar Project/i));

      // Primary image should be initially active in the showcase
      const mainImage = container.querySelector(".project-modal-main-image-wrap img") as HTMLImageElement;
      expect(mainImage).toBeDefined();
      expect(mainImage.getAttribute("src")).toBe("https://example.com/main-view.webp");

      // Gallery should have 2 thumbnail buttons
      const galleryButtons = container.querySelectorAll(".project-modal-gallery button");
      expect(galleryButtons.length).toBe(2);

      // First thumbnail is pressed (selected)
      expect(galleryButtons[0].getAttribute("aria-pressed")).toBe("true");
      expect(galleryButtons[1].getAttribute("aria-pressed")).toBe("false");

      // Click second thumbnail
      fireEvent.click(galleryButtons[1]);

      // Main image updates to second image url
      expect(mainImage.getAttribute("src")).toBe("https://example.com/panel-angle.webp");
      expect(galleryButtons[1].getAttribute("aria-pressed")).toBe("true");
      expect(galleryButtons[0].getAttribute("aria-pressed")).toBe("false");
    });

    it("works cleanly for 1-image project with exactly 1 thumbnail and full story", async () => {
      const singleImageProject: PublicProject = {
        ...mockAllPublishedProjects[0],
        id: "proj-single",
        title: "Single Image Project",
        images: [
          {
            id: "img-solo",
            url: "https://example.com/single-shot.webp",
            altText: "Single Shot Installation",
            caption: null,
            isPrimary: true,
            sortOrder: 0,
          },
        ],
      };

      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce([singleImageProject]);

      const { container } = render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Single Image Project")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Single Image Project/i));

      // 1 thumbnail rendered with yellow accent selected state
      const galleryButtons = container.querySelectorAll(".project-modal-gallery button");
      expect(galleryButtons.length).toBe(1);
      expect(galleryButtons[0].getAttribute("aria-pressed")).toBe("true");

      const mainImage = container.querySelector(".project-modal-main-image-wrap img") as HTMLImageElement;
      expect(mainImage.getAttribute("src")).toBe("https://example.com/single-shot.webp");
    });

    it("works cleanly for 5-image project maintaining sortOrder", async () => {
      const fiveImageProject: PublicProject = {
        ...mockAllPublishedProjects[0],
        id: "proj-five",
        title: "Five Image Project",
        images: [
          { id: "img-5", url: "https://example.com/img5.webp", altText: "Fifth", caption: null, isPrimary: false, sortOrder: 4 },
          { id: "img-2", url: "https://example.com/img2.webp", altText: "Second", caption: null, isPrimary: false, sortOrder: 1 },
          { id: "img-1", url: "https://example.com/img1.webp", altText: "First", caption: null, isPrimary: true, sortOrder: 0 },
          { id: "img-4", url: "https://example.com/img4.webp", altText: "Fourth", caption: null, isPrimary: false, sortOrder: 3 },
          { id: "img-3", url: "https://example.com/img3.webp", altText: "Third", caption: null, isPrimary: false, sortOrder: 2 },
        ],
      };

      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce([fiveImageProject]);

      const { container } = render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Five Image Project")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Five Image Project/i));

      const galleryButtons = container.querySelectorAll(".project-modal-gallery button");
      expect(galleryButtons.length).toBe(5);

      // Verify thumbnails are rendered in sortOrder: 0, 1, 2, 3, 4
      const thumbnailImages = container.querySelectorAll(".project-modal-gallery button img");
      expect(thumbnailImages[0].getAttribute("src")).toBe("https://example.com/img1.webp");
      expect(thumbnailImages[1].getAttribute("src")).toBe("https://example.com/img2.webp");
      expect(thumbnailImages[2].getAttribute("src")).toBe("https://example.com/img3.webp");
      expect(thumbnailImages[3].getAttribute("src")).toBe("https://example.com/img4.webp");
      expect(thumbnailImages[4].getAttribute("src")).toBe("https://example.com/img5.webp");
    });

    it("allows toggling full project story expand and collapse", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i));

      // Initially expanded
      expect(screen.getByText("Comprehensive commercial installation details...")).toBeDefined();
      const toggleBtn = screen.getByRole("button", { name: /Collapse/i });
      expect(toggleBtn).toBeDefined();

      // Collapse story
      fireEvent.click(toggleBtn);
      expect(screen.queryByText("Comprehensive commercial installation details...")).toBeNull();
      expect(screen.getByRole("button", { name: /Read Full Story/i })).toBeDefined();

      // Re-expand story
      fireEvent.click(screen.getByRole("button", { name: /Read Full Story/i }));
      expect(screen.getByText("Comprehensive commercial installation details...")).toBeDefined();
    });

    it("closes modal when close button is clicked and restores body scroll", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i));
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(document.body.style.overflow).toBe("hidden");

      const closeBtn = screen.getByLabelText(/Close project details/i);
      fireEvent.click(closeBtn);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.body.style.overflow).toBe("");
    });

    it("closes modal when Escape key is pressed", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i));
      expect(screen.getByRole("dialog")).toBeDefined();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes modal when clicking backdrop but not when clicking inside modal panel", async () => {
      vi.mocked(fetchAllPublishedProjects).mockResolvedValueOnce(mockAllPublishedProjects);

      const { container } = render(<ProjectsDirectoryPage />);

      await waitFor(() => {
        expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      });

      fireEvent.click(screen.getByLabelText(/View details for Commercial Rooftop Solar Phase 1/i));
      expect(screen.getByRole("dialog")).toBeDefined();

      // Click inside panel -> stays open
      const panel = container.querySelector(".project-modal-panel");
      expect(panel).toBeDefined();
      fireEvent.click(panel!);
      expect(screen.getByRole("dialog")).toBeDefined();

      // Click backdrop -> closes
      const backdrop = container.querySelector(".project-modal-backdrop");
      expect(backdrop).toBeDefined();
      fireEvent.click(backdrop!);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
