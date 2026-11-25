"use client";

import { CircleDollarSign, HandCoins, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BalancesLetter } from "@/components/billing/BillingLetters";
import { DocumentApiError, listCustomerBalances, type CustomerBalance } from "@/lib/billing/documents-api";
import { printBillingLetter } from "@/lib/billing/print-letter";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { formatRupees, roundMoney } from "@/lib/billing/quotation-math";
import shell from "./billing-shell.module.css";
import styles from "./customer-balances.module.css";
import quote from "./quotation.module.css";
import "./quotation-print.css";

function projectSerials(row: CustomerBalance): string {
  return row.projects.map((project) => project.serial).join(", ");
}

function paidShare(row: CustomerBalance): number {
  if (!(row.pending > 0)) return 100;
  return Math.max(0, Math.min(100, Math.round((row.paid / row.pending) * 100)));
}

function statusLabel(row: CustomerBalance): string {
  if (row.remaining <= 0) return "Cleared";
  if (row.paid > 0) return "Partial";
  return "Pending";
}

function statusClass(row: CustomerBalance): string {
  if (row.remaining <= 0) return styles.statusClear;
  if (row.paid > 0) return styles.statusPartial;
  return styles.statusDue;
}

type BalanceSort = "name" | "highest" | "lowest";

function sortLabel(sort: BalanceSort): string {
  if (sort === "highest") return "Highest to lowest";
  if (sort === "lowest") return "Lowest to highest";
  return "By name";
}

function viewLabel(pendingOnly: boolean, sort: BalanceSort, query: string, count: number): string {
  const parts = [pendingOnly ? "Pending customers only" : "All customers", sortLabel(sort)];
  if (query.trim()) parts.push(`Search “${query.trim()}”`);
  parts.push(`${count} customer${count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function compareBalances(left: CustomerBalance, right: CustomerBalance, sort: BalanceSort): number {
  if (sort === "highest") {
    return right.remaining - left.remaining || left.customerName.localeCompare(right.customerName) || left.key.localeCompare(right.key);
  }
  if (sort === "lowest") {
    return left.remaining - right.remaining || left.customerName.localeCompare(right.customerName) || left.key.localeCompare(right.key);
  }
  return left.customerName.localeCompare(right.customerName) || left.key.localeCompare(right.key);
}

export function CustomerBalancesPage() {
  const letterRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<BalanceSort>("name");
  const [downloading, setDownloading] = useState(false);

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
    return rows
      .filter((row) => {
        if (pendingOnly && row.remaining <= 0) return false;
        if (!needle) return true;
        return [row.customerName, row.cnic, row.contactNo, row.whatsappNo, projectSerials(row)].join(" ").toLowerCase().includes(needle);
      })
      .sort((left, right) => compareBalances(left, right, sort))
      .map((row, index) => ({ ...row, serial: index + 1 }));
  }, [pendingOnly, query, rows, sort]);

  const totals = visible.reduce(
    (sum, row) => ({
      pending: roundMoney(sum.pending + row.pending),
      paid: roundMoney(sum.paid + row.paid),
      remaining: roundMoney(sum.remaining + row.remaining),
    }),
    { pending: 0, paid: 0, remaining: 0 },
  );

  const pendingCustomers = visible.filter((row) => row.remaining > 0).length;
  const period = viewLabel(pendingOnly, sort, query, visible.length);
  const letterRows = visible.map((row) => ({
    id: row.key,
    serial: String(row.serial),
    customer: row.customerName,
    cnic: row.cnic,
    projects: projectSerials(row),
    status: statusLabel(row),
    pending: formatRupees(row.pending),
    paid: formatRupees(row.paid),
    remaining: formatRupees(row.remaining),
  }));

  async function downloadPdf() {
    const node = letterRef.current?.querySelector(".quotation-letter");
    if (!(node instanceof HTMLElement)) return;
    setDownloading(true);
    setBanner(null);
    try {
      const file = await quotationToPdf(node, "pending-balances");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setBanner("The balances PDF could not be created.");
    } finally {
      setDownloading(false);
    }
  }

  const canExport = !loading && !banner && visible.length > 0;

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Pending Balances</h1>
          <p className={shell.summary}>
            Open invoice balances only — quotations and fully paid invoices are excluded. A new payment updates the remaining amount automatically.
          </p>
        </div>
        <div className={quote.ledgerActions}>
          <button className={quote.secondaryButton} type="button" onClick={() => void printBillingLetter(letterRef.current)} disabled={!canExport}>
            Print
          </button>
          <button className={quote.primaryButton} type="button" onClick={() => void downloadPdf()} disabled={!canExport || downloading}>
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </header>
      {banner ? <p className={quote.error}>{banner}</p> : null}
      {loading ? <p className={quote.hint}>Loading customer balances…</p> : null}
      {!loading && !banner && rows.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No pending balances</h2>
          <p>Open invoices with an unpaid balance appear here. Quotations and fully paid invoices stay off this list.</p>
        </section>
      ) : null}
      {!loading && rows.length > 0 ? (
        <>
          <section className={styles.summary} aria-label="Balance summary">
            <article className={`${styles.metric} ${styles.pending}`}>
              <span className={styles.metricIcon} aria-hidden="true"><WalletCards size={18} /></span>
              <p className={styles.metricLabel}>Pending amount</p>
              <p className={styles.metricValue}>{formatRupees(totals.pending)}</p>
              <p className={styles.metricHint}>Total billed across this view</p>
            </article>
            <article className={`${styles.metric} ${styles.paid}`}>
              <span className={styles.metricIcon} aria-hidden="true"><HandCoins size={18} /></span>
              <p className={styles.metricLabel}>Amount paid</p>
              <p className={styles.metricValue}>{formatRupees(totals.paid)}</p>
              <p className={styles.metricHint}>Received from these customers</p>
            </article>
            <article className={`${styles.metric} ${styles.remaining}`}>
              <span className={styles.metricIcon} aria-hidden="true"><CircleDollarSign size={18} /></span>
              <p className={styles.metricLabel}>Balance remaining</p>
              <p className={styles.metricValue}>{formatRupees(totals.remaining)}</p>
              <p className={styles.metricHint}>{pendingCustomers} customer{pendingCustomers === 1 ? "" : "s"} still owing</p>
            </article>
          </section>

          <div className={styles.toolbar}>
            <div className={styles.filterGroups}>
              <div className={styles.filters} role="group" aria-label="Customer filter">
                <span className={styles.filterLabel}>Customers</span>
                <button className={pendingOnly ? styles.chip : styles.chipOn} type="button" onClick={() => setPendingOnly(false)}>All customers</button>
                <button className={pendingOnly ? styles.chipOn : styles.chip} type="button" onClick={() => setPendingOnly(true)}>Pending only</button>
              </div>
              <div className={styles.filters} role="group" aria-label="Balance amount sort">
                <span className={styles.filterLabel}>Balance remaining</span>
                <button className={sort === "name" ? styles.chipOn : styles.chip} type="button" onClick={() => setSort("name")}>By name</button>
                <button className={sort === "highest" ? styles.chipOn : styles.chip} type="button" onClick={() => setSort("highest")}>Highest to lowest</button>
                <button className={sort === "lowest" ? styles.chipOn : styles.chip} type="button" onClick={() => setSort("lowest")}>Lowest to highest</button>
              </div>
            </div>
            <label className={styles.search}>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, CNIC, or project" />
            </label>
          </div>

          <section className={`${shell.panel} ${styles.tablePanel}`}>
            <div className={styles.tableHead}>
              <div>
                <h2>Customer balances</h2>
                <p>Open invoices only, with live paid and remaining figures</p>
              </div>
              <span className={styles.countPill}>{visible.length} shown</span>
            </div>
            {visible.length === 0 ? <p className={styles.emptyMatch}>No customers match this view.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Customer balances">
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Customer</th>
                      <th>Invoices</th>
                      <th className={styles.amount}>Pending</th>
                      <th className={styles.amount}>Paid</th>
                      <th className={styles.amount}>Balance remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const profile = row.key.startsWith("open:") ? null : `/billing/profiles/${row.key}`;
                      const share = paidShare(row);
                      return (
                        <tr key={row.key}>
                          <td data-label="Serial">
                            <span className={styles.serial}>{row.serial}</span>
                          </td>
                          <td data-label="Customer">
                            <div className={styles.customer}>
                              {profile ? <a href={profile}>{row.customerName}</a> : <span className={styles.customerName}>{row.customerName}</span>}
                              {row.cnic ? <span className={styles.cnic}>{row.cnic}</span> : null}
                              <span className={`${styles.status} ${statusClass(row)}`}>{statusLabel(row)}</span>
                              <div className={styles.progress} aria-hidden="true">
                                <div className={styles.progressFill} style={{ width: `${share}%` }} />
                              </div>
                            </div>
                          </td>
                          <td data-label="Invoices">
                            <div className={styles.projects}>
                              {row.projects.map((project) => (
                                <span className={styles.projectChip} key={project.projectId}>{project.serial}</span>
                              ))}
                            </div>
                          </td>
                          <td data-label="Pending" className={styles.amount}>
                            <span className={styles.moneyPending}>{formatRupees(row.pending)}</span>
                          </td>
                          <td data-label="Paid" className={styles.amount}>
                            <span className={styles.moneyPaid}>{formatRupees(row.paid)}</span>
                          </td>
                          <td data-label="Balance remaining" className={styles.amount}>
                            <span className={row.remaining <= 0 ? styles.moneyCleared : styles.moneyRemaining}>
                              {formatRupees(row.remaining)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={styles.footerRow}>
                      <td data-label="Serial" colSpan={3}>Total</td>
                      <td data-label="Pending" className={styles.amount}><span className={styles.moneyPending}>{formatRupees(totals.pending)}</span></td>
                      <td data-label="Paid" className={styles.amount}><span className={styles.moneyPaid}>{formatRupees(totals.paid)}</span></td>
                      <td data-label="Balance remaining" className={styles.amount}><span className={styles.moneyRemaining}>{formatRupees(totals.remaining)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {!loading && !banner ? (
        <div ref={letterRef}>
          <BalancesLetter
            period={period}
            rows={letterRows}
            totals={{
              pending: formatRupees(totals.pending),
              paid: formatRupees(totals.paid),
              remaining: formatRupees(totals.remaining),
            }}
          />
        </div>
      ) : null}
    </>
  );
}
