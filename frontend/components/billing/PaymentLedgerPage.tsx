"use client";

import { useEffect, useMemo, useState } from "react";
import { customerKey } from "@/lib/billing/customers";
import { DocumentApiError, listLedger, type LedgerEntry } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees, roundMoney } from "@/lib/billing/quotation-math";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

function modeLabel(mode: LedgerEntry["paymentMode"]): string {
  return mode === "bank_transfer" ? "Bank transfer" : "Cash";
}

function detail(entry: LedgerEntry): string {
  const kind = entry.installmentNumber == null ? "Direct payment" : `Installment ${entry.installmentNumber}`;
  return entry.invoiceSerial ? `${kind} · ${entry.invoiceSerial}` : kind;
}

export function PaymentLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listLedger()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "The payment ledger could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const withRunning = useMemo(() => {
    let running = 0;
    return entries.map((entry) => {
      running = roundMoney(running + entry.paidAmount);
      return { entry, running };
    });
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return withRunning;
    return withRunning.filter(({ entry }) => [entry.customerName, entry.cnic, entry.projectSerial, entry.invoiceSerial ?? "", modeLabel(entry.paymentMode)].join(" ").toLowerCase().includes(needle));
  }, [query, withRunning]);

  const total = roundMoney(entries.reduce((sum, entry) => sum + entry.paidAmount, 0));

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Payment Ledger</h1>
          <p className={shell.summary}>Every payment received, including projects that are already complete. The running total is the amount received up to that date.</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading the ledger…</p> : null}
      {!loading && entries.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No payments received</h2>
          <p>Record a payment from Receive Payments and it will appear in this ledger.</p>
        </section>
      ) : null}
      {!loading && entries.length > 0 ? (
        <section className={shell.panel}>
          <div className={styles.cardTop}>
            <div>
              <h2>{formatRupees(total)}</h2>
              <p>{entries.length} payment{entries.length === 1 ? "" : "s"} received</p>
            </div>
            <label className={styles.field}>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, CNIC, or project" />
            </label>
          </div>
          {visible.length === 0 ? <p>No payments match that search.</p> : (
            <div className={styles.tableWrap}>
              <table className={styles.recordTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Project</th>
                    <th>Detail</th>
                    <th>Mode</th>
                    <th className={styles.amount}>Received</th>
                    <th className={styles.amount}>Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ entry, running }) => (
                    <tr key={entry.id}>
                      <td>{formatDisplayDate(entry.paymentDate)}</td>
                      <td>
                        <a href={`/billing/profiles/${customerKey(entry.cnic)}`}>{entry.customerName}</a>
                        <small className={styles.subLine}>{entry.cnic}</small>
                      </td>
                      <td>{entry.projectSerial}</td>
                      <td>{detail(entry)}</td>
                      <td>{modeLabel(entry.paymentMode)}</td>
                      <td className={styles.amount}>{formatRupees(entry.paidAmount)}</td>
                      <td className={styles.amount}>{formatRupees(running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
