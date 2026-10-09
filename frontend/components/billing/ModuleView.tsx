import type { BillingModule } from "@/lib/billing/modules";
import styles from "./billing-shell.module.css";

export function ModuleView({ module }: { module: BillingModule }) {
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Billing CMS</p>
          <h1 className={styles.title}>{module.title}</h1>
          <p className={styles.summary}>{module.summary}</p>
        </div>
      </header>
      <section className={`${styles.panel} ${styles.empty}`}>
        <h2>{module.emptyTitle}</h2>
        <p>{module.emptyText}</p>
        {module.action ? (
          <a className={styles.inlineLink} href={module.action.href}>
            {module.action.label}
          </a>
        ) : null}
      </section>
    </>
  );
}
