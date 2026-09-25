import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ElectroTechSite } from "@/components/electro-tech-site";
import { siteConfig } from "@/lib/site-config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

it("renders a floating Solar Analyzer button linking to /solar-bill-analyzer with correct accessible label", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);
  const solarFloat = container.querySelector("a.floating-solar-analyzer");
  expect(solarFloat).not.toBeNull();
  expect(solarFloat?.getAttribute("href")).toBe("/solar-bill-analyzer");
  expect(solarFloat?.getAttribute("aria-label")).toBe("Analyze Your Electricity Bill");
  expect(solarFloat?.getAttribute("title")).toBe("Analyze Your Electricity Bill");

  // FileSearch icon is rendered inside
  const icon = solarFloat?.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(icon?.classList.contains("floating-solar-analyzer-icon")).toBe(true);
});

it("WhatsApp floating button remains unchanged alongside the new Solar Analyzer float", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);

  // WhatsApp button still present with original attributes
  const whatsappFloat = container.querySelector("a.floating-whatsapp");
  expect(whatsappFloat).not.toBeNull();
  expect(whatsappFloat?.getAttribute("aria-label")).toBe("Chat on WhatsApp");
  expect(whatsappFloat?.getAttribute("title")).toBe("Chat on WhatsApp");
  expect(whatsappFloat?.getAttribute("target")).toBe("_blank");
  expect(whatsappFloat?.getAttribute("rel")).toBe("noopener noreferrer");
  expect(whatsappFloat?.getAttribute("href")).toContain("wa.me");

  // Both floating buttons coexist
  const solarFloat = container.querySelector("a.floating-solar-analyzer");
  expect(solarFloat).not.toBeNull();
});

it("Hero Analyzer CTA remains present and links to /solar-bill-analyzer", () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const { container } = render(<ElectroTechSite />);
  const heroCta = container.querySelector("a.hero-analyzer-pill");
  expect(heroCta).not.toBeNull();
  expect(heroCta?.getAttribute("href")).toBe("/solar-bill-analyzer");
  expect(heroCta?.textContent).toContain("Analyze Your Electricity Bill");
});

it("hero-analyzer-pill uses border-radius 14px, not pill shape", () => {
  // Read the globals.css and verify border-radius is 14px for .hero-analyzer-pill
  const testDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(testDir, "../app/globals.css"), "utf8");

  // Extract the .hero-analyzer-pill block (base rule, not inside a media query)
  const pillMatch = css.match(/\.hero-analyzer-pill\s*\{[^}]*border-radius:\s*([^;]+);/);
  expect(pillMatch).not.toBeNull();
  expect(pillMatch![1].trim()).toBe("14px");

  // Ensure the old pill radius is gone
  expect(css).not.toContain(".hero-analyzer-pill {\n  min-height: 46px;\n  padding: 12px 26px;\n  border-radius: 9999px;");
});

it("mobile CTA at <=520px does not use forced full-width and aligns to the left matching the capacity card", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(testDir, "../app/globals.css"), "utf8");

  // Inside the 520px media query, .hero-analyzer-pill should use fit-content width
  const mobileBlock = css.match(/@media\s*\(max-width:\s*520px\)\s*\{([\s\S]*?)\n\}/);
  expect(mobileBlock).not.toBeNull();
  const mobileRules = mobileBlock![1];

  // Should contain fit-content width for the pill
  expect(mobileRules).toContain("width: fit-content");
  expect(mobileRules).toContain("max-width: calc(100% - 32px)");

  // Should NOT contain width: 100% for .hero-actions-wrap .button
  expect(mobileRules).not.toMatch(/\.hero-actions-wrap\s+\.button\s*\{[^}]*width:\s*100%/);

  // Should align to the left matching the capacity card below, not centered
  expect(mobileRules).toContain("justify-content: flex-start");
  expect(mobileRules).not.toContain("justify-content: center");
});
