"use client";

import { Copy, Eye, FileSignature, MessageCircle, Pencil, Plus, Printer, Search, Trash2, Undo2, Wallet } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createDirectSale, deleteInvoice, DocumentApiError, listInvoices, nextDirectSaleSerial, saveAgreement, updateDueDate, updateInvoiceDiscount, type InvoiceRecord, type PaymentRecord } from "@/lib/billing/documents-api";
import { consolidatedInvoice, groupInvoices, installmentDueDate, outstandingBalances, plannedInvoice } from "@/lib/billing/pending-invoices";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { printBillingLetter, printFromControl } from "@/lib/billing/print-letter";
import { addMonths, customInstallments, formatDisplayDate, formatRupees, isDirectSale, todayIsoDate, withoutAdvance, type QuotationDraft, type QuotationRecord } from "@/lib/billing/quotation-math";
import { disapproveProject, listProjects, QuotationApiError, setPlanDiscount, updateProject } from "@/lib/billing/quotations-api";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { InvoiceLetter, PaymentSlip } from "./BillingLetters";
import { DirectSaleForm } from "./DirectSaleForm";
import { QuotationForm } from "./QuotationForm";
import { AgreementDialog, DirectPaymentDialog, type PaymentTarget } from "./ProjectFlow";
import { AmountInput } from "./FancyControls";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function directDueDates(invoice: InvoiceRecord): { number: number; dueDate: string }[] | null {
  if (!isDirectSale(invoice.project) || invoice.project.paymentMode !== "installments") return null;
  if (invoice.schedule && invoice.schedule.length > 0) {
    return invoice.schedule.map((line) => ({ number: line.number, dueDate: line.dueDate }));
  }
  if (invoice.installmentNumber != null) {
    return [{ number: invoice.installmentNumber, dueDate: invoice.dueDate ?? "" }];
  }
  return null;
}

function patchDueDate(invoice: InvoiceRecord, installmentNumber: number, dueDate: string): InvoiceRecord {
  return {
    ...invoice,
    dueDate: invoice.installmentNumber === installmentNumber ? dueDate : invoice.dueDate,
    schedule: invoice.schedule?.map((line) => line.number === installmentNumber ? { ...line, dueDate } : line),
  };
}

function openingInvoice(invoice: InvoiceRecord): boolean {
  if (isDirectSale(invoice.project) && invoice.project.paymentMode === "direct") return false;
  const opening = invoice.project.downPayment ?? 0;
  return invoice.kind === "advance" && invoice.installmentNumber == null && opening > 0 && invoice.grandTotal <= opening + 0.001;
}

function paymentTarget(invoice: InvoiceRecord): PaymentTarget {
  if (invoice.installmentNumber != null) return { kind: "installment", installmentNumber: invoice.installmentNumber };
  if (openingInvoice(invoice)) return { kind: "opening" };
  return { kind: "direct" };
}

function invoicePill(invoice: InvoiceRecord): string {
  if (consolidatedInvoice(invoice)) return `Paid · ${invoice.schedule?.length ?? invoice.project.installments.length} installments`;
  if (invoice.installmentNumber != null) {
    if (invoice.status === "paid") return "Paid";
    if (invoice.status === "partial") return "Partially paid";
    return "Due";
  }
  if (openingInvoice(invoice)) {
    return invoice.project.paymentMode === "installments" ? "Down payment" : "Advance payment";
  }
  if (invoice.kind === "settlement" || invoice.installmentNumber) return "Balance";
  if (invoice.project.origin === "direct_sale") {
    if (invoice.status === "partial") return "Direct · Partial";
    if (invoice.status === "paid") return "Direct · Paid";
    return "Direct invoice";
  }
  if (invoice.status === "partial") return "Partially paid";
  if (invoice.status === "paid") return "Paid";
  return "Pending";
}

export function InvoicesPage({ completed = false }: { completed?: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);
  const [discount, setDiscount] = useState(0);
  const [deleting, setDeleting] = useState<InvoiceRecord | null>(null);
  const [undoing, setUndoing] = useState<InvoiceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState<InvoiceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [agreementProject, setAgreementProject] = useState<QuotationRecord | null>(null);
  const [saleSerial, setSaleSerial] = useState("DS-001");
  const [copyDraft, setCopyDraft] = useState<QuotationDraft | null>(null);
  const [editing, setEditing] = useState<InvoiceRecord | null>(null);
  const [editDraft, setEditDraft] = useState<QuotationDraft | null>(null);
  const [receiving, setReceiving] = useState<InvoiceRecord | null>(null);
  const [slip, setSlip] = useState<{ project: QuotationRecord; payment: PaymentRecord } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function sendInvoice(invoice: InvoiceRecord) {
    const destination = invoice.project.whatsappNo.trim();
    if (!destination) {
      setBanner({ tone: "bad", text: "Save a WhatsApp number on this customer before sending the invoice." });
      return;
    }
    setBusy(true);
    setBanner(null);
    setCapture(invoice);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new DocumentApiError("The PDF could not be prepared.");
      const file = await quotationToPdf(node, invoice.serial);
      await sendWhatsAppDocument({
        phone: destination,
        kind: "invoice",
        message: `Assalam o Alaikum ${invoice.project.customerName}, your Electro Tech invoice ${invoice.serial} is attached.`,
        file,
      });
      setBanner({ tone: "ok", text: `${invoice.serial} was sent to ${destination} on WhatsApp.` });
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

  async function printInvoice(invoice: InvoiceRecord) {
    setBusy(true);
    setBanner(null);
    setCapture(invoice);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const root = captureRef.current;
      if (!root) throw new DocumentApiError("The invoice could not be prepared for printing.");
      await printBillingLetter(root);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The invoice could not be printed." });
    } finally {
      setCapture(null);
      setBusy(false);
    }
  }

  async function refresh() {
    const [invoiceRows, projectRows] = await Promise.all([
      listInvoices(),
      listProjects().catch(() => [] as QuotationRecord[]),
    ]);
    setInvoices(invoiceRows);
    setProjects(projectRows);
  }

  function openInvoice(invoice: InvoiceRecord) {
    setDiscount(plannedInvoice(invoice) ? invoice.project.planDiscount ?? 0 : invoice.discountAmount ?? 0);
    setViewing(invoice);
  }

  async function saveDueDate(installmentNumber: number, dueDate: string) {
    if (!viewing || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;
    const previous = viewing;
    setViewing(patchDueDate(viewing, installmentNumber, dueDate));
    setInvoices((rows) => rows.map((invoice) => invoice.projectId === viewing.projectId ? patchDueDate(invoice, installmentNumber, dueDate) : invoice));
    setBusy(true);
    setBanner(null);
    try {
      const saved = await updateDueDate(viewing.project.id, installmentNumber, dueDate);
      setInvoices((rows) => {
        const others = rows.filter((invoice) => invoice.projectId !== saved.project.id);
        return [...saved.invoices, ...others];
      });
      const next = saved.invoices.find((invoice) => invoice.id === viewing.id) ?? null;
      if (next) setViewing(next);
      setBanner({ tone: "ok", text: `Installment ${installmentNumber} due date was saved.` });
    } catch (error) {
      setViewing(previous);
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The due date could not be saved." });
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveDiscount() {
    if (!viewing) return;
    setBusy(true);
    setBanner(null);
    try {
      if (plannedInvoice(viewing)) {
        const saved = await setPlanDiscount(viewing.project.id, Number(discount) || 0);
        const projectRows = projects.map((project) => project.id === saved.id ? saved : project);
        setProjects(projectRows);
        const next = outstandingBalances(projectRows, invoices).find((invoice) => invoice.id === viewing.id) ?? null;
        if (next) {
          setViewing(next);
          setDiscount(next.project.planDiscount ?? 0);
        }
        setBanner({ tone: "ok", text: `Discount saved. The balance is divided across the installment months.` });
        return;
      }
      const saved = await updateInvoiceDiscount(viewing.id, Number(discount) || 0);
      const next = saved.invoices.find((invoice) => invoice.id === viewing.id) ?? null;
      setInvoices((rows) => {
        const others = rows.filter((invoice) => invoice.projectId !== saved.project.id);
        return [...saved.invoices, ...others];
      });
      if (next) {
        setViewing(next);
        setDiscount(next.discountAmount ?? 0);
      }
      setBanner({ tone: "ok", text: `Discount saved on ${viewing.serial}.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError || error instanceof QuotationApiError ? error.message : "The discount could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  function draftFromProject(project: QuotationRecord, quotationDate = project.quotationDate): QuotationDraft {
    return {
      quotationDate,
      customerName: project.customerName,
      cnic: project.cnic,
      address: project.address,
      contactNo: project.contactNo,
      whatsappNo: project.whatsappNo,
      customerPackage: project.customerPackage,
      paymentMode: project.paymentMode,
      downPayment: project.downPayment,
      planDiscount: project.planDiscount ?? 0,
      installmentCount: project.paymentMode === "installments" ? project.installmentCount ?? null : null,
      installmentAmounts: project.paymentMode === "installments" ? project.installmentAmounts ?? null : null,
      items: project.items.map((item) => ({
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        price: item.price,
        taxPercent: item.taxPercent,
      })),
    };
  }

  function beginEdit(invoice: InvoiceRecord) {
    setEditing(invoice);
    const draft = draftFromProject(invoice.project);
    setEditDraft(isDirectSale(invoice.project) ? withoutAdvance(draft) : draft);
    setBanner(null);
  }

  async function saveEdit() {
    if (!editing || !editDraft) return;
    setBusy(true);
    setBanner(null);
    try {
      await updateProject(editing.project.id, editDraft);
      const serial = editing.serial;
      setEditing(null);
      setEditDraft(null);
      await refresh();
      setBanner({ tone: "ok", text: `${serial} was updated.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError || error instanceof DocumentApiError ? error.message : "The invoice could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  function saleFromInvoice(invoice: InvoiceRecord): { draft: QuotationDraft; dueDates?: string[] } {
    const project = invoice.project;
    const dates = (invoice.schedule ?? []).map((line) => line.dueDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
    const installmentCount = project.paymentMode === "installments" ? project.installmentCount ?? (dates.length || null) : null;
    const dueDates = project.paymentMode === "installments" && installmentCount != null && dates.length === installmentCount ? dates : undefined;
    return {
      dueDates,
      draft: { ...draftFromProject(project, todayIsoDate()), installmentCount },
    };
  }

  async function onDuplicate(invoice: InvoiceRecord) {
    const sale = saleFromInvoice(invoice);
    if (sale.draft.paymentMode === "installments" && !sale.dueDates) {
      setCopyDraft(sale.draft);
      setBanner(null);
      void nextDirectSaleSerial().then(setSaleSerial).catch(() => setSaleSerial("DS-001"));
      setCreating(true);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const saved = await createDirectSale(sale.draft, { paidAmount: 0, paymentDate: todayIsoDate(), paymentMode: "cash" }, sale.dueDates);
      await refresh();
      setBanner({ tone: "ok", text: `${saved.invoices[0]?.serial ?? "A new invoice"} was created as a copy of ${invoice.serial}.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The invoice could not be duplicated." });
    } finally {
      setBusy(false);
    }
  }

  async function onUndoApproval() {
    if (!undoing) return;
    setBusy(true);
    setBanner(null);
    try {
      const quotation = await disapproveProject(undoing.project.id);
      if (viewing?.projectId === undoing.projectId) setViewing(null);
      await refresh();
      setBanner({ tone: "ok", text: `${quotation.serial} is back in Quotations and its invoice was removed.` });
      setUndoing(null);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The approval could not be undone." });
      setUndoing(null);
    } finally {
      setBusy(false);
    }
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
    Promise.all([
      listInvoices(),
      listProjects().catch(() => [] as QuotationRecord[]),
    ])
      .then(([invoiceRows, projectRows]) => {
        if (!cancelled) {
          setInvoices(invoiceRows);
          setProjects(projectRows);
        }
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

  const pendingBalances = completed ? [] : outstandingBalances(projects, invoices);
  const groups = groupInvoices(invoices);
  const listed = completed ? groups.completed : [...groups.open, ...pendingBalances];
  const query = search.trim().toLowerCase();
  const visible = query ? listed.filter((invoice) => invoice.project.customerName.toLowerCase().includes(query)) : listed;
  function undoable(invoice: InvoiceRecord): boolean {
    if (completed || !invoice.project.sourceQuotationId || isDirectSale(invoice.project)) return false;
    if (invoices.some((row) => row.projectId === invoice.projectId && row.payments.length > 0)) return false;
    return invoice.project.paymentMode === "direct" || plannedInvoice(invoice);
  }

  function invoiceCard(invoice: InvoiceRecord): ReactNode {
    const destination = invoice.project.whatsappNo.trim();
    const dueDate = installmentDueDate(invoice);
    const needsAgreement = !completed && invoice.project.paymentMode === "installments" && !isDirectSale(invoice.project) && plannedInvoice(invoice);
    return (
      <article
        className={`${styles.card} ${invoice.status === "paid" ? styles.cardPaid : invoice.status === "partial" ? styles.cardPartial : styles.cardDue}`}
        key={invoice.id}
      >
        <div className={styles.cardTop}>
          <strong>{invoice.serial}</strong>
          <span className={`${styles.badge} ${invoice.status === "paid" ? "" : styles.badgeLive}`}>{invoicePill(invoice)}</span>
        </div>
        <h2>{invoice.project.customerName}</h2>
        <p>{dueDate
          ? `Installment ${invoice.installmentNumber} · Due ${formatDisplayDate(dueDate)}`
          : `${formatDisplayDate(invoice.invoiceDate)}${invoice.installmentNumber ? ` · Installment ${invoice.installmentNumber}` : ""}${invoice.dueDate ? ` · Due ${formatDisplayDate(invoice.dueDate)}` : ""}`}</p>
        <p className={styles.total}>{formatRupees(invoice.grandTotal)}</p>
        <div className={styles.moneySplit}>
          <p className={styles.moneyPaid}><span>Paid</span><strong>{formatRupees(invoice.advancePaid)}</strong></p>
          <p className={styles.moneyPending}><span>Pending</span><strong>{formatRupees(invoice.balanceDue)}</strong></p>
        </div>
        {(invoice.discountAmount ?? 0) > 0 ? <p>Discount {formatRupees(invoice.discountAmount ?? 0)}</p> : null}
        <div className={styles.cardActions}>
          <button type="button" onClick={() => openInvoice(invoice)}><Eye size={15} /> View</button>
          {completed || invoice.balanceDue <= 0 ? null : <button type="button" onClick={() => { setBanner(null); setReceiving(invoice); }} disabled={busy}><Wallet size={15} /> Receive payment</button>}
          <button type="button" onClick={() => beginEdit(invoice)}><Pencil size={15} /> Edit</button>
          <button type="button" onClick={() => void onDuplicate(invoice)} disabled={busy}><Copy size={15} /> Duplicate</button>
          {needsAgreement ? <button type="button" onClick={() => setAgreementProject(invoice.project)}><FileSignature size={15} /> Agreement</button> : null}
          {completed ? <button type="button" onClick={() => void printInvoice(invoice)} disabled={busy}><Printer size={15} /> Print</button> : null}
          <button className={styles.whatsappButton} type="button" onClick={() => void sendInvoice(invoice)} disabled={busy || !destination} title={destination ? `Send to ${destination}` : "Save a WhatsApp number on this customer first"}><MessageCircle size={15} /> WhatsApp</button>
          {undoable(invoice) ? <button type="button" onClick={() => { setBanner(null); setUndoing(invoice); }} disabled={busy}><Undo2 size={15} /> Undo approval</button> : null}
          {plannedInvoice(invoice) || consolidatedInvoice(invoice) ? null : <button className={styles.danger} type="button" onClick={() => setDeleting(invoice)} disabled={busy}><Trash2 size={15} /> Delete</button>}
        </div>
      </article>
    );
  }

  if (editing && editDraft) {
    return (
      <>
        <header className={shell.pageHeader}>
          <div>
            <p className={shell.kicker}>Billing CMS</p>
            <h1 className={shell.title}>Edit {editing.serial}</h1>
            <p className={shell.summary}>Change the customer, phone numbers, package, items, or payment amounts, then save this invoice.</p>
          </div>
        </header>
        {banner?.tone === "ok" ? <p className={styles.success}>{banner.text}</p> : null}
        <section className={shell.panel}>
          <QuotationForm
            serial={editing.serial}
            draft={editDraft}
            saving={busy}
            error={banner?.tone === "bad" ? banner.text : null}
            serialLabel="Invoice serial no"
            showDate={false}
            submitLabel="Save invoice"
            advancePayment={!isDirectSale(editing.project)}
            onChange={(next) => setEditDraft(isDirectSale(editing.project) ? withoutAdvance(next) : next)}
            onCancel={() => { setEditing(null); setEditDraft(null); setBanner(null); }}
            onSubmit={() => void saveEdit()}
          />
        </section>
      </>
    );
  }

  if (creating) {
    return (
      <>
        <header className={shell.pageHeader}>
          <div>
            <p className={shell.kicker}>Billing CMS</p>
            <h1 className={shell.title}>{copyDraft ? "Copy invoice" : "New direct invoice"}</h1>
            <p className={shell.summary}>{copyDraft ? "This copy keeps the customer and the items. Choose each installment due date, then save." : "Create a daily-sale invoice without a quotation. The same fields as a quotation are used."}</p>
          </div>
        </header>
        {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
        <section className={shell.panel}>
          <DirectSaleForm
            serial={saleSerial}
            initialDraft={copyDraft ?? undefined}
            onCancel={() => { setCreating(false); setCopyDraft(null); }}
            onCreated={async (saved) => {
              setCreating(false);
              setCopyDraft(null);
              await refresh();
              setBanner({ tone: "ok", text: `${saved.invoices[0]?.serial ?? "Invoice"} was created for ${saved.project.customerName}.` });
            }}
          />
        </section>
      </>
    );
  }

  const editableDueDates = viewing && !consolidatedInvoice(viewing) ? directDueDates(viewing) : null;

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>{completed ? "Completed Invoices" : "Invoices"}</h1>
          <p className={shell.summary}>
            {completed
              ? "Fully paid invoices stay here. An installment plan moves here as one combined invoice once every installment is paid. You can view, edit, and print them."
              : "Direct invoices from daily sales and invoices from approved quotations. Each one stays here until the balance is received."}
          </p>
        </div>
        {completed ? null : (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => {
              setCopyDraft(null);
              void nextDirectSaleSerial().then(setSaleSerial).catch(() => setSaleSerial("DS-001"));
              setCreating(true);
            }}
          >
            <Plus size={16} /> Direct invoice
          </button>
        )}
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      <label className={`${styles.searchBox} ${styles.invoiceSearch}`}>
        <Search size={15} />
        <input
          type="search"
          value={search}
          placeholder="Search by customer name"
          aria-label="Search invoices by customer name"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {loading ? <p className={styles.hint}>Loading invoices…</p> : null}
      {!loading && visible.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          {query && listed.length > 0 ? (
            <>
              <h2>No matching invoices</h2>
              <p>No invoice has a customer name that matches “{search.trim()}”.</p>
            </>
          ) : (
            <>
              <h2>{completed ? "No completed invoices" : "No invoices"}</h2>
              <p>{completed ? "An invoice moves here once it is fully paid. Installment invoices move together when the last installment is paid." : "Create a direct invoice for a daily sale, or approve a quotation and its invoice appears here."}</p>
            </>
          )}
        </section>
      ) : null}
      {visible.length > 0 ? (
        <section className={styles.invoiceGroup}>
          <div className={styles.cards}>{visible.map(invoiceCard)}</div>
        </section>
      ) : null}
      {viewing ? (
        <div className={styles.modal} role="presentation" onClick={() => setViewing(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>{viewing.serial}</h2>
              <div>
                <button className={`${styles.secondaryButton} ${styles.whatsappButton}`} type="button" onClick={() => void sendInvoice(viewing)} disabled={busy || !viewing.project.whatsappNo.trim()} title={viewing.project.whatsappNo.trim() ? `Send to ${viewing.project.whatsappNo.trim()}` : "Save a WhatsApp number on this customer first"}>
                  WhatsApp{viewing.project.whatsappNo.trim() ? ` · ${viewing.project.whatsappNo.trim()}` : ""}
                </button>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setViewing(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}>
              {editableDueDates ? (
                <div className={styles.discountBar}>
                  {editableDueDates.map((line) => (
                    <label className={styles.field} key={line.number}>
                      <span>Installment {line.number} due date</span>
                      <input
                        type="date"
                        value={line.dueDate}
                        disabled={busy}
                        onChange={(event) => {
                          const dueDate = event.target.value;
                          if (dueDate) void saveDueDate(line.number, dueDate);
                        }}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              {consolidatedInvoice(viewing) || (plannedInvoice(viewing) && (viewing.project.paymentMode !== "installments" || customInstallments(viewing.project))) ? null : (
                <div className={styles.discountBar}>
                  <label className={styles.field}>
                    <span>{plannedInvoice(viewing) ? "Discount after down payment" : "Discount amount"}</span>
                    <AmountInput value={discount} onChange={(amount) => setDiscount(amount ?? 0)} />
                  </label>
                  <button className={styles.primaryButton} type="button" onClick={() => void saveDiscount()} disabled={busy}>Save discount</button>
                </div>
              )}
              <InvoiceLetter invoice={viewing} />
            </div>
          </div>
        </div>
      ) : null}
      {deleting ? (
        <div className={styles.modal} role="presentation" onClick={() => { if (!busy) setDeleting(null); }}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-invoice-title">Delete {deleting.serial}?</h2>
            <p>This removes the invoice{deleting.payments.length > 0 ? " and the payments recorded on it" : ""}. The quotation stays.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDelete()} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {undoing ? (
        <div className={styles.modal} role="presentation" onClick={() => { if (!busy) setUndoing(null); }}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="undo-approval-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="undo-approval-title">Undo approval of {undoing.serial}?</h2>
            <p>This removes the invoice{undoing.project.paymentMode === "installments" ? "s of this plan" : ""} and moves the quotation back to Quotations. You can edit it and approve it again.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setUndoing(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onUndoApproval()} disabled={busy}>{busy ? "Undoing…" : "Undo approval"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {receiving ? (
        <DirectPaymentDialog
          project={receiving.project}
          serial={receiving.serial}
          balance={receiving.balanceDue}
          firstPayment={paymentTarget(receiving).kind === "direct" && receiving.advancePaid <= 0}
          target={paymentTarget(receiving)}
          prepare={plannedInvoice(receiving)
            ? async () => {
              const today = todayIsoDate();
              const dueDates = receiving.project.installments.map((_, index) => addMonths(today, index + 1));
              await saveAgreement(receiving.project.id, { dueDates, guarantors: [] });
            }
            : undefined}
          onClose={() => setReceiving(null)}
          onSaved={(payment) => {
            const { project, serial } = receiving;
            setReceiving(null);
            if (payment) setSlip({ project, payment });
            void refresh().then(() => setBanner({ tone: "ok", text: `Payment received on ${serial} and added to the payment ledger.` }));
          }}
        />
      ) : null}
      {slip ? (
        <div className={styles.modal} role="presentation" onClick={() => setSlip(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>Paid slip</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => setSlip(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><PaymentSlip project={slip.project} payment={slip.payment} /></div>
          </div>
        </div>
      ) : null}
      {agreementProject ? (
        <AgreementDialog
          project={agreementProject}
          onClose={() => setAgreementProject(null)}
          onSaved={() => {
            setAgreementProject(null);
            void refresh().then(() => setBanner({ tone: "ok", text: `The agreement and invoices for ${agreementProject.customerName} were saved.` }));
          }}
        />
      ) : null}
      {capture ? (
        <div className={styles.capture} ref={captureRef} data-capture>
          <InvoiceLetter invoice={capture} paper />
        </div>
      ) : null}
    </>
  );
}
