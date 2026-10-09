"use client";

import { Menu, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { billingNav, isBillingNavActive } from "@/lib/billing/navigation";
import { currentAssuranceLevel, hasBillingAccess, signOutBilling } from "@/lib/billing/mfa";
import { billingSupabase } from "@/lib/billing/supabase";
import styles from "./billing-shell.module.css";

export function BillingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function guard() {
      const level = await currentAssuranceLevel();
      if (!active) return;
      if (!hasBillingAccess(level)) {
        router.replace("/billing/login");
        return;
      }
      const { data } = await billingSupabase.auth.getSession();
      if (!active) return;
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    }
    void guard();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (!ready) {
    return <p className={styles.loading}>Opening Billing CMS…</p>;
  }

  const initial = (email ?? "E").slice(0, 1).toUpperCase();

  return (
    <div className={styles.shell}>
      {menuOpen ? (
        <button className={styles.backdrop} type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <img className={styles.logo} src="/logos/electrotech-horizontal-dark.png" alt="Electro Tech" />
          <p className={styles.brandMark}>Billing CMS</p>
        </div>
        <nav className={styles.nav} aria-label="Billing CMS">
          {billingNav.map((group) => (
            <div className={styles.group} key={group.label}>
              <p className={styles.groupLabel}>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isBillingNavActive(pathname, item);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`${styles.link} ${active ? styles.linkActive : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{initial}</span>
          <div className={styles.accountText}>
            <span className={styles.accountName}>{email ?? "Staff"}</span>
          </div>
          <button
            className={styles.signOut}
            type="button"
            onClick={() => {
              void signOutBilling().then(() => router.replace("/billing/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className={styles.topTitle}>Billing CMS</span>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
