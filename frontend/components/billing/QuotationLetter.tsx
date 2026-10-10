import type { QuotationRecord } from "@/lib/billing/quotation-math";
import { formatDisplayDate, formatRupees, letterhead } from "@/lib/billing/quotation-math";
import { printFromControl } from "@/lib/billing/print-letter";
import styles from "./quotation.module.css";

export function QuotationLetter({
  quotation,
  paper = false,
}: {
  quotation: QuotationRecord;
  paper?: boolean;
}) {
  const installments = quotation.paymentMode === "installments";
  const balance = quotation.grandTotal - (quotation.downPayment ?? 0);

  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <header className={styles.letterHead}>
        <img className={styles.logo} src="/logos/logo-1.png" alt="Electro Tech" />
        <div className={styles.company}>
          <strong>{letterhead.company}</strong>
          <span>{letterhead.person}</span>
          <span>{letterhead.address}</span>
          <span>{letterhead.phone}</span>
          <span>{letterhead.email}</span>
        </div>
        <p className={styles.docTitle}>QUOTATION</p>
      </header>

      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>Bill to</p>
          <strong>{quotation.customerName}</strong>
          <span>{quotation.address}</span>
          <span>CNIC {quotation.cnic}</span>
          <span>{quotation.contactNo}</span>
          <span>WhatsApp {quotation.whatsappNo}</span>
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

      <section className={styles.packageBlock}>
        <p className={styles.blockLabel}>Customer package</p>
        <p>{quotation.customerPackage}</p>
      </section>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Taxable amount</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item) => (
              <tr key={item.lineNo}>
                <td>{item.lineNo}</td>
                <td>{item.description}</td>
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
            <p>Balance <strong>{formatRupees(balance)}</strong></p>
            <ol>
              {quotation.installments.map((line) => (
                <li key={line.number}>
                  <span>Installment {line.number}</span>
                  <strong>{formatRupees(line.amount)}</strong>
                </li>
              ))}
            </ol>
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
              <th>Total amount</th>
              <td>{formatRupees(quotation.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className={styles.signature}>
        <strong>For, ELECTRO TECH</strong>
        <img src="/logos/authorized-signature.png" alt="Authorized signature" />
        <small>Authorized signature</small>
      </footer>
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
