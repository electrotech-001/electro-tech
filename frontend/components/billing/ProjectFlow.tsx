"use client";

import { useState } from "react";
import { DocumentApiError, readImageFile, saveAgreement, recordPayment, type BankMode, type GuarantorInput, type InvoiceRecord } from "@/lib/billing/documents-api";
import { formatRupees, todayIsoDate, type QuotationRecord } from "@/lib/billing/quotation-math";
import { FancySelect, FilePicker } from "./FancyControls";
import styles from "./quotation.module.css";

const bankModes: { value: BankMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
];

const sectors: { value: GuarantorInput["sector"]; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "government", label: "Government" },
];

const emptyGuarantor = (): GuarantorInput => ({
  fullName: "",
  designation: "",
  occupation: "",
  sector: "private",
  cnicFront: "",
  cnicBack: "",
});

export function AgreementDialog({
  project,
  onClose,
  onSaved,
}: {
  project: QuotationRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const installments = project.paymentMode === "installments";
  const [dueDates, setDueDates] = useState<string[]>(() => Array.from({ length: project.installmentCount ?? 0 }, () => ""));
  const [guarantors, setGuarantors] = useState<GuarantorInput[]>([emptyGuarantor(), emptyGuarantor()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateGuarantor(index: number, patch: Partial<GuarantorInput>) {
    setGuarantors((current) => current.map((guarantor, guarantorIndex) => guarantorIndex === index ? { ...guarantor, ...patch } : guarantor));
  }

  async function onFile(index: number, side: "cnicFront" | "cnicBack", file: File | undefined) {
    if (!file) return;
    try {
      const image = await readImageFile(file);
      updateGuarantor(index, { [side]: image });
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The CNIC photo could not be read.");
    }
  }

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      await saveAgreement(project.id, {
        dueDates: installments ? dueDates : [],
        guarantors: installments ? guarantors : [],
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The agreement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="agreement-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalBar}>
          <h2 id="agreement-title">Agreement for {project.serial}</h2>
          <button className={styles.secondaryButton} type="button" onClick={onClose}>Close</button>
        </div>
        <div className={`${styles.modalScroll} ${styles.form}`}>
          <p>{installments
            ? "Enter the due date of each installment and the two guarantors. The letter is saved in Agreements and the guarantors are linked to this customer."
            : "A direct payment agreement is written on the Electro Tech letterhead. Guarantors are not required."}</p>
          {installments ? dueDates.map((date, index) => (
            <label className={styles.field} key={index}>
              <span>Installment {index + 1} due date · {formatRupees(project.installments[index]?.amount ?? 0)}</span>
              <input type="date" value={date} onChange={(event) => setDueDates((current) => current.map((value, dateIndex) => dateIndex === index ? event.target.value : value))} />
            </label>
          )) : null}
          {installments ? guarantors.map((guarantor, index) => (
            <fieldset className={styles.planFields} key={index}>
              <legend>Guarantor {index + 1}</legend>
              <label className={styles.field}><span>Name</span><input value={guarantor.fullName} onChange={(event) => updateGuarantor(index, { fullName: event.target.value })} /></label>
              <label className={styles.field}><span>Designation</span><input value={guarantor.designation} onChange={(event) => updateGuarantor(index, { designation: event.target.value })} /></label>
              <label className={styles.field}><span>Occupation</span><input value={guarantor.occupation} onChange={(event) => updateGuarantor(index, { occupation: event.target.value })} /></label>
              <div className={styles.field}>
                <span id={`guarantor-sector-${index}`}>Sector</span>
                <FancySelect labelId={`guarantor-sector-${index}`} value={guarantor.sector} options={sectors} onChange={(sector) => updateGuarantor(index, { sector })} />
              </div>
              <div className={styles.field}>
                <span>CNIC front</span>
                <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicFront ? "Photo attached" : null} onFile={(file) => void onFile(index, "cnicFront", file)} />
              </div>
              <div className={styles.field}>
                <span>CNIC back</span>
                <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicBack ? "Photo attached" : null} onFile={(file) => void onFile(index, "cnicBack", file)} />
              </div>
              {guarantor.cnicFront ? <p className={styles.hint}>CNIC front attached.</p> : null}
              {guarantor.cnicBack ? <p className={styles.hint}>CNIC back attached.</p> : null}
            </fieldset>
          )) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className={styles.primaryButton} type="button" onClick={() => void onSubmit()} disabled={saving}>{saving ? "Saving…" : "Save agreement"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DirectPaymentDialog({
  project,
  balance,
  onClose,
  onSaved,
}: {
  project: QuotationRecord;
  balance: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paidAmount, setPaidAmount] = useState(balance > 0 && balance < project.grandTotal ? balance : 0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, balance - Number(paidAmount || 0));

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      await recordPayment(project.id, { kind: "direct", paidAmount: Number(paidAmount), paymentDate, paymentMode });
      onSaved();
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The invoice could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="invoice-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="invoice-title">{balance < project.grandTotal ? "Record balance" : "Create invoice"} · {project.serial}</h2>
        <p>Total {formatRupees(project.grandTotal)}. Remaining before this payment {formatRupees(balance)}. After this payment the balance will be {formatRupees(remaining)}.</p>
        <label className={styles.field}><span>{balance < project.grandTotal ? "Balance paid" : "Advance paid"}</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></label>
        <label className={styles.field}><span>Date of payment</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
        <div className={styles.field}>
          <span id="invoice-payment-mode">Payment mode</span>
          <FancySelect labelId="invoice-payment-mode" value={paymentMode} options={bankModes} onChange={setPaymentMode} />
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.primaryButton} type="button" onClick={() => void onSubmit()} disabled={saving}>{saving ? "Saving…" : "Save invoice"}</button>
        </div>
      </div>
    </div>
  );
}

export function InstallmentInvoiceDialog({
  invoices,
  onClose,
  onView,
}: {
  invoices: InvoiceRecord[];
  onClose: () => void;
  onView: (invoice: InvoiceRecord) => void;
}) {
  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="installment-invoices-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalBar}>
          <h2 id="installment-invoices-title">Installment invoices</h2>
          <button className={styles.secondaryButton} type="button" onClick={onClose}>Close</button>
        </div>
        <div className={styles.modalScroll}>
          {invoices.length === 0 ? <p>Generate the agreement first. Each installment then gets an invoice with its due date.</p> : null}
          <div className={styles.cards}>
            {invoices.map((invoice) => (
              <article className={styles.card} key={invoice.id}>
                <strong>{invoice.serial}</strong>
                <p>Installment {invoice.installmentNumber} · {invoice.status === "paid" ? "Paid" : invoice.dueDate ? `Due ${invoice.dueDate}` : "Due"}</p>
                <p className={styles.total}>{formatRupees(invoice.grandTotal)}</p>
                <button className={styles.secondaryButton} type="button" onClick={() => onView(invoice)}>View</button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
