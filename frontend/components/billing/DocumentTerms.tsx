"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import styles from "./quotation.module.css";

const DocumentTermsContext = createContext<string>("");

let cachedTerms = "";
const listeners = new Set<(value: string) => void>();

export function publishDocumentTerms(value: string): void {
  cachedTerms = value;
  listeners.forEach((listener) => listener(value));
}

export function DocumentTermsProvider({ children }: { children: ReactNode }) {
  const [terms, setTerms] = useState(cachedTerms);

  useEffect(() => {
    listeners.add(setTerms);
    return () => {
      listeners.delete(setTerms);
    };
  }, []);

  return <DocumentTermsContext.Provider value={terms}>{children}</DocumentTermsContext.Provider>;
}

export function DocumentTermsNote() {
  const terms = useContext(DocumentTermsContext).trim();
  if (!terms) return null;
  return (
    <section className={styles.terms}>
      <p className={styles.blockLabel}>Terms and conditions</p>
      <p>{terms}</p>
    </section>
  );
}
