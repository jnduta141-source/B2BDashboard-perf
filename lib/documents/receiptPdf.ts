/**
 * Client-side payment receipt PDF — shared via Web Share / download.
 * Layout mirrors the branded HTML receipt without requiring print.
 */

import { jsPDF } from "jspdf";
import { MBOKA_LETTERHEAD } from "@/lib/documents/letterhead";
import type { ReceiptShareDoc } from "@/lib/documents/receiptShare";

const INDIGO: [number, number, number] = [59, 46, 211];
const INK: [number, number, number] = [19, 17, 38];
const MUTED: [number, number, number] = [76, 74, 102];
const LINE: [number, number, number] = [220, 218, 230];
const TINT: [number, number, number] = [238, 237, 251];

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
  return doc.splitTextToSize(text || "", maxWidth) as string[];
}

/** Build a downloadable/shareable receipt PDF from the branded document model. */
export function buildReceiptPdfBlob(
  receipt: ReceiptShareDoc,
  filenameStem?: string,
): { blob: Blob; filename: string; title: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  // Brand mark (simple indigo square — matches letterhead colour)
  doc.setFillColor(...INDIGO);
  doc.roundedRect(margin, y, 28, 28, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("M", margin + 9, y + 18);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(MBOKA_LETTERHEAD.product, margin + 38, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(MBOKA_LETTERHEAD.tagline.toUpperCase(), margin + 38, y + 26);

  // Compact contact on the right
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const contactLines = [
    MBOKA_LETTERHEAD.email,
    "Wilmington, DE · Nairobi, Kenya",
  ];
  contactLines.forEach((line, i) => {
    doc.text(line, pageW - margin, y + 12 + i * 11, { align: "right" });
  });
  y += 48;

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 22;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const headingLines = wrapText(doc, receipt.heading, contentW, 20);
  ensureSpace(headingLines.length * 24 + 8);
  doc.text(headingLines, margin, y);
  y += headingLines.length * 22 + 6;

  if (receipt.statusBadge) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 122, 74);
    doc.text(receipt.statusBadge.toUpperCase(), margin, y);
    y += 18;
  }

  if (receipt.amount) {
    ensureSpace(72);
    doc.setFillColor(...TINT);
    doc.roundedRect(margin, y, contentW, 64, 8, 8, "F");
    doc.setTextColor(...INDIGO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (receipt.amountCaption) {
      doc.text(receipt.amountCaption.toUpperCase(), margin + 16, y + 20);
    }
    doc.setTextColor(...INK);
    doc.setFont("courier", "bold");
    doc.setFontSize(22);
    doc.text(receipt.amount, margin + 16, y + 44);
    if (receipt.party) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(receipt.party, margin + 16, y + 56);
    }
    y += 80;
  }

  for (const section of receipt.sections) {
    ensureSpace(36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(section.title.toUpperCase(), margin, y);
    y += 14;
    doc.setDrawColor(...LINE);
    doc.line(margin, y, pageW - margin, y);
    y += 12;

    for (const row of section.rows) {
      const labelW = contentW * 0.38;
      const valueW = contentW * 0.58;
      const labelLines = wrapText(doc, row.label, labelW, 10);
      const valueLines = wrapText(doc, row.value, valueW, 10);
      const rowH = Math.max(labelLines.length, valueLines.length) * 13 + 10;
      ensureSpace(rowH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(labelLines, margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(valueLines, margin + labelW + 8, y);
      y += rowH;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.4);
      doc.line(margin, y - 6, pageW - margin, y - 6);
    }
    y += 10;
  }

  ensureSpace(90);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const foot = [
    receipt.footnote,
    `Generated ${new Date().toLocaleString()} · ${MBOKA_LETTERHEAD.product} business payments.`,
    "This is a computer-generated receipt and does not require a signature.",
    "",
    "United States — Elementpay Inc., 1007 N Orange St, 4th Floor, Ste 1382, Wilmington, DE 19801",
    "Kenya — Elementpay Inc., Fedha Plaza, Parklands Road, Nairobi, Kenya",
    MBOKA_LETTERHEAD.email,
  ].filter(Boolean) as string[];
  for (const line of foot) {
    const lines = wrapText(doc, line, contentW, 8);
    ensureSpace(lines.length * 11 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 11 + 2;
  }

  const filename = pdfFilename(filenameStem || receipt.fileTitle || "mboka-receipt");
  const blob = doc.output("blob");
  return {
    blob,
    filename,
    title: receipt.fileTitle || receipt.heading || "Mboka receipt",
  };
}

export function receiptPdfFile(
  blob: Blob,
  filename: string,
): File {
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
      // Fall through to download when a target rejects the file payload.
    }
  }
  try {
    downloadPdfBlob(opts.blob, opts.filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}
