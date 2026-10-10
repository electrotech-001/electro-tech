import type { AgreementRecord, InvoiceRecord, PaymentRecord } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees, letterhead, type QuotationRecord } from "@/lib/billing/quotation-math";
import styles from "./quotation.module.css";

function Letterhead({ title }: { title: string }) {
  return (
    <header className={styles.letterHead}>
      <img className={styles.logo} src="/logos/logo-1.png" alt="Electro Tech" />
      <div className={styles.company}>
        <strong>{letterhead.company}</strong>
        <span>{letterhead.person}</span>
        <span>{letterhead.address}</span>
        <span>{letterhead.phone}</span>
        <span>{letterhead.email}</span>
      </div>
      <p className={styles.docTitle}>{title}</p>
    </header>
  );
}

function modeLabel(mode: PaymentRecord["paymentMode"] | null): string {
  if (mode === "bank_transfer") return "Bank transfer";
  if (mode === "cash") return "Cash";
  return "";
}

export function AgreementLetter({ agreement, paper = false }: { agreement: AgreementRecord; paper?: boolean }) {
  const project = agreement.project;
  const installments = agreement.paymentMode === "installments";
  const balance = project.grandTotal - (project.downPayment ?? 0);

  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="AGREEMENT" />
      <section className={styles.packageBlock}>
        <p>This agreement is made on {formatDisplayDate(project.quotationDate)} at Attock between Electro Tech, through Muhammad Aqeel, and {project.customerName}, CNIC {project.cnic}, resident of {project.address}.</p>
        <p>The customer has selected this package: {project.customerPackage}</p>
        {installments ? (
          <p>The payment mode is Installments. The total price is {formatRupees(project.grandTotal)}. A down payment of {formatRupees(project.downPayment ?? 0)} is payable at the start of the work. The remaining balance of {formatRupees(balance)} is payable in {project.installmentCount} installments on the dates below.</p>
        ) : (
          <p>The payment mode is Direct. The total price is {formatRupees(project.grandTotal)}. The customer will pay this amount directly. A direct payment does not require a guarantor.</p>
        )}
      </section>
      {installments ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>#</th><th>Due date</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {agreement.schedule.map((line) => (
                <tr key={line.number}>
                  <td>Installment {line.number}</td>
                  <td>{formatDisplayDate(line.dueDate)}</td>
                  <td className={styles.num}>{formatRupees(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr><th>#</th><th>Description</th><th>Qty</th><th>Total</th></tr>
          </thead>
          <tbody>
            {project.items.map((item) => (
              <tr key={item.lineNo}>
                <td>{item.lineNo}</td>
                <td>{item.description}</td>
                <td>{item.qty} {item.unit}</td>
                <td className={styles.num}>{formatRupees(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {installments ? agreement.guarantors.map((guarantor) => (
        <section className={styles.packageBlock} key={guarantor.id}>
          <p className={styles.blockLabel}>Guarantor {guarantor.slot}</p>
          <p>{guarantor.fullName} accepts responsibility for the unpaid balance of this agreement.</p>
          <p>Designation: {guarantor.designation}. Occupation: {guarantor.occupation}. Sector: {guarantor.sector === "government" ? "Government" : "Private"}.</p>
          <div className={styles.cnicRow}>
            <img src={guarantor.cnicFront} alt={`${guarantor.fullName} CNIC front`} />
            <img src={guarantor.cnicBack} alt={`${guarantor.fullName} CNIC back`} />
          </div>
        </section>
      )) : null}
      <footer className={styles.signature}>
        <strong>For, ELECTRO TECH</strong>
        <img src="/logos/authorized-signature.png" alt="Authorized signature" />
        <small>Authorized signature</small>
      </footer>
    </article>
  );
}

export function InvoiceLetter({ invoice, paper = false }: { invoice: InvoiceRecord; paper?: boolean }) {
  const project = invoice.project;
  const paid = invoice.status === "paid";

  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="INVOICE" />
      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>Bill to</p>
          <strong>{project.customerName}</strong>
          <span>{project.address}</span>
          <span>CNIC {project.cnic}</span>
          <span>{project.contactNo}</span>
        </div>
        <dl className={styles.meta}>
          <div><dt>Invoice#</dt><dd>{invoice.serial}</dd></div>
          <div><dt>Invoice date</dt><dd>{formatDisplayDate(invoice.invoiceDate)}</dd></div>
          <div><dt>Quotation</dt><dd>{project.serial}</dd></div>
          <div><dt>Status</dt><dd>{invoice.status === "partial" ? "Partially paid" : invoice.status === "paid" ? "Paid" : "Due"}</dd></div>
        </dl>
      </section>
      {invoice.installmentNumber ? <p className={styles.packageBlock}>This invoice is for installment {invoice.installmentNumber}{invoice.dueDate ? `, due ${formatDisplayDate(invoice.dueDate)}` : ""}.</p> : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
          </thead>
          <tbody>
            {project.items.map((item) => (
              <tr key={item.lineNo}>
                <td>{item.lineNo}</td>
                <td>{item.description}</td>
                <td className={styles.num}>{item.qty}</td>
                <td>{item.unit}</td>
                <td className={styles.num}>{formatRupees(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoice.payments.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Payment date</th><th>Mode</th><th>Amount</th></tr></thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDisplayDate(payment.paymentDate)}</td>
                  <td>{modeLabel(payment.paymentMode)}</td>
                  <td className={styles.num}>{formatRupees(payment.paidAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <table className={styles.totals}>
        <tbody>
          <tr><th>Total amount</th><td>{formatRupees(invoice.grandTotal)}</td></tr>
          <tr><th>Received</th><td>{formatRupees(invoice.advancePaid)}</td></tr>
          <tr className={styles.grand}><th>Balance due</th><td>{formatRupees(invoice.balanceDue)}</td></tr>
        </tbody>
      </table>
      {paid ? (
        <footer className={styles.signOff}>
          <div className={styles.paidStamp}>
            Paid
            <small>{invoice.paymentDate ? formatDisplayDate(invoice.paymentDate) : ""}</small>
          </div>
          <div className={styles.signature}>
            <strong>For, ELECTRO TECH</strong>
            <img src="/logos/authorized-signature.png" alt="Authorized signature" />
            <small>Authorized signature</small>
          </div>
        </footer>
      ) : (
        <footer className={styles.signature}>
          <strong>For, ELECTRO TECH</strong>
          <img src="/logos/authorized-signature.png" alt="Authorized signature" />
          <small>Authorized signature</small>
        </footer>
      )}
    </article>
  );
}

export function PaymentSlip({
  project,
  payment,
  paper = false,
}: {
  project: QuotationRecord;
  payment: PaymentRecord;
  paper?: boolean;
}) {
  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="PAID SLIP" />
      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>Received from</p>
          <strong>{project.customerName}</strong>
          <span>{project.address}</span>
          <span>{project.contactNo}</span>
        </div>
        <dl className={styles.meta}>
          <div><dt>Project</dt><dd>{project.serial}</dd></div>
          <div><dt>Payment date</dt><dd>{formatDisplayDate(payment.paymentDate)}</dd></div>
          <div><dt>Mode</dt><dd>{modeLabel(payment.paymentMode)}</dd></div>
          {payment.installmentNumber ? <div><dt>Installment</dt><dd>{payment.installmentNumber}</dd></div> : null}
        </dl>
      </section>
      <table className={styles.totals}>
        <tbody>
          <tr className={styles.grand}><th>Amount received</th><td>{formatRupees(payment.paidAmount)}</td></tr>
        </tbody>
      </table>
      <footer className={styles.signOff}>
        <div className={styles.paidStamp}>
          Paid
          <small>{formatDisplayDate(payment.paymentDate)}</small>
        </div>
        <div className={styles.signature}>
          <strong>For, ELECTRO TECH</strong>
          <img src="/logos/authorized-signature.png" alt="Authorized signature" />
          <small>Authorized signature</small>
        </div>
      </footer>
    </article>
  );
}

export function CustomerNoteCard({
  title,
  customerName,
  projectSerial,
  body,
  paper = false,
}: {
  title: string;
  customerName: string;
  projectSerial: string;
  body: string;
  paper?: boolean;
}) {
  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title={title} />
      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>For</p>
          <strong>{customerName}</strong>
          {projectSerial ? <span>Project {projectSerial}</span> : null}
        </div>
      </section>
      <section className={styles.packageBlock}>
        <p>{body}</p>
      </section>
      <footer className={styles.signature}>
        <strong>For, ELECTRO TECH</strong>
        <img src="/logos/authorized-signature.png" alt="Authorized signature" />
        <small>Authorized signature</small>
      </footer>
    </article>
  );
}
