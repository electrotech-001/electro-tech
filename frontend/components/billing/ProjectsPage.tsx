"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentApiError } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees, type QuotationRecord } from "@/lib/billing/quotation-math";
import { listProjects, QuotationApiError } from "@/lib/billing/quotations-api";
import shell from "./billing-shell.module.css";
import { QuotationDialog } from "./QuotationLetter";
import styles from "./quotation.module.css";
import "./quotation-print.css";

export function ProjectsPage() {
  const [projects, setProjects] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [viewing, setViewing] = useState<QuotationRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows.filter((project) => project.status === "completed"));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof QuotationApiError || error instanceof DocumentApiError
            ? error.message
            : "Projects could not be loaded.";
          setBanner({ tone: "bad", text: message });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Completed Projects</h1>
          <p className={shell.summary}>A project appears here automatically once the customer's invoice is fully paid.</p>
        </div>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading projects…</p> : null}
      {!loading && projects.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No completed projects</h2>
          <p>When a customer's payment is complete, the project is marked completed and listed here.</p>
        </section>
      ) : null}
      <div className={styles.cards}>
        {projects.map((project) => (
          <article className={styles.card} key={project.id}>
            <div className={styles.cardTop}>
              <strong>{project.serial}</strong>
              <span className={`${styles.badge} ${styles.badgeDone}`}>Completed</span>
            </div>
            <h2>{project.customerName}</h2>
            <p>{formatDisplayDate(project.quotationDate)} · {project.paymentMode === "installments" ? "Installments" : "Direct"}</p>
            <p className={styles.packageText}>{project.customerPackage}</p>
            <p className={styles.total}>{formatRupees(project.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(project)}><Eye size={15} /> View</button>
            </div>
          </article>
        ))}
      </div>
      {viewing ? <QuotationDialog quotation={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
