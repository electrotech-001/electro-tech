"use client";

import { BadgeCheck, Eye, FileSignature, MessageCircle, Receipt, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { completeProject, DocumentApiError, listAgreements, listInvoices, listReceiveProjects, type AgreementRecord, type InvoiceRecord, type ReceiveProject } from "@/lib/billing/documents-api";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { formatDisplayDate, formatRupees, type QuotationRecord } from "@/lib/billing/quotation-math";
import { disapproveProject, listProjects, QuotationApiError } from "@/lib/billing/quotations-api";
import { printFromControl } from "@/lib/billing/print-letter";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { AgreementLetter, InvoiceLetter } from "./BillingLetters";
import shell from "./billing-shell.module.css";
import { AgreementDialog, DirectPaymentDialog, InstallmentInvoiceDialog } from "./ProjectFlow";
import { QuotationDialog } from "./QuotationLetter";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function latestInvoice(invoices: InvoiceRecord[], projectId: string): InvoiceRecord | null {
  const rows = invoices.filter((invoice) => invoice.projectId === projectId);
  return rows.find((invoice) => invoice.kind === "settlement") ?? rows[rows.length - 1] ?? null;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<QuotationRecord[]>([]);
  const [receive, setReceive] = useState<ReceiveProject[]>([]);
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [viewing, setViewing] = useState<QuotationRecord | null>(null);
  const [agreementView, setAgreementView] = useState<AgreementRecord | null>(null);
  const [invoiceView, setInvoiceView] = useState<InvoiceRecord | null>(null);
  const [drafting, setDrafting] = useState<QuotationRecord | null>(null);
  const [billing, setBilling] = useState<QuotationRecord | null>(null);
  const [installmentView, setInstallmentView] = useState<QuotationRecord | null>(null);
  const [disapproving, setDisapproving] = useState<QuotationRecord | null>(null);
  const [completing, setCompleting] = useState<QuotationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState<{ agreement?: AgreementRecord; invoice?: InvoiceRecord } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const [projectRows, agreementRows, invoiceRows, receiveRows] = await Promise.all([
      listProjects(),
      listAgreements(),
      listInvoices(),
      listReceiveProjects(),
    ]);
    setProjects(projectRows);
    setAgreements(agreementRows);
    setInvoices(invoiceRows);
    setReceive(receiveRows);
  }

  useEffect(() => {
    let cancelled = false;
    refresh()
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

  async function onDisapprove() {
    if (!disapproving) return;
    setBusy(true);
    setBanner(null);
    try {
      await disapproveProject(disapproving.id);
      await refresh();
      setBanner({ tone: "ok", text: `${disapproving.serial} is back in Quotations.` });
      setDisapproving(null);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The project could not be moved back." });
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    if (!completing) return;
    setBusy(true);
    setBanner(null);
    try {
      await completeProject(completing.id);
      await refresh();
      setBanner({ tone: "ok", text: `${completing.serial} is marked completed.` });
      setCompleting(null);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The project could not be completed." });
    } finally {
      setBusy(false);
    }
  }

  async function sendLetter(project: QuotationRecord, kind: "agreement" | "invoice") {
    const agreement = agreements.find((entry) => entry.projectId === project.id);
    const invoice = latestInvoice(invoices, project.id);
    if (kind === "agreement" && !agreement) {
      setBanner({ tone: "bad", text: "Save the agreement before sending it on WhatsApp." });
      return;
    }
    if (kind === "invoice" && !invoice) {
      setBanner({ tone: "bad", text: "Create an invoice before sending it on WhatsApp." });
      return;
    }
    setBusy(true);
    setBanner(null);
    setCapture(kind === "agreement" && agreement ? { agreement } : invoice ? { invoice } : null);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new DocumentApiError("The PDF could not be prepared.");
      const serial = kind === "agreement" ? agreement?.serial ?? project.serial : invoice?.serial ?? project.serial;
      const file = await quotationToPdf(node, serial);
      await sendWhatsAppDocument({
        phone: project.whatsappNo,
        kind,
        message: `Assalam o Alaikum ${project.customerName}, your Electro Tech ${kind} ${serial} is attached.`,
        file,
      });
      setBanner({ tone: "ok", text: `${serial} was sent on WhatsApp.` });
    } catch (error) {
      const message = error instanceof WhatsAppApiError || error instanceof DocumentApiError ? error.message : "The document could not be sent on WhatsApp.";
      setBanner({ tone: "bad", text: message });
    } finally {
      setCapture(null);
      setBusy(false);
    }
  }

  const active = projects.filter((project) => project.status !== "completed");
  const completed = projects.filter((project) => project.status === "completed");

  function renderCard(project: QuotationRecord) {
    const agreement = agreements.find((entry) => entry.projectId === project.id);
    const invoice = latestInvoice(invoices, project.id);
    const workspace = receive.find((entry) => entry.project.id === project.id);
    const balance = workspace?.balance ?? project.grandTotal;
    const done = project.status === "completed";
    return (
      <article className={styles.card} key={project.id}>
        <div className={styles.cardTop}>
          <strong>{project.serial}</strong>
          <span className={styles.badge}>{done ? "Completed" : "In process"}</span>
        </div>
        <h2>{project.customerName}</h2>
        <p>{formatDisplayDate(project.quotationDate)} · {project.paymentMode === "installments" ? "Installments" : "Direct"}</p>
        <p className={styles.packageText}>{project.customerPackage}</p>
        <p className={styles.total}>{formatRupees(project.grandTotal)}</p>
        <div className={styles.cardActions}>
          <button type="button" onClick={() => setViewing(project)}><Eye size={15} /> View</button>
          {done ? null : (
            <button type="button" onClick={() => project.paymentMode === "installments" ? setInstallmentView(project) : setBilling(project)} disabled={project.paymentMode === "direct" && balance <= 0}>
              <Receipt size={15} /> Create Invoice
            </button>
          )}
          {done ? null : agreement ? (
            <button type="button" onClick={() => setAgreementView(agreement)}><FileSignature size={15} /> View agreement</button>
          ) : (
            <button type="button" onClick={() => setDrafting(project)}><FileSignature size={15} /> Generate Agreement</button>
          )}
          {done ? null : <button type="button" onClick={() => setCompleting(project)}><BadgeCheck size={15} /> Project completed</button>}
          <button type="button" onClick={() => void sendLetter(project, "agreement")} disabled={busy || !agreement}><MessageCircle size={15} /> WhatsApp agreement</button>
          <button type="button" onClick={() => void sendLetter(project, "invoice")} disabled={busy || !invoice}><MessageCircle size={15} /> WhatsApp invoice</button>
          {done || agreement || invoice ? null : (
            <button type="button" onClick={() => setDisapproving(project)} disabled={busy}><Undo2 size={15} /> Disapprove</button>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Projects in Process</h1>
          <p className={shell.summary}>Create the invoice and agreement from a project card. Completed projects stay in the list below.</p>
        </div>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading projects…</p> : null}
      {!loading && active.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No projects in process</h2>
          <p>Approve a quotation and its copy will appear here.</p>
        </section>
      ) : null}
      <div className={styles.cards}>{active.map(renderCard)}</div>
      {completed.length > 0 ? (
        <>
          <h2 className={styles.blockLabel}>Completed</h2>
          <div className={styles.cards}>{completed.map(renderCard)}</div>
        </>
      ) : null}

      {viewing ? <QuotationDialog quotation={viewing} onClose={() => setViewing(null)} /> : null}
      {agreementView ? (
        <div className={styles.modal} role="presentation" onClick={() => setAgreementView(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>{agreementView.serial}</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setAgreementView(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><AgreementLetter agreement={agreementView} /></div>
          </div>
        </div>
      ) : null}
      {invoiceView ? (
        <div className={styles.modal} role="presentation" onClick={() => setInvoiceView(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>{invoiceView.serial}</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setInvoiceView(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><InvoiceLetter invoice={invoiceView} /></div>
          </div>
        </div>
      ) : null}
      {drafting ? <AgreementDialog project={drafting} onClose={() => setDrafting(null)} onSaved={() => { setDrafting(null); void refresh(); }} /> : null}
      {billing ? (
        <DirectPaymentDialog
          project={billing}
          balance={receive.find((entry) => entry.project.id === billing.id)?.balance ?? billing.grandTotal}
          onClose={() => setBilling(null)}
          onSaved={() => { setBilling(null); void refresh(); }}
        />
      ) : null}
      {installmentView ? (
        <InstallmentInvoiceDialog
          invoices={invoices.filter((invoice) => invoice.projectId === installmentView.id)}
          onClose={() => setInstallmentView(null)}
          onView={(invoice) => { setInstallmentView(null); setInvoiceView(invoice); }}
        />
      ) : null}
      {disapproving ? (
        <div className={styles.modal} role="presentation" onClick={() => setDisapproving(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Disapprove {disapproving.serial}?</h2>
            <p>This removes the project and brings the quotation back to the quotations list.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setDisapproving(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDisapprove()} disabled={busy}>Disapprove</button>
            </div>
          </div>
        </div>
      ) : null}
      {completing ? (
        <div className={styles.modal} role="presentation" onClick={() => setCompleting(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Mark {completing.serial} completed?</h2>
            <p>It leaves Projects in Process and will no longer accept new payments.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setCompleting(null)} disabled={busy}>Cancel</button>
              <button className={styles.primaryButton} type="button" onClick={() => void onComplete()} disabled={busy}>Project completed</button>
            </div>
          </div>
        </div>
      ) : null}
      {capture ? (
        <div className={styles.capture} ref={captureRef}>
          {capture.agreement ? <AgreementLetter agreement={capture.agreement} paper /> : null}
          {capture.invoice ? <InvoiceLetter invoice={capture.invoice} paper /> : null}
        </div>
      ) : null}
    </>
  );
}
