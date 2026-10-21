"use client";

import { Check, Copy, Eye, MessageCircle, Pencil, Printer, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { blankDraft, formatDisplayDate, formatRupees, todayIsoDate, type QuotationDraft, type QuotationRecord } from "@/lib/billing/quotation-math";
import { DocumentApiError, issueDirectInvoice } from "@/lib/billing/documents-api";
import { approveQuotation, deleteQuotation, listQuotations, nextQuotationSerial, QuotationApiError, saveQuotation } from "@/lib/billing/quotations-api";
import { printBillingLetter } from "@/lib/billing/print-letter";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import shell from "./billing-shell.module.css";
import { QuotationDialog, QuotationLetter } from "./QuotationLetter";
import { QuotationForm } from "./QuotationForm";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function toDraft(record: QuotationRecord): QuotationDraft {
  return {
    quotationDate: record.quotationDate,
    customerName: record.customerName,
    cnic: record.cnic,
    address: record.address,
    contactNo: record.contactNo,
    whatsappNo: record.whatsappNo,
    customerPackage: record.customerPackage,
    paymentMode: record.paymentMode,
    downPayment: record.downPayment,
    planDiscount: record.planDiscount ?? 0,
    installmentCount: record.installmentCount,
    installmentAmounts: record.installmentAmounts ?? null,
    items: record.items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      price: item.price,
      taxPercent: item.taxPercent,
    })),
  };
}

export function QuotationsPage() {
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState<QuotationRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<QuotationDraft>(blankDraft());
  const [serial, setSerial] = useState("QT-001");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<QuotationRecord | null>(null);
  const [approving, setApproving] = useState<QuotationRecord | null>(null);
  const [deleting, setDeleting] = useState<QuotationRecord | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: "whatsapp" | "approve" | "delete" | "duplicate" } | null>(null);
  const [capture, setCapture] = useState<QuotationRecord | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setQuotations(await listQuotations());
  }

  useEffect(() => {
    let cancelled = false;
    listQuotations()
      .then((rows) => {
        if (!cancelled) setQuotations(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "Quotations could not be loaded." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewing(null);
        setApproving(null);
        setDeleting(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function startNew() {
    setBanner(null);
    setFormError(null);
    setEditing(null);
    try {
      const next = await nextQuotationSerial();
      setSerial(next);
      setDraft(blankDraft(next));
    } catch {
      setSerial("QT-001");
      setDraft(blankDraft());
    }
    setCreating(true);
  }

  function startEdit(quotation: QuotationRecord) {
    setBanner(null);
    setFormError(null);
    setCreating(false);
    setEditing(quotation);
    setSerial(quotation.serial);
    setDraft(toDraft(quotation));
  }

  async function onSave() {
    setSaving(true);
    setFormError(null);
    try {
      await saveQuotation(draft, editing?.id);
      await refresh();
      setCreating(false);
      setEditing(null);
    } catch (error) {
      setFormError(error instanceof QuotationApiError ? error.message : "The quotation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate(quotation: QuotationRecord) {
    setBusy({ id: quotation.id, action: "duplicate" });
    setBanner(null);
    try {
      const saved = await saveQuotation({ ...toDraft(quotation), quotationDate: todayIsoDate() });
      await refresh();
      setBanner({ tone: "ok", text: `${saved.serial} was created as a copy of ${quotation.serial}.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The quotation could not be duplicated." });
    } finally {
      setBusy(null);
    }
  }

  async function onApprove() {
    if (!approving) return;
    setBusy({ id: approving.id, action: "approve" });
    setBanner(null);
    try {
      const project = await approveQuotation(approving.id);
      if (project.paymentMode === "direct") {
        await issueDirectInvoice(project.id, { paidAmount: 0, paymentDate: todayIsoDate(), paymentMode: "cash" });
      }
      await refresh();
      setApproving(null);
      setBanner({
        tone: "ok",
        text: project.paymentMode === "installments"
          ? `${approving.serial} is approved. Its invoices are in Invoices.`
          : `${approving.serial} is approved and its invoice is in Invoices.`,
      });
    } catch (error) {
      const message = error instanceof QuotationApiError || error instanceof DocumentApiError
        ? error.message
        : "The quotation could not be approved.";
      setBanner({ tone: "bad", text: message });
      await refresh().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy({ id: deleting.id, action: "delete" });
    setBanner(null);
    try {
      await deleteQuotation(deleting.id);
      await refresh();
      setDeleting(null);
      setBanner({ tone: "ok", text: `${deleting.serial} was deleted.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The quotation could not be deleted." });
    } finally {
      setBusy(null);
    }
  }

  function onPrint(quotation: QuotationRecord) {
    setViewing(quotation);
    window.setTimeout(() => {
      const dialog = document.querySelector("[role='dialog']");
      printBillingLetter(dialog instanceof HTMLElement ? dialog : document.body);
    }, 80);
  }

  async function onWhatsApp(quotation: QuotationRecord) {
    setBusy({ id: quotation.id, action: "whatsapp" });
    setBanner(null);
    setCapture(quotation);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new QuotationApiError("The quotation PDF could not be prepared.");
      const file = await quotationToPdf(node, quotation.serial);
      await sendWhatsAppDocument({
        phone: quotation.whatsappNo,
        kind: "quotation",
        message: `Assalam o Alaikum ${quotation.customerName}, your Electro Tech quotation ${quotation.serial} is attached.`,
        file,
      });
      setBanner({ tone: "ok", text: `Quotation ${quotation.serial} was sent on WhatsApp.` });
    } catch (error) {
      const message = error instanceof WhatsAppApiError || error instanceof QuotationApiError
        ? error.message
        : "The quotation could not be sent on WhatsApp.";
      setBanner({ tone: "bad", text: message });
    } finally {
      setCapture(null);
      setBusy(null);
    }
  }

  const formOpen = creating || editing;
  const pending = quotations.filter((quotation) => !quotation.approvedAt);

  if (formOpen) {
    return (
      <>
        <header className={shell.pageHeader}>
          <div>
            <p className={shell.kicker}>Billing CMS</p>
            <h1 className={shell.title}>{editing ? `Edit ${editing.serial}` : "New quotation"}</h1>
            <p className={shell.summary}>Fill the quotation, then save it. The list stays on the quotations page.</p>
          </div>
        </header>
        {formError ? null : banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
        <section className={shell.panel}>
          <QuotationForm
            serial={serial}
            draft={draft}
            saving={saving}
            error={formError}
            onChange={setDraft}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSubmit={() => void onSave()}
          />
        </section>
      </>
    );
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Quotations</h1>
          <p className={shell.summary}>Quotations waiting for approval are listed here. Approving one creates its invoice and moves it to Invoices.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void startNew()}>
          <Plus size={16} /> New quotation
        </button>
      </header>

      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}

      {loading ? <p className={styles.hint}>Loading quotations…</p> : null}
      {!loading && pending.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No quotations waiting for approval</h2>
          <p>Save a new quotation and it will appear here as a card. Approved quotations are in Invoices.</p>
        </section>
      ) : null}

      <div className={styles.cards}>
        {pending.map((quotation) => (
          <article className={styles.card} key={quotation.id}>
            <div className={styles.cardTop}>
              <strong>{quotation.serial}</strong>
            </div>
            <h2>{quotation.customerName}</h2>
            <p>{formatDisplayDate(quotation.quotationDate)} · {quotation.paymentMode === "installments" ? "Installments" : "Direct"}</p>
            <p className={styles.packageText}>{quotation.customerPackage}</p>
            <p className={styles.total}>{formatRupees(quotation.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(quotation)}><Eye size={15} /> View</button>
              <button type="button" onClick={() => startEdit(quotation)}><Pencil size={15} /> Edit</button>
              <button type="button" onClick={() => void onDuplicate(quotation)} disabled={busy?.id === quotation.id}>
                <Copy size={15} /> {busy?.id === quotation.id && busy.action === "duplicate" ? "Copying…" : "Duplicate"}
              </button>
              <button type="button" onClick={() => onPrint(quotation)}><Printer size={15} /> Print</button>
              <button className={styles.whatsappButton} type="button" onClick={() => void onWhatsApp(quotation)} disabled={busy?.id === quotation.id}>
                <MessageCircle size={15} /> {busy?.id === quotation.id && busy.action === "whatsapp" ? "Sending…" : "WhatsApp"}
              </button>
              <button type="button" onClick={() => setApproving(quotation)} disabled={busy?.id === quotation.id}>
                <Check size={15} /> Approve
              </button>
              <button className={styles.danger} type="button" onClick={() => setDeleting(quotation)} disabled={busy?.id === quotation.id}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {viewing ? (
        <QuotationDialog quotation={viewing} onClose={() => setViewing(null)} />
      ) : null}

      {deleting ? (
        <div className={styles.modal} role="presentation" onClick={() => setDeleting(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-title">Delete {deleting.serial}?</h2>
            <p>This removes the quotation.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setDeleting(null)} disabled={busy?.id === deleting.id}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDelete()} disabled={busy?.id === deleting.id}>
                {busy?.id === deleting.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approving ? (
        <div className={styles.modal} role="presentation" onClick={() => setApproving(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="approve-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="approve-title">Approve {approving.serial}?</h2>
            <p>The card will show Approved, and the invoice will be created in Invoices. This quotation stays here, and later edits here do not change that invoice.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setApproving(null)} disabled={busy?.id === approving.id}>Cancel</button>
              <button className={styles.primaryButton} type="button" onClick={() => void onApprove()} disabled={busy?.id === approving.id}>
                {busy?.id === approving.id ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {capture ? (
        <div className={styles.capture} ref={captureRef} data-capture>
          <QuotationLetter quotation={capture} paper />
        </div>
      ) : null}
    </>
  );
}
