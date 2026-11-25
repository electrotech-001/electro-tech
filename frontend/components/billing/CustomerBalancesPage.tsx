"use client";

import { useEffect, useMemo, useState } from "react";
import { DocumentApiError, listCustomerBalances, type CustomerBalance } from "@/lib/billing/documents-api";
import { formatRupees, roundMoney } from "@/lib/billing/quotation-math";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

function projectSerials(row: CustomerBalance): string {
  return row.projects.map((project) => project.serial).join(", ");
}

export function CustomerBalancesPage() {
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await listCustomerBalances();
        if (cancelled) return;
        setRows(next);
        setBanner(null);
      } catch (error: unknown) {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "Customer balances could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (pendingOnly && row.remaining <= 0) return false;
      if (!needle) return true;
      return [row.customerName, row.cnic, row.contactNo, row.whatsappNo, projectSerials(row)].join(" ").toLowerCase().includes(needle);
    });
  }, [pendingOnly, query, rows]);

  const totals = visible.reduce(
    (sum, row) => ({
      pending: roundMoney(sum.pending + row.pending),
      paid: roundMoney(sum.paid + row.paid),
      remaining: roundMoney(sum.remaining + row.remaining),
    }),
    { pending: 0, paid: 0, remaining: 0 },
  );

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Pending Balances</h1>
          <p className={shell.summary}>
            Every customer in serial order, with the amount pending, the amount paid, and the balance left. A new payment updates the balance automatically.
          </p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading customer balances…</p> : null}
      {!loading && !banner && rows.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No customer balances yet</h2>
          <p>Approve a quotation or create a direct invoice. The pending amount, payments, and remaining balance will appear here.</p>
        </section>
      ) : null}
      {!loading && rows.length > 0 ? (
        <section className={shell.panel}>
          <div className={styles.ledgerHero}>
            <div>
              <p className={styles.ledgerEyebrow}>Balance remaining</p>
              <h2>{formatRupees(totals.remaining)}</h2>
              <p>Pending {formatRupees(totals.pending)} · Paid {formatRupees(totals.paid)} · {visible.length} customer{visible.length === 1 ? "" : "s"}</p>
            </div>
            <label className={styles.field}>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, CNIC, or project" />
            </label>
          </div>
          <div className={styles.filters} role="group" aria-label="Balance filter">
            <button className={pendingOnly ? styles.chip : styles.chipOn} type="button" onClick={() => setPendingOnly(false)}>All customers</button>
            <button className={pendingOnly ? styles.chipOn : styles.chip} type="button" onClick={() => setPendingOnly(true)}>Pending only</button>
          </div>
          {visible.length === 0 ? <p>No customers match this view.</p> : (
            <div className={styles.tableWrap}>
              <table className={styles.recordTable}>
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>Customer</th>
                    <th>Projects</th>
                    <th className={styles.amount}>Pending</th>
                    <th className={styles.amount}>Paid</th>
                    <th className={styles.amount}>Balance remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const profile = row.key.startsWith("open:") ? null : `/billing/profiles/${row.key}`;
                    return (
                      <tr key={row.key}>
                        <td data-label="Serial">{row.serial}</td>
                        <td data-label="Customer">
                          {profile ? <a href={profile}>{row.customerName}</a> : row.customerName}
                          {row.cnic ? <small className={styles.subLine}>{row.cnic}</small> : null}
                        </td>
                        <td data-label="Projects">{projectSerials(row)}</td>
                        <td data-label="Pending" className={styles.amount}>{formatRupees(row.pending)}</td>
                        <td data-label="Paid" className={styles.amount}>{formatRupees(row.paid)}</td>
                        <td data-label="Balance remaining" className={styles.amount}>{formatRupees(row.remaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={styles.ledgerTotal}>
                    <td colSpan={3}>Total</td>
                    <td className={styles.amount}>{formatRupees(totals.pending)}</td>
                    <td className={styles.amount}>{formatRupees(totals.paid)}</td>
                    <td className={styles.amount}>{formatRupees(totals.remaining)}</td>
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
