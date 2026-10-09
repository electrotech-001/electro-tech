"use client";

import { useEffect, useState } from "react";
import { DocumentApiError, listGuarantors, type GuarantorRecord } from "@/lib/billing/documents-api";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

export function GuarantorsPage() {
  const [guarantors, setGuarantors] = useState<GuarantorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listGuarantors()
      .then((rows) => {
        if (!cancelled) setGuarantors(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "Guarantors could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const customers = [...new Set(guarantors.map((guarantor) => guarantor.customerName))];

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Guarantors</h1>
          <p className={shell.summary}>Installment guarantors are grouped under the customer they stand for.</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading guarantors…</p> : null}
      {!loading && guarantors.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No guarantors yet</h2>
          <p>They are added when an installment agreement is saved.</p>
        </section>
      ) : null}
      {customers.map((customer) => (
        <section className={shell.panel} key={customer}>
          <h2>{customer}</h2>
          <div className={styles.cards}>
            {guarantors.filter((guarantor) => guarantor.customerName === customer).map((guarantor) => (
              <article className={styles.card} key={guarantor.id}>
                <div className={styles.cardTop}>
                  <strong>Guarantor {guarantor.slot}</strong>
                  <span className={styles.badge}>{guarantor.sector === "government" ? "Government" : "Private"}</span>
                </div>
                <h2>{guarantor.fullName}</h2>
                <p>{guarantor.designation} · {guarantor.occupation}</p>
                <div className={styles.cnicRow}>
                  <img src={guarantor.cnicFront} alt={`${guarantor.fullName} CNIC front`} />
                  <img src={guarantor.cnicBack} alt={`${guarantor.fullName} CNIC back`} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
