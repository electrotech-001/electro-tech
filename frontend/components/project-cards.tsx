"use client";

import Image from "next/image";
import { ArrowUpRight, MapPin, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchHomepageProjects } from "@/lib/projects";
import type { PublicProject } from "@/types/project";
import styles from "./project-cards.module.css";

export function ProjectCards() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchHomepageProjects();
        if (mounted) {
          // Exactly 3 homepage projects
          setProjects(data.slice(0, 3));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load featured projects.");
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

  if (isLoading) {
    return (
      <div className={styles.grid} aria-busy="true" aria-label="Loading featured projects">
        <div className={`${styles.row} ${styles.rowStandard}`}>
          {[1, 2, 3].map((placeholderIndex) => (
            <div
              key={placeholderIndex}
              className={styles.card}
              style={{
                minHeight: "420px",
                backgroundColor: "var(--surface)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: "260px",
                  backgroundColor: "var(--surface-subtle)",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                }}
              />
              <div style={{ padding: "24px", flex: 1 }}>
                <div
                  style={{
                    width: "32px",
                    height: "12px",
                    backgroundColor: "var(--surface-subtle)",
                    marginBottom: "16px",
                    borderRadius: "4px",
                  }}
                />
                <div
                  style={{
                    width: "75%",
                    height: "24px",
                    backgroundColor: "var(--surface-subtle)",
                    marginBottom: "20px",
                    borderRadius: "4px",
                  }}
                />
                <div
                  style={{
                    width: "50%",
                    height: "16px",
                    backgroundColor: "var(--surface-subtle)",
                    borderRadius: "4px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-muted)",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.95rem" }}>
          Unable to load featured projects right now. Please explore our full directory below.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-muted)",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.95rem" }}>
          Featured solar projects are being updated. Check back shortly.
        </p>
      </div>
    );
  }

  const rowHasActive = projects.some((p) => p.id === activeProjectId);
  const rowLayoutClass =
    projects.length === 1
      ? styles.rowOne
      : projects.length === 2
      ? styles.rowTwo
      : styles.rowStandard;

  return (
    <div className={styles.grid} data-active={activeProjectId ?? undefined}>
      <div
        className={`${styles.row} ${rowLayoutClass}`}
        data-has-active={rowHasActive ? "true" : undefined}
      >
        {projects.map((project, index) => {
          const number = String(index + 1).padStart(2, "0");
          const expanded = activeProjectId === project.id;

          const primaryImage =
            project.mainImage?.url || project.images[0]?.url || "/images/hero-solar-architectural.webp";
          const secondaryImage =
            project.images.find((img) => !img.isPrimary)?.url ||
            project.images[1]?.url ||
            primaryImage;

          const primaryAlt = project.mainImage?.altText || project.title;
          const secondaryAlt =
            project.images.find((img) => !img.isPrimary)?.altText ||
            project.mainImage?.altText ||
            project.title;

          return (
            <article
              className={`${styles.card} ${expanded ? styles.cardExpanded : ""}`.trim()}
              data-expanded={expanded}
              data-project-id={project.id}
              key={project.id}
            >
              <div className={styles.image}>
                <Image
                  src={primaryImage}
                  alt={primaryAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className={styles.primary}
                  aria-hidden={expanded}
                  unoptimized
                />
                <Image
                  src={secondaryImage}
                  alt={secondaryAlt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className={styles.secondary}
                  aria-hidden={!expanded}
                  unoptimized
                />
              </div>

              <div className={styles.info}>
                <span className={styles.index} aria-hidden="true">
                  {number}
                </span>
                <h3 className={styles.title}>
                  <button
                    type="button"
                    className={styles.toggle}
                    aria-expanded={expanded}
                    aria-controls={`${project.id}-details`}
                    onClick={() =>
                      setActiveProjectId((current) => (current === project.id ? null : project.id))
                    }
                  >
                    {project.title}
                    <span className={styles.arrow} aria-hidden="true">
                      <ArrowUpRight size={18} strokeWidth={1.5} />
                    </span>
                  </button>
                </h3>

                <dl className={styles.metadata}>
                  {project.location && (
                    <div>
                      <dt>
                        <MapPin size={15} aria-hidden="true" />
                        <span className={styles.srOnly}>Location</span>
                      </dt>
                      <dd>{project.location}</dd>
                    </div>
                  )}
                  {project.size && (
                    <div>
                      <dt>
                        <Zap size={15} aria-hidden="true" />
                        <span className={styles.srOnly}>Project size</span>
                      </dt>
                      <dd>{project.size}</dd>
                    </div>
                  )}
                </dl>

                <div
                  id={`${project.id}-details`}
                  className={styles.details}
                  inert={!expanded}
                  aria-hidden={!expanded}
                >
                  <div>
                    <p>{project.shortSummary || project.description}</p>
                    {project.equipment && project.equipment.length > 0 ? (
                      <>
                        <h4>Equipment &amp; installation</h4>
                        <ul className={styles.equipment}>
                          {project.equipment.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </>
                    ) : project.fullStory ? (
                      <>
                        <h4>Project Details</h4>
                        <p style={{ whiteSpace: "pre-wrap" }}>{project.fullStory}</p>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
