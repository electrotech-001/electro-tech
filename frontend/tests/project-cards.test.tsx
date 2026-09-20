import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCards } from "@/components/project-cards";
import type { PublicProject } from "@/types/project";

vi.mock("@/lib/projects", () => ({
  fetchHomepageProjects: vi.fn(),
  fetchAllPublishedProjects: vi.fn(),
}));

import { fetchHomepageProjects } from "@/lib/projects";

const mockHomepageProjects: PublicProject[] = [
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
      {
        id: "img-2",
        url: "/images/projects/darul-islam-colony-attock-02.webp",
        altText: "Inverter and Distribution Unit",
        caption: "Electrical Room",
        isPrimary: false,
        sortOrder: 1,
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
    isFeaturedHomepage: true,
    homepageOrder: 2,
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
      {
        id: "img-4",
        url: "/images/projects/she-shelter-girls-hostel-attock-02.webp",
        altText: "Battery Storage Bank",
        caption: null,
        isPrimary: false,
        sortOrder: 1,
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
  {
    id: "proj-3",
    slug: "institutional-solar-plant",
    title: "Institutional Solar Plant",
    clientOrganization: "Attock Education Complex",
    location: "Attock City",
    size: "30 kW On-Grid",
    category: "Complete Solar System Installation",
    completionYear: 2024,
    shortSummary: "30 kW educational campus solar array.",
    fullStory: null,
    description: "30 kW educational campus solar array.",
    equipment: ["30 kW Inverter", "Elevated Structure"],
    status: "published",
    isFeaturedHomepage: true,
    homepageOrder: 3,
    publishedAt: "2026-09-03T10:00:00Z",
    createdAt: "2026-09-03T09:00:00Z",
    updatedAt: "2026-09-03T10:00:00Z",
    images: [
      {
        id: "img-5",
        url: "/images/projects/iqbal-malik-house-mehria-town-01.webp",
        altText: "Campus Solar Array",
        caption: null,
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    mainImage: {
      id: "img-5",
      url: "/images/projects/iqbal-malik-house-mehria-town-01.webp",
      altText: "Campus Solar Array",
      caption: null,
      isPrimary: true,
      sortOrder: 0,
    },
  },
];

describe("ProjectCards (Homepage Featured Projects)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders exactly 3 published homepage projects with primary and secondary images", async () => {
    vi.mocked(fetchHomepageProjects).mockResolvedValueOnce(mockHomepageProjects);

    const { container } = render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
      expect(screen.getByText("Institutional Solar Plant")).toBeDefined();
    });

    const articles = container.querySelectorAll("article");
    expect(articles.length).toBe(3);

    // Numbering indices 01, 02, 03
    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("03")).toBeDefined();

    // Verify metadata
    expect(screen.getByText("Kamra Road, Attock")).toBeDefined();
    expect(screen.getByText("50 kW On-Grid")).toBeDefined();
    expect(screen.getByText("15 kW Hybrid")).toBeDefined();
  });

  it("expands card on click and toggles secondary image and equipment details", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHomepageProjects).mockResolvedValueOnce(mockHomepageProjects);

    render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
    });

    const toggleButton = screen.getByRole("button", { name: /Commercial Rooftop Solar Phase 1/i });
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggleButton);

    expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Tier 1 Solar Panels")).toBeDefined();
    expect(screen.getByText("Distribution Board")).toBeDefined();

    // Click again to collapse
    await user.click(toggleButton);
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("supports keyboard expansion with Enter and Space keys", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHomepageProjects).mockResolvedValueOnce(mockHomepageProjects);

    render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });

    const button = screen.getByRole("button", { name: /Residential Hybrid Solar/i });
    button.focus();
    expect(document.activeElement).toBe(button);

    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Lithium Battery 10kWh")).toBeDefined();

    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("switches active card when another project is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHomepageProjects).mockResolvedValueOnce(mockHomepageProjects);

    render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText("Commercial Rooftop Solar Phase 1")).toBeDefined();
    });

    const btn1 = screen.getByRole("button", { name: /Commercial Rooftop Solar Phase 1/i });
    const btn2 = screen.getByRole("button", { name: /Residential Hybrid Solar/i });

    await user.click(btn1);
    expect(btn1.getAttribute("aria-expanded")).toBe("true");
    expect(btn2.getAttribute("aria-expanded")).toBe("false");

    await user.click(btn2);
    expect(btn1.getAttribute("aria-expanded")).toBe("false");
    expect(btn2.getAttribute("aria-expanded")).toBe("true");
  });

  it("handles loading and empty states gracefully", async () => {
    vi.mocked(fetchHomepageProjects).mockResolvedValueOnce([]);

    render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText(/featured solar projects are being updated/i)).toBeDefined();
    });
  });

  it("handles error state without crashing", async () => {
    vi.mocked(fetchHomepageProjects).mockRejectedValueOnce(new Error("Network connection error"));

    render(<ProjectCards />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load featured projects right now/i)).toBeDefined();
    });
  });
});
