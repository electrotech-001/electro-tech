"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerKey, groupCustomers, stageLabel, type CustomerCard } from "@/lib/billing/customers";
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
import {
  customerProfileIssues,
  formatDisplayDate,
  formatRupees,
  maskCnic,
  maskPhone,
  type CustomerProfileInput,
} from "@/lib/billing/quotation-math";
import { listProjects, listQuotations, QuotationApiError } from "@/lib/billing/quotations-api";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

function modeLabel(mode: string): string {
  return mode === "bank_transfer" ? "Bank transfer" : mode === "cash" ? "Cash" : mode === "installments" ? "Installments" : "Direct";
}

function paymentDetail(entry: LedgerEntry): string {
  const kind = entry.installmentNumber == null ? "Direct payment" : `Installment ${entry.installmentNumber}`;
  return entry.invoiceSerial ? `${kind} · ${entry.invoiceSerial}` : kind;
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
  const requestKey = useRef(cnicKey);
  const [customer, setCustomer] = useState<CustomerCard | null>(null);
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
    const [quotations, projects, invoiceRows, ledger, agreementRows] = await Promise.all([
      listQuotations(),
      listProjects(),
      listInvoices(),
      listLedger(),
      listAgreements({ photos: false }),
    ]);
    if (requestKey.current !== key) return;
    const match = groupCustomers(quotations, projects).find((card) => card.key === key) ?? null;
    setCustomer(match);
    setInvoices(invoiceRows.filter((invoice) => customerKey(invoice.project.cnic) === key));
    setPayments(ledger.filter((entry) => customerKey(entry.cnic) === key));
    setAgreements(agreementRows.filter((agreement) => customerKey(agreement.project.cnic) === key));
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
    load(cnicKey)
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
  }, [cnicKey]);

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
      const nextKey = customerKey(saved.cnic);
      setBanner({ tone: "ok", text: "Customer profile saved." });
      if (nextKey !== cnicKey) {
        router.replace(`/billing/profiles/${nextKey}`);
        return;
      }
      await load(cnicKey);
    } catch (error) {
      setFormError(error instanceof DocumentApiError ? error.message : "The customer profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const received = payments.reduce((sum, entry) => sum + entry.paidAmount, 0);

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
              <label className={styles.field}>
                <span>Contact number</span>
                <input value={form.contactNo} inputMode="numeric" placeholder="0300-0000000" onChange={(event) => setField("contactNo", maskPhone(event.target.value))} />
              </label>
              <label className={styles.field}>
                <span>WhatsApp number</span>
                <input value={form.whatsappNo} inputMode="numeric" placeholder="0300-0000000" onChange={(event) => setField("whatsappNo", maskPhone(event.target.value))} />
              </label>
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
            <div className={shell.stat}><span className={shell.statLabel}>Invoices</span><span className={shell.statValue}>{invoices.length}</span></div>
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
            <h2>Invoices</h2>
            {invoices.length === 0 ? <p>No invoices for this customer yet.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.recordTable}>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Project</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th className={styles.amount}>Balance</th>
                      <th className={styles.amount}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.serial}</td>
                        <td>{invoice.project.serial}</td>
                        <td>{formatDisplayDate(invoice.invoiceDate)}</td>
                        <td>{invoice.status === "partial" ? "Partially paid" : invoice.status === "paid" ? "Paid" : "Due"}</td>
                        <td className={styles.amount}>{formatRupees(invoice.balanceDue)}</td>
                        <td className={styles.amount}>{formatRupees(invoice.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={shell.panel}>
            <h2>Agreements</h2>
            {agreements.length === 0 ? <p>No agreements for this customer yet.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.recordTable}>
                  <thead>
                    <tr>
                      <th>Agreement</th>
                      <th>Project</th>
                      <th>Plan</th>
                      <th>Guarantors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreements.map((agreement) => (
                      <tr key={agreement.id}>
                        <td>{agreement.serial}</td>
                        <td>{agreement.project.serial}</td>
                        <td>{modeLabel(agreement.paymentMode)}</td>
                        <td>{agreement.guarantors.map((person) => person.fullName).join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                        <td>{paymentDetail(entry)}</td>
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
