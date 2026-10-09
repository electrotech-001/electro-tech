export async function quotationToPdf(element: HTMLElement, serial: string): Promise<File> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const image = canvas.toDataURL("image/jpeg", 0.92);
  let remaining = imgHeight;
  let offset = 0;
  pdf.addImage(image, "JPEG", 0, offset, imgWidth, imgHeight);
  remaining -= pageHeight;
  while (remaining > 1) {
    offset = remaining - imgHeight;
    pdf.addPage();
    pdf.addImage(image, "JPEG", 0, offset, imgWidth, imgHeight);
    remaining -= pageHeight;
  }
  return new File([pdf.output("blob")], `Electro-Tech-${serial}.pdf`, { type: "application/pdf" });
}
