import { formatDisplayDate, formatRupees, type QuotationRecord } from "./quotation-math";

export function defaultAgreementWording(project: QuotationRecord): string {
  const installments = project.paymentMode === "installments";
  const balance = project.grandTotal - (project.downPayment ?? 0);
  const opening = `This agreement is made on ${formatDisplayDate(project.quotationDate)} at Attock between Electro Tech, through Muhammad Aqeel, and ${project.customerName}, CNIC ${project.cnic}, resident of ${project.address}.`;
  const selected = `The customer has selected this package: ${project.customerPackage}`;
  const payment = installments
    ? `The payment mode is Installments. The total price is ${formatRupees(project.grandTotal)}. A down payment of ${formatRupees(project.downPayment ?? 0)} is payable at the start of the work. The remaining balance of ${formatRupees(balance)} is payable in ${project.installmentCount ?? 0} installments on the dates below.`
    : `The payment mode is Direct. The total price is ${formatRupees(project.grandTotal)}. The customer will pay this amount directly. A direct payment does not require a guarantor.`;
  return `${opening}\n\n${selected}\n\n${payment}`;
}

export function agreementWording(body: string | null | undefined, project: QuotationRecord): string {
  const saved = body?.trim();
  return saved || defaultAgreementWording(project);
}
