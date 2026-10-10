import { agreementWording } from "@/lib/billing/agreement-wording";
import type { AgreementRecord, InvoiceRecord, PaymentRecord } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees, letterhead, type QuotationRecord } from "@/lib/billing/quotation-math";
import styles from "./quotation.module.css";

function Letterhead({ title }: { title: string }) {
  return (
    <header className={styles.letterHead}>
      <img className={styles.logo} src="/logos/logo-1.png" alt="Electro Tech" decoding="sync" />
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

function ArcLabel({ text, start, sweep, radius, flip = false }: { text: string; start: number; sweep: number; radius: number; flip?: boolean }) {
  const chars = [...text];
  return (
    <span className={styles.sealArc} aria-hidden="true">
      {chars.map((char, index) => {
        const angle = chars.length === 1 ? start + sweep / 2 : start + (index / (chars.length - 1)) * sweep;
        return (
          <span key={`${char}-${index}`} style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px)${flip ? " rotate(180deg)" : ""}` }}>
            {char === " " ? "\u00a0" : char}
          </span>
        );
      })}
    </span>
  );
}

function PaidSeal({ date }: { date: string }) {
  return (
    <div className={styles.paidSeal} aria-label={`Paid ${date}`}>
      <span className={styles.sealRing} />
      <span className={styles.sealRingInner} />
      <ArcLabel text="ELECTRO TECH" start={-62} sweep={124} radius={92} />
      <strong>PAID</strong>
      <small>
        <span>DATE</span>
        {date}
      </small>
    </div>
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
  const wording = agreementWording(agreement.body, project);

  return (
    <article className={`${styles.letter} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="AGREEMENT" />
      <section className={styles.packageBlock}>
        {wording.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
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
          <p>Contact: {guarantor.contactNo || "—"}. CNIC: {guarantor.cnic || "—"}.</p>
          <div className={styles.cnicRow}>
            <img src={guarantor.cnicFront} alt={`${guarantor.fullName} CNIC front`} />
            <img src={guarantor.cnicBack} alt={`${guarantor.fullName} CNIC back`} />
          </div>
        </section>
      )) : null}
      <div className={styles.signGrid}>
        <div className={styles.signBox}>
          <span className={styles.signLine} />
          <strong>{project.customerName}</strong>
          <small>Customer signature</small>
          <small>CNIC {project.cnic}</small>
        </div>
        {installments ? agreement.guarantors.map((guarantor) => (
          <div className={styles.signBox} key={`${guarantor.id}-sign`}>
            <span className={styles.signLine} />
            <strong>{guarantor.fullName}</strong>
            <small>Guarantor {guarantor.slot} signature</small>
            <small>CNIC {guarantor.cnic || "—"}</small>
          </div>
        )) : null}
      </div>
      <footer className={styles.signature}>
        <strong>For, ELECTRO TECH</strong>
        <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
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
      {invoice.schedule && invoice.schedule.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Installment</th><th>Due date</th><th>Amount</th><th>Status</th><th>Paid on</th><th>Mode</th></tr></thead>
            <tbody>
              {invoice.schedule.map((line) => (
                <tr key={line.number}>
                  <td>{line.number}</td>
                  <td>{formatDisplayDate(line.dueDate)}</td>
                  <td className={styles.num}>{formatRupees(line.amount)}</td>
                  <td>{line.status === "paid" ? "Paid" : "Due"}</td>
                  <td>{line.paidDate ? formatDisplayDate(line.paidDate) : ""}</td>
                  <td>{modeLabel(line.paymentMode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
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
      <div className={styles.letterFoot}>
        <div className={styles.paymentInstructions}>
          <strong>Payment Instructions</strong>
          <span>Account Title : Electro Tech</span>
          <span>Account Number : 57365002120531</span>
          <span>Bank Name: Bank Alfalah.</span>
        </div>
        <table className={styles.totals}>
          <tbody>
            <tr><th>Total amount</th><td>{formatRupees(invoice.grandTotal)}</td></tr>
            <tr><th>Received</th><td>{formatRupees(invoice.advancePaid)}</td></tr>
            <tr className={styles.grand}><th>Balance due</th><td>{formatRupees(invoice.balanceDue)}</td></tr>
          </tbody>
        </table>
      </div>
      {paid ? (
        <footer className={styles.signOff}>
          <div className={styles.paidStamp}>
            Paid
            <small>{invoice.paymentDate ? formatDisplayDate(invoice.paymentDate) : ""}</small>
          </div>
          <div className={styles.signature}>
            <strong>For, ELECTRO TECH</strong>
            <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
            <small>Authorized signature</small>
          </div>
        </footer>
      ) : (
        <footer className={styles.signature}>
          <strong>For, ELECTRO TECH</strong>
          <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
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
    <article className={`${styles.letter} ${styles.slipSheet} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title="PAID SLIP" />
      <div className={styles.slipBody}>
        <div className={styles.slipAmount}>
          <p>Amount received</p>
          <strong>{formatRupees(payment.paidAmount)}</strong>
        </div>
        <PaidSeal date={formatDisplayDate(payment.paymentDate)} />
        <dl className={styles.slipFacts}>
          <div><dt>Received from</dt><dd>{project.customerName}</dd></div>
          <div><dt>Package</dt><dd>{project.customerPackage}</dd></div>
          <div><dt>Project</dt><dd>{project.serial}</dd></div>
          <div><dt>Payment date</dt><dd>{formatDisplayDate(payment.paymentDate)}</dd></div>
          <div><dt>Mode</dt><dd>{modeLabel(payment.paymentMode)}</dd></div>
          {payment.installmentNumber ? <div><dt>Installment</dt><dd>{payment.installmentNumber}</dd></div> : null}
          <div><dt>Contact</dt><dd>{project.contactNo}</dd></div>
        </dl>
      </div>
      <p className={styles.slipNote}>This slip confirms that Electro Tech has received the payment shown above.</p>
      <footer className={styles.signature}>
        <strong>For, ELECTRO TECH</strong>
        <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
        <small>Authorized signature</small>
      </footer>
    </article>
  );
}

export function GreetingCard({
  variant,
  customerName,
  body,
  paper = false,
}: {
  variant: "thanks" | "feedback";
  customerName: string;
  body: string;
  paper?: boolean;
}) {
  const thanks = variant === "thanks";
  return (
    <article className={`${styles.greeting} ${thanks ? styles.greetingThanks : styles.greetingFeedback} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <img className={styles.greetingLogo} src="/logos/logo-1.png" alt="Electro Tech" decoding="sync" />
      <p className={styles.greetingBrand}>Electro Tech</p>
      <h2>{thanks ? "Thank You" : "We Value Your Feedback"}</h2>
      <p className={styles.greetingName}>{customerName || "Valued customer"}</p>
      <p className={styles.greetingBody}>{body}</p>
      <p className={styles.greetingClose}>{thanks ? "With gratitude" : "Your words help us serve you better"}</p>
      <small>Electrical & Solar Solutions · Attock</small>
    </article>
  );
}

export function LedgerLetter({
  period,
  rows,
  total,
}: {
  period: string;
  rows: Array<{ id: string; date: string; customer: string; cnic: string; project: string; detail: string; mode: string; amount: string }>;
  total: string;
}) {
  return (
    <article className={`${styles.letter} ${styles.ledgerSheet} ${styles.ledgerPrint} quotation-letter`}>
      <Letterhead title="PAYMENT LEDGER" />
      <p className={styles.ledgerPeriod}>{period}</p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Project</th>
              <th>Detail</th>
              <th>Mode</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.customer}<small>{row.cnic}</small></td>
                <td>{row.project}</td>
                <td>{row.detail}</td>
                <td>{row.mode}</td>
                <td className={styles.num}>{row.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total received</td>
              <td className={styles.num}>{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
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
        <img src="/logos/authorized-signature.png" alt="Authorized signature" decoding="sync" />
        <small>Authorized signature</small>
      </footer>
    </article>
  );
}
