"use client";

import { Copy, Eye, MessageCircle, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createDirectSale, deleteInvoice, DocumentApiError, listInvoices, nextDirectSaleSerial, updateDueDate, updateInvoiceDiscount, type InvoiceRecord } from "@/lib/billing/documents-api";
import { outstandingBalances, plannedInvoice, stillOpen } from "@/lib/billing/pending-invoices";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { printBillingLetter, printFromControl } from "@/lib/billing/print-letter";
import { formatDisplayDate, formatRupees, isDirectSale, todayIsoDate, type QuotationDraft, type QuotationRecord } from "@/lib/billing/quotation-math";
import { listProjects, QuotationApiError, setPlanDiscount } from "@/lib/billing/quotations-api";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { InvoiceLetter } from "./BillingLetters";
import { DirectSaleForm } from "./DirectSaleForm";
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

function invoicePill(invoice: InvoiceRecord): string {
  const opening = invoice.project.downPayment ?? 0;
  if (invoice.kind === "advance" && invoice.installmentNumber == null && opening > 0 && invoice.grandTotal <= opening + 0.001) {
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

export function InvoicesPage({ completed = false, direct = false }: { completed?: boolean; direct?: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [projects, setProjects] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);
  const [discount, setDiscount] = useState(0);
  const [deleting, setDeleting] = useState<InvoiceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState<InvoiceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [saleSerial, setSaleSerial] = useState("DS-001");
  const [copyDraft, setCopyDraft] = useState<QuotationDraft | null>(null);
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

  function saleFromInvoice(invoice: InvoiceRecord): { draft: QuotationDraft; dueDates?: string[] } {
    const project = invoice.project;
    const dates = (invoice.schedule ?? []).map((line) => line.dueDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
    const installmentCount = project.paymentMode === "installments" ? project.installmentCount ?? (dates.length || null) : null;
    const dueDates = project.paymentMode === "installments" && installmentCount != null && dates.length === installmentCount ? dates : undefined;
    return {
      dueDates,
      draft: {
        quotationDate: todayIsoDate(),
        customerName: project.customerName,
        cnic: project.cnic,
        address: project.address,
        contactNo: project.contactNo,
        whatsappNo: project.whatsappNo,
        customerPackage: project.customerPackage,
        paymentMode: project.paymentMode,
        downPayment: project.downPayment,
        planDiscount: project.planDiscount ?? 0,
        installmentCount,
        items: project.items.map((item) => ({
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          price: item.price,
          taxPercent: item.taxPercent,
        })),
      },
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

  const pendingBalances = completed || direct ? [] : outstandingBalances(projects, invoices);
  const visible = direct
    ? invoices.filter((invoice) => isDirectSale(invoice.project) && stillOpen(invoice))
    : completed
      ? invoices.filter((invoice) => !stillOpen(invoice))
      : [...invoices.filter((invoice) => stillOpen(invoice) && !isDirectSale(invoice.project)), ...pendingBalances];
  const directInvoices = visible.filter((invoice) => isDirectSale(invoice.project));
  const projectInvoices = visible.filter((invoice) => !isDirectSale(invoice.project));

  function invoiceCard(invoice: InvoiceRecord): ReactNode {
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
        <p>{formatDisplayDate(invoice.invoiceDate)}{invoice.installmentNumber ? ` · Installment ${invoice.installmentNumber}` : ""}{invoice.dueDate ? ` · Due ${formatDisplayDate(invoice.dueDate)}` : ""}</p>
        <p className={styles.total}>{formatRupees(invoice.grandTotal)}</p>
        <div className={styles.moneySplit}>
          <p className={styles.moneyPaid}><span>Paid</span><strong>{formatRupees(invoice.advancePaid)}</strong></p>
          <p className={styles.moneyPending}><span>Pending</span><strong>{formatRupees(invoice.balanceDue)}</strong></p>
        </div>
        {(invoice.discountAmount ?? 0) > 0 ? <p>Discount {formatRupees(invoice.discountAmount ?? 0)}</p> : null}
        <div className={styles.cardActions}>
          <button type="button" onClick={() => openInvoice(invoice)}><Eye size={15} /> View</button>
          <button type="button" onClick={() => void onDuplicate(invoice)} disabled={busy}><Copy size={15} /> Duplicate</button>
          {completed ? <button type="button" onClick={() => openInvoice(invoice)}><Pencil size={15} /> Edit</button> : null}
          {completed ? <button type="button" onClick={() => void printInvoice(invoice)} disabled={busy}><Printer size={15} /> Print</button> : null}
          <button type="button" onClick={() => void sendInvoice(invoice)} disabled={busy}><MessageCircle size={15} /> WhatsApp</button>
          {plannedInvoice(invoice) ? null : <button className={styles.danger} type="button" onClick={() => setDeleting(invoice)} disabled={busy}><Trash2 size={15} /> Delete</button>}
        </div>
      </article>
    );
  }

  if (creating) {
    return (
      <>
        <header className={shell.pageHeader}>
          <div>
            <p className={shell.kicker}>Billing CMS</p>
            <h1 className={shell.title}>{copyDraft ? "Copy invoice" : "New direct invoice"}</h1>
            <p className={shell.summary}>{copyDraft ? "This copy keeps the customer and the items. Choose each installment due date, then save." : "Create a daily-sale invoice without a quotation or a project in process. The same fields as a quotation are used."}</p>
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

  const editableDueDates = viewing ? directDueDates(viewing) : null;

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>{direct ? "Direct Invoices" : completed ? "Completed Invoices" : "Pending Invoices"}</h1>
          <p className={shell.summary}>
            {direct
              ? "Daily sales made without a quotation or a project in process. Open invoices stay here until the balance is received."
              : completed
                ? "Fully paid invoices stay here. You can view, edit the discount, print, or delete them."
                : "Unpaid project invoices stay here until the balance is received."}
          </p>
        </div>
        {direct ? (
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
        ) : null}
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading invoices…</p> : null}
      {!loading && visible.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>{direct ? "No direct invoices" : completed ? "No completed invoices" : "No pending invoices"}</h2>
          <p>{direct ? "Create a direct invoice for a daily sale. It does not need a quotation or a project in process." : completed ? "An invoice moves here once it is fully paid." : "Create an invoice from a project in process."}</p>
        </section>
      ) : null}
      {directInvoices.length > 0 ? (
        <section className={styles.invoiceGroup}>
          {direct ? null : <h2>Direct Invoices</h2>}
          <div className={styles.cards}>{directInvoices.map(invoiceCard)}</div>
        </section>
      ) : null}
      {projectInvoices.length > 0 ? (
        <section className={styles.invoiceGroup}>
          {directInvoices.length > 0 ? <h2>Project invoices</h2> : null}
          <div className={styles.cards}>{projectInvoices.map(invoiceCard)}</div>
        </section>
      ) : null}
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
              {plannedInvoice(viewing) && viewing.project.paymentMode !== "installments" ? null : (
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
