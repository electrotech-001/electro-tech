import type { PaymentMode, QuotationRecord } from "./quotation-math";

export type CustomerStage = "sending" | "approved" | "in_process" | "completed";

export type CustomerJob = {
  id: string;
  serial: string;
  kind: "quotation" | "project";
  date: string;
  packageName: string;
  grandTotal: number;
  paymentMode: PaymentMode;
  stage: CustomerStage;
};

export type CustomerCard = {
  key: string;
  cnic: string;
  customerName: string;
  address: string;
  contactNo: string;
  whatsappNo: string;
  sendingQuotation: boolean;
  inProcess: boolean;
  jobs: CustomerJob[];
};

type Bucket = CustomerCard & { latestDate: string };

export function customerKey(cnic: string): string {
  return cnic.replace(/\D/g, "");
}

function jobFrom(record: QuotationRecord): CustomerJob {
  const stage: CustomerStage = record.kind === "project"
    ? record.status === "completed" ? "completed" : "in_process"
    : record.approvedAt ? "approved" : "sending";
  return {
    id: record.id,
    serial: record.serial,
    kind: record.kind,
    date: record.quotationDate,
    packageName: record.customerPackage,
    grandTotal: record.grandTotal,
    paymentMode: record.paymentMode,
    stage,
  };
}

function applyIdentity(bucket: Bucket, record: QuotationRecord): void {
  if (record.quotationDate < bucket.latestDate) return;
  bucket.latestDate = record.quotationDate;
  bucket.cnic = record.cnic;
  bucket.customerName = record.customerName;
  bucket.address = record.address;
  bucket.contactNo = record.contactNo;
  bucket.whatsappNo = record.whatsappNo;
}

export function groupCustomers(quotations: QuotationRecord[], projects: QuotationRecord[]): CustomerCard[] {
  const buckets = new Map<string, Bucket>();
  function bucketFor(record: QuotationRecord): Bucket {
    const key = customerKey(record.cnic);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: Bucket = {
      key,
      cnic: record.cnic,
      customerName: record.customerName,
      address: record.address,
      contactNo: record.contactNo,
      whatsappNo: record.whatsappNo,
      sendingQuotation: false,
      inProcess: false,
      jobs: [],
      latestDate: "",
    };
    buckets.set(key, created);
    return created;
  }

  for (const record of [...quotations, ...projects]) {
    const bucket = bucketFor(record);
    applyIdentity(bucket, record);
    bucket.jobs.push(jobFrom(record));
  }

  return [...buckets.values()]
    .map((bucket) => {
      const jobs = [...bucket.jobs].sort((left, right) => right.date.localeCompare(left.date) || right.serial.localeCompare(left.serial));
      return {
        key: bucket.key,
        cnic: bucket.cnic,
        customerName: bucket.customerName,
        address: bucket.address,
        contactNo: bucket.contactNo,
        whatsappNo: bucket.whatsappNo,
        sendingQuotation: jobs.some((job) => job.stage === "sending"),
        inProcess: jobs.some((job) => job.stage === "in_process"),
        jobs,
      };
    })
    .sort((left, right) => left.customerName.localeCompare(right.customerName));
}

export function activeCustomers(cards: CustomerCard[]): CustomerCard[] {
  return cards.filter((card) => card.sendingQuotation || card.inProcess);
}

export function stageLabel(stage: CustomerStage): string {
  if (stage === "sending") return "Quotation";
  if (stage === "in_process") return "In process";
  if (stage === "completed") return "Completed";
  return "Approved";
}
