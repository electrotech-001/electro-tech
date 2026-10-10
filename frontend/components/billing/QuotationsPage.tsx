"use client";

import { Check, Eye, MessageCircle, Pencil, Printer, Plus, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { blankDraft, formatDisplayDate, formatRupees, type QuotationDraft, type QuotationRecord } from "@/lib/billing/quotation-math";
import { approveQuotation, deleteQuotation, disapproveQuotation, listQuotations, nextQuotationSerial, QuotationApiError, saveQuotation } from "@/lib/billing/quotations-api";
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
    installmentCount: record.installmentCount,
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
  const [disapproving, setDisapproving] = useState<QuotationRecord | null>(null);
  const [deleting, setDeleting] = useState<QuotationRecord | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: "whatsapp" | "approve" | "disapprove" | "delete" } | null>(null);
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
        setDisapproving(null);
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

  async function onApprove() {
    if (!approving) return;
    setBusy({ id: approving.id, action: "approve" });
    setBanner(null);
    try {
      await approveQuotation(approving.id);
      await refresh();
      setApproving(null);
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The quotation could not be approved." });
    } finally {
      setBusy(null);
    }
  }

  async function onDisapprove() {
    if (!disapproving) return;
    setBusy({ id: disapproving.id, action: "disapprove" });
    setBanner(null);
    try {
      await disapproveQuotation(disapproving.id);
      await refresh();
      setDisapproving(null);
      setBanner({ tone: "ok", text: `${disapproving.serial} is back in Quotations.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof QuotationApiError ? error.message : "The quotation could not be disapproved." });
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
          <p className={shell.summary}>Each saved quotation stays here as a card. Approving it also copies it into Projects in Process.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void startNew()}>
          <Plus size={16} /> New quotation
        </button>
      </header>

      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}

      {loading ? <p className={styles.hint}>Loading quotations…</p> : null}
      {!loading && quotations.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No quotations yet</h2>
          <p>Save the first quotation and it will appear here as a card.</p>
        </section>
      ) : null}

      <div className={styles.cards}>
        {quotations.map((quotation) => (
          <article className={styles.card} key={quotation.id}>
            <div className={styles.cardTop}>
              <strong>{quotation.serial}</strong>
              {quotation.approvedAt ? <span className={styles.badge}>Approved</span> : null}
            </div>
            <h2>{quotation.customerName}</h2>
            <p>{formatDisplayDate(quotation.quotationDate)} · {quotation.paymentMode === "installments" ? "Installments" : "Direct"}</p>
            <p className={styles.packageText}>{quotation.customerPackage}</p>
            <p className={styles.total}>{formatRupees(quotation.grandTotal)}</p>
            <div className={styles.cardActions}>
              <button type="button" onClick={() => setViewing(quotation)}><Eye size={15} /> View</button>
              <button type="button" onClick={() => startEdit(quotation)}><Pencil size={15} /> Edit</button>
              <button type="button" onClick={() => onPrint(quotation)}><Printer size={15} /> Print</button>
              <button type="button" onClick={() => void onWhatsApp(quotation)} disabled={busy?.id === quotation.id}>
                <MessageCircle size={15} /> {busy?.id === quotation.id && busy.action === "whatsapp" ? "Sending…" : "WhatsApp"}
              </button>
              {quotation.approvedAt ? (
                <button type="button" onClick={() => setDisapproving(quotation)} disabled={busy?.id === quotation.id}>
                  <Undo2 size={15} /> Disapprove
                </button>
              ) : (
                <button type="button" onClick={() => setApproving(quotation)} disabled={busy?.id === quotation.id}>
                  <Check size={15} /> Approve
                </button>
              )}
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

      {disapproving ? (
        <div className={styles.modal} role="presentation" onClick={() => setDisapproving(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="disapprove-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="disapprove-title">Disapprove {disapproving.serial}?</h2>
            <p>This removes it from Projects in Process and brings it back to Quotations. You can approve it again later.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setDisapproving(null)} disabled={busy?.id === disapproving.id}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDisapprove()} disabled={busy?.id === disapproving.id}>
                {busy?.id === disapproving.id ? "Disapproving…" : "Disapprove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <div className={styles.modal} role="presentation" onClick={() => setDeleting(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-title">Delete {deleting.serial}?</h2>
            <p>This removes the quotation. If it is in Projects in Process, that copy is removed too.</p>
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
            <p>A copy will be added to Projects in Process. This quotation stays in the list, and later edits here do not change that copy.</p>
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
        <div className={styles.capture} ref={captureRef}>
          <QuotationLetter quotation={capture} paper />
        </div>
      ) : null}
    </>
  );
}
