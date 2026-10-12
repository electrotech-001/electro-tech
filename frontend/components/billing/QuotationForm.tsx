import { Plus, Trash2 } from "lucide-react";
import { computeTotals, formatRupees, installmentBalance, maskCnic, maskPhone, planDiscountOf, quotationIssues, type PaymentMode, type QuotationDraft, type QuotationItemInput } from "@/lib/billing/quotation-math";
import { AmountInput, FancySelect } from "./FancyControls";
import styles from "./quotation.module.css";

const paymentModes: { value: PaymentMode; label: string }[] = [
  { value: "installments", label: "Installments" },
  { value: "direct", label: "Direct" },
];

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
  submitLabel = "Save quotation",
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
  submitLabel?: string;
  onChange: (draft: QuotationDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const totals = computeTotals(draft);
  const issues = quotationIssues(draft);
  const balance = installmentBalance(totals.grandTotal, draft.downPayment, planDiscountOf(draft));

  function set<K extends keyof QuotationDraft>(key: K, value: QuotationDraft[K]) {
    onChange({ ...draft, [key]: value });
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
        <label className={styles.field}>
          <span>{dateLabel}</span>
          <input type="date" value={draft.quotationDate} onChange={(event) => set("quotationDate", event.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>Customer name</span>
          <input value={draft.customerName} onChange={(event) => set("customerName", event.target.value)} required />
        </label>
        <label className={styles.field}>
          <span>CNIC number (optional)</span>
          <input
            value={draft.cnic}
            onChange={(event) => set("cnic", maskCnic(event.target.value))}
            inputMode="numeric"
            placeholder="00000-0000000-0"
          />
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>Address</span>
          <textarea value={draft.address} onChange={(event) => set("address", event.target.value)} rows={3} required />
        </label>
        <label className={styles.field}>
          <span>Contact no (optional)</span>
          <input
            value={draft.contactNo}
            onChange={(event) => set("contactNo", maskPhone(event.target.value))}
            inputMode="numeric"
            placeholder="0300-0000000"
          />
        </label>
        <label className={styles.field}>
          <span>WhatsApp number (optional)</span>
          <input
            value={draft.whatsappNo}
            onChange={(event) => set("whatsappNo", maskPhone(event.target.value))}
            inputMode="numeric"
            placeholder="0300-0000000"
          />
        </label>
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
                planDiscount: paymentMode === "installments" ? draft.planDiscount ?? 0 : 0,
                installmentCount: paymentMode === "installments" ? draft.installmentCount ?? 1 : null,
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
            <label className={styles.field}>
              <span>Advance payment</span>
              <AmountInput
                value={draft.downPayment}
                emptyAs={null}
                onChange={(amount) => set("downPayment", amount)}
              />
            </label>
            <p>Remaining after advance payment <strong>{formatRupees(Math.max(0, totals.grandTotal - (draft.downPayment ?? 0)))}</strong></p>
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
                onChange={(count) => set("installmentCount", count)}
              />
            </label>
            <div className={styles.breakdown}>
              <p>Remaining after down payment and discount <strong>{formatRupees(Math.max(0, balance))}</strong></p>
              <ol>
                {totals.installments.map((line) => (
                  <li key={line.number}>
                    <span>Installment {line.number}</span>
                    <strong>{formatRupees(line.amount)}</strong>
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
