import { agreementWording } from "@/lib/billing/agreement-wording";
import type { AgreementRecord, GuarantorRecord, InvoiceRecord, PaymentRecord } from "@/lib/billing/documents-api";
import { installmentDueDate } from "@/lib/billing/pending-invoices";
import { formatDisplayDate, formatRupees, installmentBalance, letterhead, planDiscountOf, type QuotationRecord } from "@/lib/billing/quotation-math";
import { DocumentTermsNote } from "./DocumentTerms";
import styles from "./quotation.module.css";

function PhoneMark() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 3h3l1.5 4-2 1.2a12 12 0 0 0 6.3 6.3L17 12.5 21 14v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3z" />
    </svg>
  );
}

function MailMark() {
  return (
    <svg className={styles.contactIcon} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function Letterhead({ title }: { title: string }) {
  const lines = title.split("\n");
  return (
    <header className={styles.letterHead}>
      <img className={styles.logo} src="/logos/logo-1.png" alt="Electro Tech" decoding="sync" />
      <div className={styles.company}>
        <strong>{letterhead.company}</strong>
        <span>{letterhead.person}</span>
        <span>{letterhead.address}</span>
        <span className={styles.contactLine}>
          <PhoneMark />
          <span>{letterhead.phone}</span>
          <MailMark />
          <span>{letterhead.email}</span>
        </span>
      </div>
      <p className={styles.docTitle}>
        {lines.map((line) => <span key={line}>{line}</span>)}
      </p>
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

function discountOf(invoice: InvoiceRecord): number {
  const fromPayments = invoice.payments.reduce((sum, payment) => sum + (payment.discountAmount ?? 0), 0);
  return Math.round(((invoice.discountAmount ?? 0) + fromPayments) * 100) / 100;
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
      {installments ? agreement.guarantors.filter((guarantor) => guarantor.slot === 1).map((guarantor) => (
        <GuarantorBlock guarantor={guarantor} key={guarantor.id} />
      )) : null}
      <div className={styles.signGrid}>
        <div className={styles.signBox}>
          <span className={styles.signLine} />
          <strong>{project.customerName}</strong>
          <small>Customer signature</small>
          <small>CNIC {project.cnic}</small>
        </div>
        {installments ? agreement.guarantors.filter((guarantor) => guarantor.slot === 1).map((guarantor) => (
          <div className={styles.signBox} key={`${guarantor.id}-sign`}>
            <span className={styles.signLine} />
            <strong>{guarantor.fullName || "Guarantor"}</strong>
            <small>Guarantor 1 signature</small>
            {guarantor.cnic ? <small>CNIC {guarantor.cnic}</small> : null}
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

function GuarantorBlock({ guarantor }: { guarantor: GuarantorRecord }) {
  return (
    <section className={styles.packageBlock}>
      <p className={styles.blockLabel}>Guarantor 1</p>
      {guarantor.fullName ? <p>{guarantor.fullName} accepts responsibility for the unpaid balance of this agreement.</p> : null}
      <p>
        {[
          guarantor.designation ? `Designation: ${guarantor.designation}` : "",
          guarantor.occupation ? `Occupation: ${guarantor.occupation}` : "",
          `Sector: ${guarantor.sector === "government" ? "Government" : "Private"}`,
        ].filter(Boolean).join(". ")}.
      </p>
      {(guarantor.contactNo || guarantor.cnic) ? <p>{[guarantor.contactNo ? `Contact: ${guarantor.contactNo}` : "", guarantor.cnic ? `CNIC: ${guarantor.cnic}` : ""].filter(Boolean).join(". ")}.</p> : null}
      {(guarantor.cnicFront || guarantor.cnicBack) ? (
        <div className={styles.cnicRow}>
          {guarantor.cnicFront ? <img src={guarantor.cnicFront} alt={`${guarantor.fullName || "Guarantor"} CNIC front`} /> : null}
          {guarantor.cnicBack ? <img src={guarantor.cnicBack} alt={`${guarantor.fullName || "Guarantor"} CNIC back`} /> : null}
        </div>
      ) : null}
    </section>
  );
}

export function InvoiceLetter({ invoice, paper = false }: { invoice: InvoiceRecord; paper?: boolean }) {
  const project = invoice.project;
  const paid = invoice.status === "paid";
  const discount = discountOf(invoice);
  const paymentDiscount = invoice.payments.some((payment) => (payment.discountAmount ?? 0) > 0);
  const openingPayments = invoice.openingPayments ?? [];
  const openingPaid = openingPayments.reduce((sum, payment) => sum + payment.paidAmount + (payment.discountAmount ?? 0), 0);
  const planDiscount = planDiscountOf(project);
  const installments = project.paymentMode === "installments";
  const dueDate = installmentDueDate(invoice);
  const downPayment = project.downPayment ?? 0;
  const remainingBalance = installmentBalance(project.grandTotal, project.downPayment, planDiscount);
  const breakdownLines = invoice.schedule && invoice.schedule.length > 0
    ? invoice.schedule
    : project.installments.map((line) => ({
      number: line.number,
      dueDate: "",
      amount: line.amount,
      status: "due" as const,
      paidAmount: 0,
      paidDate: null,
      paymentMode: null,
    }));

  return (
    <article className={`${styles.letter} ${styles.sheet} quotation-letter ${paper ? styles.letterPaper : ""}`}>
      <Letterhead title={"TAX\nINVOICE"} />
      <section className={styles.parties}>
        <div>
          <p className={styles.blockLabel}>Bill to</p>
          <strong>{project.customerName}</strong>
          <span>{project.address}</span>
          {project.cnic ? <span>CNIC {project.cnic}</span> : null}
          {project.contactNo ? <span>{project.contactNo}</span> : null}
          {project.customerPackage ? <span>{project.customerPackage}</span> : null}
        </div>
        <dl className={styles.meta}>
          <div><dt>Invoice#</dt><dd>{invoice.serial}</dd></div>
          {dueDate ? <div><dt>Due date</dt><dd>{formatDisplayDate(dueDate)}</dd></div> : <div><dt>Invoice date</dt><dd>{formatDisplayDate(invoice.invoiceDate)}</dd></div>}
          <div><dt>{project.origin === "direct_sale" ? "Sale" : "Quotation"}</dt><dd>{project.serial}</dd></div>
          <div><dt>Status</dt><dd>{invoice.status === "partial" ? "Partially paid" : invoice.status === "paid" ? "Paid" : "Due"}</dd></div>
        </dl>
      </section>
      {invoice.installmentNumber ? <p className={styles.packageBlock}>This invoice is for installment {invoice.installmentNumber}{dueDate ? `, due ${formatDisplayDate(dueDate)}` : ""}.</p> : null}
      {invoice.kind === "advance" && (project.downPayment ?? 0) > 0 && invoice.grandTotal <= (project.downPayment ?? 0) ? (
        <p className={styles.packageBlock}>{project.paymentMode === "installments" ? "This invoice is the down payment." : "This invoice is the advance payment."}</p>
      ) : null}
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
            {project.items.map((item) => (
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
      {invoice.payments.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Payment date</th><th>Mode</th><th>Amount</th>{paymentDiscount ? <th>Discount</th> : null}</tr></thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDisplayDate(payment.paymentDate)}</td>
                  <td>{modeLabel(payment.paymentMode)}</td>
                  <td className={styles.num}>{formatRupees(payment.paidAmount)}</td>
                  {paymentDiscount ? <td className={styles.num}>{(payment.discountAmount ?? 0) > 0 ? formatRupees(payment.discountAmount ?? 0) : ""}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className={styles.letterFoot}>
        {installments ? (
          <div className={styles.plan}>
            <p>Down payment <strong>{formatRupees(downPayment)}</strong></p>
            <p>Discount <strong>{formatRupees(planDiscount)}</strong></p>
            <p>Remaining balance <strong>{formatRupees(remainingBalance)}</strong></p>
            {openingPayments.map((payment) => (
              <p key={payment.id}>
                Received {formatDisplayDate(payment.paymentDate)} · {modeLabel(payment.paymentMode)} <strong>{formatRupees(payment.paidAmount)}</strong>
              </p>
            ))}
          </div>
        ) : openingPayments.length > 0 ? (
          <div className={styles.plan}>
            <p className={styles.blockLabel}>Advance received</p>
            {openingPayments.map((payment) => (
              <p key={payment.id}>
                {formatDisplayDate(payment.paymentDate)} · {modeLabel(payment.paymentMode)} <strong>{formatRupees(payment.paidAmount)}</strong>
              </p>
            ))}
            <p>Balance after advance <strong>{formatRupees(Math.max(0, project.grandTotal - openingPaid))}</strong></p>
          </div>
        ) : <div />}
        <table className={styles.totals}>
          <tbody>
            <tr><th>Taxable amount</th><td>{formatRupees(project.taxableTotal)}</td></tr>
            <tr><th>Tax</th><td>{formatRupees(project.taxTotal)}</td></tr>
            <tr className={styles.grand}><th>{invoice.installmentNumber ? "This invoice" : "Total"}</th><td>{formatRupees(invoice.grandTotal)}</td></tr>
            {discount > 0 ? <tr><th>Discount</th><td>{formatRupees(discount)}</td></tr> : null}
            <tr><th>Paid</th><td>{formatRupees(invoice.advancePaid)}</td></tr>
            <tr className={styles.grand}><th>Balance due</th><td>{formatRupees(invoice.balanceDue)}</td></tr>
            {invoice.kind === "advance" && project.grandTotal - invoice.grandTotal > 0 ? (
              <tr><th>Remaining amount</th><td>{formatRupees(project.grandTotal - invoice.grandTotal)}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {installments && breakdownLines.length > 0 ? (
        <section className={styles.installmentBreakdown}>
          <p className={styles.blockLabel}>Installment breakdown</p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Installment</th>
                  <th>Due date</th>
                  <th className={styles.num}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {breakdownLines.map((line) => (
                  <tr key={line.number}>
                    <td>Installment {line.number}</td>
                    <td>{line.dueDate ? formatDisplayDate(line.dueDate) : ""}</td>
                    <td className={styles.num}>{formatRupees(line.amount)}</td>
                    <td>{line.number === invoice.installmentNumber && line.status !== "paid" ? "This invoice" : line.status === "paid" ? "Paid" : line.paidAmount > 0 ? "Partial" : "Due"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <div className={styles.sheetClose}>
        <div className={styles.paymentInstructions}>
          <strong>Payment Instructions</strong>
          <span>Account Title : Electro Tech</span>
          <span>Account Number : 57365002120531</span>
          <span>Bank Name: Bank Alfalah.</span>
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
      </div>
      <DocumentTermsNote />
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
          {(payment.discountAmount ?? 0) > 0 ? (
            <>
              <div><dt>Balance amount</dt><dd>{formatRupees(payment.expectedAmount)}</dd></div>
              <div><dt>Discount amount</dt><dd>{formatRupees(payment.discountAmount ?? 0)}</dd></div>
              <div><dt>Received amount</dt><dd>{formatRupees(payment.paidAmount)}</dd></div>
            </>
          ) : null}
          {payment.installmentNumber ? <div><dt>Installment</dt><dd>{payment.installmentNumber}</dd></div> : null}
          <div><dt>Contact</dt><dd>{project.contactNo}</dd></div>
        </dl>
      </div>
      <p className={styles.slipNote}>{(payment.discountAmount ?? 0) > 0
        ? "This slip confirms the balance, the discount, and the amount received shown above."
        : "This slip confirms that Electro Tech has received the payment shown above."}</p>
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
