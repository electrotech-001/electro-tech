"use client";

import { Eye, MessageCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteInvoice, DocumentApiError, listInvoices, type InvoiceRecord } from "@/lib/billing/documents-api";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { printFromControl } from "@/lib/billing/print-letter";
import { formatDisplayDate, formatRupees } from "@/lib/billing/quotation-math";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { InvoiceLetter } from "./BillingLetters";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);
  const [deleting, setDeleting] = useState<InvoiceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState<InvoiceRecord | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function sendInvoice(invoice: InvoiceRecord) {
    setBusy(true);
    setBanner(null);
    setCapture(invoice);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new DocumentApiError("The PDF could not be prepared.");
      const file = await quotationToPdf(node, invoice.serial);
      await sendWhatsAppDocument({
        phone: invoice.project.whatsappNo,
        kind: "invoice",
        message: `Assalam o Alaikum ${invoice.project.customerName}, your Electro Tech invoice ${invoice.serial} is attached.`,
        file,
      });
      setBanner({ tone: "ok", text: `${invoice.serial} was sent on WhatsApp.` });
    } catch (error) {
      const message = error instanceof WhatsAppApiError || error instanceof DocumentApiError
        ? error.message
        : "The invoice could not be sent on WhatsApp.";
      setBanner({ tone: "bad", text: message });
    } finally {
      setCapture(null);
      setBusy(false);
    }
  }

  async function refresh() {
    setInvoices(await listInvoices());
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    setBanner(null);
    try {
      await deleteInvoice(deleting.id);
      if (viewing?.id === deleting.id) setViewing(null);
      await refresh();
      setBanner({ tone: "ok", text: `${deleting.serial} was deleted.` });
      setDeleting(null);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The invoice could not be deleted." });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listInvoices()
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "Invoices could not be loaded." });
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
          <p className={shell.summary}>Each invoice stays here and can be sent on WhatsApp. A later payment updates the same invoice with the amount, date, and mode.</p>
        </div>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
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
            <p>{formatDisplayDate(invoice.invoiceDate)}{invoice.installmentNumber ? ` · Installment ${invoice.installmentNumber}` : ""} · Balance {formatRupees(invoice.balanceDue)}</p>
            <p className={styles.total}>{formatRupees(invoice.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(invoice)}><Eye size={15} /> View</button>
              <button type="button" onClick={() => void sendInvoice(invoice)} disabled={busy}><MessageCircle size={15} /> WhatsApp</button>
              <button className={styles.danger} type="button" onClick={() => setDeleting(invoice)} disabled={busy}><Trash2 size={15} /> Delete</button>
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
                <button className={styles.secondaryButton} type="button" onClick={() => void sendInvoice(viewing)} disabled={busy}>WhatsApp</button>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><InvoiceLetter invoice={viewing} /></div>
          </div>
        </div>
      ) : null}
      {deleting ? (
        <div className={styles.modal} role="presentation" onClick={() => { if (!busy) setDeleting(null); }}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-invoice-title">Delete {deleting.serial}?</h2>
            <p>This removes the invoice{deleting.payments.length > 0 ? " and the payments recorded on it" : ""}. You can create it again from the project.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDelete()} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {capture ? (
        <div className={styles.capture} ref={captureRef}>
          <InvoiceLetter invoice={capture} paper />
        </div>
      ) : null}
    </>
  );
}
