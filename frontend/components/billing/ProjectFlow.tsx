"use client";

import { useState } from "react";
import { defaultAgreementWording } from "@/lib/billing/agreement-wording";
import { DocumentApiError, readImageFile, saveAgreement, updateAgreementWording, recordPayment, type AgreementRecord, type BankMode, type GuarantorInput } from "@/lib/billing/documents-api";
import { printFromControl } from "@/lib/billing/print-letter";
import { formatRupees, maskCnic, maskPhone, todayIsoDate, type QuotationRecord } from "@/lib/billing/quotation-math";
import { AgreementLetter } from "./BillingLetters";
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
  contactNo: "",
  cnic: "",
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
  const [wording, setWording] = useState(() => defaultAgreementWording(project));
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
        body: wording,
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
            ? "Enter the due date of each installment and the two guarantors. Edit the wording if this customer needs different text."
            : "A direct payment agreement is written on the Electro Tech letterhead. Guarantors are not required. Edit the wording if this customer needs different text."}</p>
          <label className={styles.field}>
            <span>Agreement wording</span>
            <textarea rows={8} value={wording} onChange={(event) => setWording(event.target.value)} />
          </label>
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
              <label className={styles.field}><span>Contact number</span><input inputMode="numeric" value={guarantor.contactNo} onChange={(event) => updateGuarantor(index, { contactNo: maskPhone(event.target.value) })} placeholder="0300-0000000" /></label>
              <label className={styles.field}><span>CNIC number</span><input inputMode="numeric" value={guarantor.cnic} onChange={(event) => updateGuarantor(index, { cnic: maskCnic(event.target.value) })} placeholder="00000-0000000-0" /></label>
              <div className={styles.field}>
                <span id={`guarantor-sector-${index}`}>Sector</span>
                <FancySelect labelId={`guarantor-sector-${index}`} value={guarantor.sector} options={sectors} onChange={(sector) => updateGuarantor(index, { sector })} />
              </div>
              <div className={styles.cnicPreview}>
                <figure>
                  <span>CNIC front</span>
                  <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicFront ? "Photo attached" : null} onFile={(file) => void onFile(index, "cnicFront", file)} />
                  {guarantor.cnicFront ? <img src={guarantor.cnicFront} alt={`Guarantor ${index + 1} CNIC front preview`} /> : <div className={styles.cnicEmpty}>Front preview</div>}
                </figure>
                <figure>
                  <span>CNIC back</span>
                  <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicBack ? "Photo attached" : null} onFile={(file) => void onFile(index, "cnicBack", file)} />
                  {guarantor.cnicBack ? <img src={guarantor.cnicBack} alt={`Guarantor ${index + 1} CNIC back preview`} /> : <div className={styles.cnicEmpty}>Back preview</div>}
                </figure>
              </div>
            </fieldset>
          )) : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className={styles.primaryButton} type="button" onClick={() => void onSubmit()} disabled={saving}>{saving ? "Saving…" : installments ? "Create invoices" : "Save agreement"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgreementViewDialog({
  agreement,
  onClose,
  onSaved,
}: {
  agreement: AgreementRecord;
  onClose: () => void;
  onSaved: (agreement: AgreementRecord) => void;
}) {
  const [wording, setWording] = useState(() => agreement.body?.trim() || defaultAgreementWording(agreement.project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = { ...agreement, body: wording };

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateAgreementWording(agreement.id, wording));
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The agreement wording could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalBar}>
          <h2>{agreement.serial}</h2>
          <div>
            <button className={styles.secondaryButton} type="button" onClick={() => void onSave()} disabled={saving}>{saving ? "Saving…" : "Save wording"}</button>
            <button className={styles.secondaryButton} type="button" onClick={(event) => void printFromControl(event.currentTarget)}>Print</button>
            <button className={styles.secondaryButton} type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className={`${styles.modalScroll} ${styles.form}`}>
          <label className={styles.field}>
            <span>Agreement wording</span>
            <textarea rows={8} value={wording} onChange={(event) => setWording(event.target.value)} />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <AgreementLetter agreement={preview} />
        </div>
      </div>
    </div>
  );
}

export function DirectPaymentDialog({
  project,
  balance,
  firstPayment,
  onClose,
  onSaved,
}: {
  project: QuotationRecord;
  balance: number;
  firstPayment: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, Math.round((balance - Number(paidAmount || 0)) * 100) / 100);

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      await recordPayment(project.id, { kind: "direct", paidAmount: Number(paidAmount), paymentDate, paymentMode });
      onSaved();
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The payment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="invoice-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="invoice-title">Receive payment · {project.serial}</h2>
        <p>Total {formatRupees(project.grandTotal)}. The remaining balance invoice updates with this payment, its date, and its mode.</p>
        <label className={styles.field}><span>{firstPayment ? "Advance payment" : "Paid amount"}</span><input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))} /></label>
        <label className={styles.field}><span>Remaining balance</span><input readOnly value={formatRupees(remaining)} /></label>
        <label className={styles.field}><span>Date of payment</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
        <div className={styles.field}>
          <span id="invoice-payment-mode">Payment mode</span>
          <FancySelect labelId="invoice-payment-mode" value={paymentMode} options={bankModes} onChange={setPaymentMode} />
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.primaryButton} type="button" onClick={() => void onSubmit()} disabled={saving}>{saving ? "Saving…" : "Receive payment"}</button>
        </div>
      </div>
    </div>
  );
}
