"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { DocumentApiError, listInvoices, type InvoiceRecord } from "@/lib/billing/documents-api";
import { printFromControl } from "@/lib/billing/print-letter";
import { formatDisplayDate, formatRupees } from "@/lib/billing/quotation-math";
import { InvoiceLetter } from "./BillingLetters";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    listInvoices()
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "Invoices could not be loaded.");
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
          <h1 className={shell.title}>Invoices</h1>
          <p className={shell.summary}>Partial invoices stay here with the payment date. A later balance payment adds a closing invoice with every payment listed.</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading invoices…</p> : null}
      {!loading && invoices.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No invoices yet</h2>
          <p>Create an invoice from a project card.</p>
        </section>
      ) : null}
      <div className={styles.cards}>
        {invoices.map((invoice) => (
          <article className={styles.card} key={invoice.id}>
            <div className={styles.cardTop}>
              <strong>{invoice.serial}</strong>
              <span className={styles.badge}>{invoice.status === "partial" ? "Partially paid" : invoice.status === "paid" ? "Paid" : "Due"}</span>
            </div>
            <h2>{invoice.project.customerName}</h2>
            <p>{formatDisplayDate(invoice.invoiceDate)} · Balance {formatRupees(invoice.balanceDue)}</p>
            <p className={styles.total}>{formatRupees(invoice.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(invoice)}><Eye size={15} /> View</button>
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
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><InvoiceLetter invoice={viewing} /></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
