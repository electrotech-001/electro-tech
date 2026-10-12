"use client";

import { useState } from "react";
import { createDirectSale, DocumentApiError, type BankMode, type ReceiveProject } from "@/lib/billing/documents-api";
import { blankDraft, computeTotals, formatRupees, quotationIssues, todayIsoDate, type QuotationDraft } from "@/lib/billing/quotation-math";
import { AmountInput, FancySelect } from "./FancyControls";
import { QuotationForm } from "./QuotationForm";
import styles from "./quotation.module.css";

const bankModes: { value: BankMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
];

export function DirectSaleForm({
  serial,
  onCancel,
  onCreated,
}: {
  serial: string;
  onCancel: () => void;
  onCreated: (saved: ReceiveProject) => void;
}) {
  const [draft, setDraft] = useState<QuotationDraft>(blankDraft(serial));
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [step, setStep] = useState<"form" | "receipt">("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totals = computeTotals(draft);
  const received = Math.max(0, Number(paidAmount) || 0);
  const balance = Math.max(0, totals.grandTotal - received);
  const receiptLabel = draft.paymentMode === "installments" ? "Down payment received" : "Amount received";

  async function onSave() {
    const issues = quotationIssues(draft);
    if (issues[0]) {
      setError(issues[0]);
      return;
    }
    if (received > totals.grandTotal) {
      setError("The amount received cannot be more than the total amount.");
      return;
    }
    if (received > 0 && !paymentDate) {
      setError("Choose the date the payment was received.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await createDirectSale(draft, { paidAmount: received, paymentDate, paymentMode });
      onCreated(saved);
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The invoice could not be created.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "receipt") {
    return (
      <div className={styles.form}>
        <p>Record cash or bank received on this sale. Enter 0 if the customer will pay later. The rest stays in pending invoices, receive payments, and the ledger.</p>
        <label className={styles.field}><span>Total</span><input readOnly value={formatRupees(totals.grandTotal)} /></label>
        <label className={styles.field}>
          <span>{receiptLabel}</span>
          <AmountInput value={paidAmount} onChange={(amount) => setPaidAmount(amount ?? 0)} />
        </label>
        {received > 0 ? (
          <>
            <label className={styles.field}>
              <span>Date received</span>
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </label>
            <div className={styles.field}>
              <span id="direct-sale-mode">Payment mode</span>
              <FancySelect labelId="direct-sale-mode" value={paymentMode} options={bankModes} onChange={setPaymentMode} />
            </div>
          </>
        ) : null}
        <label className={styles.field}><span>Balance</span><input readOnly value={formatRupees(balance)} /></label>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => setStep("form")} disabled={saving}>Back</button>
          <button className={styles.primaryButton} type="button" onClick={() => void onSave()} disabled={saving}>{saving ? "Saving…" : "Create invoice"}</button>
        </div>
      </div>
    );
  }

  return (
    <QuotationForm
      serial={serial}
      draft={draft}
      saving={saving}
      error={error}
      serialLabel="Sale serial no"
      dateLabel="Invoice date"
      submitLabel="Continue"
      onChange={setDraft}
      onCancel={onCancel}
      onSubmit={() => {
        const issues = quotationIssues(draft);
        if (issues[0]) {
          setError(issues[0]);
          return;
        }
        setError(null);
        setStep("receipt");
      }}
    />
  );
}
