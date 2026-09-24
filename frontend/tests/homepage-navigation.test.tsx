import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ElectroTechSite } from "@/components/electro-tech-site";
import { siteConfig } from "@/lib/site-config";

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

it("renders Solar Analyzer CTA in hero, removes redundant quote CTA from hero, and retains navbar quote CTA", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);
  const heroActions = container.querySelector(".hero-actions-wrap");
  expect(heroActions).toBeDefined();

  // Hero contains Analyze Your Electricity Bill pointing to /solar-bill-analyzer
  const analyzerBtn = heroActions?.querySelector("a[href='/solar-bill-analyzer']");
  expect(analyzerBtn).toBeDefined();
  expect(analyzerBtn?.textContent).toContain("Analyze Your Electricity Bill");
  expect(analyzerBtn?.className).toContain("hero-analyzer-pill");
  expect(analyzerBtn?.tagName.toLowerCase()).toBe("a");

  // Hero no longer contains the Hero-level Request a Solar Quote
  expect(heroActions?.textContent).not.toContain("Request a Solar Quote");

  // Navbar still contains Request a Solar Quote
  const navbarCta = container.querySelector(".site-header .header-pill-cta");
  expect(navbarCta).toBeDefined();
  expect(navbarCta?.textContent).toContain("Request a Solar Quote");
  expect(navbarCta?.getAttribute("href")).toBe("#contact");
});

it("renders official Facebook and TikTok social links in the footer", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);
  const footerSocials = container.querySelector(".footer-socials");
  expect(footerSocials).toBeDefined();

  const fbLink = footerSocials?.querySelector(`a[href='${siteConfig.facebookHref}']`);
  expect(fbLink).not.toBeNull();
  expect(fbLink?.getAttribute("target")).toBe("_blank");
  expect(fbLink?.getAttribute("rel")).toBe("noopener noreferrer");
  expect(fbLink?.getAttribute("aria-label")).toBe("Visit Electro Tech on Facebook");
  const fbSvg = fbLink?.querySelector("svg");
  expect(fbSvg?.getAttribute("width")).toBe("17");
  expect(fbSvg?.getAttribute("stroke-width")).toBe("2.3");

  const tiktokLink = footerSocials?.querySelector(`a[href='${siteConfig.tiktokHref}']`);
  expect(tiktokLink).not.toBeNull();
  expect(tiktokLink?.getAttribute("target")).toBe("_blank");
  expect(tiktokLink?.getAttribute("rel")).toBe("noopener noreferrer");
  expect(tiktokLink?.getAttribute("aria-label")).toBe("Visit Electro Tech on TikTok");
  const tiktokSvg = tiktokLink?.querySelector("svg");
  expect(tiktokSvg?.getAttribute("width")).toBe("17");
  expect(tiktokSvg?.getAttribute("stroke-width")).toBe("2.3");
});

