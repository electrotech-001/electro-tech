"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerIdentity, groupCustomers, matchesCustomerKey, stageLabel, type CustomerCard } from "@/lib/billing/customers";
import {
  DocumentApiError,
  listAgreements,
  listInvoices,
  listLedger,
  updateCustomerProfile,
  type AgreementRecord,
  type InvoiceRecord,
  type LedgerEntry,
} from "@/lib/billing/documents-api";
import { outstandingBalances, stillOpen } from "@/lib/billing/pending-invoices";
import {
  customerProfileIssues,
  formatDisplayDate,
  formatRupees,
  maskCnic,
  type CustomerProfileInput,
  type QuotationRecord,
} from "@/lib/billing/quotation-math";
import { listProjects, listQuotations, QuotationApiError } from "@/lib/billing/quotations-api";
import shell from "./billing-shell.module.css";
import { PhoneField } from "./PhoneField";
import styles from "./quotation.module.css";

function modeLabel(mode: string): string {
  return mode === "bank_transfer" ? "Bank transfer" : mode === "cash" ? "Cash" : mode === "installments" ? "Installments" : "Direct";
}

function paymentDetail(entry: LedgerEntry, projects: QuotationRecord[]): string {
  const project = projects.find((item) => item.id === entry.projectId);
  const kind = entry.paymentKind === "down" || (entry.paymentKind == null && entry.installmentNumber == null && project?.paymentMode === "installments")
    ? "Down payment"
    : entry.installmentNumber != null
      ? `Installment ${entry.installmentNumber}`
      : "Direct payment";
  return entry.invoiceSerial ? `${kind} · ${entry.invoiceSerial}` : kind;
}

function receivedDownPayment(projectId: string, rows: LedgerEntry[]): number {
  return rows
    .filter((entry) => entry.projectId === projectId && entry.installmentNumber == null)
    .reduce((sum, entry) => sum + entry.paidAmount, 0);
}

function invoiceLabel(invoice: InvoiceRecord): string {
  if (invoice.installmentNumber) return `Installment ${invoice.installmentNumber}`;
  const opening = invoice.project.downPayment ?? 0;
  if (invoice.kind === "advance" && opening > 0 && invoice.grandTotal <= opening + 0.001) {
    return invoice.project.paymentMode === "installments" ? "Down payment" : "Advance payment";
  }
  if (invoice.kind === "settlement") return "Balance";
  return "Invoice";
}

function profileKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const emptyProfile: CustomerProfileInput = {
  customerName: "",
  cnic: "",
  address: "",
  contactNo: "",
  whatsappNo: "",
};

export function CustomerProfilePage({ cnicKey }: { cnicKey: string }) {
  const router = useRouter();
  const key = profileKey(cnicKey);
  const requestKey = useRef(key);
  const [customer, setCustomer] = useState<CustomerCard | null>(null);
  const [projects, setProjects] = useState<QuotationRecord[]>([]);
  const [form, setForm] = useState<CustomerProfileInput>(emptyProfile);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<LedgerEntry[]>([]);
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function load(key: string) {
    requestKey.current = key;
    const [quotations, projectRows] = await Promise.all([listQuotations(), listProjects()]);
    if (requestKey.current !== key) return;
    const match = groupCustomers(quotations, projectRows).find((card) => card.key === key) ?? null;
    const customerProjects = projectRows.filter((project) => matchesCustomerKey(key, project));
    const projectIds = new Set(customerProjects.map((project) => project.id));
    setCustomer(match);
    setProjects(customerProjects);
    const [invoiceRows, ledger, agreementRows] = await Promise.all([
      listInvoices(),
      listLedger(),
      listAgreements({ photos: false }),
    ]);
    if (requestKey.current !== key) return;
    setInvoices(invoiceRows.filter((invoice) => projectIds.has(invoice.projectId) || matchesCustomerKey(key, invoice.project)));
    setPayments(ledger.filter((entry) => projectIds.has(entry.projectId) || matchesCustomerKey(key, entry)));
    setAgreements(agreementRows.filter((agreement) => projectIds.has(agreement.projectId) || matchesCustomerKey(key, agreement.project)));
    if (match) {
      setForm({
        customerName: match.customerName,
        cnic: match.cnic,
        address: match.address,
        contactNo: match.contactNo,
        whatsappNo: match.whatsappNo,
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    load(key)
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof QuotationApiError || error instanceof DocumentApiError
          ? error.message
          : "The customer profile could not be loaded.";
        setBanner({ tone: "bad", text: message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  function setField<K extends keyof CustomerProfileInput>(key: K, value: CustomerProfileInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSave() {
    if (!customer) return;
    const issues = customerProfileIssues(form);
    if (issues[0]) {
      setFormError(issues[0]);
      return;
    }
    setSaving(true);
    setFormError(null);
    setBanner(null);
    try {
      const saved = await updateCustomerProfile({
        cnic: customer.cnic,
        nextCnic: form.cnic.trim(),
        customerName: form.customerName,
        address: form.address,
        contactNo: form.contactNo,
        whatsappNo: form.whatsappNo,
      });
      const nextKey = customerIdentity({ cnic: saved.cnic, customerName: form.customerName, whatsappNo: form.whatsappNo });
      setBanner({ tone: "ok", text: "Customer profile saved." });
      if (nextKey !== key) {
        router.replace(`/billing/profiles/${nextKey}`);
        return;
      }
      await load(key);
    } catch (error) {
      setFormError(error instanceof DocumentApiError ? error.message : "The customer profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const received = payments.reduce((sum, entry) => sum + entry.paidAmount, 0);
  const pendingInvoices = [...invoices.filter(stillOpen), ...outstandingBalances(projects, invoices)];
  const paidInvoices = invoices.filter((invoice) => !stillOpen(invoice));
  const plansWithoutAgreement = projects.filter((project) => project.paymentMode === "installments" && !agreements.some((agreement) => agreement.projectId === project.id));

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>{customer?.customerName ?? "Customer profile"}</h1>
          <p className={shell.summary}>Name, CNIC, address, and phone can be edited. Quotations, projects, invoices, agreements, and payments for this customer stay on the profile.</p>
        </div>
        <a className={shell.inlineLink} href="/billing/profiles">All profiles</a>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading customer…</p> : null}
      {!loading && !customer ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>Customer was not found</h2>
          <p>This CNIC is not on a quotation or a project.</p>
        </section>
      ) : null}
      {customer ? (
        <div className={styles.stack}>
          <section className={shell.panel}>
            <h2>Details</h2>
            <p>Saving writes these details onto every quotation and project for this CNIC.</p>
            <div className={`${styles.formGrid} ${styles.formGap}`}>
              <label className={styles.field}>
                <span>Customer name</span>
                <input value={form.customerName} onChange={(event) => setField("customerName", event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>CNIC</span>
                <input value={form.cnic} inputMode="numeric" placeholder="00000-0000000-0" onChange={(event) => setField("cnic", maskCnic(event.target.value))} />
              </label>
              <PhoneField label="Contact number" value={form.contactNo} onChange={(contactNo) => setField("contactNo", contactNo)} />
              <PhoneField label="WhatsApp number (optional)" value={form.whatsappNo} onChange={(whatsappNo) => setField("whatsappNo", whatsappNo)} />
              <label className={`${styles.field} ${styles.wide}`}>
                <span>Address</span>
                <textarea rows={3} value={form.address} onChange={(event) => setField("address", event.target.value)} />
              </label>
            </div>
            {formError ? <p className={styles.error}>{formError}</p> : null}
            <div className={styles.cardActions}>
              <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void onSave()}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </section>

          <section className={shell.stats} aria-label="Customer totals">
            <div className={shell.stat}><span className={shell.statLabel}>Quotations</span><span className={shell.statValue}>{customer.jobs.filter((job) => job.kind === "quotation").length}</span></div>
            <div className={shell.stat}><span className={shell.statLabel}>Projects</span><span className={shell.statValue}>{customer.jobs.filter((job) => job.kind === "project").length}</span></div>
            <div className={shell.stat}><span className={shell.statLabel}>Pending invoices</span><span className={shell.statValue}>{pendingInvoices.length}</span></div>
            <div className={shell.stat}><span className={shell.statLabel}>Received</span><span className={`${shell.statValue} ${styles.moneyStat}`}>{formatRupees(received)}</span></div>
          </section>

          <section className={shell.panel}>
            <h2>Quotations and projects</h2>
            <div className={styles.tableWrap}>
              <table className={styles.recordTable}>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Stage</th>
                    <th>Date</th>
                    <th>Package</th>
                    <th>Plan</th>
                    <th className={styles.amount}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.jobs.map((job) => (
                    <tr key={`${job.kind}-${job.id}`}>
                      <td>{job.serial}</td>
                      <td>{stageLabel(job.stage)}</td>
                      <td>{formatDisplayDate(job.date)}</td>
                      <td>{job.packageName}</td>
                      <td>{modeLabel(job.paymentMode)}</td>
                      <td className={styles.amount}>{formatRupees(job.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={shell.panel}>
            <h2>Pending invoices</h2>
            {pendingInvoices.length === 0 ? <p>No pending invoices for this customer.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.recordTable}>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Project</th>
                      <th>For</th>
                      <th>Status</th>
                      <th className={styles.amount}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.serial}</td>
                        <td>{invoice.project.serial}</td>
                        <td>{invoiceLabel(invoice)}</td>
                        <td>{invoice.status === "partial" ? "Partially paid" : "Due"}</td>
                        <td className={styles.amount}>{formatRupees(invoice.balanceDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {paidInvoices.length > 0 ? (
              <div className={styles.formGap}>
                <h2>Paid invoices</h2>
                <div className={styles.tableWrap}>
                  <table className={styles.recordTable}>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th>For</th>
                        <th className={styles.amount}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidInvoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>{invoice.serial}</td>
                          <td>{invoice.project.serial}</td>
                          <td>{invoiceLabel(invoice)}</td>
                          <td className={styles.amount}>{formatRupees(invoice.grandTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>

          <section className={shell.panel}>
            <h2>Agreements</h2>
            {agreements.length === 0 && plansWithoutAgreement.length === 0 ? <p>No agreements for this customer yet.</p> : null}
            {agreements.map((agreement) => (
              <div className={styles.formGap} key={agreement.id}>
                <p>{agreement.serial} · {agreement.project.serial} · {modeLabel(agreement.paymentMode)} · {agreement.guarantors.map((person) => person.fullName).join(", ") || "No guarantor"}</p>
                {agreement.paymentMode === "installments" ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.recordTable}>
                      <thead>
                        <tr>
                          <th>Installment</th>
                          <th>Due date</th>
                          <th className={styles.amount}>Amount</th>
                          <th>Status</th>
                          <th className={styles.amount}>Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(agreement.project.downPayment ?? 0) > 0 ? (
                          <tr>
                            <td>Down payment</td>
                            <td />
                            <td className={styles.amount}>{formatRupees(agreement.project.downPayment ?? 0)}</td>
                            <td>{receivedDownPayment(agreement.projectId, payments) + 0.001 >= (agreement.project.downPayment ?? 0) ? "Paid" : receivedDownPayment(agreement.projectId, payments) > 0 ? "Partial" : "Due"}</td>
                            <td className={styles.amount}>{formatRupees(receivedDownPayment(agreement.projectId, payments))}</td>
                          </tr>
                        ) : null}
                        {agreement.schedule.map((line) => (
                          <tr key={line.number}>
                            <td>Installment {line.number}</td>
                            <td>{formatDisplayDate(line.dueDate)}</td>
                            <td className={styles.amount}>{formatRupees(line.amount)}</td>
                            <td>{line.status === "paid" ? "Paid" : line.paidAmount > 0 ? "Partial" : "Due"}</td>
                            <td className={styles.amount}>{formatRupees(line.paidAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
            {plansWithoutAgreement.map((project) => (
              <div className={styles.formGap} key={project.id}>
                <p>{project.serial} · Installments · Agreement is saved when the invoices are created.</p>
                <div className={styles.tableWrap}>
                  <table className={styles.recordTable}>
                    <thead>
                      <tr>
                        <th>Installment</th>
                        <th className={styles.amount}>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(project.downPayment ?? 0) > 0 ? (
                        <tr>
                          <td>Down payment</td>
                          <td className={styles.amount}>{formatRupees(project.downPayment ?? 0)}</td>
                          <td>{receivedDownPayment(project.id, payments) + 0.001 >= (project.downPayment ?? 0) ? "Paid" : receivedDownPayment(project.id, payments) > 0 ? "Partial" : "Due"}</td>
                        </tr>
                      ) : null}
                      {project.installments.map((line) => (
                        <tr key={line.number}>
                          <td>Installment {line.number}</td>
                          <td className={styles.amount}>{formatRupees(line.amount)}</td>
                          <td>Due</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          <section className={shell.panel}>
            <h2>Payments received</h2>
            {payments.length === 0 ? <p>No payments have been received for this customer.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.recordTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Project</th>
                      <th>Detail</th>
                      <th>Mode</th>
                      <th className={styles.amount}>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDisplayDate(entry.paymentDate)}</td>
                        <td>{entry.projectSerial}</td>
                        <td>{paymentDetail(entry, projects)}</td>
                        <td>{modeLabel(entry.paymentMode)}</td>
                        <td className={styles.amount}>{formatRupees(entry.paidAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total received</td>
                      <td className={styles.amount}>{formatRupees(received)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
