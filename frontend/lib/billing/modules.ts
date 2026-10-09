export type BillingModule = {
  slug: string;
  title: string;
  summary: string;
  emptyTitle: string;
  emptyText: string;
  action?: {
    href: string;
    label: string;
  };
};

export const billingModules: Record<string, BillingModule> = {
  quotations: {
    slug: "quotations",
    title: "Quotations",
    summary: "Customer details, the requested solar system, and a line-by-line price in PKR. Each saved quotation becomes a card.",
    emptyTitle: "No quotations yet",
    emptyText: "The quotation form will collect serial, item, description, quantity, unit, price, tax, discount and total, then the installment or direct plan.",
    action: { href: "/billing/whatsapp", label: "Send a quotation on WhatsApp" },
  },
  projects: {
    slug: "projects",
    title: "Projects in Process",
    summary: "A quotation moves here once the customer has negotiated it and approved it. It becomes the working project card.",
    emptyTitle: "No projects in process",
    emptyText: "Approved quotations will appear here as project cards, ready for invoices, payments and the agreement.",
  },
  invoices: {
    slug: "invoices",
    title: "Invoices",
    summary: "For an installment plan, enter the down payment and split the balance. A direct plan uses one invoice for the agreed total.",
    emptyTitle: "No invoices yet",
    emptyText: "Invoices will be editable, printable, and sendable on WhatsApp. Deleting one will ask for a reason.",
    action: { href: "/billing/whatsapp", label: "Send an invoice on WhatsApp" },
  },
  payments: {
    slug: "payments",
    title: "Payments",
    summary: "Every received installment and the remaining balance stays here, so the record can be reviewed and corrected.",
    emptyTitle: "No payments recorded",
    emptyText: "Each installment invoice and the amount received against it will be stored with the project.",
  },
  agreements: {
    slug: "agreements",
    title: "Agreements",
    summary: "The approved plan generates a letterhead agreement with the items, the amount structure, and the overdue fine.",
    emptyTitle: "No agreements yet",
    emptyText: "Direct and installment agreements will be saved here and can be printed with the customer and guarantor signature blocks.",
    action: { href: "/billing/whatsapp", label: "Send an agreement on WhatsApp" },
  },
  guarantors: {
    slug: "guarantors",
    title: "Guarantors",
    summary: "An installment plan needs two guarantors, including CNIC front and back, their details, and a place to sign.",
    emptyTitle: "No guarantors yet",
    emptyText: "Guarantor records will be attached to the installment agreement and shown on the printed letterhead.",
  },
  templates: {
    slug: "templates",
    title: "WhatsApp Templates",
    summary: "Messages for the monthly installment reminder, the thank-you when the plan is complete, and the feedback request.",
    emptyTitle: "No templates yet",
    emptyText: "These templates will be editable here and used when a quotation, invoice, or completed plan is sent on WhatsApp.",
  },
};

export const billingModuleSlugs = Object.keys(billingModules);
