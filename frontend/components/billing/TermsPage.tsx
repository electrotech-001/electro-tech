"use client";

import { useEffect, useState } from "react";
import { DocumentApiError, getDocumentTerms, saveDocumentTerms } from "@/lib/billing/documents-api";
import { publishDocumentTerms } from "./DocumentTerms";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";

export function TermsPage() {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocumentTerms()
      .then((text) => {
        if (!cancelled) setBody(text);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "Terms and conditions could not be loaded." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setBanner(null);
    try {
      const saved = await saveDocumentTerms(body);
      setBody(saved);
      publishDocumentTerms(saved);
      setBanner({ tone: "ok", text: "Terms and conditions saved. They appear at the bottom of each quotation and invoice." });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "Terms and conditions could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>Terms & Conditions</h1>
          <p className={shell.summary}>This text is printed at the bottom of every quotation and invoice. Leave it blank to hide it.</p>
        </div>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading terms…</p> : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
        >
          <label className={styles.field}>
            <span>Terms and conditions</span>
            <textarea rows={16} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Payment is due as stated on the quotation. Goods remain the property of Electro Tech until paid in full." />
          </label>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? "Saving…" : "Save terms"}</button>
          </div>
        </form>
      )}
    </>
  );
}
