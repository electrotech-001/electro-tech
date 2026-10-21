"use client";

import { useEffect, useMemo, useState } from "react";
import { customerKey } from "@/lib/billing/customers";
import { DocumentApiError, listDiscounts, type DiscountEntry } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees, roundMoney } from "@/lib/billing/quotation-math";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

export function DiscountsPage() {
  const [entries, setEntries] = useState<DiscountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listDiscounts()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "Discounts could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [entry.customerName, entry.cnic, entry.projectSerial].join(" ").toLowerCase().includes(needle));
  }, [entries, query]);

  const total = roundMoney(visible.reduce((sum, entry) => sum + entry.discountAmount, 0));

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Discounts</h1>
          <p className={shell.summary}>Every discount given on an invoice or a received payment, with the customer and the amount.</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading discounts…</p> : null}
      {!loading && !banner && entries.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No discounts yet</h2>
          <p>A discount entered on an invoice or while receiving a payment will appear here.</p>
        </section>
      ) : null}
      {!loading && entries.length > 0 ? (
        <section className={shell.panel}>
          <div className={styles.ledgerHero}>
            <div>
              <p className={styles.ledgerEyebrow}>Discount given</p>
              <h2>{formatRupees(total)}</h2>
              <p>{visible.length} discount{visible.length === 1 ? "" : "s"} in this view</p>
            </div>
            <label className={styles.field}>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, CNIC, or project" />
            </label>
          </div>
          {visible.length === 0 ? <p>No discounts match this search.</p> : (
            <div className={styles.tableWrap}>
              <table className={styles.recordTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Project</th>
                    <th>Where</th>
                    <th className={styles.amount}>Balance amount</th>
                    <th className={styles.amount}>Discount amount</th>
                    <th className={styles.amount}>Received amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Date">{formatDisplayDate(entry.paymentDate)}</td>
                      <td data-label="Customer">
                        <a href={`/billing/profiles/${customerKey(entry.cnic)}`}>{entry.customerName}</a>
                        <small className={styles.subLine}>{entry.cnic}</small>
                      </td>
                      <td data-label="Project">{entry.projectSerial}</td>
                      <td data-label="Where">{entry.kind === "invoice" ? "Invoice" : "Payment"}</td>
                      <td data-label="Balance amount" className={styles.amount}>{formatRupees(entry.balanceAmount)}</td>
                      <td data-label="Discount amount" className={styles.amount}>{formatRupees(entry.discountAmount)}</td>
                      <td data-label="Received amount" className={styles.amount}>{entry.kind === "payment" ? formatRupees(entry.paidAmount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={styles.ledgerTotal}>
                    <td colSpan={5}>Total discount</td>
                    <td className={styles.amount}>{formatRupees(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
