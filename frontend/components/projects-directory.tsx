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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--background, #F6F5F2)",
      }}
    >
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
      <main style={{ flex: 1 }}>
        {/* HERO INTRO */}
        <section
          style={{
            maxWidth: "var(--max, 1380px)",
            margin: "0 auto",
            padding: "64px 24px 40px",
          }}
        >
          <p className="eyebrow" style={{ color: "var(--accent, #F5C400)" }}>
            OUR WORK
          </p>
          <h1
            style={{
              fontSize: "clamp(2rem, 3.8vw, 3.2rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text, #111111)",
              marginBottom: "16px",
              lineHeight: 1.1,
            }}
          >
            Projects Directory
          </h1>
          <p
            style={{
              fontSize: "clamp(1rem, 1.2vw, 1.15rem)",
              color: "var(--text-muted, #6F706B)",
              maxWidth: "680px",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Explore our complete portfolio of solar energy installations, hybrid storage solutions, and
            electrical infrastructure across Attock and surrounding regions.
          </p>
        </section>

        {/* PROJECTS GRID SECTION */}
        <section
          style={{
            maxWidth: "var(--max, 1380px)",
            margin: "0 auto",
            padding: "0 24px 80px",
          }}
        >
          {isLoading && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: "28px",
              }}
              aria-busy="true"
              aria-label="Loading projects directory"
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "var(--surface, #FFFFFF)",
                    border: "1px solid var(--border, #E6E4DF)",
                    borderRadius: "var(--radius-md, 14px)",
                    overflow: "hidden",
                    height: "440px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      height: "240px",
                      backgroundColor: "var(--surface-subtle, #EFECE6)",
                      animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    }}
                  />
                  <div style={{ padding: "24px", flex: 1 }}>
                    <div
                      style={{
                        width: "100px",
                        height: "14px",
                        backgroundColor: "var(--surface-subtle, #EFECE6)",
                        marginBottom: "16px",
                        borderRadius: "4px",
                      }}
                    />
                    <div
                      style={{
                        width: "80%",
                        height: "22px",
                        backgroundColor: "var(--surface-subtle, #EFECE6)",
                        marginBottom: "16px",
                        borderRadius: "4px",
                      }}
                    />
                    <div
                      style={{
                        width: "60%",
                        height: "14px",
                        backgroundColor: "var(--surface-subtle, #EFECE6)",
                        borderRadius: "4px",
                      }}
                    />
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: "28px",
              }}
            >
              {projects.map((project) => {
                const primaryImage =
                  project.mainImage?.url ||
                  project.images?.[0]?.url ||
                  "/images/hero-solar-architectural.webp";
                const primaryAlt = project.mainImage?.altText || project.title;

                return (
                  <article
                    key={project.id}
                    style={{
                      backgroundColor: "var(--surface, #FFFFFF)",
                      border: "1px solid var(--border, #E6E4DF)",
                      borderRadius: "var(--radius-md, 14px)",
                      overflow: "hidden",
                      boxShadow: "var(--shadow-subtle, 0 2px 10px rgba(17, 17, 15, 0.03))",
                      display: "flex",
                      flexDirection: "column",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    }}
                  >
                    {/* Card Image Box */}
                    <div
                      style={{
                        position: "relative",
                        height: "260px",
                        backgroundColor: "var(--surface-subtle, #EFECE6)",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={primaryImage}
                        alt={primaryAlt}
                        loading="lazy"
                        decoding="async"
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                      {project.isFeaturedHomepage && (
                        <div
                          style={{
                            position: "absolute",
                            top: "12px",
                            right: "12px",
                            backgroundColor: "var(--accent, #F5C400)",
                            color: "var(--dark, #11110F)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: "9999px",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                          }}
                        >
                          Featured
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div
                      style={{
                        padding: "24px",
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                      }}
                    >
                      {/* Category & Year */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "12px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            color: "var(--accent-hover, #E5B800)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {project.category || "Solar Project"}
                        </span>
                        {project.completionYear && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "0.76rem",
                              color: "var(--text-muted, #6F706B)",
                            }}
                          >
                            <Calendar size={12} aria-hidden="true" />
                            {project.completionYear}
                          </span>
                        )}
                      </div>

                      {/* Project Title */}
                      <h3
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 700,
                          color: "var(--text, #111111)",
                          lineHeight: 1.25,
                          marginBottom: "14px",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {project.title}
                      </h3>

                      {/* Metadata Row: Client, Location, Size */}
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          marginBottom: "16px",
                          fontSize: "0.84rem",
                          color: "var(--text-muted, #6F706B)",
                        }}
                      >
                        {project.clientOrganization && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Building2 size={15} style={{ flexShrink: 0, color: "var(--text-light, #9B9C96)" }} aria-hidden="true" />
                            <span style={{ fontWeight: 500, color: "var(--text, #111111)" }}>{project.clientOrganization}</span>
                          </div>
                        )}
                        {project.location && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <MapPin size={15} style={{ flexShrink: 0, color: "var(--text-light, #9B9C96)" }} aria-hidden="true" />
                            <span>{project.location}</span>
                          </div>
                        )}
                        {project.size && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Zap size={15} style={{ flexShrink: 0, color: "var(--accent, #F5C400)" }} aria-hidden="true" />
                            <span style={{ fontWeight: 600, color: "var(--text, #111111)" }}>
                              {project.size}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Short Summary */}
                      {(project.shortSummary || project.description) && (
                        <p
                          style={{
                            fontSize: "0.9rem",
                            color: "var(--text-muted, #6F706B)",
                            lineHeight: 1.6,
                            margin: 0,
                            flex: 1,
                          }}
                        >
                          {project.shortSummary || project.description}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* CALL TO ACTION */}
        <section
          style={{
            backgroundColor: "var(--surface, #FFFFFF)",
            borderTop: "1px solid var(--border, #E6E4DF)",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "680px", margin: "0 auto" }}>
            <p className="eyebrow" style={{ color: "var(--accent, #F5C400)" }}>
              START YOUR PROJECT
            </p>
            <h2
              style={{
                fontSize: "clamp(1.8rem, 3vw, 2.5rem)",
                fontWeight: 700,
                color: "var(--text, #111111)",
                marginBottom: "16px",
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
              }}
            >
              Ready to explore solar for your property?
            </h2>
            <p
              style={{
                fontSize: "1rem",
                color: "var(--text-muted, #6F706B)",
                lineHeight: 1.6,
                marginBottom: "32px",
              }}
            >
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
      <footer
        style={{
          borderTop: "1px solid var(--border, #E6E4DF)",
          backgroundColor: "var(--background, #F6F5F2)",
          padding: "36px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "var(--max, 1380px)",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            fontSize: "0.82rem",
            color: "var(--text-muted, #6F706B)",
          }}
        >
          <div>&copy; {new Date().getFullYear()} Electro Tech. All rights reserved.</div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <Link href="/" style={{ color: "var(--text, #111111)", textDecoration: "none" }}>
              Home
            </Link>
            <Link href="/#about" style={{ color: "var(--text, #111111)", textDecoration: "none" }}>
              About
            </Link>
            <Link href="/#services" style={{ color: "var(--text, #111111)", textDecoration: "none" }}>
              Services
            </Link>
            <Link href="/projects" style={{ color: "var(--text, #111111)", fontWeight: 600, textDecoration: "none" }}>
              Projects
            </Link>
            <Link href="/#process" style={{ color: "var(--text, #111111)", textDecoration: "none" }}>
              Process
            </Link>
            <Link href="/#contact" style={{ color: "var(--text, #111111)", textDecoration: "none" }}>
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
