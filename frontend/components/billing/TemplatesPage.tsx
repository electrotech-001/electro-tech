"use client";

import { MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupCustomers, type CustomerCard } from "@/lib/billing/customers";
import {
  createTemplate,
  deleteTemplate,
  DocumentApiError,
  listTemplates,
  updateTemplate,
  type MessageTemplate,
} from "@/lib/billing/documents-api";
import {
  fillTemplate,
  templateCardTitle,
  templateKindLabel,
  templateSendsCard,
  type TemplateKind,
} from "@/lib/billing/message-templates";
import { quotationToPdf } from "@/lib/billing/quotation-pdf";
import { listProjects, listQuotations, QuotationApiError } from "@/lib/billing/quotations-api";
import { sendWhatsAppDocument, WhatsAppApiError, type WhatsAppDocumentKind } from "@/lib/billing/whatsapp-api";
import { CustomerNoteCard, GreetingCard } from "./BillingLetters";
import { FancySelect } from "./FancyControls";
import shell from "./billing-shell.module.css";
import styles from "./quotation.module.css";
import "./quotation-print.css";

function whatsAppKind(kind: TemplateKind): WhatsAppDocumentKind {
  if (kind === "thank_you") return "thanks";
  if (kind === "feedback") return "feedback";
  if (kind === "reminder") return "reminder";
  return "card";
}

function valuesFor(customer: CustomerCard) {
  const job = customer.jobs[0];
  return {
    name: customer.customerName,
    project: job?.serial ?? "",
    packageName: job?.packageName ?? "",
    phone: customer.whatsappNo,
  };
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [customers, setCustomers] = useState<CustomerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<MessageTemplate | null>(null);
  const [sending, setSending] = useState<MessageTemplate | null>(null);
  const [customerKey, setCustomerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState<{ template: MessageTemplate; customer: CustomerCard; message: string } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const [rows, quotations, projects] = await Promise.all([listTemplates(), listQuotations(), listProjects()]);
    setTemplates(rows);
    const people = groupCustomers(quotations, projects);
    setCustomers(people);
    setCustomerKey((current) => (people.some((person) => person.key === current) ? current : people[0]?.key ?? ""));
  }

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof DocumentApiError || error instanceof QuotationApiError
          ? error.message
          : "Templates could not be loaded.";
        setBanner({ tone: "bad", text: message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCustomer = customers.find((customer) => customer.key === customerKey) ?? null;
  const filled = useMemo(() => {
    if (!sending || !selectedCustomer) return "";
    return fillTemplate(sending.body, valuesFor(selectedCustomer));
  }, [selectedCustomer, sending]);

  function startNew() {
    setEditing("new");
    setName("");
    setBody("");
    setBanner(null);
  }

  function startEdit(template: MessageTemplate) {
    setEditing(template);
    setName(template.name);
    setBody(template.body);
    setBanner(null);
  }

  async function onSave() {
    setSaving(true);
    setBanner(null);
    try {
      if (editing === "new") await createTemplate({ name, body });
      else if (editing) await updateTemplate(editing.id, { name, body });
      await refresh();
      setEditing(null);
      setBanner({ tone: "ok", text: "Template saved." });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The template could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!removing) return;
    setBusy(true);
    setBanner(null);
    try {
      await deleteTemplate(removing.id);
      await refresh();
      setRemoving(null);
      setBanner({ tone: "ok", text: `${removing.name} was deleted.` });
    } catch (error) {
      setBanner({ tone: "bad", text: error instanceof DocumentApiError ? error.message : "The template could not be deleted." });
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    if (!sending || !selectedCustomer || !filled.trim()) return;
    setBusy(true);
    setBanner(null);
    const payload = { template: sending, customer: selectedCustomer, message: filled };
    setCapture(payload);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = captureRef.current?.querySelector("article");
      if (!(node instanceof HTMLElement)) throw new DocumentApiError("The card could not be prepared.");
      const serial = selectedCustomer.jobs[0]?.serial ?? "note";
      const file = await quotationToPdf(node, `${sending.kind}-${serial}`);
      await sendWhatsAppDocument({
        phone: selectedCustomer.whatsappNo,
        kind: whatsAppKind(sending.kind),
        message: filled,
        file,
      });
      setBanner({ tone: "ok", text: `${sending.name} was sent to ${selectedCustomer.customerName} on WhatsApp.` });
      setSending(null);
    } catch (error) {
      const message = error instanceof WhatsAppApiError || error instanceof DocumentApiError
        ? error.message
        : "The card could not be sent on WhatsApp.";
      setBanner({ tone: "bad", text: message });
    } finally {
      setCapture(null);
      setBusy(false);
    }
  }

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <p className={shell.kicker}>Billing CMS</p>
          <h1 className={shell.title}>WhatsApp Templates</h1>
          <p className={shell.summary}>Edit the reminder, thank-you, and feedback messages, or add your own. Thank-you and feedback are sent as a card to the customer on WhatsApp. Use {"{{name}}"}, {"{{project}}"}, {"{{package}}"}, and {"{{phone}}"}.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={startNew}><Plus size={16} /> New template</button>
      </header>
      {banner ? <p className={banner.tone === "ok" ? styles.success : styles.error}>{banner.text}</p> : null}
      {loading ? <p className={styles.hint}>Loading templates…</p> : null}
      {editing ? (
        <section className={shell.panel}>
          <h2>{editing === "new" ? "New template" : `Edit ${editing.name}`}</h2>
          <div className={`${styles.formGrid} ${styles.formGap}`}>
            <label className={styles.field}>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.wide}`}>
              <span>Message</span>
              <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
            </label>
          </div>
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button className={styles.primaryButton} type="button" onClick={() => void onSave()} disabled={saving}>{saving ? "Saving…" : "Save template"}</button>
          </div>
          {editing !== "new" && editing && templateSendsCard(editing.kind) ? (
            <GreetingCard
              variant={editing.kind === "feedback" ? "feedback" : "thanks"}
              customerName="Customer"
              body={fillTemplate(body, { name: "Customer", project: "Project", packageName: "your package", phone: "" })}
            />
          ) : null}
        </section>
      ) : null}
      <div className={styles.cards}>
        {templates.map((template) => (
          <article className={`${styles.card} ${templateSendsCard(template.kind) ? styles.cardWide : ""}`} key={template.id}>
            <div className={styles.cardTop}>
              <span className={styles.badge}>{templateKindLabel(template.kind)}</span>
            </div>
            <h2>{template.name}</h2>
            {templateSendsCard(template.kind) ? (
              <GreetingCard
                variant={template.kind === "feedback" ? "feedback" : "thanks"}
                customerName="Customer"
                body={fillTemplate(template.body, { name: "Customer", project: "Project", packageName: "your package", phone: "" })}
              />
            ) : <p>{template.body}</p>}
            <div className={styles.cardActions}>
              <button type="button" onClick={() => startEdit(template)}><Pencil size={15} /> Edit</button>
              <button type="button" onClick={() => setSending(template)}><MessageCircle size={15} /> {templateSendsCard(template.kind) ? "Send card" : "WhatsApp"}</button>
              {template.kind === "custom" ? (
                <button type="button" onClick={() => setRemoving(template)}><Trash2 size={15} /> Delete</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {sending ? (
        <div className={styles.modal} role="presentation" onClick={() => { if (!busy) setSending(null); }}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalBar}>
              <h2>Send {sending.name}</h2>
              <div>
                <button className={styles.secondaryButton} type="button" onClick={() => void onSend()} disabled={busy || !selectedCustomer}>
                  {busy ? "Sending…" : "Send on WhatsApp"}
                </button>
                <button className={styles.secondaryButton} type="button" onClick={() => setSending(null)} disabled={busy}>Close</button>
              </div>
            </div>
            <div className={styles.modalScroll}>
              {customers.length === 0 ? <p className={styles.hint}>Save a quotation before sending a card.</p> : (
                <div className={styles.field}>
                  <span>Customer</span>
                  <FancySelect
                    value={customerKey}
                    options={customers.map((customer) => ({ value: customer.key, label: `${customer.customerName} · ${customer.whatsappNo}` }))}
                    onChange={setCustomerKey}
                  />
                </div>
              )}
              {selectedCustomer && templateSendsCard(sending.kind) ? (
                <GreetingCard
                  variant={sending.kind === "feedback" ? "feedback" : "thanks"}
                  customerName={selectedCustomer.customerName}
                  body={filled}
                />
              ) : null}
              {selectedCustomer && !templateSendsCard(sending.kind) ? (
                <CustomerNoteCard
                  title={templateCardTitle(sending.kind)}
                  customerName={selectedCustomer.customerName}
                  projectSerial={selectedCustomer.jobs[0]?.serial ?? ""}
                  body={filled}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {removing ? (
        <div className={styles.modal} role="presentation" onClick={() => setRemoving(null)}>
          <div className={styles.confirm} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Delete {removing.name}?</h2>
            <p>The reminder, thank-you, and feedback templates stay. Only a template you added can be removed.</p>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setRemoving(null)} disabled={busy}>Cancel</button>
              <button className={styles.dangerButton} type="button" onClick={() => void onDelete()} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {capture ? (
        <div className={styles.capture} ref={captureRef}>
          {templateSendsCard(capture.template.kind) ? (
            <GreetingCard
              variant={capture.template.kind === "feedback" ? "feedback" : "thanks"}
              customerName={capture.customer.customerName}
              body={capture.message}
              paper
            />
          ) : (
            <CustomerNoteCard
              title={templateCardTitle(capture.template.kind)}
              customerName={capture.customer.customerName}
              projectSerial={capture.customer.jobs[0]?.serial ?? ""}
              body={capture.message}
              paper
            />
          )}
        </div>
      ) : null}
    </>
  );
}
