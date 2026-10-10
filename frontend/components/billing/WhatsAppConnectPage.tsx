"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  fetchWhatsAppStatus,
  sendWhatsAppDocument,
  WhatsAppApiError,
  type WhatsAppDocumentKind,
  type WhatsAppStatus,
} from "@/lib/billing/whatsapp-api";
import { FancySelect, FilePicker } from "./FancyControls";
import styles from "./billing-shell.module.css";

const emptyStatus: WhatsAppStatus = {
  status: "disconnected",
  phone: null,
  phoneDisplay: null,
  pushName: null,
  qrDataUrl: null,
  savedSession: false,
  error: null,
};

const kindLabels: Record<WhatsAppDocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  agreement: "Agreement",
  slip: "Paid slip",
  thanks: "Thank you",
  feedback: "Feedback",
  reminder: "Reminder",
  card: "Message",
};

function statusLabel(status: WhatsAppStatus["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "qr") return "Scan QR";
  if (status === "connecting") return "Connecting";
  return "Not connected";
}

function pillClass(status: WhatsAppStatus["status"]): string {
  if (status === "connected") return styles.waPillOn;
  if (status === "qr" || status === "connecting") return styles.waPillWait;
  return styles.waPillOff;
}

export function WhatsAppConnectPage() {
  const [status, setStatus] = useState<WhatsAppStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [watch, setWatch] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "send" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [kind, setKind] = useState<WhatsAppDocumentKind>("quotation");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function load() {
      try {
        const next = await fetchWhatsAppStatus();
        if (cancelled) return;
        setStatus(next);
        setLoading(false);
        if (next.status === "qr" || next.status === "connecting") {
          timer = window.setTimeout(() => void load(), 2000);
        }
      } catch (error) {
        if (cancelled) return;
        setLoading(false);
        setBanner(error instanceof WhatsAppApiError ? error.message : "WhatsApp could not be reached.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [watch]);

  async function onConnect() {
    setBusy("connect");
    setBanner(null);
    setSuccess(null);
    setConfirmDisconnect(false);
    try {
      setStatus(await connectWhatsApp());
      setWatch((value) => value + 1);
    } catch (error) {
      setBanner(error instanceof WhatsAppApiError ? error.message : "WhatsApp could not be connected.");
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect() {
    setBusy("disconnect");
    setBanner(null);
    setSuccess(null);
    try {
      setStatus(await disconnectWhatsApp());
      setConfirmDisconnect(false);
      setWatch((value) => value + 1);
    } catch (error) {
      setBanner(error instanceof WhatsAppApiError ? error.message : "WhatsApp could not be disconnected.");
    } finally {
      setBusy(null);
    }
  }

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setBanner("Choose the quotation, invoice, agreement, or paid slip file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setBanner("The document must be 10 MB or smaller.");
      return;
    }
    const form = event.currentTarget;
    setBusy("send");
    setBanner(null);
    setSuccess(null);
    try {
      await sendWhatsAppDocument({ phone, kind, message, file });
      setSuccess(`${kindLabels[kind]} sent to ${phone.trim()}.`);
      setMessage("");
      setFile(null);
      form.reset();
    } catch (error) {
      setBanner(error instanceof WhatsAppApiError ? error.message : "The document was not sent.");
    } finally {
      setBusy(null);
    }
  }

  const connected = status.status === "connected";

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Billing CMS</p>
          <h1 className={styles.title}>WhatsApp</h1>
          <p className={styles.summary}>
            Scan once with the official Electro Tech number. The session stays saved, so quotations, invoices, agreements, and paid slips can be sent without scanning again.
          </p>
        </div>
      </header>
      <div className={styles.waLayout}>
        <section className={styles.panel} aria-labelledby="whatsapp-connection-title">
          <div className={styles.waStatusRow}>
            <h2 id="whatsapp-connection-title">Connection</h2>
            <span className={`${styles.waPill} ${pillClass(status.status)}`} aria-live="polite">
              {loading ? "Checking" : statusLabel(status.status)}
            </span>
          </div>
          {status.error ? <p className={styles.waError}>{status.error}</p> : null}
          {banner ? <p className={styles.waError}>{banner}</p> : null}
          {connected ? (
            <p className={styles.waIdentity}>
              {status.phoneDisplay || "Official number"}
              <span>{status.pushName || "Linked device"}</span>
            </p>
          ) : null}
          {status.status === "disconnected" && status.savedSession ? (
            <p className={styles.waNote}>A saved session is ready. Connect to resume this number without a new scan.</p>
          ) : null}
          {status.status === "connecting" ? <p className={styles.waNote}>Opening the saved WhatsApp session…</p> : null}
          {status.qrDataUrl ? (
            <>
              <div className={styles.qrFrame}>
                <img src={status.qrDataUrl} alt="WhatsApp login QR code" />
              </div>
              <ol className={styles.waSteps}>
                <li>1. Open WhatsApp on the official phone.</li>
                <li>2. Go to Linked devices and choose Link a device.</li>
                <li>3. Scan this code. It refreshes on its own.</li>
              </ol>
            </>
          ) : null}
          <div className={styles.waActions}>
            {status.status === "disconnected" ? (
              <button className={styles.primaryButton} type="button" onClick={() => void onConnect()} disabled={busy !== null || loading}>
                {busy === "connect" ? "Connecting…" : status.savedSession ? "Resume WhatsApp" : "Connect WhatsApp"}
              </button>
            ) : null}
            {status.status === "qr" || connected ? (
              confirmDisconnect ? (
                <div className={styles.confirmRow}>
                  <button className={styles.dangerButton} type="button" onClick={() => void onDisconnect()} disabled={busy !== null}>
                    {busy === "disconnect" ? "Disconnecting…" : "Disconnect number"}
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => setConfirmDisconnect(false)} disabled={busy !== null}>
                    Keep connected
                  </button>
                </div>
              ) : (
                <button className={styles.secondaryButton} type="button" onClick={() => setConfirmDisconnect(true)}>
                  Disconnect
                </button>
              )
            ) : null}
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="whatsapp-send-title">
          <h2 id="whatsapp-send-title">Send a document</h2>
          <p>Send a quotation, invoice, agreement, or paid slip from the connected official number.</p>
          {success ? <p className={styles.waSuccess}>{success}</p> : null}
          <form className={styles.waForm} onSubmit={(event) => void onSend(event)}>
            <fieldset className={styles.waForm} disabled={!connected || busy === "send"}>
              <div className={styles.field}>
                <span id="whatsapp-document-kind">Document</span>
                <FancySelect
                  labelId="whatsapp-document-kind"
                  value={kind}
                  options={[
                    { value: "quotation", label: "Quotation" },
                    { value: "invoice", label: "Invoice" },
                    { value: "agreement", label: "Agreement" },
                    { value: "slip", label: "Paid slip" },
                  ]}
                  onChange={setKind}
                />
              </div>
              <label className={styles.field}>
                <span>Customer WhatsApp</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03xx xxx xxxx"
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Message</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={1000}
                  placeholder="Short note to send with the document."
                  required
                />
              </label>
              <div className={styles.field}>
                <span>File</span>
                <FilePicker
                  accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                  fileName={file?.name ?? null}
                  onFile={(next) => setFile(next ?? null)}
                />
              </div>
              <button className={styles.primaryButton} type="submit">
                {busy === "send" ? "Sending…" : `Send ${kindLabels[kind].toLowerCase()}`}
              </button>
            </fieldset>
          </form>
        </section>
      </div>
    </>
  );
}
