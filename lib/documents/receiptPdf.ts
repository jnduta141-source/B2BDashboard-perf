/**
 * Client-side payment receipt PDF — M-PESA-inspired layout with Mboka branding.
 *
 * Structure mirrors familiar mobile-money receipts (hero, amount card + detail
 * column, barcode band, contact footer) while using Mboka indigo / ink colours
 * and Elementpay contact lines — never partner brands.
 */

import { jsPDF } from "jspdf";
import { MBOKA_LETTERHEAD } from "@/lib/documents/letterhead";
import type { ReceiptShareDoc } from "@/lib/documents/receiptShare";

const INDIGO: [number, number, number] = [59, 46, 211];
const INDIGO_DEEP: [number, number, number] = [45, 35, 170];
const INK: [number, number, number] = [19, 17, 38];
const MUTED: [number, number, number] = [76, 74, 102];
const LINE: [number, number, number] = [220, 218, 230];
const WHITE: [number, number, number] = [255, 255, 255];

function pdfFilename(stem: string): string {
  const base = stem.replace(/\.(pdf|html)$/i, "").trim() || "mboka-receipt";
  return `${base}.pdf`;
}

function wrapText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(String(text || ""), maxWidth) as string[];
}

function flattenRows(receipt: ReceiptShareDoc): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const section of receipt.sections) {
    for (const row of section.rows) {
      if (row.value?.trim()) rows.push({ label: row.label, value: row.value.trim() });
    }
  }
  return rows;
}

function findRow(
  rows: { label: string; value: string }[],
  ...needles: string[]
): string | null {
  for (const needle of needles) {
    const hit = rows.find((r) => r.label.toLowerCase().includes(needle.toLowerCase()));
    if (hit) return hit.value;
  }
  return null;
}

function greetingName(receipt: ReceiptShareDoc, rows: { label: string; value: string }[]): string {
  const party =
    findRow(rows, "recipient", "payer", "counterparty") ||
    (receipt.party || "").split("·")[0]?.trim() ||
    "";
  if (!party) return "there";
  // First token only — "Jane Wanjiku" → "Jane"
  const first = party.split(/\s+/)[0]?.replace(/[^a-zA-Z'-]/g, "") || "";
  return first || "there";
}

function amountBoxLabel(caption?: string): string {
  const c = (caption || "").toLowerCase();
  if (c.includes("received")) return "Total Amount Received:";
  if (c.includes("sent")) return "Total Amount Paid:";
  return "Total Amount:";
}

/** Abstract Mboka mark — interlocking squares, not a partner/rail icon. */
function drawHeroMark(doc: jsPDF, cx: number, cy: number, size: number): void {
  const s = size;
  doc.setFillColor(...INDIGO);
  doc.roundedRect(cx - s * 0.55, cy - s * 0.55, s * 0.72, s * 0.72, 10, 10, "F");
  doc.setFillColor(124, 111, 255);
  doc.roundedRect(cx - s * 0.12, cy - s * 0.12, s * 0.72, s * 0.72, 10, 10, "F");
  doc.setFillColor(...WHITE);
  doc.roundedRect(cx - s * 0.22, cy - s * 0.22, s * 0.38, s * 0.38, 6, 6, "F");
  doc.setFillColor(...INDIGO);
  doc.roundedRect(cx - s * 0.12, cy - s * 0.12, s * 0.24, s * 0.24, 4, 4, "F");
}

/** Decorative barcode-style band (visual separator, not a real barcode). */
function drawBarcodeBand(doc: jsPDF, x: number, y: number, width: number, height: number): void {
  doc.setFillColor(...INK);
  let cursor = x;
  const end = x + width;
  let i = 0;
  while (cursor < end) {
    const barW = i % 5 === 0 ? 2.4 : i % 3 === 0 ? 1.6 : 1.0;
    const gap = i % 4 === 0 ? 2.2 : 1.4;
    if (cursor + barW > end) break;
    doc.rect(cursor, y, barW, height, "F");
    cursor += barW + gap;
    i += 1;
  }
}

/** Build a downloadable/shareable receipt PDF from the branded document model. */
export function buildReceiptPdfBlob(
  receipt: ReceiptShareDoc,
  filenameStem?: string,
): { blob: Blob; filename: string; title: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  let y = margin;

  const rows = flattenRows(receipt);
  const phone =
    findRow(rows, "m-pesa number", "mobile number", "phone") ||
    findRow(rows, "bank account", "destination account", "source account");
  const paidTo = findRow(rows, "recipient", "payer", "counterparty");
  const txnNo =
    findRow(rows, "m-pesa reference", "payment reference", "bank reference", "mobile money reference") ||
    findRow(rows, "receipt number");
  const paymentType = findRow(rows, "payment method");
  const date =
    findRow(rows, "date settled", "date initiated") ||
    new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const currency = findRow(rows, "currency");

  // Detail column prefers a compact M-PESA-like set, then remaining rows.
  const preferredLabels = [
    { label: "Date", value: date },
    { label: paidTo && rows.some((r) => /payer/i.test(r.label)) ? "Paid By" : "Paid To", value: paidTo },
    { label: "Transaction No", value: txnNo },
    { label: "Payment Type", value: paymentType },
    { label: "Currency", value: currency },
  ].filter((r): r is { label: string; value: string } => Boolean(r.value));

  const usedValues = new Set(preferredLabels.map((r) => r.value));
  const extras = rows.filter(
    (r) =>
      !usedValues.has(r.value) &&
      !/currency|payment method|date /i.test(r.label) &&
      r.value !== phone &&
      r.value !== paidTo &&
      r.value !== txnNo,
  );
  const detailRows = [...preferredLabels, ...extras].slice(0, 8);

  // —— Top brand ——
  doc.setFillColor(...INDIGO);
  doc.roundedRect(margin, y, 26, 26, 7, 7, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("M", margin + 8, y + 17);
  doc.setTextColor(...INK);
  doc.setFontSize(18);
  doc.text(MBOKA_LETTERHEAD.product, margin + 34, y + 18);
  y += 48;

  // —— Hero mark ——
  drawHeroMark(doc, pageW / 2, y + 52, 88);
  y += 120;

  // —— Greeting ——
  const name = greetingName(receipt, rows);
  doc.setTextColor(...INDIGO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`Hi ${name},`, pageW / 2, y, { align: "center" });
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const thanks = wrapText(
    doc,
    `Thank you for making your payment with ${MBOKA_LETTERHEAD.product}.`,
    contentW * 0.85,
    11,
  );
  doc.text(thanks, pageW / 2, y, { align: "center" });
  y += thanks.length * 14 + 22;

  // —— Amount card + detail column ——
  const cardW = contentW * 0.42;
  const detailX = margin + cardW + 18;
  const detailW = contentW - cardW - 18;
  const cardH = Math.max(118, 28 + detailRows.length * 18);

  doc.setFillColor(...INDIGO_DEEP);
  doc.roundedRect(margin, y, cardW, cardH, 4, 4, "F");
  doc.setFillColor(...INDIGO);
  doc.roundedRect(margin, y, cardW, cardH - 6, 4, 4, "F");

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(amountBoxLabel(receipt.amountCaption), margin + 14, y + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const amountLines = wrapText(doc, receipt.amount || "—", cardW - 28, 20);
  doc.text(amountLines, margin + 14, y + 48);

  if (phone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const phoneLabel = /\+?\d[\d\s-]{7,}/.test(phone) ? "Phone Number:" : "Account:";
    const phoneLines = wrapText(doc, `${phoneLabel} ${phone}`, cardW - 28, 9);
    doc.text(phoneLines, margin + 14, y + cardH - 18 - (phoneLines.length - 1) * 11);
  }

  let dy = y + 14;
  for (const row of detailRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`${row.label}:`, detailX, dy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    const valueLines = wrapText(doc, row.value, detailW - 4, 9);
    doc.text(valueLines, detailX, dy + 11);
    dy += 11 + valueLines.length * 11 + 6;
  }

  y += cardH + 28;

  // —— Barcode band ——
  drawBarcodeBand(doc, margin, y, contentW, 28);
  y += 48;

  // —— Footer contact (short letterhead style) ——
  doc.setTextColor(...INDIGO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Questions? Comments? Feel free to get in touch!", pageW / 2, y, {
    align: "center",
  });
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of MBOKA_LETTERHEAD.lines) {
    doc.text(line, pageW / 2, y, { align: "center" });
    y += 12;
  }
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Simple  ·  Transparent  ·  Honest", pageW / 2, y, { align: "center" });
  y += 28;

  // —— Bottom brand rule + mark ——
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(2.5);
  doc.line(margin, pageH - 42, pageW - margin - 70, pageH - 42);
  doc.setFillColor(...INDIGO);
  doc.roundedRect(pageW - margin - 58, pageH - 58, 58, 28, 6, 6, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(MBOKA_LETTERHEAD.product, pageW - margin - 29, pageH - 40, { align: "center" });

  if (receipt.footnote) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(receipt.footnote, margin, pageH - 18);
  }

  const filename = pdfFilename(filenameStem || receipt.fileTitle || "mboka-receipt");
  const blob = doc.output("blob");
  return {
    blob,
    filename,
    title: receipt.fileTitle || receipt.heading || "Mboka receipt",
  };
}

export function receiptPdfFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: "application/pdf" });
}

export function canSharePdfFile(file: File): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Share a receipt PDF via the system sheet when possible; otherwise download it.
 * Returns how the PDF was delivered.
 */
export async function shareReceiptPdf(opts: {
  blob: Blob;
  filename: string;
  title: string;
}): Promise<"shared" | "downloaded" | "aborted" | "failed"> {
  const file = receiptPdfFile(opts.blob, opts.filename);
  if (canSharePdfFile(file)) {
    try {
      await navigator.share({
        files: [file],
        title: opts.title,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "aborted";
    }
  }
  try {
    downloadPdfBlob(opts.blob, opts.filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}
