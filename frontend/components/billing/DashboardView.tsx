"use client";

import { useEffect, useState } from "react";
import { DocumentApiError, listSummary, type BillingSummary, type LedgerEntry } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees } from "@/lib/billing/quotation-math";
import styles from "./billing-shell.module.css";

const steps = [
  { title: "Quotation", text: "Customer, demand, line items in PKR, then installment or direct." },
  { title: "Project in process", text: "An approved quotation becomes the working project card." },
  { title: "Invoice and agreement", text: "Down payment, installments, guarantors, letterhead, and WhatsApp." },
];

function modeLabel(mode: LedgerEntry["paymentMode"]): string {
  return mode === "bank_transfer" ? "Bank transfer" : "Cash";
}

export function DashboardView() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const today = new Intl.DateTimeFormat("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    let cancelled = false;
    listSummary()
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof DocumentApiError ? error.message : "The dashboard could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { href: "/billing/quotations", label: "Quotations", value: summary ? String(summary.quotations) : "—", hint: "Saved quotations", tone: "" },
    { href: "/billing/projects", label: "Projects in process", value: summary ? String(summary.projectsInProcess) : "—", hint: "Still being delivered", tone: "" },
    { href: "/billing/invoices", label: "Open invoices", value: summary ? String(summary.openInvoices) : "—", hint: "Not fully paid", tone: "" },
    { href: "/billing/payments", label: "Overdue installments", value: summary ? String(summary.overdueInstallments) : "—", hint: "Due date has passed", tone: summary && summary.overdueInstallments > 0 ? styles.statAlert : "" },
    { href: "/billing/ledger", label: "Received", value: summary ? formatRupees(summary.receivedTotal) : "—", hint: summary ? `${summary.paymentCount} payment${summary.paymentCount === 1 ? "" : "s"}` : "Payments received", tone: styles.statMoney },
  ];

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Electro Tech</p>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.summary}>Live counts from quotations, projects, invoices, and payments received.</p>
        </div>
        <p className={styles.date}>{today}</p>
      </header>
      {banner ? <p className={styles.banner}>{banner}</p> : null}
      <section className={styles.stats} aria-label="Billing summary">
        {cards.map((card) => (
          <a className={`${styles.stat} ${card.tone}`} href={card.href} key={card.href}>
            <span className={styles.statLabel}>{card.label}</span>
            <span className={`${styles.statValue} ${card.tone === styles.statMoney ? styles.statValueMoney : ""}`}>{card.value}</span>
            <span className={styles.statHint}>{card.hint}</span>
          </a>
        ))}
      </section>
      <section className={styles.panels}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Recent payments</h2>
            <a href="/billing/ledger">Open ledger</a>
          </div>
          {summary && summary.recent.length > 0 ? (
            <ul className={styles.recent}>
              {summary.recent.map((entry) => (
                <li className={styles.recentRow} key={entry.id}>
                  <div>
                    <strong>{entry.customerName}</strong>
                    <span>{formatDisplayDate(entry.paymentDate)} · {entry.projectSerial} · {modeLabel(entry.paymentMode)}</span>
                  </div>
                  <b>{formatRupees(entry.paidAmount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.recentEmpty}>{summary ? "No payments received yet." : "Loading the latest payments…"}</p>
          )}
        </article>
        <article className={styles.panel}>
          <h2>How a job moves</h2>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li className={styles.step} key={step.title}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </>
  );
}
