import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectCreatePage } from "../src/pages/ProjectCreatePage.js";
import { ProjectEditPage } from "../src/pages/ProjectEditPage.js";
import {
  getEditProjectDraftKey,
  getProjectDraft,
  NEW_PROJECT_DRAFT_KEY,
  saveProjectDraft,
} from "../src/lib/draft-storage.js";
import type { AdminProject } from "../src/types/project.js";

// Mock API client
vi.mock("../src/lib/api.js", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createAdminProject: vi.fn(),
    fetchAdminProjectById: vi.fn(),
    updateAdminProject: vi.fn(),
  };
});

import {
  createAdminProject,
  fetchAdminProjectById,
  updateAdminProject,
} from "../src/lib/api.js";

const mockServerProject: AdminProject = {
  id: "proj-edit-1",
  slug: "original-slug",
  title: "Original Title",
  clientOrganization: "Original Client",
  location: "Original Location",
  size: "10 kW",
  category: "Complete Solar System Installation",
  completionYear: 2026,
  shortSummary: "Original Short Summary",
  fullStory: "Original Full Story",
  description: "Original Description",
  equipment: ["Panel A"],
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
  projectOrder: 0,
  publishedAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  media: [],
  mainMedia: null,
  images: [],
  mainImage: null,
};

describe("Draft Persistence & Unsaved Changes Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  // 1. Create Project: Unsaved form input persists to sessionStorage
  it("1. ProjectCreatePage persists entered fields to sessionStorage and shows unsaved changes", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectCreatePage />
      </MemoryRouter>,
    );

    const titleInput = screen.getByLabelText(/project title/i);
    await user.type(titleInput, "Persistent Draft Title");

    const locationInput = screen.getByLabelText(/location/i);
    await user.type(locationInput, "Attock Facility");

    // Check that draft was stored in sessionStorage
    const saved = getProjectDraft(NEW_PROJECT_DRAFT_KEY);
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe("Persistent Draft Title");
    expect(saved?.location).toBe("Attock Facility");

    // Unsaved changes indicator should be visible
    expect(screen.getByText(/unsaved changes/i)).toBeDefined();
  });

  // 2. Create Project: Remounting restores draft from sessionStorage
  it("2. ProjectCreatePage restores unsaved draft automatically on mount", () => {
    saveProjectDraft(NEW_PROJECT_DRAFT_KEY, {
      title: "Restored Project Title",
      location: "Restored Location",
      size: "20 kW",
      clientOrganization: "Restored Client Org",
      shortSummary: "Restored Short Summary",
    });

    render(
      <MemoryRouter>
        <ProjectCreatePage />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("Restored Project Title")).toBeDefined();
    expect(screen.getByDisplayValue("Restored Location")).toBeDefined();
    expect(screen.getByDisplayValue("20 kW")).toBeDefined();
    expect(screen.getByDisplayValue("Restored Client Org")).toBeDefined();
    expect(screen.getByDisplayValue("Restored Short Summary")).toBeDefined();
  });

  // 3. Create Project: Successful save clears draft
  it("3. ProjectCreatePage clears draft on successful creation", async () => {
    const user = userEvent.setup();
    saveProjectDraft(NEW_PROJECT_DRAFT_KEY, {
      title: "Draft to Create",
    });

    vi.mocked(createAdminProject).mockResolvedValueOnce({
      ...mockServerProject,
      id: "new-proj-uuid",
      title: "Draft to Create",
    });

    render(
      <MemoryRouter initialEntries={["/projects/new"]}>
        <Routes>
          <Route path="/projects/new" element={<ProjectCreatePage />} />
          <Route path="/projects/:id/edit" element={<div>Editor Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const submitBtn = screen.getByRole("button", { name: /create draft project/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createAdminProject).toHaveBeenCalled();
      expect(getProjectDraft(NEW_PROJECT_DRAFT_KEY)).toBeNull();
      expect(screen.getByText("Editor Page")).toBeDefined();
    });
  });

  // 4. Create Project: Failed save retains draft
  it("4. ProjectCreatePage retains draft if creation request fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createAdminProject).mockRejectedValueOnce(new Error("Network Error"));

    render(
      <MemoryRouter>
        <ProjectCreatePage />
      </MemoryRouter>,
    );

    const titleInput = screen.getByLabelText(/project title/i);
    await user.type(titleInput, "Draft That Will Fail");

    const submitBtn = screen.getByRole("button", { name: /create draft project/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Network Error")).toBeDefined();
    });

    // Draft MUST still exist in sessionStorage
    const saved = getProjectDraft(NEW_PROJECT_DRAFT_KEY);
    expect(saved?.title).toBe("Draft That Will Fail");
  });

  // 5. Edit Project: Loads server project, persists unsaved edits
  it("5. ProjectEditPage persists modified fields and shows unsaved changes badge", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockServerProject);

    render(
      <MemoryRouter initialEntries={["/projects/proj-edit-1/edit"]}>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Original Title")).toBeDefined();
    });

    // Initially not dirty (matches server)
    expect(screen.queryByText(/unsaved changes/i)).toBeNull();

    // Modify a field
    const titleInput = screen.getByDisplayValue("Original Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Modified Project Title");

    await waitFor(() => {
      expect(screen.getByText(/unsaved changes/i)).toBeDefined();
    });

    // Verify sessionStorage has project-specific draft
    const draft = getProjectDraft(getEditProjectDraftKey("proj-edit-1"));
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe("Modified Project Title");
  });

  // 6. Edit Project: Remount restores unsaved draft over server data
  it("6. ProjectEditPage restores unsaved draft over freshly fetched server data", async () => {
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockServerProject);

    // Pre-save an unsaved draft
    saveProjectDraft(getEditProjectDraftKey("proj-edit-1"), {
      title: "Unsaved Local Draft Title",
      size: "99 kW",
    });

    render(
      <MemoryRouter initialEntries={["/projects/proj-edit-1/edit"]}>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Must display local draft over server data
      expect(screen.getByDisplayValue("Unsaved Local Draft Title")).toBeDefined();
      expect(screen.getByDisplayValue("99 kW")).toBeDefined();
      expect(screen.queryByDisplayValue("Original Title")).toBeNull();
    });
  });

  // 7. Edit Project: Successful save clears project-specific draft
  it("7. ProjectEditPage clears project draft after successful save", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(mockServerProject);

    saveProjectDraft(getEditProjectDraftKey("proj-edit-1"), {
      title: "Title to Save",
    });

    const updatedProject = {
      ...mockServerProject,
      title: "Title to Save",
    };
    vi.mocked(updateAdminProject).mockResolvedValueOnce(updatedProject);

    render(
      <MemoryRouter initialEntries={["/projects/proj-edit-1/edit"]}>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Title to Save")).toBeDefined();
    });

    const saveButtons = screen.getAllByRole("button", { name: /save changes/i });
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(updateAdminProject).toHaveBeenCalled();
      expect(getProjectDraft(getEditProjectDraftKey("proj-edit-1"))).toBeNull();
      expect(screen.queryByText(/unsaved changes/i)).toBeNull();
    });
  });

  // 8. Edit Project: Drafts for Project A do not leak to Project B
  it("8. project-specific drafts do not leak between different project IDs", async () => {
    const projectB: AdminProject = {
      ...mockServerProject,
      id: "proj-B",
      title: "Project B Title",
    };

    saveProjectDraft(getEditProjectDraftKey("proj-A"), {
      title: "Project A Unsaved Edit",
    });

    vi.mocked(fetchAdminProjectById).mockResolvedValueOnce(projectB);

    render(
      <MemoryRouter initialEntries={["/projects/proj-B/edit"]}>
        <Routes>
          <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Must display Project B Title, NOT Project A Unsaved Edit
      expect(screen.getByDisplayValue("Project B Title")).toBeDefined();
      expect(screen.queryByDisplayValue("Project A Unsaved Edit")).toBeNull();
    });
  });
});
