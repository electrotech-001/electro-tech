"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  MapPin,
  Menu,
  X,
  Zap,
} from "lucide-react";
import { fetchAllPublishedProjects } from "@/lib/projects";
import type { PublicProject } from "@/types/project";
import { ProjectDetailModal } from "./project-detail-modal";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Projects", href: "/projects", active: true },
  { label: "Process", href: "/#process" },
  { label: "Contact", href: "/#contact" },
];

export function ProjectsDirectory() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<PublicProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 20);

      if (currentScrollY <= 40) {
        setHeaderVisible(true);
      } else if (currentScrollY > lastScrollY.current + 6) {
        setHeaderVisible(false);
      } else if (currentScrollY < lastScrollY.current - 6) {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchAllPublishedProjects();
        if (mounted) {
          setProjects(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load projects.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="projects-directory-wrapper">
      {/* HEADER */}
      <header
        className={`site-header ${scrolled ? "is-scrolled" : ""} ${!headerVisible && !menuOpen ? "is-hidden" : ""} ${menuOpen ? "has-open-menu" : ""}`}
      >
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Electro Tech home">
            <img
              src="/logos/electrotech-horizontal.png"
              width={407}
              height={112}
              alt="Electro Tech — Electrical & Solar Solutions"
            />
          </a>

          {/* Desktop Navigation */}
          <nav className="desktop-nav desktop-nav-projects" aria-label="Primary navigation">
            {navLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  color: item.active ? "var(--accent-hover, #D4A017)" : undefined,
                  fontWeight: item.active ? 600 : undefined,
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a className="button button-dark header-pill-cta" href="/#contact">
            Request a Solar Quote <ArrowUpRight size={15} className="link-icon" aria-hidden="true" />
          </a>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span /><span />
          </button>
        </div>

        {/* Mobile Dropdown */}
        {menuOpen && (
          <nav id="mobile-menu" className="mobile-nav" aria-label="Mobile navigation">
            {navLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  color: item.active ? "var(--accent-hover, #D4A017)" : undefined,
                  fontWeight: item.active ? 600 : undefined,
                }}
              >
                {item.label}
                <ArrowUpRight className="link-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
              </a>
            ))}
            <a
              href="/#contact"
              className="button button-dark mobile-cta"
              onClick={() => setMenuOpen(false)}
            >
              Request a Solar Quote <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </nav>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, width: "100%" }}>
        {/* HERO INTRO */}
        <section className="projects-hero-section">
          <div className="projects-hero-shell">
            <p className="eyebrow" style={{ color: "var(--accent, #F5C400)" }}>
              OUR WORK
            </p>
            <h1 className="projects-hero-title">
              Projects Directory
            </h1>
            <p className="projects-hero-desc">
              Explore our complete portfolio of solar energy installations, hybrid storage solutions, and
              electrical infrastructure across Attock and surrounding regions.
            </p>
          </div>
        </section>

        {/* PROJECTS GRID SECTION */}
        <section className="projects-grid-section">
          <div className="projects-grid-shell">
            {isLoading && (
              <div
                className="projects-grid"
                aria-busy="true"
                aria-label="Loading projects directory"
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="project-directory-card project-card-skeleton">
                    <div className="project-card-image-wrap skeleton-pulse" />
                    <div className="project-card-body">
                      <div className="skeleton-line skeleton-w-30" />
                      <div className="skeleton-line skeleton-w-80" />
                      <div className="skeleton-line skeleton-w-60" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  backgroundColor: "var(--surface, #FFFFFF)",
                  border: "1px solid var(--border, #E6E4DF)",
                  borderRadius: "var(--radius-md, 14px)",
                  color: "var(--text-muted, #6F706B)",
                }}
              >
                <h3 style={{ color: "var(--text, #111111)", marginBottom: "8px" }}>
                  Unable to Load Projects
                </h3>
                <p style={{ margin: "0 0 20px" }}>{error}</p>
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </button>
              </div>
            )}

            {!isLoading && !error && projects.length === 0 && (
              <div
                style={{
                  padding: "64px 24px",
                  textAlign: "center",
                  backgroundColor: "var(--surface, #FFFFFF)",
                  border: "1px solid var(--border, #E6E4DF)",
                  borderRadius: "var(--radius-md, 14px)",
                  color: "var(--text-muted, #6F706B)",
                }}
              >
                <h3 style={{ color: "var(--text, #111111)", marginBottom: "8px" }}>
                  No Published Projects
                </h3>
                <p style={{ margin: "0 0 20px" }}>
                  Our projects directory is currently being updated with new installations.
                </p>
                <Link href="/" className="button button-dark">
                  Return to Home
                </Link>
              </div>
            )}

            {!isLoading && !error && projects.length > 0 && (
              <div className="projects-grid">
                {projects.map((project) => {
                  const primaryImage =
                    project.mainImage?.url ||
                    project.images?.[0]?.url ||
                    "/images/hero-solar-architectural.webp";
                  const primaryAlt = project.mainImage?.altText || project.title;

                  return (
                    <article
                      key={project.id}
                      tabIndex={0}
                      role="button"
                      aria-haspopup="dialog"
                      aria-label={`View details for ${project.title}`}
                      onClick={() => setSelectedProject(project)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedProject(project);
                        }
                      }}
                      className="project-directory-card"
                    >
                      {/* Card Image Box */}
                      <div className="project-card-image-wrap">
                        <img
                          src={primaryImage}
                          alt={primaryAlt}
                          loading="lazy"
                          decoding="async"
                          className="project-card-img"
                        />
                        {project.isFeaturedHomepage && (
                          <div className="project-card-featured-badge">
                            Featured
                          </div>
                        )}
                      </div>

                      {/* Card Body */}
                      <div className="project-card-body">
                        {/* Category & Year */}
                        <div className="project-card-header-meta">
                          <span className="project-card-category">
                            {project.category || "Solar Project"}
                          </span>
                          {project.completionYear && (
                            <span className="project-card-year">
                              <Calendar size={12} aria-hidden="true" />
                              {project.completionYear}
                            </span>
                          )}
                        </div>

                        {/* Project Title & Action Icon */}
                        <div className="project-card-title-row">
                          <h3 className="project-card-title">
                            {project.title}
                          </h3>
                          <span
                            aria-hidden="true"
                            className="project-card-arrow"
                          >
                            <ArrowUpRight size={16} />
                          </span>
                        </div>

                        {/* Metadata Row: Client, Location, Size */}
                        <div className="project-card-metadata">
                          {project.clientOrganization && (
                            <div className="project-card-meta-item">
                              <Building2 size={15} className="project-card-meta-icon" aria-hidden="true" />
                              <span className="project-card-meta-value project-card-client-name">
                                {project.clientOrganization}
                              </span>
                            </div>
                          )}
                          {project.location && (
                            <div className="project-card-meta-item">
                              <MapPin size={15} className="project-card-meta-icon" aria-hidden="true" />
                              <span className="project-card-meta-value">
                                {project.location}
                              </span>
                            </div>
                          )}
                          {project.size && (
                            <div className="project-card-meta-item">
                              <Zap size={15} className="project-card-meta-icon accent-icon" aria-hidden="true" />
                              <span className="project-card-meta-value project-card-size-value">
                                {project.size}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Short Summary */}
                        {(project.shortSummary || project.description) && (
                          <p className="project-card-summary">
                            {project.shortSummary || project.description}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="projects-cta-section">
          <div className="projects-cta-inner">
            <p className="eyebrow" style={{ color: "var(--accent, #F5C400)" }}>
              START YOUR PROJECT
            </p>
            <h2 className="projects-cta-title">
              Ready to explore solar for your property?
            </h2>
            <p className="projects-cta-desc">
              Tell us about your project and Electro Tech can review your requirements, inspect your
              electrical infrastructure, and provide an engineered solar proposal.
            </p>
            <a href="/#contact" className="button button-dark">
              Request a Solar Quote <ArrowRight size={15} className="link-icon" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="projects-footer">
        <div className="projects-footer-inner">
          <div>&copy; {new Date().getFullYear()} Electro Tech. All rights reserved.</div>
          <div className="projects-footer-nav">
            <Link href="/" className="projects-footer-link">
              Home
            </Link>
            <Link href="/#about" className="projects-footer-link">
              About
            </Link>
            <Link href="/#services" className="projects-footer-link">
              Services
            </Link>
            <Link href="/projects" className="projects-footer-link active">
              Projects
            </Link>
            <Link href="/#process" className="projects-footer-link">
              Process
            </Link>
            <Link href="/#contact" className="projects-footer-link">
              Contact
            </Link>
          </div>
        </div>
      </footer>

      {/* Project Detail Modal Overlay */}
      <ProjectDetailModal
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
