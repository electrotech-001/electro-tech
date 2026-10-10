"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LedgerLetter } from "@/components/billing/BillingLetters";
import { customerKey } from "@/lib/billing/customers";
import { DocumentApiError, listLedger, type LedgerEntry } from "@/lib/billing/documents-api";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { formatDisplayDate, formatRupees, roundMoney } from "@/lib/billing/quotation-math";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function modeLabel(mode: LedgerEntry["paymentMode"]): string {
  return mode === "bank_transfer" ? "Bank transfer" : "Cash";
}

function detail(entry: LedgerEntry): string {
  const kind = entry.installmentNumber == null ? "Direct payment" : `Installment ${entry.installmentNumber}`;
  return entry.invoiceSerial ? `${kind} · ${entry.invoiceSerial}` : kind;
}

function monthKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" }).format(date);
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-PK", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function periodLabel(month: string, from: string, to: string, thisMonth: string, lastMonth: string): string {
  const monthText = month === "all" ? "" : month === thisMonth ? "This month" : month === lastMonth ? "Last month" : monthLabel(month);
  const range = from && to
    ? `${formatDisplayDate(from)} to ${formatDisplayDate(to)}`
    : from
      ? `From ${formatDisplayDate(from)}`
      : to
        ? `Through ${formatDisplayDate(to)}`
        : "";
  if (monthText && range) return `${monthText} · ${range}`;
  return monthText || range || "All dates";
}

export function PaymentLedgerPage() {
  const letterRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);
  const thisMonth = useMemo(() => monthKey(), []);
  const lastMonth = useMemo(() => shiftMonth(thisMonth, -1), [thisMonth]);

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

  const extraMonths = useMemo(() => {
    const keys = [...new Set(entries.map((entry) => entry.paymentDate.slice(0, 7)))].sort().reverse();
    return keys.filter((key) => key !== thisMonth && key !== lastMonth);
  }, [entries, lastMonth, thisMonth]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = entries.filter((entry) => {
      if (month !== "all" && entry.paymentDate.slice(0, 7) !== month) return false;
      if (from && entry.paymentDate < from) return false;
      if (to && entry.paymentDate > to) return false;
      if (!needle) return true;
      return [entry.customerName, entry.cnic, entry.projectSerial, entry.invoiceSerial ?? "", modeLabel(entry.paymentMode)].join(" ").toLowerCase().includes(needle);
    });
    let running = 0;
    return matched.map((entry) => {
      running = roundMoney(running + entry.paidAmount);
      return { entry, running };
    });
  }, [entries, from, month, query, to]);

  const total = roundMoney(visible.reduce((sum, row) => sum + row.entry.paidAmount, 0));
  const period = periodLabel(month, from, to, thisMonth, lastMonth);
  const letterRows = visible.map(({ entry }) => ({
    id: entry.id,
    date: formatDisplayDate(entry.paymentDate),
    customer: entry.customerName,
    cnic: entry.cnic,
    project: entry.projectSerial,
    detail: detail(entry),
    mode: modeLabel(entry.paymentMode),
    amount: formatRupees(entry.paidAmount),
  }));

  function chooseMonth(next: string) {
    setMonth(next);
    setFrom("");
    setTo("");
  }

  async function downloadPdf() {
    const node = letterRef.current?.querySelector(".quotation-letter");
    if (!(node instanceof HTMLElement)) return;
    setDownloading(true);
    setBanner(null);
    try {
      const file = await quotationToPdf(node, "payment-ledger");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setBanner("The ledger PDF could not be created.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Payment Ledger</h1>
          <p className={shell.summary}>Payments received, including completed projects. Filter by month or date, then print or download the letterhead.</p>
        </div>
        <div className={styles.ledgerActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => window.print()} disabled={loading || Boolean(banner) || entries.length === 0}>Print</button>
          <button className={styles.primaryButton} type="button" onClick={() => void downloadPdf()} disabled={loading || downloading || Boolean(banner) || entries.length === 0}>{downloading ? "Preparing PDF…" : "Download PDF"}</button>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading the ledger…</p> : null}
      {!loading && !banner && entries.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No payments received</h2>
          <p>Record a payment from Receive Payments and it will appear in this ledger.</p>
        </section>
      ) : null}
      {!loading && entries.length > 0 ? (
        <section className={shell.panel}>
          <div className={styles.ledgerHero}>
            <div>
              <p className={styles.ledgerEyebrow}>{period}</p>
              <h2>{formatRupees(total)}</h2>
              <p>{visible.length} payment{visible.length === 1 ? "" : "s"} in this view</p>
            </div>
            <label className={styles.field}>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer, CNIC, or project" />
            </label>
          </div>
          <div className={styles.filters} role="group" aria-label="Month">
            <button className={month === "all" && !from && !to ? styles.chipOn : styles.chip} type="button" onClick={() => chooseMonth("all")}>All</button>
            <button className={month === thisMonth ? styles.chipOn : styles.chip} type="button" onClick={() => chooseMonth(thisMonth)}>This month</button>
            <button className={month === lastMonth ? styles.chipOn : styles.chip} type="button" onClick={() => chooseMonth(lastMonth)}>Last month</button>
            {extraMonths.map((key) => (
              <button className={month === key ? styles.chipOn : styles.chip} type="button" key={key} onClick={() => chooseMonth(key)}>{monthLabel(key)}</button>
            ))}
          </div>
          <div className={styles.dateFilters}>
            <label className={styles.field}>
              <span>From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
          {visible.length === 0 ? <p>No payments match these filters.</p> : (
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
                <tfoot>
                  <tr className={styles.ledgerTotal}>
                    <td colSpan={6}>Total received</td>
                    <td className={styles.amount}>{formatRupees(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {!loading && !banner ? (
        <div ref={letterRef}>
          <LedgerLetter period={period} rows={letterRows} total={formatRupees(total)} />
        </div>
      ) : null}
    </>
  );
}
