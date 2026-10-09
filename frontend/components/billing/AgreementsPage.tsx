"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentApiError, listAgreements, type AgreementRecord } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees } from "@/lib/billing/quotation-math";
import { AgreementLetter } from "./BillingLetters";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

export function AgreementsPage() {
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AgreementRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAgreements()
      .then((rows) => {
        if (!cancelled) setAgreements(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "Agreements could not be loaded.");
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
          <h1 className={shell.title}>Agreements</h1>
          <p className={shell.summary}>Saved agreements keep the letterhead wording, the payment plan, and any guarantors.</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading agreements…</p> : null}
      {!loading && agreements.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No agreements yet</h2>
          <p>Generate an agreement from a project card.</p>
        </section>
      ) : null}
      <div className={styles.cards}>
        {agreements.map((agreement) => (
          <article className={styles.card} key={agreement.id}>
            <div className={styles.cardTop}>
              <strong>{agreement.serial}</strong>
              <span className={styles.badge}>{agreement.paymentMode === "installments" ? "Installments" : "Direct"}</span>
            </div>
            <h2>{agreement.project.customerName}</h2>
            <p>{formatDisplayDate(agreement.project.quotationDate)}</p>
            <p className={styles.total}>{formatRupees(agreement.project.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(agreement)}><Eye size={15} /> View</button>
            </div>
          </article>
        ))}
      </div>
      {viewing ? (
        <div className={styles.modal} role="presentation" onClick={() => setViewing(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>{viewing.serial}</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={() => window.print()}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><AgreementLetter agreement={viewing} /></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
