import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ElectroTechSite } from "@/components/electro-tech-site";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("homepage View All Projects button links directly to /projects", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  render(<ElectroTechSite />);
  const viewAllLink = screen.getByRole("link", { name: /View All Projects/i });
  expect(viewAllLink).toBeDefined();
  expect(viewAllLink.getAttribute("href")).toBe("/projects");
  expect(viewAllLink.className).toContain("button");
  expect(viewAllLink.className).toContain("button-dark");
});

it("renders 'Grid Feeding' in the solar energy flow diagram and does not use standalone 'Grid'", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);
  const gridNode = container.querySelector(".diagram-node.node-grid");
  expect(gridNode).toBeDefined();

  const nodeTitle = gridNode?.querySelector(".node-title");
  expect(nodeTitle?.textContent?.trim()).toBe("Grid Feeding");

  const nodeSubtitle = gridNode?.querySelector(".node-subtitle");
  expect(nodeSubtitle?.textContent?.trim()).toBe("Provides backup power and enables energy export");
});

