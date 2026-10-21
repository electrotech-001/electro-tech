"use client";

import { useState } from "react";
import { defaultAgreementWording } from "@/lib/billing/agreement-wording";
import { DocumentApiError, issueDirectInvoice, readImageFile, saveAgreement, updateAgreementWording, recordPayment, type AgreementRecord, type BankMode, type GuarantorInput, type PaymentRecord } from "@/lib/billing/documents-api";
import { printFromControl } from "@/lib/billing/print-letter";
import { customInstallments, formatRupees, isDirectSale, maskCnic, maskPhone, roundMoney, splitInstallments, todayIsoDate, type QuotationRecord } from "@/lib/billing/quotation-math";
import { AgreementLetter } from "./BillingLetters";
import { AmountInput, FancySelect, FilePicker } from "./FancyControls";
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
  const [dueDates, setDueDates] = useState<string[]>(() => Array.from({ length: project.installmentCount ?? 0 }, (_, index) => project.installmentDueDates?.[index] ?? ""));
  const [guarantor, setGuarantor] = useState<GuarantorInput>(emptyGuarantor);
  const [wording, setWording] = useState(() => defaultAgreementWording(project));
  const [downAmount, setDownAmount] = useState(0);
  const [planDiscount, setPlanDiscount] = useState(project.planDiscount ?? 0);
  const custom = customInstallments(project) != null;
  const installmentFaces = installments && !custom && (project.installmentCount ?? 0) > 0
    ? splitInstallments(Math.max(0, roundMoney(project.grandTotal - (project.downPayment ?? 0) - (Number(planDiscount) || 0))), project.installmentCount ?? 0)
    : project.installments;
  const [downDate, setDownDate] = useState(todayIsoDate());
  const [downMode, setDownMode] = useState<BankMode>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateGuarantor(patch: Partial<GuarantorInput>) {
    setGuarantor((current) => ({ ...current, ...patch }));
  }

  async function onFile(side: "cnicFront" | "cnicBack", file: File | undefined) {
    if (!file) return;
    try {
      const image = await readImageFile(file);
      updateGuarantor({ [side]: image });
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The CNIC photo could not be read.");
    }
  }

  function guarantorFilled(person: GuarantorInput): boolean {
    return Boolean(
      person.fullName.trim()
      || person.designation.trim()
      || person.occupation.trim()
      || person.contactNo.trim()
      || person.cnic.trim()
      || person.cnicFront
      || person.cnicBack,
    );
  }

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      const received = roundMoney(Math.max(0, Number(downAmount) || 0));
      const discount = roundMoney(Math.max(0, Number(planDiscount) || 0));
      const afterDown = roundMoney(Math.max(0, project.grandTotal - (project.downPayment ?? 0)));
      if (installments && discount > afterDown) {
        setError("Down payment and discount cannot be more than the total amount.");
        setSaving(false);
        return;
      }
      if (installments && received > (project.downPayment ?? 0)) {
        setError("Down payment cannot be more than the down payment on the quotation.");
        setSaving(false);
        return;
      }
      if (installments && received > 0 && !downDate) {
        setError("Choose the date the down payment was received.");
        setSaving(false);
        return;
      }
      await saveAgreement(project.id, {
        dueDates: installments ? dueDates : [],
        guarantors: installments && guarantorFilled(guarantor) ? [guarantor] : [],
        body: wording,
        opening: installments ? { paidAmount: received, paymentDate: downDate, paymentMode: downMode } : undefined,
        planDiscount: installments ? roundMoney(Math.max(0, Number(planDiscount) || 0)) : undefined,
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
            ? "Record the down payment already received, then the due date of each installment. The remaining balance follows the installments on the quotation. The guarantor is optional."
            : "A direct payment agreement is written on the Electro Tech letterhead. Guarantors are not required. Edit the wording if this customer needs different text."}</p>
          {installments ? (
            <fieldset className={styles.planFields}>
              <legend>Down payment received</legend>
              <label className={styles.field}>
                <span>Amount received</span>
                <AmountInput value={downAmount} onChange={(amount) => setDownAmount(amount ?? 0)} />
              </label>
              <p>Quotation down payment {formatRupees(project.downPayment ?? 0)}. Enter 0 if nothing has been received yet.</p>
              {(Number(downAmount) || 0) > 0 ? (
                <>
                  <label className={styles.field}>
                    <span>Date received</span>
                    <input type="date" value={downDate} onChange={(event) => setDownDate(event.target.value)} />
                  </label>
                  <div className={styles.field}>
                    <span id="down-payment-mode">Payment mode</span>
                    <FancySelect labelId="down-payment-mode" value={downMode} options={bankModes} onChange={setDownMode} />
                  </div>
                </>
              ) : null}
              {custom ? (
                <p>This plan uses the custom amount entered for each installment.</p>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Discount after down payment</span>
                    <AmountInput value={planDiscount} onChange={(amount) => setPlanDiscount(amount ?? 0)} />
                  </label>
                  <p>Balance after down payment and discount <strong>{formatRupees(Math.max(0, roundMoney(project.grandTotal - (project.downPayment ?? 0) - (Number(planDiscount) || 0))))}</strong></p>
                  <p>This balance is divided across the installment months.</p>
                </>
              )}
            </fieldset>
          ) : null}
          <label className={styles.field}>
            <span>Agreement wording</span>
            <textarea rows={8} value={wording} onChange={(event) => setWording(event.target.value)} />
          </label>
          {installments ? dueDates.map((date, index) => (
            <label className={styles.field} key={index}>
              <span>Installment {index + 1} due date · {formatRupees(installmentFaces[index]?.amount ?? 0)}</span>
              <input type="date" value={date} onChange={(event) => setDueDates((current) => current.map((value, dateIndex) => dateIndex === index ? event.target.value : value))} />
            </label>
          )) : null}
          {installments ? (
            <fieldset className={styles.planFields}>
              <legend>Guarantor 1 (optional)</legend>
              <label className={styles.field}><span>Name</span><input value={guarantor.fullName} onChange={(event) => updateGuarantor({ fullName: event.target.value })} /></label>
              <label className={styles.field}><span>Designation</span><input value={guarantor.designation} onChange={(event) => updateGuarantor({ designation: event.target.value })} /></label>
              <label className={styles.field}><span>Occupation</span><input value={guarantor.occupation} onChange={(event) => updateGuarantor({ occupation: event.target.value })} /></label>
              <label className={styles.field}><span>Contact number</span><input inputMode="numeric" value={guarantor.contactNo} onChange={(event) => updateGuarantor({ contactNo: maskPhone(event.target.value) })} placeholder="0300-0000000" /></label>
              <label className={styles.field}><span>CNIC number</span><input inputMode="numeric" value={guarantor.cnic} onChange={(event) => updateGuarantor({ cnic: maskCnic(event.target.value) })} placeholder="00000-0000000-0" /></label>
              <div className={styles.field}>
                <span id="guarantor-sector-1">Sector</span>
                <FancySelect labelId="guarantor-sector-1" value={guarantor.sector} options={sectors} onChange={(sector) => updateGuarantor({ sector })} />
              </div>
              <div className={styles.cnicPreview}>
                <figure>
                  <span>CNIC front (optional)</span>
                  <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicFront ? "Photo attached" : null} onFile={(file) => void onFile("cnicFront", file)} />
                  {guarantor.cnicFront ? <img src={guarantor.cnicFront} alt="Guarantor 1 CNIC front preview" /> : <div className={styles.cnicEmpty}>Front preview</div>}
                </figure>
                <figure>
                  <span>CNIC back (optional)</span>
                  <FilePicker accept="image/png,image/jpeg" fileName={guarantor.cnicBack ? "Photo attached" : null} onFile={(file) => void onFile("cnicBack", file)} />
                  {guarantor.cnicBack ? <img src={guarantor.cnicBack} alt="Guarantor 1 CNIC back preview" /> : <div className={styles.cnicEmpty}>Back preview</div>}
                </figure>
              </div>
            </fieldset>
          ) : null}
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

export type PaymentTarget = { kind: "direct" } | { kind: "opening" } | { kind: "installment"; installmentNumber: number };

export function DirectPaymentDialog({
  project,
  balance,
  firstPayment,
  serial = project.serial,
  target = { kind: "direct" },
  prepare,
  onClose,
  onSaved,
}: {
  project: QuotationRecord;
  balance: number;
  firstPayment: boolean;
  serial?: string;
  target?: PaymentTarget;
  prepare?: () => Promise<void>;
  onClose: () => void;
  onSaved: (payment: PaymentRecord | null) => void;
}) {
  const [paidAmount, setPaidAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(0, Math.round((balance - Number(paidAmount || 0) - Number(discountAmount || 0)) * 100) / 100);

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      const paid = Number(paidAmount);
      const discount = Number(discountAmount) || 0;
      await prepare?.();
      const saved = await recordPayment(project.id, { ...target, paidAmount: paid, discountAmount: discount, paymentDate, paymentMode });
      const installmentNumber = target.kind === "installment" ? target.installmentNumber : null;
      const payment = [...saved.payments].reverse().find((entry) => entry.paymentDate === paymentDate && entry.paidAmount === paid && (entry.discountAmount ?? 0) === discount && entry.paymentMode === paymentMode && (target.kind === "direct" || entry.installmentNumber === installmentNumber)) ?? null;
      onSaved(payment);
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The payment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="invoice-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="invoice-title">Receive payment · {serial}</h2>
        <p>Total {formatRupees(project.grandTotal)}. Cash and discount on this receipt update the balance invoice.</p>
        <label className={styles.field}><span>Balance amount</span><input readOnly value={formatRupees(balance)} /></label>
        <label className={styles.field}><span>{firstPayment && !isDirectSale(project) ? "Advance payment" : "Paid amount"}</span><AmountInput value={paidAmount} onChange={(amount) => setPaidAmount(amount ?? 0)} /></label>
        <label className={styles.field}><span>Discount amount</span><AmountInput value={discountAmount} onChange={(amount) => setDiscountAmount(amount ?? 0)} /></label>
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

export function DirectInvoiceDialog({
  project,
  onClose,
  onSaved,
}: {
  project: QuotationRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentMode, setPaymentMode] = useState<BankMode>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const received = roundMoney(Math.max(0, Number(paidAmount) || 0));
  const balance = Math.max(0, roundMoney(project.grandTotal - received));

  async function onSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (received > project.grandTotal) {
        setError("Advance payment cannot be more than the total amount.");
        return;
      }
      if (received > 0 && !paymentDate) {
        setError("Choose the date the advance payment was received.");
        return;
      }
      await issueDirectInvoice(project.id, { paidAmount: received, paymentDate, paymentMode });
      onSaved();
    } catch (caught) {
      setError(caught instanceof DocumentApiError ? caught.message : "The invoice could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="direct-invoice-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="direct-invoice-title">Create invoice · {project.serial}</h2>
        <p>Record the advance payment already received. Enter 0 if none was received. This stays on the invoice and in the payment ledger.</p>
        <label className={styles.field}><span>Total</span><input readOnly value={formatRupees(project.grandTotal)} /></label>
        <label className={styles.field}>
          <span>Advance payment received</span>
          <AmountInput value={paidAmount} onChange={(amount) => setPaidAmount(amount ?? 0)} />
        </label>
        <p>{(project.downPayment ?? 0) > 0 ? `Quotation advance payment ${formatRupees(project.downPayment ?? 0)}. ` : ""}Enter 0 if nothing has been received yet.</p>
        {received > 0 ? (
          <>
            <label className={styles.field}>
              <span>Date received</span>
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </label>
            <div className={styles.field}>
              <span id="direct-advance-mode">Payment mode</span>
              <FancySelect labelId="direct-advance-mode" value={paymentMode} options={bankModes} onChange={setPaymentMode} />
            </div>
          </>
        ) : null}
        <label className={styles.field}><span>Balance</span><input readOnly value={formatRupees(balance)} /></label>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.formActions}>
          <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.primaryButton} type="button" onClick={() => void onSubmit()} disabled={saving}>{saving ? "Saving…" : "Save invoice"}</button>
        </div>
      </div>
    </div>
  );
}
