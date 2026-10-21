"use client";

import { MessageCircle, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listInvoices, type InvoiceRecord } from "@/lib/billing/documents-api";
import { isCustomerPhone } from "@/lib/billing/phone-countries";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import type { QuotationRecord } from "@/lib/billing/quotation-math";
import { listQuotations } from "@/lib/billing/quotations-api";
import { sendWhatsAppDocument, WhatsAppApiError, type WhatsAppDocumentKind } from "@/lib/billing/whatsapp-api";
import { InvoiceLetter } from "./BillingLetters";
import { PhoneField } from "./PhoneField";
import { SearchPicker } from "./SearchPicker";
import { QuotationLetter } from "./QuotationLetter";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

type SendMode = "message" | "quotation" | "invoice" | "upload";

const modes: { value: SendMode; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "quotation", label: "Quotation" },
  { value: "invoice", label: "Invoice" },
  { value: "upload", label: "Upload a document" },
];

export function WhatsAppComposer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SendMode>("message");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [captureQuote, setCaptureQuote] = useState<QuotationRecord | null>(null);
  const [captureInvoice, setCaptureInvoice] = useState<InvoiceRecord | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listQuotations().catch(() => [] as QuotationRecord[]),
      listInvoices().catch(() => [] as InvoiceRecord[]),
    ]).then(([quotationRows, invoiceRows]) => {
      if (cancelled) return;
      setQuotations(quotationRows);
      setInvoices(invoiceRows);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function chooseQuotation(id: string) {
    setSelectedId(id);
    const quotation = quotations.find((entry) => entry.id === id);
    if (quotation && !phone.trim() && quotation.whatsappNo.trim()) setPhone(quotation.whatsappNo);
    if (quotation && !message.trim()) {
      setMessage(`Assalam o Alaikum ${quotation.customerName}, your Electro Tech quotation ${quotation.serial} is attached.`);
    }
  }

  function chooseInvoice(id: string) {
    setSelectedId(id);
    const invoice = invoices.find((entry) => entry.id === id);
    if (invoice && !phone.trim() && invoice.project.whatsappNo.trim()) setPhone(invoice.project.whatsappNo);
    if (invoice && !message.trim()) {
      setMessage(`Assalam o Alaikum ${invoice.project.customerName}, your Electro Tech invoice ${invoice.serial} is attached.`);
    }
  }

  async function onSend() {
    if (!isCustomerPhone(phone.trim())) {
      setNotice({ tone: "bad", text: "Choose the country and enter the full number in that country's format." });
      return;
    }
    if (!message.trim()) {
      setNotice({ tone: "bad", text: "Write the message to send." });
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      if (mode === "message") {
        await sendWhatsAppDocument({ phone, kind: "card", message });
      } else if (mode === "upload") {
        if (!file) throw new WhatsAppApiError("Choose a PDF or image to upload.");
        await sendWhatsAppDocument({ phone, kind: "card", message, file });
      } else if (mode === "quotation") {
        const quotation = quotations.find((entry) => entry.id === selectedId);
        if (!quotation) throw new WhatsAppApiError("Choose a quotation from the list.");
        setCaptureQuote(quotation);
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        const node = captureRef.current?.querySelector("article");
        if (!(node instanceof HTMLElement)) throw new WhatsAppApiError("The quotation could not be prepared.");
        const pdf = await quotationToPdf(node, quotation.serial);
        await sendWhatsAppDocument({ phone, kind: "quotation" satisfies WhatsAppDocumentKind, message, file: pdf });
      } else {
        const invoice = invoices.find((entry) => entry.id === selectedId);
        if (!invoice) throw new WhatsAppApiError("Choose an invoice from the list.");
        setCaptureInvoice(invoice);
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        const node = captureRef.current?.querySelector("article");
        if (!(node instanceof HTMLElement)) throw new WhatsAppApiError("The invoice could not be prepared.");
        const pdf = await quotationToPdf(node, invoice.serial);
        await sendWhatsAppDocument({ phone, kind: "invoice", message, file: pdf });
      }
      setNotice({ tone: "ok", text: "Sent on WhatsApp." });
      setFile(null);
    } catch (error) {
      setNotice({
        tone: "bad",
        text: error instanceof WhatsAppApiError ? error.message : "The message could not be sent on WhatsApp.",
      });
    } finally {
      setCaptureQuote(null);
      setCaptureInvoice(null);
      setSending(false);
    }
  }

  return (
    <>
      <button className={shell.whatsappFloat} type="button" aria-label="Send on WhatsApp" onClick={() => { setNotice(null); setOpen(true); }}>
        <MessageCircle size={26} />
      </button>
      {open ? (
        <div className={styles.modal} role="presentation" onClick={() => { if (!sending) setOpen(false); }}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="whatsapp-composer-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2 id="whatsapp-composer-title">Send on WhatsApp</h2>
              <button className={styles.secondaryButton} type="button" onClick={() => setOpen(false)} disabled={sending} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalScroll}>
              <p>Choose a country, enter the number in that format, then send a message, a saved quotation, a saved invoice, or your own file.</p>
              <PhoneField label="WhatsApp number" value={phone} onChange={setPhone} />
              <div className={styles.field}>
                <span>What to send</span>
                <div className={styles.sendModes} role="group" aria-label="What to send">
                  {modes.map((entry) => (
                    <button
                      key={entry.value}
                      className={styles.sendMode}
                      type="button"
                      aria-pressed={mode === entry.value}
                      onClick={() => { setMode(entry.value); setSelectedId(""); setNotice(null); }}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
              {mode === "quotation" ? (
                <div className={styles.field}>
                  <span>Quotation</span>
                  <SearchPicker
                    label="Quotation"
                    value={selectedId}
                    disabled={loading}
                    emptyLabel={loading ? "Loading quotations…" : "Choose a quotation"}
                    placeholder="Search quotation"
                    options={quotations.map((quotation) => ({
                      value: quotation.id,
                      label: `${quotation.serial} · ${quotation.customerName}`,
                    }))}
                    onChange={chooseQuotation}
                  />
                </div>
              ) : null}
              {mode === "invoice" ? (
                <div className={styles.field}>
                  <span>Invoice</span>
                  <SearchPicker
                    label="Invoice"
                    value={selectedId}
                    disabled={loading}
                    emptyLabel={loading ? "Loading invoices…" : "Choose an invoice"}
                    placeholder="Search invoice"
                    options={invoices.map((invoice) => ({
                      value: invoice.id,
                      label: `${invoice.serial} · ${invoice.project.customerName}`,
                    }))}
                    onChange={chooseInvoice}
                  />
                </div>
              ) : null}
              {mode === "upload" ? (
                <div className={styles.field}>
                  <span>Document</span>
                  <label className={styles.uploadZone}>
                    <Upload size={22} />
                    <strong>{file ? file.name : "Upload a PDF or image"}</strong>
                    <span>PDF, JPG, PNG, or WEBP · up to 10 MB</span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}
              <label className={styles.field}>
                <span>Message</span>
                <textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the WhatsApp message." />
              </label>
              {notice ? <p className={notice.tone === "ok" ? styles.success : styles.error}>{notice.text}</p> : null}
              <div className={styles.formActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
                <button className={`${styles.primaryButton} ${styles.whatsappButton}`} type="button" onClick={() => void onSend()} disabled={sending}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {captureQuote || captureInvoice ? (
        <div className={styles.capture} ref={captureRef} data-capture>
          {captureQuote ? <QuotationLetter quotation={captureQuote} paper /> : null}
          {captureInvoice ? <InvoiceLetter invoice={captureInvoice} paper /> : null}
        </div>
      ) : null}
    </>
  );
}
