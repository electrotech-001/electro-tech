"use client";

import { useEffect, useMemo, useState } from "react";
import { activeCustomers, groupCustomers, stageLabel, type CustomerCard } from "@/lib/billing/customers";
import { formatRupees, type QuotationRecord } from "@/lib/billing/quotation-math";
import { listProjects, listQuotations, QuotationApiError } from "@/lib/billing/quotations-api";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

function matches(card: CustomerCard, query: string): boolean {
  const haystack = [
    card.customerName,
    card.cnic,
    card.contactNo,
    card.whatsappNo,
    card.address,
    ...card.jobs.map((job) => `${job.serial} ${job.packageName}`),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function CustomerDirectoryPage({ mode }: { mode: "active" | "profiles" }) {
  const [cards, setCards] = useState<CustomerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listQuotations(), listProjects()])
      .then(([quotations, projects]: [QuotationRecord[], QuotationRecord[]]) => {
        if (cancelled) return;
        const grouped = groupCustomers(quotations, projects);
        setCards(mode === "active" ? activeCustomers(grouped) : grouped);
      })
      .catch((error: unknown) => {
        if (!cancelled) setBanner(error instanceof QuotationApiError ? error.message : "Customers could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => matches(card, needle));
  }, [cards, query]);

  const title = mode === "active" ? "Quoted & In Process" : "Customer Profiles";
  const summary = mode === "active"
    ? "Customers with a quotation still being sent, or a project that is still in process."
    : "Open a profile to edit the customer and review quotations, projects, invoices, and payments.";
  const emptyTitle = mode === "active" ? "No customers in this list" : "No customer profiles yet";
  const emptyText = mode === "active"
    ? "A customer appears here while a quotation is being sent, and stays while their project is in process."
    : "Save a quotation and the customer profile will appear here.";

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>{title}</h1>
          <p className={shell.summary}>{summary}</p>
        </div>
      </header>
      {banner ? <p className={styles.error}>{banner}</p> : null}
      {loading ? <p className={styles.hint}>Loading customers…</p> : null}
      {!loading && cards.length > 0 ? (
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, CNIC, phone, or quotation" />
          </label>
        </div>
      ) : null}
      {!loading && cards.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>{emptyTitle}</h2>
          <p>{emptyText}</p>
        </section>
      ) : null}
      {!loading && cards.length > 0 && visible.length === 0 ? (
        <section className={`${shell.panel} ${shell.empty}`}>
          <h2>No matching customers</h2>
          <p>Try a different name, CNIC, or quotation number.</p>
        </section>
      ) : null}
      <div className={styles.cards}>
        {visible.map((card) => {
          const jobs = mode === "active"
            ? card.jobs.filter((job) => job.stage === "sending" || job.stage === "in_process")
            : card.jobs;
          return (
            <article className={styles.card} key={card.key}>
              <div className={styles.cardTop}>
                <strong>{card.cnic}</strong>
                <span className={styles.badge}>{card.inProcess ? "In process" : card.sendingQuotation ? "Quotation" : "On file"}</span>
              </div>
              <h2>{card.customerName}</h2>
              <p>{card.contactNo} · WhatsApp {card.whatsappNo}</p>
              <p>{card.address}</p>
              {jobs.map((job) => (
                <p key={`${job.kind}-${job.id}`}>
                  {job.serial} · {stageLabel(job.stage)} · {formatRupees(job.grandTotal)}
                </p>
              ))}
              <div className={styles.cardActions}>
                <a href={`/billing/profiles/${card.key}`}>Open profile</a>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
