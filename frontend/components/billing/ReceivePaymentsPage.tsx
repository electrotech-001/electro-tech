"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DocumentApiError, listReceiveProjects, recordPayment, updateDueDate, updatePayment, type BankMode, type PaymentRecord, type ReceiveProject } from "@/lib/billing/documents-api";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { formatDisplayDate, formatRupees, todayIsoDate } from "@/lib/billing/quotation-math";
import { printFromControl } from "@/lib/billing/print-letter";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { PaymentSlip } from "./BillingLetters";
import { FancySelect } from "./FancyControls";
import { DirectPaymentDialog } from "./ProjectFlow";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function PaymentFields({
  paidAmount,
  paymentDate,
  paymentMode,
  onAmount,
  onDate,
  onMode,
}: {
  paidAmount: number;
  paymentDate: string;
  paymentMode: BankMode;
  onAmount: (value: number) => void;
  onDate: (value: string) => void;
  onMode: (value: BankMode) => void;
}) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.field}><span>Paid amount</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => onAmount(Number(event.target.value))} /></label>
      <label className={styles.field}><span>Date of payment</span><input type="date" value={paymentDate} onChange={(event) => onDate(event.target.value)} /></label>
      <div className={styles.field}>
        <span>Payment mode</span>
        <FancySelect
          value={paymentMode}
          options={[{ value: "cash", label: "Cash" }, { value: "bank_transfer", label: "Bank transfer" }]}
          onChange={onMode}
        />
      </div>
    </div>
  );
}

export function ReceivePaymentsPage() {
  const [projects, setProjects] = useState<ReceiveProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [slip, setSlip] = useState<PaymentRecord | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<PaymentRecord | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function refresh(selected = projectId) {
    const rows = await listReceiveProjects();
    setProjects(rows);
    if (selected && rows.some((row) => row.project.id === selected)) setProjectId(selected);
    else setProjectId(rows[0]?.project.id ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    listReceiveProjects()
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
        setProjectId(rows[0]?.project.id ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "Projects could not be loaded." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = projects.find((row) => row.project.id === projectId) ?? null;

  async function saveInstallment(installmentNumber: number, amount: number) {
    if (!current) return;
    setSaving(true);
    setBanner(null);
    try {
      const saved = await recordPayment(current.project.id, { kind: "installment", installmentNumber, paidAmount: amount, paymentDate, paymentMode });
      await refresh(current.project.id);
      setSlip(saved.payments.find((payment) => payment.installmentNumber === installmentNumber) ?? null);
      setBanner({ tone: "ok", text: `Installment ${installmentNumber} is marked paid.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The installment could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function sendSlip(payment: PaymentRecord) {
    if (!current) return;
    setSendingId(payment.id);
    setBanner(null);
    setCapture(payment);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new DocumentApiError("The paid slip could not be prepared.");
      const file = await quotationToPdf(node, `${current.project.serial}-paid-slip`);
      await sendWhatsAppDocument({
        phone: current.project.whatsappNo,
        kind: "slip",
        message: `Assalam o Alaikum ${current.project.customerName}, your Electro Tech paid slip for ${current.project.serial} is attached.`,
        file,
      });
      setBanner({ tone: "ok", text: `The paid slip for ${current.project.serial} was sent on WhatsApp.` });
    } catch (error) {
      const message = error instanceof WhatsAppApiError || error instanceof DocumentApiError
        ? error.message
        : "The paid slip could not be sent on WhatsApp.";
      setBanner({ tone: "bad", text: message });
    } finally {
      setCapture(null);
      setSendingId(null);
    }
  }

  async function saveEdit() {
    if (!editing || !current) return;
    setSaving(true);
    setBanner(null);
    try {
      await updatePayment(editing.id, { paidAmount: editing.paidAmount, paymentDate: editing.paymentDate, paymentMode: editing.paymentMode });
      await refresh(current.project.id);
      setEditing(null);
      setBanner({ tone: "ok", text: "The received amount was updated." });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The payment could not be updated." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Receive Payments</h1>
          <p className={shell.summary}>Choose a customer whose project is still in process. Direct payments and installment cards are recorded here, and each receipt can be edited.</p>
        </div>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading customers…</p> : null}
      {!loading && projects.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No projects in process</h2>
          <p>Approve a quotation before recording a payment.</p>
        </section>
      ) : null}
      {projects.length > 0 ? (
        <section className={shell.panel}>
          <div className={styles.field}>
            <span id="receive-customer">Customer</span>
            <FancySelect
              labelId="receive-customer"
              value={projectId}
              options={projects.map((row) => ({
                value: row.project.id,
                label: `${row.project.customerName} · ${row.project.serial} · ${row.project.paymentMode === "installments" ? "Installments" : "Direct"}`,
              }))}
              onChange={setProjectId}
            />
          </div>
          {current ? (
            <div className={styles.form}>
              <p>Total {formatRupees(current.project.grandTotal)} · Received {formatRupees(current.paidTotal)} · Balance {formatRupees(current.balance)}</p>
              {current.project.paymentMode === "direct" ? (
                <div className={styles.formActions}>
                  {current.invoices.length === 0 ? <p className={styles.hint}>Create the invoice from Projects in Process before receiving a payment.</p> : null}
                  <button className={styles.primaryButton} type="button" onClick={() => setReceiving(true)} disabled={saving || current.balance <= 0 || current.invoices.length === 0}>Receive payment</button>
                </div>
              ) : current.agreement ? (
                <>
                  <PaymentFields paidAmount={paidAmount} paymentDate={paymentDate} paymentMode={paymentMode} onAmount={setPaidAmount} onDate={setPaymentDate} onMode={setPaymentMode} />
                  <p className={styles.hint}>The date and mode above are used when an installment is received. Due dates stay editable on each card.</p>
                <div className={styles.cards}>
                  {current.agreement.schedule.map((line) => (
                    <article className={styles.card} key={line.number}>
                      <div className={styles.cardTop}>
                        <strong>Installment {line.number}</strong>
                        <span className={styles.badge}>{line.status === "paid" ? "Paid" : "Due"}</span>
                      </div>
                      <p className={styles.total}>{formatRupees(line.amount)}</p>
                      <label className={styles.field}>
                        <span>Due date</span>
                        <input type="date" value={line.dueDate} onChange={(event) => {
                          const dueDate = event.target.value;
                          void updateDueDate(current.project.id, line.number, dueDate).then((saved) => {
                            setProjects((rows) => rows.map((row) => row.project.id === saved.project.id ? saved : row));
                          }).catch((error: unknown) => {
                            setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The due date could not be saved." });
                          });
                        }} />
                      </label>
                      {line.status === "paid" ? <p>Paid {formatRupees(line.paidAmount)} on {line.paidDate ? formatDisplayDate(line.paidDate) : ""}</p> : (
                        <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void saveInstallment(line.number, paidAmount > 0 ? paidAmount : line.amount)}>
                          Receive {formatRupees(line.amount)}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                </>
              ) : <p>Generate the installment agreement on the project card before receiving these payments.</p>}

              <h2>Payment history</h2>
              {current.payments.length === 0 ? <p>No payments received yet.</p> : null}
              {current.payments.map((payment) => (
                <article className={styles.card} key={payment.id}>
                  {editing?.id === payment.id ? (
                    <>
                      <PaymentFields
                        paidAmount={editing.paidAmount}
                        paymentDate={editing.paymentDate}
                        paymentMode={editing.paymentMode}
                        onAmount={(value) => setEditing({ ...editing, paidAmount: value })}
                        onDate={(value) => setEditing({ ...editing, paymentDate: value })}
                        onMode={(value) => setEditing({ ...editing, paymentMode: value })}
                      />
                      <div className={styles.formActions}>
                        <button className={styles.secondaryButton} type="button" onClick={() => setEditing(null)}>Cancel</button>
                        <button className={styles.primaryButton} type="button" onClick={() => void saveEdit()} disabled={saving}>Save edit</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>{formatRupees(payment.paidAmount)}</strong>
                      <p>{formatDisplayDate(payment.paymentDate)} · {payment.paymentMode === "bank_transfer" ? "Bank transfer" : "Cash"}{payment.installmentNumber ? ` · Installment ${payment.installmentNumber}` : ""}</p>
                      <div className={styles.cardActions}>
                        <button type="button" onClick={() => setSlip(payment)}>Paid slip</button>
                        <button type="button" onClick={() => void sendSlip(payment)} disabled={sendingId === payment.id}>
                          <MessageCircle size={15} /> {sendingId === payment.id ? "Sending…" : "WhatsApp"}
                        </button>
                        <button type="button" onClick={() => setEditing(payment)}>Edit</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {receiving && current?.project.paymentMode === "direct" ? (
        <DirectPaymentDialog
          project={current.project}
          balance={current.balance}
          firstPayment={current.paidTotal <= 0}
          onClose={() => setReceiving(false)}
          onSaved={() => {
            const id = current.project.id;
            setReceiving(false);
            setBanner({ tone: "ok", text: "Payment received. The remaining balance invoice is updated." });
            void refresh(id);
          }}
        />
      ) : null}
      {slip && current ? (
        <div className={styles.modal} role="presentation" onClick={() => setSlip(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>Paid slip</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
                <button className={styles.secondaryButton} type="button" onClick={() => void sendSlip(slip)} disabled={sendingId === slip.id}>
                  <MessageCircle size={15} /> {sendingId === slip.id ? "Sending…" : "Send on WhatsApp"}
                </button>
                <button className={styles.secondaryButton} type="button" onClick={() => setSlip(null)}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}><PaymentSlip project={current.project} payment={slip} /></div>
          </div>
        </div>
      ) : null}
      {capture && current ? (
        <div className={styles.capture} ref={captureRef}>
          <PaymentSlip project={current.project} payment={capture} paper />
        </div>
      ) : null}
    </>
  );
}
