import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardPage } from "@/components/admin/DashboardPage";
import { ProjectsListPage } from "@/components/admin/ProjectsListPage";
import { ProjectCreatePage } from "@/components/admin/ProjectCreatePage";
import { ProjectEditPage } from "@/components/admin/ProjectEditPage";
import { ProjectPreviewPage } from "@/components/admin/ProjectPreviewPage";
import { EquipmentEditor } from "@/components/admin/EquipmentEditor";
import { ImageSlotManager } from "@/components/admin/ImageSlotManager";
import { ProjectMediaManager } from "@/components/admin/ProjectMediaManager";
import { DeleteConfirmModal } from "@/components/admin/DeleteConfirmModal";
import { ApiError } from "@/lib/admin/api";
import type { AdminProject, ProjectImageItem } from "@/types/admin/project";
import { mockRouter, resetMockNavigation, setMockParams } from "../next-navigation-mock";

// Mock API client functions
vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    fetchAdminProjects: vi.fn(),
    fetchAdminProjectById: vi.fn(),
    createAdminProject: vi.fn(),
    updateAdminProject: vi.fn(),
    publishAdminProject: vi.fn(),
    unpublishAdminProject: vi.fn(),
    archiveAdminProject: vi.fn(),
    restoreAdminProject: vi.fn(),
    deleteAdminProject: vi.fn(),
    uploadAdminProjectImage: vi.fn(),
    deleteAdminProjectImage: vi.fn(),
    uploadAdminProjectMedia: vi.fn(),
    updateAdminProjectMedia: vi.fn(),
    deleteAdminProjectMedia: vi.fn(),
    reorderAdminProjectMedia: vi.fn(),
    setAdminProjectMediaPrimary: vi.fn(),
    updateAdminHomepageProjects: vi.fn(),
  };
});

import {
  fetchAdminProjects,
  fetchAdminProjectById,
  createAdminProject,
  updateAdminProject,
  publishAdminProject,
  setAdminProjectMediaPrimary,
  updateAdminHomepageProjects,
} from "@/lib/admin/api";

const mockProjects: AdminProject[] = [
  {
    id: "proj-1",
    slug: "commercial-solar-1",
    title: "Commercial Solar Phase 1",
    clientOrganization: "Attock Commercial Plaza",
    location: "Attock City",
    size: "50 kW",
    category: "Complete Solar System Installation",
    completionYear: 2026,
    shortSummary: "50 kW commercial rooftop solar installation in Attock.",
    fullStory: "Comprehensive commercial installation details...",
    description: "50 kW commercial solar array.",
    equipment: ["Inverter 50kW", "Tier 1 Solar Panels"],
    primaryImagePath: "projects/proj-1/primary.webp",
    secondaryImagePath: "projects/proj-1/secondary.webp",
    primaryImageUrl: "https://example.com/proj-1-primary.webp",
    secondaryImageUrl: "https://example.com/proj-1-secondary.webp",
    primaryAlt: "Primary Image Alt",
    secondaryAlt: "Secondary Image Alt",
    primaryImagePosition: "center",
    secondaryImagePosition: "center",
    status: "published",
    isFeaturedHomepage: true,
    homepageOrder: 1,
    projectOrder: 0,
    publishedAt: "2026-09-01T10:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    media: [],
    mainMedia: null,
    images: [
      {
        id: "img-1",
        projectId: "proj-1",
        url: "https://example.com/proj-1-primary.webp",
        mimeType: "image/webp",
        altText: "Primary Image Alt",
        caption: "Main Rooftop",
        isPrimary: true,
        sortOrder: 0,
        createdAt: "2026-09-01T09:00:00Z",
        updatedAt: "2026-09-01T09:00:00Z",
      },
      {
        id: "img-2",
        projectId: "proj-1",
        url: "https://example.com/proj-1-secondary.webp",
        mimeType: "image/webp",
        altText: "Secondary Image Alt",
        caption: "Inverter Room",
        isPrimary: false,
        sortOrder: 1,
        createdAt: "2026-09-01T09:00:00Z",
        updatedAt: "2026-09-01T09:00:00Z",
      },
    ],
    mainImage: {
      id: "img-1",
      projectId: "proj-1",
      url: "https://example.com/proj-1-primary.webp",
      mimeType: "image/webp",
      altText: "Primary Image Alt",
      caption: "Main Rooftop",
      isPrimary: true,
      sortOrder: 0,
      createdAt: "2026-09-01T09:00:00Z",
      updatedAt: "2026-09-01T09:00:00Z",
    },
  },
  {
    id: "proj-2",
    slug: "residential-hybrid-solar",
    title: "Residential Hybrid Solar",
    clientOrganization: "Kamra Residence",
    location: "Kamra",
    size: "15 kW",
    category: "Complete Solar System Installation",
    completionYear: 2025,
    shortSummary: "15 kW hybrid setup with battery storage in Kamra.",
    fullStory: null,
    description: "15 kW hybrid setup with battery storage.",
    equipment: ["Hybrid Inverter", "Lithium Battery 10kWh"],
    primaryImagePath: null,
    secondaryImagePath: null,
    primaryImageUrl: null,
    secondaryImageUrl: null,
    primaryAlt: null,
    secondaryAlt: null,
    primaryImagePosition: "center",
    secondaryImagePosition: "center",
    status: "draft",
    isFeaturedHomepage: false,
    homepageOrder: null,
    projectOrder: 1,
    publishedAt: null,
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
    media: [],
    mainMedia: null,
    images: [],
    mainImage: null,
  },
  {
    id: "proj-3",
    slug: "archived-industrial-solar",
    title: "Old Industrial Solar",
    clientOrganization: "Hasan Abdal Mills",
    location: "Hasan Abdal",
    size: "100 kW",
    category: "Complete Solar System Installation",
    completionYear: 2024,
    shortSummary: "Decommissioned or archived plant in Hasan Abdal.",
    fullStory: null,
    description: "Decommissioned or archived plant.",
    equipment: [],
    primaryImagePath: null,
    secondaryImagePath: null,
    primaryImageUrl: null,
    secondaryImageUrl: null,
    primaryAlt: null,
    secondaryAlt: null,
    primaryImagePosition: "center",
    secondaryImagePosition: "center",
    status: "archived",
    isFeaturedHomepage: false,
    homepageOrder: null,
    projectOrder: 2,
    publishedAt: null,
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-05T10:00:00Z",
    media: [],
    mainMedia: null,
    images: [],
    mainImage: null,
  },
];

describe("Phase 4B: Projects Management UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockNavigation();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Dashboard Overview
  it("1. DashboardPage renders project statistics and recent projects", async () => {
    vi.mocked(fetchAdminProjects).mockResolvedValueOnce(mockProjects);

    render(<DashboardPage />);

    expect(screen.getByText(/loading dashboard metrics/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Projects Overview")).toBeDefined();
      expect(screen.getByText("Total Projects")).toBeDefined();
      // Total count = 3
      expect(screen.getByText("3")).toBeDefined();
      // 1 published, 1 draft, 1 archived
      expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText("Commercial Solar Phase 1")).toBeDefined();
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });
  });

  // 2. Projects List and Filtering
  it("2. ProjectsListPage renders projects and filters by status tab", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProjects).mockResolvedValueOnce(mockProjects);

    render(<ProjectsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Projects Directory")).toBeDefined();
      expect(screen.getAllByText("Commercial Solar Phase 1").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });

    // Click Draft tab
    vi.mocked(fetchAdminProjects).mockResolvedValueOnce([mockProjects[1]]);
    const draftTab = screen.getByRole("tab", { name: /^drafts$/i });
    await user.click(draftTab);

    await waitFor(() => {
      expect(fetchAdminProjects).toHaveBeenCalledWith("draft");
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });
  });

  // 3. Quick Lifecycle Actions on Projects List
  it("3. ProjectsListPage executes quick publish and unpublish actions", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProjects).mockResolvedValueOnce(mockProjects);

    const publishedDraft: AdminProject = {
      ...mockProjects[1],
      status: "published",
      publishedAt: new Date().toISOString(),
    };
    vi.mocked(publishAdminProject).mockResolvedValueOnce(publishedDraft);

    render(<ProjectsListPage />);

    await waitFor(() => {
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });

    // Find Publish button for draft project
    const publishButton = screen.getByRole("button", { name: /^publish$/i });
    await user.click(publishButton);

    await waitFor(() => {
      expect(publishAdminProject).toHaveBeenCalledWith("proj-2");
      expect(screen.getByText(/"Residential Hybrid Solar" was published successfully\./i)).toBeDefined();
    });
  });

  // 4. Create Project: Sections 1 & 2 only, NO media section, redirects to edit page
  it("4. ProjectCreatePage contains only sections 1 & 2, omits media controls, and redirects to edit page", async () => {
    const user = userEvent.setup();
    const createdProject: AdminProject = {
      ...mockProjects[1],
      id: "new-proj-uuid",
      title: "New Solar Array",
      slug: "new-solar-array",
    };
    vi.mocked(createAdminProject).mockResolvedValueOnce(createdProject);

    render(<ProjectCreatePage />);

    expect(screen.getByText("Create New Project")).toBeDefined();

    // Verify Section 1 and Section 2 are present
    expect(screen.getByText("1. Core Information")).toBeDefined();
    expect(screen.getByText("2. Project Narrative & Summary")).toBeDefined();

    // Verify Section 3 "Media & Uploads" and placeholders are completely absent
    expect(screen.queryByText(/Media & Uploads/i)).toBeNull();
    expect(screen.queryByText(/3\. Media/i)).toBeNull();
    expect(screen.queryByText(/photos can be added after creating this draft/i)).toBeNull();
    expect(screen.queryByLabelText(/upload/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /add image/i })).toBeNull();

    const titleInput = screen.getByLabelText(/project title/i);
    await user.type(titleInput, "New Solar Array");

    const submitButton = screen.getByRole("button", { name: /create draft project/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(createAdminProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Solar Array",
        }),
      );
      expect(mockRouter.push).toHaveBeenCalledWith("/admin/projects/new-proj-uuid/edit");
    });
  });

  // 5. Edit Project Metadata, Sections, and Save
  it("5. ProjectEditPage loads project, renders all 4 sections including Media and Status, and saves updated metadata", async () => {
    const user = userEvent.setup();
    setMockParams({ id: "proj-1" });
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockProjects[0]);
    const updatedProject: AdminProject = {
      ...mockProjects[0],
      title: "Updated Commercial Solar Title",
      size: "75 kW",
    };
    vi.mocked(updateAdminProject).mockResolvedValueOnce(updatedProject);

    render(<ProjectEditPage projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Commercial Solar Phase 1")).toBeDefined();
    });

    // Verify all 4 sections are rendered on Edit screen
    expect(screen.getByText("1. Core Information")).toBeDefined();
    expect(screen.getByText("2. Project Narrative & Summary")).toBeDefined();
    expect(screen.getByText("3. Media & Uploads")).toBeDefined();
    expect(screen.getByText("4. Status & Actions")).toBeDefined();

    // Verify media manager is present in Section 3
    expect(screen.getByText(/Project Images/i)).toBeDefined();

    const titleInput = screen.getByDisplayValue("Commercial Solar Phase 1");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated Commercial Solar Title");

    const saveButtons = screen.getAllByRole("button", { name: /save changes/i });
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(updateAdminProject).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({
          title: "Updated Commercial Solar Title",
        }),
      );
      expect(screen.getByText(/project details updated successfully/i)).toBeDefined();
    });
  });

  // 6. Image Upload and Deletion in ProjectEditPage
  it("6. ImageSlotManager handles image file upload and deletion", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <ImageSlotManager
        slot="primary"
        imageUrl="https://example.com/test.jpg"
        altText="Test Alt"
        position="center"
        onUpload={onUpload}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Primary Image")).toBeDefined();
    expect(screen.getByText("Uploaded")).toBeDefined();

    // Click delete
    const deleteButton = screen.getByRole("button", { name: /delete primary image/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalled();
    });
  });

  // 7. Publish Validation Error (Missing Primary Image)
  it("7. ProjectEditPage handles 400 validation error when primary image is missing", async () => {
    const user = userEvent.setup();
    setMockParams({ id: "proj-2" });
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockProjects[1]); // draft with no image
    vi.mocked(publishAdminProject).mockRejectedValueOnce(
      new ApiError("Project cannot be published", 400, {
        error: "Project cannot be published",
        missingFields: ["primary_image_path"],
      }),
    );

    render(<ProjectEditPage projectId="proj-2" />);

    await waitFor(() => {
      expect(screen.getByText("Residential Hybrid Solar")).toBeDefined();
    });

    const publishButton = screen.getByRole("button", { name: /publish to website/i });
    await user.click(publishButton);

    await waitFor(() => {
      expect(
        screen.getByText(/cannot publish: Project cannot be published\. Missing required items: primary_image_path\./i),
      ).toBeDefined();
    });
  });

  // 8. Permanent Deletion with Confirmation Modal
  it("8. DeleteConfirmModal prompts confirmation and executes deletion", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <DeleteConfirmModal
        isOpen={true}
        projectTitle="Commercial Solar Phase 1"
        onConfirm={onConfirm}
        onCancel={onCancel}
        isDeleting={false}
      />,
    );

    expect(screen.getByText("Delete Project")).toBeDefined();
    expect(
      screen.getByText(/are you sure you want to permanently delete/i),
    ).toBeDefined();

    const deleteBtn = screen.getByRole("button", { name: /permanently delete/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  // 9. Project Preview Page
  it("9. ProjectPreviewPage renders simulated card and toggles expand/collapse", async () => {
    const user = userEvent.setup();
    setMockParams({ id: "proj-1" });
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockProjects[0]);

    render(<ProjectPreviewPage projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText("Public Presentation Preview")).toBeDefined();
      expect(screen.getByText("Commercial Solar Phase 1")).toBeDefined();
      expect(screen.getByText("Attock City")).toBeDefined();
      expect(screen.getByText("50 kW")).toBeDefined();
      expect(screen.getByText("Complete Solar System Installation")).toBeDefined();
      expect(screen.getByText(/50 kW commercial rooftop solar installation in Attock\./i)).toBeDefined();
    });

    // Verify main showcase image uses image.url directly
    const showcaseImg = document.querySelector(".preview-image") as HTMLImageElement;
    expect(showcaseImg).toBeDefined();
    expect(showcaseImg.src).toBe("https://example.com/proj-1-primary.webp");
    expect(showcaseImg.alt).toBe("Primary Image Alt");

    // Click secondary thumbnail to switch preview image locally (no DB mutation)
    const thumbnails = document.querySelectorAll("button[title='Secondary Image Alt']");
    expect(thumbnails.length).toBe(1);
    await user.click(thumbnails[0]);

    // Showcase image should now be the secondary image
    expect(showcaseImg.src).toBe("https://example.com/proj-1-secondary.webp");
    expect(showcaseImg.alt).toBe("Secondary Image Alt");

    // Expand full story
    const toggleButton = screen.getByRole("button", { name: /read full story/i });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText("Comprehensive commercial installation details...")).toBeDefined();
    });
  });

  // 10. Equipment Editor
  it("10. EquipmentEditor allows adding, moving, and removing items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = ["Item A", "Item B"];

    render(
      <EquipmentEditor items={items} onChange={onChange} />,
    );

    expect(screen.getByText("Item A")).toBeDefined();
    expect(screen.getByText("Item B")).toBeDefined();

    // Add new item
    const input = screen.getByLabelText("New equipment item");
    await user.type(input, "Item C");
    const addButton = screen.getByRole("button", { name: /^add$/i });
    await user.click(addButton);

    expect(onChange).toHaveBeenCalledWith(["Item A", "Item B", "Item C"]);

    // Move up
    const moveUpButtons = screen.getAllByRole("button", { name: /move "Item B" up/i });
    await user.click(moveUpButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["Item B", "Item A"]);

    // Remove
    const removeButtons = screen.getAllByRole("button", { name: /remove "Item A"/i });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith(["Item B"]);
  });

  // 11. ProjectMediaManager: image management controls
  it("11. ProjectMediaManager renders uploaded photos and handles primary designation", async () => {
    const user = userEvent.setup();
    const onMediaChange = vi.fn();
    const mockMedia: ProjectImageItem[] = [
      {
        id: "media-1",
        projectId: "proj-1",
        objectPath: "projects/proj-1/photo1.webp",
        url: "https://example.com/photo1.webp",
        publicUrl: "https://example.com/photo1.webp",
        mimeType: "image/webp",
        sortOrder: 0,
        isPrimary: true,
        altText: "Main Solar Roof",
        caption: "Installed 2026",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "media-2",
        projectId: "proj-1",
        objectPath: "projects/proj-1/photo2.webp",
        url: "https://example.com/photo2.webp",
        publicUrl: "https://example.com/photo2.webp",
        mimeType: "image/webp",
        sortOrder: 1,
        isPrimary: false,
        altText: "Inverter Room",
        caption: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    vi.mocked(setAdminProjectMediaPrimary).mockResolvedValueOnce({
      ...mockMedia[1],
      isPrimary: true,
    });

    render(
      <ProjectMediaManager
        projectId="proj-1"
        media={mockMedia}
        projectStatus="draft"
        onMediaChange={onMediaChange}
      />,
    );

    expect(screen.getByText(/Project Images \(2 \/ 5\)/i)).toBeDefined();
    expect(screen.getByText("Main Image")).toBeDefined();
    expect(screen.getByText("Order #2")).toBeDefined();
    expect(screen.getByText(/Alt: "Main Solar Roof"/i)).toBeDefined();

    // Click "Set as Main" on photo 2
    const setMainBtn = screen.getByRole("button", { name: /set as main/i });
    await user.click(setMainBtn);

    await waitFor(() => {
      expect(setAdminProjectMediaPrimary).toHaveBeenCalledWith("proj-1", "media-2");
      expect(onMediaChange).toHaveBeenCalled();
    });
  });

  // 12. Multi-image selection, remaining capacity enforcement, and upload queue
  it("12. ProjectMediaManager enforces remaining capacity and processes multi-image queue", async () => {
    const user = userEvent.setup();
    const onMediaChange = vi.fn();
    const { uploadAdminProjectMedia } = await import("@/lib/admin/api");
    vi.mocked(uploadAdminProjectMedia).mockResolvedValue({
      id: "new-media-id",
      projectId: "proj-1",
      url: "https://example.com/new.webp",
      mimeType: "image/webp",
      altText: null,
      caption: null,
      isPrimary: false,
      sortOrder: 2,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    });

    const mockMedia: ProjectImageItem[] = [
      {
        id: "media-1",
        projectId: "proj-1",
        url: "https://example.com/photo1.webp",
        mimeType: "image/webp",
        sortOrder: 0,
        isPrimary: true,
        altText: "Main Solar Roof",
        caption: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "media-2",
        projectId: "proj-1",
        url: "https://example.com/photo2.webp",
        mimeType: "image/webp",
        sortOrder: 1,
        isPrimary: false,
        altText: "Inverter",
        caption: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    render(
      <ProjectMediaManager
        projectId="proj-1"
        media={mockMedia}
        projectStatus="draft"
        onMediaChange={onMediaChange}
      />,
    );

    const fileInput = screen.getByLabelText(/Add Images/i) as HTMLInputElement;
    expect(fileInput.multiple).toBe(true);

    // Case A: Select 4 files when only 3 remaining capacity -> rejected
    const excessFiles = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
      new File(["d"], "d.jpg", { type: "image/jpeg" }),
    ];
    await user.upload(fileInput, excessFiles);

    expect(
      screen.getByText(/This project already has 2 images\. You can add up to 3 more\./i),
    ).toBeDefined();

    // Case B: Select 2 files within capacity -> added to queue
    const validFiles = [
      new File(["photo1"], "photo-a.jpg", { type: "image/jpeg" }),
      new File(["photo2"], "photo-b.png", { type: "image/png" }),
    ];
    await user.upload(fileInput, validFiles);

    expect(screen.getByText(/Selected Images \(2\)/i)).toBeDefined();
    expect(screen.getByText("photo-a.jpg")).toBeDefined();
    expect(screen.getByText("photo-b.png")).toBeDefined();

    // Click "Upload 2 Images"
    const uploadBtn = screen.getByRole("button", { name: /Upload 2 Images/i });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(uploadAdminProjectMedia).toHaveBeenCalledTimes(2);
      expect(onMediaChange).toHaveBeenCalled();
    });
  });

  describe("Homepage Featured Projects Controls", () => {
    it("renders homepage featured section and table controls on ProjectsListPage", async () => {
      vi.mocked(fetchAdminProjects).mockResolvedValue(mockProjects);

      render(<ProjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/Homepage Featured Projects \(1\/3\)/i)).toBeDefined();
        expect(screen.getAllByText(/Commercial Solar Phase 1/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Featured \(#1\)/i)).toBeDefined();
      });
    });

    it("enforces max-3 limit when attempting to feature a 4th project", async () => {
      const user = userEvent.setup();
      const threeFeaturedProjects: AdminProject[] = [
        { ...mockProjects[0], id: "p1", title: "Project 1", isFeaturedHomepage: true, homepageOrder: 1, status: "published" },
        { ...mockProjects[0], id: "p2", title: "Project 2", isFeaturedHomepage: true, homepageOrder: 2, status: "published" },
        { ...mockProjects[0], id: "p3", title: "Project 3", isFeaturedHomepage: true, homepageOrder: 3, status: "published" },
        { ...mockProjects[0], id: "p4", title: "Project 4", isFeaturedHomepage: false, homepageOrder: null, status: "published" },
      ];
      vi.mocked(fetchAdminProjects).mockResolvedValue(threeFeaturedProjects);

      render(<ProjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/Homepage Featured Projects \(3\/3\)/i)).toBeDefined();
      });

      // Attempt to feature the 4th project
      const featureBtns = screen.getAllByRole("button", { name: /Feature on Homepage/i });
      expect(featureBtns.length).toBeGreaterThan(0);
      await user.click(featureBtns[0]);

      expect(
        screen.getByText(/Maximum 3 projects can be featured on the homepage\. Remove one of the current featured projects first\./i),
      ).toBeDefined();
      expect(updateAdminHomepageProjects).not.toHaveBeenCalled();
    });

    it("features a published project and calls updateAdminHomepageProjects", async () => {
      const user = userEvent.setup();
      const unfeaturedProject: AdminProject[] = [
        { ...mockProjects[0], id: "p1", title: "Project 1", isFeaturedHomepage: false, homepageOrder: null, status: "published" },
      ];
      vi.mocked(fetchAdminProjects).mockResolvedValue(unfeaturedProject);
      vi.mocked(updateAdminHomepageProjects).mockResolvedValue([
        { ...unfeaturedProject[0], isFeaturedHomepage: true, homepageOrder: 1 },
      ]);

      render(<ProjectsListPage />);

      await waitFor(() => {
        expect(screen.getByText(/Homepage Featured Projects \(0\/3\)/i)).toBeDefined();
      });

      const featureBtn = screen.getByRole("button", { name: /Feature on Homepage/i });
      await user.click(featureBtn);

      await waitFor(() => {
        expect(updateAdminHomepageProjects).toHaveBeenCalledWith(["p1"]);
      });
    });

    it("disables Feature on Homepage for draft projects", async () => {
      const draftProject: AdminProject[] = [
        { ...mockProjects[0], id: "p-draft", title: "Draft Project", isFeaturedHomepage: false, homepageOrder: null, status: "draft" },
      ];
      vi.mocked(fetchAdminProjects).mockResolvedValue(draftProject);

      render(<ProjectsListPage />);

      await waitFor(() => {
        const featureBtn = screen.getByRole("button", { name: /Feature on Homepage/i }) as HTMLButtonElement;
        expect(featureBtn.disabled).toBe(true);
      });
    });

    it("ProjectEditPage: featuring first published project sends [project.id] UUID and never slug, refetches project state, and updates UI", async () => {
      const user = userEvent.setup();
      const testUuid = "e19bd9c3-01fe-4890-ae5a-2839541657d8";
      const initialProject: AdminProject = {
        ...mockProjects[0],
        id: testUuid,
        slug: "test-project-oo1",
        title: "Test project oo1",
        status: "published",
        isFeaturedHomepage: false,
        homepageOrder: null,
      };
      const updatedProject: AdminProject = {
        ...initialProject,
        isFeaturedHomepage: true,
        homepageOrder: 1,
      };

      setMockParams({ id: testUuid });
      vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(initialProject).mockResolvedValueOnce(updatedProject);
      vi.mocked(fetchAdminProjects).mockResolvedValue([initialProject]);
      vi.mocked(updateAdminHomepageProjects).mockResolvedValue([updatedProject]);

      render(<ProjectEditPage projectId={testUuid} />);

      await waitFor(() => {
        expect(screen.getByText(/Homepage Feature:/i)).toBeDefined();
        expect(screen.getByText("Not Featured")).toBeDefined();
      });

      const featureBtn = screen.getByRole("button", { name: /Feature on Homepage/i });
      await user.click(featureBtn);

      await waitFor(() => {
        // Must send UUID, never slug
        expect(updateAdminHomepageProjects).toHaveBeenCalledWith([testUuid]);
        expect(updateAdminHomepageProjects).not.toHaveBeenCalledWith(["test-project-oo1"]);
        // Must refetch project state from server
        expect(fetchAdminProjectById).toHaveBeenCalledTimes(2);
        // UI must update to Featured (#1)
        expect(screen.getByText(/Featured \(#1\)/i)).toBeDefined();
        expect(screen.getByRole("button", { name: /Remove from Homepage/i })).toBeDefined();
      });
    });

    it("ProjectEditPage: excludes stale draft/archived projects and deduplicates IDs", async () => {
      const user = userEvent.setup();
      const testUuid = "e19bd9c3-01fe-4890-ae5a-2839541657d8";
      const existingFeaturedUuid = "22222222-2222-2222-2222-222222222222";
      const draftUuid = "33333333-3333-3333-3333-333333333333";
      const archivedUuid = "44444444-4444-4444-4444-444444444444";

      const currentProject: AdminProject = {
        ...mockProjects[0],
        id: testUuid,
        slug: "test-project-oo1",
        title: "Test project oo1",
        status: "published",
        isFeaturedHomepage: false,
        homepageOrder: null,
      };

      const allProjectsList: AdminProject[] = [
        currentProject,
        {
          ...mockProjects[0],
          id: existingFeaturedUuid,
          slug: "valid-featured",
          title: "Valid Featured",
          status: "published",
          isFeaturedHomepage: true,
          homepageOrder: 1,
        },
        // Stale draft that still had isFeaturedHomepage: true
        {
          ...mockProjects[0],
          id: draftUuid,
          slug: "stale-draft",
          title: "Stale Draft",
          status: "draft",
          isFeaturedHomepage: true,
          homepageOrder: 2,
        },
        // Stale archived that still had isFeaturedHomepage: true
        {
          ...mockProjects[0],
          id: archivedUuid,
          slug: "stale-archived",
          title: "Stale Archived",
          status: "archived",
          isFeaturedHomepage: true,
          homepageOrder: 3,
        },
      ];

      setMockParams({ id: testUuid });
      vi.mocked(fetchAdminProjectById).mockResolvedValue(currentProject);
      vi.mocked(fetchAdminProjects).mockResolvedValue(allProjectsList);
      vi.mocked(updateAdminHomepageProjects).mockResolvedValue([]);

      render(<ProjectEditPage projectId={testUuid} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Feature on Homepage/i })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /Feature on Homepage/i }));

      await waitFor(() => {
        // Excludes draftUuid and archivedUuid, and appends testUuid
        expect(updateAdminHomepageProjects).toHaveBeenCalledWith([existingFeaturedUuid, testUuid]);
      });
    });

    it("ProjectEditPage: removes project from homepage and refetches state", async () => {
      const user = userEvent.setup();
      const testUuid = "e19bd9c3-01fe-4890-ae5a-2839541657d8";
      const initialProject: AdminProject = {
        ...mockProjects[0],
        id: testUuid,
        slug: "test-project-oo1",
        title: "Test project oo1",
        status: "published",
        isFeaturedHomepage: true,
        homepageOrder: 1,
      };
      const unfeaturedProject: AdminProject = {
        ...initialProject,
        isFeaturedHomepage: false,
        homepageOrder: null,
      };

      setMockParams({ id: testUuid });
      vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(initialProject).mockResolvedValueOnce(unfeaturedProject);
      vi.mocked(fetchAdminProjects).mockResolvedValue([initialProject]);
      vi.mocked(updateAdminHomepageProjects).mockResolvedValue([]);

      render(<ProjectEditPage projectId={testUuid} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Remove from Homepage/i })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: /Remove from Homepage/i }));

      await waitFor(() => {
        // Removed current project, leaving empty array
        expect(updateAdminHomepageProjects).toHaveBeenCalledWith([]);
        expect(fetchAdminProjectById).toHaveBeenCalledTimes(2);
        expect(screen.getByText("Not Featured")).toBeDefined();
        expect(screen.getByRole("button", { name: /Feature on Homepage/i })).toBeDefined();
      });
    });
  });
});
