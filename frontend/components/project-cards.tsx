"use client";

import Image from "next/image";
import { ArrowUpRight, MapPin, Zap } from "lucide-react";
import { useState } from "react";
import { siteConfig } from "@/lib/site-config";
import styles from "./project-cards.module.css";

// Keep the full project directory intact; only explicitly featured records appear here.
const projects = siteConfig.projects.filter((project) => "featured" in project);
// Balanced desktop rows: 3 + 3 + centered 1. CSS flattens these groups on smaller screens.
const numberedProjects = projects.map((project, index) => ({ project, number: String(index + 1).padStart(2, "0") }));
const rows = [numberedProjects.slice(0, 3), numberedProjects.slice(3, 6), numberedProjects.slice(6)];

export function ProjectCards() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  return (
    <div className={styles.grid} data-active={activeProjectId ?? undefined}>
      {rows.map((row, rowIndex) => {
        const rowHasActive = row.some((item) => item.project.id === activeProjectId);
        const isThirdRow = rowIndex === 2;
        return (
          <div
            className={`${styles.row} ${isThirdRow ? styles.rowThird : styles.rowStandard}`}
            data-has-active={rowHasActive ? "true" : undefined}
            key={row[0].project.id}
          >
            {row.map(({ project, number }) => {
              const expanded = activeProjectId === project.id;
              const isSeventh = number === "07";
              return (
                <article
                  className={`${styles.card} ${isSeventh ? styles.cardSeventh : ""} ${expanded ? styles.cardExpanded : ""}`.trim()}
                  data-expanded={expanded}
                  data-project-id={project.id}
                  key={project.id}
                >
            <div className={styles.image}>
              <Image src={project.primaryImage} alt={project.primaryAlt} fill
                style={{ objectPosition: "primaryImagePosition" in project ? project.primaryImagePosition : "center" }}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className={styles.primary} aria-hidden={expanded} />
              <Image src={project.secondaryImage} alt={project.secondaryAlt} fill
                style={{ objectPosition: "secondaryImagePosition" in project ? project.secondaryImagePosition : "center" }}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className={styles.secondary} aria-hidden={!expanded} />
            </div>
            <div className={styles.info}>
              <span className={styles.index} aria-hidden="true">{number}</span>
              <h3 className={styles.title}>
                <button type="button" className={styles.toggle} aria-expanded={expanded}
                  aria-controls={`${project.id}-details`}
                  onClick={() => setActiveProjectId((current) => current === project.id ? null : project.id)}>
                  {project.title}
                  <span className={styles.arrow} aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.5} /></span>
                </button>
              </h3>
              <dl className={styles.metadata}>
                <div><dt><MapPin size={15} aria-hidden="true" /><span className={styles.srOnly}>Location</span></dt><dd>{project.location}</dd></div>
                <div><dt><Zap size={15} aria-hidden="true" /><span className={styles.srOnly}>Project size</span></dt><dd>{project.size}</dd></div>
              </dl>
              <div id={`${project.id}-details`} className={styles.details} inert={!expanded} aria-hidden={!expanded}>
                <div>
                  <p>{project.description}</p>
                  <h4>Equipment &amp; installation</h4>
                  <ul className={styles.equipment}>{project.equipment.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
            </div>
          </article>
        );
      })}
          </div>
        );
      })}
    </div>
  );
}
