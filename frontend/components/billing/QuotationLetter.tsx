import type { QuotationRecord } from "@/lib/billing/quotation-math";
import { formatDisplayDate, formatRupees, installmentBalance, planDiscountOf } from "@/lib/billing/quotation-math";
import { printFromControl } from "@/lib/billing/print-letter";
import { Letterhead } from "./BillingLetters";
import { DocumentTermsNote } from "./DocumentTerms";
import styles from "./quotation.module.css";

export function QuotationLetter({
  quotation,
  paper = false,
}: {
  quotation: QuotationRecord;
  paper?: boolean;
}) {
  const installments = quotation.paymentMode === "installments";
  const discount = planDiscountOf(quotation);
  const balance = installmentBalance(quotation.grandTotal, quotation.downPayment, discount);

  return (
    <article className={`${styles.letter} ${styles.sheet} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="QUOTATION" />

      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>Bill to</p>
          <strong>{quotation.customerName}</strong>
          <span>{quotation.address}</span>
          {quotation.cnic ? <span>CNIC {quotation.cnic}</span> : null}
          {quotation.contactNo ? <span>{quotation.contactNo}</span> : null}
          {quotation.customerPackage ? <span>{quotation.customerPackage}</span> : null}
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>Quotation#</dt>
            <dd>{quotation.serial}</dd>
          </div>
          <div>
            <dt>Quotation date</dt>
            <dd>{formatDisplayDate(quotation.quotationDate)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{installments ? "Installments" : "Direct"}</dd>
          </div>
        </dl>
      </section>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className={styles.num}>Qty</th>
              <th>Unit</th>
              <th className={styles.num}>Price</th>
              <th className={styles.num}>Taxable amount</th>
              <th className={styles.num}>Tax</th>
              <th className={styles.num}>Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.lineNo}>
                <td>{item.lineNo}</td>
                <td className={styles.itemText}>{item.description}</td>
                <td className={styles.num}>{item.qty}</td>
                <td>{item.unit}</td>
                <td className={styles.num}>{formatRupees(item.price)}</td>
                <td className={styles.num}>{formatRupees(item.taxableAmount)}</td>
                <td className={styles.num}>
                  {formatRupees(item.taxAmount)}
                  <small>{item.taxPercent.toFixed(2)}%</small>
                </td>
                <td className={styles.num}>{formatRupees(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.letterFoot}>
        {installments ? (
          <div className={styles.plan}>
            <p className={styles.blockLabel}>Installment breakdown</p>
            <p>Down payment <strong>{formatRupees(quotation.downPayment ?? 0)}</strong></p>
            {discount > 0 ? <p>Discount <strong>{formatRupees(discount)}</strong></p> : null}
            <p>Remaining after down payment and discount <strong>{formatRupees(balance)}</strong></p>
            <ol>
              {quotation.installments.map((line) => (
                <li key={line.number}>
                  <span>Installment {line.number}</span>
                  <strong>{formatRupees(line.amount)}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : (quotation.downPayment ?? 0) > 0 ? (
          <div className={styles.plan}>
            <p className={styles.blockLabel}>Advance payment</p>
            <p>Advance payment <strong>{formatRupees(quotation.downPayment ?? 0)}</strong></p>
            <p>Remaining amount <strong>{formatRupees(Math.max(0, quotation.grandTotal - (quotation.downPayment ?? 0)))}</strong></p>
          </div>
        ) : <div />}
        <table className={styles.totals}>
          <tbody>
            <tr>
              <th>Taxable amount</th>
              <td>{formatRupees(quotation.taxableTotal)}</td>
            </tr>
            <tr>
              <th>Tax</th>
              <td>{formatRupees(quotation.taxTotal)}</td>
            </tr>
            <tr className={styles.grand}>
              <th>Total</th>
              <td>{formatRupees(quotation.grandTotal)}</td>
            </tr>
            {discount > 0 ? (
              <tr>
                <th>Discount</th>
                <td>{formatRupees(discount)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.sheetClose}>
        <div />
        <footer className={styles.signature}>
          <strong>For, ELECTRO TECH</strong>
          <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
          <small>Authorized signature</small>
        </footer>
      </div>
      <DocumentTermsNote />
    </article>
  );
}

export function QuotationDialog({
  quotation,
  onClose,
}: {
  quotation: QuotationRecord;
  onClose: () => void;
}) {
  return (
    <div className={styles.modal} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quotation-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalBar}>
          <h2 id="quotation-dialog-title">{quotation.serial}</h2>
          <div>
            <button className={styles.secondaryButton} type="button" onClick={(event) => printFromControl(event.currentTarget)}>Print</button>
            <button className={styles.secondaryButton} type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className={styles.modalScroll}>
          <QuotationLetter quotation={quotation} />
        </div>
      </div>
    </div>
  );
}
