"use client";

import styles from "./billing-shell.module.css";

const steps = [
  {
    title: "Quotation",
    text: "Customer, demand, line items in PKR, then installment or direct.",
  },
  {
    title: "Project in process",
    text: "An approved quotation becomes the working project card.",
  },
  {
    title: "Invoice and agreement",
    text: "Down payment, installments, guarantors, letterhead, and WhatsApp.",
  },
];

const stats = [
  { href: "/billing/quotations", label: "Quotations", hint: "Saved as cards" },
  { href: "/billing/projects", label: "Projects in process", hint: "Approved quotations" },
  { href: "/billing/invoices", label: "Open invoices", hint: "Direct or installment" },
  { href: "/billing/payments", label: "Overdue installments", hint: "Daily fine applies later" },
];

export function DashboardView() {
  const today = new Intl.DateTimeFormat("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Electro Tech</p>
          <h1 className={styles.title}>Dashboard</h1>
        </div>
        <p className={styles.date}>{today}</p>
      </header>
      <section className={styles.stats} aria-label="Billing summary">
        {stats.map((stat) => (
          <a className={styles.stat} href={stat.href} key={stat.href}>
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>0</span>
            <span className={styles.statHint}>{stat.hint}</span>
          </a>
        ))}
      </section>
      <section className={styles.panels}>
        <article className={styles.panel}>
          <h2>How a job moves</h2>
          <p>Each count above is zero because nothing has been saved yet.</p>
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
        <article className={styles.panel}>
          <h2>Still to connect</h2>
          <p>Connect the official WhatsApp from the sidebar. The saved session sends quotations, invoices, and agreements. Templates for the monthly reminder, thank-you, and feedback sit beside it.</p>
        </article>
      </section>
    </>
  );
}
