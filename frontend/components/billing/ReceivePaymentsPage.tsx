"use client";

import { MessageCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DocumentApiError, listReceiveProjects, nextDirectSaleSerial, recordPayment, saveAgreement, updateDueDate, updatePayment, type BankMode, type PaymentRecord, type ReceiveProject } from "@/lib/billing/documents-api";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { formatDisplayDate, formatRupees, isDirectSale, todayIsoDate } from "@/lib/billing/quotation-math";
import { DirectSaleForm } from "./DirectSaleForm";
import { printFromControl } from "@/lib/billing/print-letter";
import { sendWhatsAppDocument, WhatsAppApiError } from "@/lib/billing/whatsapp-api";
import { PaymentSlip } from "./BillingLetters";
import { AmountInput, FancySelect } from "./FancyControls";
import { DirectPaymentDialog } from "./ProjectFlow";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year || 2026, (month || 1) - 1 + months, day || 1);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function legacyAdvanceInvoice(current: ReceiveProject) {
  const face = current.project.downPayment ?? 0;
  if (!(face > 0) || face + 0.001 >= current.project.grandTotal) return undefined;
  return current.invoices.find((entry) => entry.kind === "advance" && entry.grandTotal <= face + 0.001);
}

function openingPending(current: ReceiveProject): number {
  const face = current.project.downPayment ?? 0;
  if (!(face > 0)) return 0;
  if (current.project.paymentMode === "installments") {
    const covered = current.payments
      .filter((payment) => payment.installmentNumber == null)
      .reduce((sum, payment) => sum + payment.paidAmount + (payment.discountAmount ?? 0), 0);
    return Math.max(0, Math.round((face - covered) * 100) / 100);
  }
  return legacyAdvanceInvoice(current)?.balanceDue ?? 0;
}

function OpeningCard({
  current,
  paidAmount,
  saving,
  onReceived,
}: {
  current: ReceiveProject;
  paidAmount: number;
  saving: boolean;
  onReceived: (amount: number) => void;
}) {
  const face = current.project.downPayment ?? 0;
  const pending = openingPending(current);
  if (!(face > 0)) return null;
  if (current.project.paymentMode === "direct" && !legacyAdvanceInvoice(current)) return null;
  const title = current.project.paymentMode === "installments" ? "Down payment" : "Advance payment";
  const cash = Math.min(paidAmount > 0 ? paidAmount : pending, pending);
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <strong>{title}</strong>
        <span className={styles.badge}>{pending <= 0 ? "Paid" : "Due"}</span>
      </div>
      <p className={styles.total}>{formatRupees(face)}</p>
      <div className={styles.moneySplit}>
        <p className={styles.moneyPaid}><span>Paid</span><strong>{formatRupees(Math.max(0, face - pending))}</strong></p>
        <p className={styles.moneyPending}><span>Pending</span><strong>{formatRupees(pending)}</strong></p>
      </div>
      {pending <= 0 ? <p>Received in cash or bank.</p> : (
        <button className={styles.primaryButton} type="button" disabled={saving || cash <= 0} onClick={() => onReceived(cash)}>
          Receive {formatRupees(cash)}
        </button>
      )}
    </article>
  );
}

function PaymentFields({
  paidAmount,
  discountAmount,
  paymentDate,
  paymentMode,
  onAmount,
  onDiscount,
  onDate,
  onMode,
}: {
  paidAmount: number;
  discountAmount: number;
  paymentDate: string;
  paymentMode: BankMode;
  onAmount: (value: number) => void;
  onDiscount: (value: number) => void;
  onDate: (value: string) => void;
  onMode: (value: BankMode) => void;
}) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.field}><span>Paid amount</span><AmountInput value={paidAmount} onChange={(amount) => onAmount(amount ?? 0)} /></label>
      <label className={styles.field}><span>Discount amount</span><AmountInput value={discountAmount} onChange={(amount) => onDiscount(amount ?? 0)} /></label>
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
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [slip, setSlip] = useState<PaymentRecord | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<PaymentRecord | null>(null);
  const [draftDueDates, setDraftDueDates] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [saleSerial, setSaleSerial] = useState("DS-001");
  const captureRef = useRef<HTMLDivElement>(null);

  function draftDueDate(projectId: string, number: number, index: number): string {
    return draftDueDates[`${projectId}:${number}`] ?? addMonths(todayIsoDate(), index + 1);
  }

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

  if (creating) {
    return (
      <>
        <header className={shell.pageHeader}>
          <div>
            <p className={shell.kicker}>Billing CMS</p>
            <h1 className={shell.title}>New direct invoice</h1>
            <p className={shell.summary}>Create a daily-sale invoice without a quotation or a project in process, then receive its payments here.</p>
          </div>
        </header>
        {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
        <section className={shell.panel}>
          <DirectSaleForm
            serial={saleSerial}
            onCancel={() => setCreating(false)}
            onCreated={(saved) => {
              setCreating(false);
              setBanner({ tone: "ok", text: `${saved.invoices[0]?.serial ?? "Invoice"} was created. Receive any remaining balance here.` });
              void refresh(saved.project.id);
            }}
          />
        </section>
      </>
    );
  }

  async function saveOpening(amount: number) {
    if (!current) return;
    setSaving(true);
    setBanner(null);
    try {
      const saved = await recordPayment(current.project.id, { kind: "opening", paidAmount: amount, discountAmount, paymentDate, paymentMode });
      await refresh(current.project.id);
      const label = current.project.paymentMode === "installments" ? "Down payment" : "Advance payment";
      setSlip([...saved.payments].reverse().find((payment) => payment.installmentNumber == null && payment.paidAmount === amount) ?? null);
      setDiscountAmount(0);
      setBanner({ tone: "ok", text: `${label} was received and added to the payment ledger.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The payment could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function saveInstallment(installmentNumber: number, amount: number) {
    if (!current) return;
    setSaving(true);
    setBanner(null);
    try {
      if (!current.agreement) {
        const dueDates = current.project.installments.map((line, index) => draftDueDate(current.project.id, line.number, index));
        await saveAgreement(current.project.id, { dueDates, guarantors: [] });
      }
      const saved = await recordPayment(current.project.id, { kind: "installment", installmentNumber, paidAmount: amount, discountAmount, paymentDate, paymentMode });
      await refresh(current.project.id);
      setSlip([...saved.payments].reverse().find((payment) => payment.installmentNumber === installmentNumber) ?? null);
      setDiscountAmount(0);
      const line = saved.agreement?.schedule.find((entry) => entry.number === installmentNumber);
      setBanner({ tone: "ok", text: line?.status === "paid" ? `Installment ${installmentNumber} is marked paid.` : `Installment ${installmentNumber} payment was received.` });
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
      await updatePayment(editing.id, { paidAmount: editing.paidAmount, discountAmount: editing.discountAmount ?? 0, paymentDate: editing.paymentDate, paymentMode: editing.paymentMode });
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
          <p className={shell.summary}>Choose a customer whose project is still in process, or a direct invoice from daily sales. Direct payments and installment cards are recorded here, and each receipt can be edited.</p>
        </div>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => {
            void nextDirectSaleSerial().then(setSaleSerial).catch(() => setSaleSerial("DS-001"));
            setCreating(true);
          }}
        >
          <Plus size={16} /> Direct invoice
        </button>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading customers…</p> : null}
      {!loading && projects.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No invoices to receive</h2>
          <p>Create a direct invoice for a daily sale, or approve a quotation before recording a payment.</p>
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
                label: `${row.project.customerName} · ${row.project.serial} · ${isDirectSale(row.project) ? "Direct invoice" : row.project.paymentMode === "installments" ? "Installments" : "Direct"}`,
              }))}
              onChange={setProjectId}
            />
          </div>
          {current ? (
            <div className={styles.form}>
              <p>Total {formatRupees(current.project.grandTotal)} · Received {formatRupees(current.paidTotal)} · Balance {formatRupees(current.balance)}</p>
              {current.project.paymentMode === "direct" ? (
                <>
                  {legacyAdvanceInvoice(current) ? (
                    <>
                      <PaymentFields paidAmount={paidAmount} discountAmount={discountAmount} paymentDate={paymentDate} paymentMode={paymentMode} onAmount={setPaidAmount} onDiscount={setDiscountAmount} onDate={setPaymentDate} onMode={setPaymentMode} />
                      <div className={styles.cards}>
                        <OpeningCard current={current} paidAmount={paidAmount} saving={saving} onReceived={(amount) => void saveOpening(amount)} />
                      </div>
                    </>
                  ) : null}
                  <div className={styles.formActions}>
                    {current.invoices.length === 0 ? <p className={styles.hint}>Create the invoice from Projects in Process. The advance payment is recorded there and shown on the invoice balance.</p> : null}
                    {openingPending(current) > 0 ? <p className={styles.hint}>Receive the advance payment before the remaining balance.</p> : null}
                    <button className={styles.primaryButton} type="button" onClick={() => setReceiving(true)} disabled={saving || current.balance <= 0 || openingPending(current) > 0 || current.invoices.length === 0}>Receive payment</button>
                  </div>
                </>
              ) : current.project.installments.length > 0 || current.agreement ? (
                <>
                  <PaymentFields paidAmount={paidAmount} discountAmount={discountAmount} paymentDate={paymentDate} paymentMode={paymentMode} onAmount={setPaidAmount} onDiscount={setDiscountAmount} onDate={setPaymentDate} onMode={setPaymentMode} />
                  <p className={styles.hint}>A down payment already received is in the ledger and reduces the project balance. It is not a separate invoice. The date and mode above are used when a remaining down payment or installment is received.</p>
                <div className={styles.cards}>
                  <OpeningCard current={current} paidAmount={paidAmount} saving={saving} onReceived={(amount) => void saveOpening(amount)} />
                  {(current.agreement ? current.agreement.schedule : current.project.installments.map((line, index) => ({
                    number: line.number,
                    dueDate: draftDueDate(current.project.id, line.number, index),
                    amount: line.amount,
                    status: "due" as const,
                    paidAmount: 0,
                    discountAmount: 0,
                    paidDate: null,
                  }))).map((line) => {
                    const paymentDiscount = current.payments.filter((payment) => payment.installmentNumber === line.number).reduce((sum, payment) => sum + (payment.discountAmount ?? 0), 0);
                    const pending = Math.max(0, Math.round((line.amount - line.paidAmount - (line.discountAmount ?? 0) - paymentDiscount) * 100) / 100);
                    const cash = paidAmount > 0 ? paidAmount : Math.max(0, Math.round((pending - discountAmount) * 100) / 100);
                    return (
                    <article className={styles.card} key={line.number}>
                      <div className={styles.cardTop}>
                        <strong>Installment {line.number}</strong>
                        <span className={styles.badge}>{line.status === "paid" ? "Paid" : line.paidAmount > 0 ? "Partial" : "Due"}</span>
                      </div>
                      <p className={styles.total}>{formatRupees(line.amount)}</p>
                      <div className={styles.moneySplit}>
                        <p className={styles.moneyPaid}><span>Paid</span><strong>{formatRupees(line.paidAmount)}</strong></p>
                        <p className={styles.moneyPending}><span>Pending</span><strong>{formatRupees(pending)}</strong></p>
                      </div>
                      <label className={styles.field}>
                        <span>Due date</span>
                        <input type="date" value={line.dueDate} onChange={(event) => {
                          const dueDate = event.target.value;
                          if (!current.agreement) {
                            setDraftDueDates((dates) => ({ ...dates, [`${current.project.id}:${line.number}`]: dueDate }));
                            return;
                          }
                          void updateDueDate(current.project.id, line.number, dueDate).then((saved) => {
                            setProjects((rows) => rows.map((row) => row.project.id === saved.project.id ? saved : row));
                          }).catch((error: unknown) => {
                            setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The due date could not be saved." });
                          });
                        }} />
                      </label>
                      {line.status === "paid" ? <p>Paid in full{(line.discountAmount ?? 0) > 0 ? ` · Discount ${formatRupees(line.discountAmount ?? 0)}` : ""} on {line.paidDate ? formatDisplayDate(line.paidDate) : ""}</p> : (
                        <button className={styles.primaryButton} type="button" disabled={saving || cash <= 0} onClick={() => void saveInstallment(line.number, cash)}>
                          Receive {formatRupees(cash)}
                        </button>
                      )}
                    </article>
                    );
                  })}
                </div>
                </>
              ) : <p>This installment project has no amounts to receive yet.</p>}

              <h2>Payment history</h2>
              {current.payments.length === 0 ? <p>No payments received yet.</p> : null}
              {current.payments.map((payment) => (
                <article className={styles.card} key={payment.id}>
                  {editing?.id === payment.id ? (
                    <>
                      <PaymentFields
                        paidAmount={editing.paidAmount}
                        discountAmount={editing.discountAmount ?? 0}
                        paymentDate={editing.paymentDate}
                        paymentMode={editing.paymentMode}
                        onAmount={(value) => setEditing({ ...editing, paidAmount: value })}
                        onDiscount={(value) => setEditing({ ...editing, discountAmount: value })}
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
                      <p>{formatDisplayDate(payment.paymentDate)} · {payment.paymentMode === "bank_transfer" ? "Bank transfer" : "Cash"}{payment.installmentNumber ? ` · Installment ${payment.installmentNumber}` : ""}{(payment.discountAmount ?? 0) > 0 ? ` · Discount ${formatRupees(payment.discountAmount ?? 0)}` : ""}</p>
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
          onSaved={(payment) => {
            const id = current.project.id;
            setReceiving(false);
            if (payment) setSlip(payment);
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
