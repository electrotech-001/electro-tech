"use client";

import { useEffect, useState } from "react";
import { DocumentApiError, listSummary, type BillingSummary, type LedgerEntry } from "@/lib/billing/documents-api";
import { formatDisplayDate, formatRupees } from "@/lib/billing/quotation-math";
import { listProjects } from "@/lib/billing/quotations-api";
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
  const [projectCounts, setProjectCounts] = useState<{ inProcess: number; completed: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const today = new Intl.DateTimeFormat("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [summaryResult, projectsResult] = await Promise.allSettled([listSummary(), listProjects()]);
      if (cancelled) return;
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      if (projectsResult.status === "fulfilled") {
        const projects = projectsResult.value;
        setProjectCounts({
          inProcess: projects.filter((project) => project.status !== "completed").length,
          completed: projects.filter((project) => project.status === "completed").length,
        });
      }
      if (summaryResult.status === "rejected" && projectsResult.status === "rejected") {
        const error = summaryResult.reason;
        setBanner(error instanceof DocumentApiError ? error.message : "The dashboard could not be loaded.");
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

  const inProcess = projectCounts
    ? String(projectCounts.inProcess)
    : summary
      ? String(summary.projectsInProcess)
      : "—";
  const completed = projectCounts
    ? String(projectCounts.completed)
    : summary
      ? String(summary.projectsCompleted ?? 0)
      : "—";

  const cards = [
    { href: "/billing/quotations", label: "Quotations", value: summary ? String(summary.quotations) : "—", hint: "Saved quotations", tone: "" },
    { href: "/billing/projects", label: "Projects in process", value: inProcess, hint: "Still being delivered", tone: "" },
    { href: "/billing/projects#completed", label: "Completed projects", value: completed, hint: "Marked completed", tone: styles.statDone },
    { href: "/billing/invoices", label: "Open invoices", value: summary ? String(summary.openInvoices) : "—", hint: "Not fully paid", tone: "" },
    { href: "/billing/payments", label: "Overdue installments", value: summary ? String(summary.overdueInstallments) : "—", hint: "Due date has passed", tone: summary && summary.overdueInstallments > 0 ? styles.statAlert : "" },
    { href: "/billing/invoices", label: "Pending amount", value: summary ? formatRupees(summary.pendingTotal) : "—", hint: "Still to be received", tone: styles.statPending },
    { href: "/billing/ledger", label: "Received amount", value: summary ? formatRupees(summary.receivedTotal) : "—", hint: summary ? `${summary.paymentCount} payment${summary.paymentCount === 1 ? "" : "s"}` : "Payments received", tone: styles.statMoney },
    { href: "/billing/discounts", label: "Discount amount", value: summary ? formatRupees(summary.discountTotal) : "—", hint: "Given on invoices and payments", tone: styles.statDiscount },
  ];

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Electro Tech</p>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.summary}>Live counts from quotations, projects, and invoices, with the pending, received, and discount amounts.</p>
        </div>
        <p className={styles.date}>{today}</p>
      </header>
      {banner ? <p className={styles.banner}>{banner}</p> : null}
      <section className={styles.stats} aria-label="Billing summary">
        {cards.map((card) => (
          <a className={`${styles.stat} ${card.tone}`} href={card.href} key={card.label}>
            <span className={styles.statLabel}>{card.label}</span>
            <span className={`${styles.statValue} ${card.tone === styles.statMoney ? styles.statValueMoney : ""} ${card.tone === styles.statPending ? styles.statValuePending : ""} ${card.tone === styles.statDiscount ? styles.statValueDiscount : ""}`}>{card.value}</span>
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
