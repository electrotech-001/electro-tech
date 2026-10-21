import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { computeTotals, formatRupees, installmentBalance, maskCnic, planDiscountOf, quotationIssues, roundMoney, splitInstallments, type PaymentMode, type QuotationDraft, type QuotationItemInput } from "@/lib/billing/quotation-math";
import { findCustomerByCnic } from "@/lib/billing/quotations-api";
import { AmountInput, FancySelect } from "./FancyControls";
import { PhoneField } from "./PhoneField";
import styles from "./quotation.module.css";

const completeCnic = /^\d{5}-\d{7}-\d$/;

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "installments", label: "Installments" },
  { value: "direct", label: "Direct" },
];

const amountModes: { value: "equal" | "custom"; label: string }[] = [
  { value: "equal", label: "Equal amounts" },
  { value: "custom", label: "Custom amount for each installment" },
];

function sizedAmounts(amounts: number[], count: number | null): number[] {
  return Array.from({ length: Math.max(0, count ?? 0) }, (_, index) => amounts[index] ?? 0);
}

function sizedDates(dates: string[], count: number | null): string[] {
  return Array.from({ length: Math.max(0, count ?? 0) }, (_, index) => dates[index] ?? "");
}

function updateItem(items: QuotationItemInput[], index: number, patch: Partial<QuotationItemInput>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function QuotationForm({
  serial,
  draft,
  saving,
  error,
  serialLabel = "Quotation serial no",
  dateLabel = "Quotation date",
  showDate = true,
  submitLabel = "Save quotation",
  installmentDueDates,
  onInstallmentDueDate,
  dueDatesOnDraft = false,
  advancePayment = true,
  onChange,
  onCancel,
  onSubmit,
}: {
  serial: string;
  draft: QuotationDraft;
  saving: boolean;
  error: string | null;
  serialLabel?: string;
  dateLabel?: string;
  showDate?: boolean;
  submitLabel?: string;
  installmentDueDates?: string[];
  onInstallmentDueDate?: (index: number, value: string) => void;
  dueDatesOnDraft?: boolean;
  advancePayment?: boolean;
  onChange: (draft: QuotationDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const totals = computeTotals(draft);
  const draftDates = dueDatesOnDraft && draft.paymentMode === "installments" ? sizedDates(draft.installmentDueDates ?? [], draft.installmentCount) : null;
  const dueDates = draftDates ?? installmentDueDates;
  const onDueDate = draftDates
    ? (index: number, value: string) => onChange({ ...draft, installmentDueDates: draftDates.map((date, dateIndex) => dateIndex === index ? value : date) })
    : onInstallmentDueDate;
  const issues = quotationIssues(draftDates ? { ...draft, installmentDueDates: draftDates } : draft).filter((issue) => showDate || issue !== "Choose a quotation date.");
  const balance = installmentBalance(totals.grandTotal, draft.downPayment, planDiscountOf(draft));
  const customAmounts = draft.installmentAmounts != null;
  const enteredTotal = roundMoney((draft.installmentAmounts ?? []).reduce((sum, amount) => sum + (Number(amount) || 0), 0));
  const draftRef = useRef(draft);
  const lookupRef = useRef(0);
  const [knownCustomer, setKnownCustomer] = useState<string | null>(null);
  draftRef.current = draft;

  function set<K extends keyof QuotationDraft>(key: K, value: QuotationDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function onCnic(value: string) {
    const cnic = maskCnic(value);
    const next = { ...draftRef.current, cnic };
    draftRef.current = next;
    onChange(next);
    const request = ++lookupRef.current;
    if (!completeCnic.test(cnic)) {
      setKnownCustomer(null);
      return;
    }
    void findCustomerByCnic(cnic).then((customer) => {
      if (request !== lookupRef.current) return;
      if (!customer) {
        setKnownCustomer(null);
        return;
      }
      const filled = {
        ...draftRef.current,
        cnic,
        customerName: customer.customerName,
        address: customer.address,
        contactNo: customer.contactNo,
        whatsappNo: customer.whatsappNo,
      };
      draftRef.current = filled;
      onChange(filled);
      setKnownCustomer(customer.customerName);
    }).catch(() => {
      if (request === lookupRef.current) setKnownCustomer(null);
    });
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>{serialLabel}</span>
          <input value={serial} readOnly />
        </label>
        {showDate ? (
          <label className={styles.field}>
            <span>{dateLabel}</span>
            <input type="date" value={draft.quotationDate} onChange={(event) => set("quotationDate", event.target.value)} required />
          </label>
        ) : null}
        <label className={styles.field}>
          <span>Customer name</span>
          <input value={draft.customerName} onChange={(event) => set("customerName", event.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>CNIC number (optional)</span>
          <input
            value={draft.cnic}
            onChange={(event) => onCnic(event.target.value)}
            inputMode="numeric"
            placeholder="00000-0000000-0"
          />
          {knownCustomer ? <small className={styles.hint}>Saved customer: {knownCustomer}</small> : null}
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>Address</span>
          <textarea value={draft.address} onChange={(event) => set("address", event.target.value)} rows={3} required />
        </label>
        <PhoneField label="Contact no (optional)" value={draft.contactNo} onChange={(contactNo) => set("contactNo", contactNo)} />
        <PhoneField label="WhatsApp number (optional)" value={draft.whatsappNo} onChange={(whatsappNo) => set("whatsappNo", whatsappNo)} />
        <label className={`${styles.field} ${styles.wide}`}>
          <span>Customer package</span>
          <textarea value={draft.customerPackage} onChange={(event) => set("customerPackage", event.target.value)} rows={4} required />
        </label>
        <div className={styles.field}>
          <span id="payment-mode-label">Payment mode</span>
          <FancySelect
            labelId="payment-mode-label"
            value={draft.paymentMode}
            options={paymentModes}
            onChange={(paymentMode) => {
              onChange({
                ...draft,
                paymentMode,
                downPayment: paymentMode === "installments" ? draft.downPayment ?? 0 : draft.downPayment,
                planDiscount: draft.planDiscount ?? 0,
                installmentCount: paymentMode === "installments" ? draft.installmentCount ?? 1 : null,
                installmentAmounts: paymentMode === "installments" ? draft.installmentAmounts ?? null : null,
                installmentDueDates: paymentMode === "installments" ? draft.installmentDueDates ?? null : null,
              });
            }}
          />
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.editTable}>
          <thead>
            <tr>
              <th>Serial no</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Taxable amount</th>
              <th>Tax %</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, index) => {
              const computed = totals.items[index];
              return (
                <tr key={index}>
                  <td><span className={styles.cellLabel}>Serial no</span>{index + 1}</td>
                  <td>
                    <span className={styles.cellLabel}>Description</span>
                    <textarea
                      value={item.description}
                      rows={2}
                      aria-label={`Description ${index + 1}`}
                      onChange={(event) => set("items", updateItem(draft.items, index, { description: event.target.value }))}
                    />
                  </td>
                  <td>
                    <span className={styles.cellLabel}>Qty</span>
                    <AmountInput
                      value={item.qty}
                      aria-label={`Quantity ${index + 1}`}
                      onChange={(qty) => set("items", updateItem(draft.items, index, { qty: qty ?? 0 }))}
                    />
                  </td>
                  <td>
                    <span className={styles.cellLabel}>Unit</span>
                    <input
                      value={item.unit}
                      aria-label={`Unit ${index + 1}`}
                      onChange={(event) => set("items", updateItem(draft.items, index, { unit: event.target.value }))}
                    />
                  </td>
                  <td>
                    <span className={styles.cellLabel}>Price</span>
                    <AmountInput
                      value={item.price}
                      aria-label={`Price ${index + 1}`}
                      onChange={(price) => set("items", updateItem(draft.items, index, { price: price ?? 0 }))}
                    />
                  </td>
                  <td><span className={styles.cellLabel}>Taxable amount</span>{formatRupees(computed?.taxableAmount ?? 0)}</td>
                  <td>
                    <span className={styles.cellLabel}>Tax %</span>
                    <AmountInput
                      value={item.taxPercent}
                      aria-label={`Tax ${index + 1}`}
                      onChange={(taxPercent) => set("items", updateItem(draft.items, index, { taxPercent: taxPercent ?? 0 }))}
                    />
                  </td>
                  <td><span className={styles.cellLabel}>Total</span>{formatRupees(computed?.lineTotal ?? 0)}</td>
                  <td>
                    {draft.items.length > 1 ? (
                      <button
                        className={styles.iconButton}
                        type="button"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => set("items", draft.items.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => set("items", [...draft.items, { description: "", qty: 1, unit: "Nos", price: 0, taxPercent: 0 }])}
      >
        <Plus size={16} /> Add Item
      </button>

      <div className={styles.summaryRow}>
        {draft.paymentMode === "direct" ? (
          <div className={styles.planFields}>
            {advancePayment ? (
              <label className={styles.field}>
                <span>Advance payment</span>
                <AmountInput
                  value={draft.downPayment}
                  emptyAs={null}
                  onChange={(amount) => set("downPayment", amount)}
                />
              </label>
            ) : null}
            <label className={styles.field}>
              <span>Discount</span>
              <AmountInput
                value={draft.planDiscount ?? 0}
                onChange={(amount) => set("planDiscount", amount ?? 0)}
              />
            </label>
            <p>{advancePayment ? "Remaining after advance payment and discount" : "Total after discount"} <strong>{formatRupees(Math.max(0, balance))}</strong></p>
          </div>
        ) : null}
        {draft.paymentMode === "installments" ? (
          <div className={styles.planFields}>
            <label className={styles.field}>
              <span>Down payment</span>
              <AmountInput
                value={draft.downPayment}
                onChange={(amount) => set("downPayment", amount ?? 0)}
              />
            </label>
            <label className={styles.field}>
              <span>Discount</span>
              <AmountInput
                value={draft.planDiscount ?? 0}
                onChange={(amount) => set("planDiscount", amount ?? 0)}
              />
            </label>
            <label className={styles.field}>
              <span>Total number of installments</span>
              <AmountInput
                integer
                value={draft.installmentCount}
                emptyAs={null}
                onChange={(count) => onChange({
                  ...draft,
                  installmentCount: count,
                  installmentAmounts: customAmounts ? sizedAmounts(draft.installmentAmounts ?? [], count) : null,
                  installmentDueDates: draft.installmentDueDates ? sizedDates(draft.installmentDueDates, count) : draft.installmentDueDates,
                })}
              />
            </label>
            <div className={styles.field}>
              <span id="installment-amounts-label">Installment amounts</span>
              <FancySelect
                labelId="installment-amounts-label"
                value={customAmounts ? "custom" : "equal"}
                options={amountModes}
                onChange={(mode) => set(
                  "installmentAmounts",
                  mode === "custom"
                    ? (draft.installmentCount ?? 0) > 0
                      ? splitInstallments(Math.max(0, balance), draft.installmentCount ?? 0).map((line) => line.amount)
                      : []
                    : null,
                )}
              />
            </div>
            <div className={styles.breakdown}>
              <p>Remaining after down payment and discount <strong>{formatRupees(Math.max(0, balance))}</strong></p>
              {customAmounts ? (
                <p>Installments entered <strong>{formatRupees(enteredTotal)}</strong>{enteredTotal !== roundMoney(Math.max(0, balance)) ? ` · ${formatRupees(Math.abs(roundMoney(balance - enteredTotal)))} ${enteredTotal < balance ? "still to assign" : "over the remaining"}` : ""}</p>
              ) : null}
              <ol>
                {(customAmounts ? sizedAmounts(draft.installmentAmounts ?? [], draft.installmentCount).map((amount, index) => ({ number: index + 1, amount })) : totals.installments).map((line, index) => (
                  <li key={line.number} className={onDueDate || customAmounts ? styles.dueDateLine : undefined}>
                    <span>Installment {line.number}</span>
                    {customAmounts ? (
                      <label className={styles.field}>
                        <span>Installment {line.number} amount</span>
                        <AmountInput
                          value={line.amount}
                          onChange={(amount) => set("installmentAmounts", sizedAmounts(draft.installmentAmounts ?? [], draft.installmentCount).map((current, amountIndex) => amountIndex === index ? amount ?? 0 : current))}
                        />
                      </label>
                    ) : <strong>{formatRupees(line.amount)}</strong>}
                    {onDueDate ? (
                      <label className={styles.field}>
                        <span>Installment {line.number} due date</span>
                        <input
                          type="date"
                          value={dueDates?.[index] ?? ""}
                          onChange={(event) => onDueDate(index, event.target.value)}
                        />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : <div />}
        <table className={styles.summary}>
          <tbody>
            <tr>
              <th>Total taxable amount</th>
              <td>{formatRupees(totals.taxableTotal)}</td>
            </tr>
            <tr>
              <th>Tax</th>
              <td>{formatRupees(totals.taxTotal)}</td>
            </tr>
            <tr>
              <th>Total amount</th>
              <td>{formatRupees(totals.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {issues[0] && !error ? <p className={styles.hint}>{issues[0]}</p> : null}
      <div className={styles.formActions}>
        <button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className={styles.primaryButton} type="submit" disabled={saving || issues.length > 0}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
