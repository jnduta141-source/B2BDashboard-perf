/**
 * Share targets for settled payment receipts.
 *
 * Receipts are shared as a PDF file (Web Share Level 2) with download fallback.
 * Channel deep links cannot attach files, so named channels also share/download
 * the PDF rather than pasting a text summary.
 */

export type ReceiptShareDoc = {
  fileTitle: string;
  heading: string;
  statusBadge?: string;
  amount?: string;
  amountCaption?: string;
  party?: string;
  sections: { title: string; rows: { label: string; value: string }[] }[];
  footnote?: string;
};

export type ReceiptSharePayload = {
  title: string;
  /** Short caption used only when a channel opens without a file attach API. */
  text: string;
  filename: string;
  /** Structured fields for PDF builders (app + preview window). */
  doc: ReceiptShareDoc;
};

export type ReceiptShareMethodId =
  | "device"
  | "whatsapp"
  | "email"
  | "sms"
  | "telegram"
  | "pdf";

export type ReceiptShareMethod = {
  id: ReceiptShareMethodId;
  label: string;
  /** Short hint under the label in menus. */
  hint: string;
};

/** All share paths we surface for a receipt (order is intentional). */
export const RECEIPT_SHARE_METHODS: ReceiptShareMethod[] = [
  {
    id: "device",
    label: "Share PDF",
    hint: "Share the receipt PDF via the system sheet",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    hint: "Share the receipt PDF",
  },
  {
    id: "email",
    label: "Email",
    hint: "Share the receipt PDF",
  },
  {
    id: "sms",
    label: "Messages / SMS",
    hint: "Share the receipt PDF",
  },
  {
    id: "telegram",
    label: "Telegram",
    hint: "Share the receipt PDF",
  },
  {
    id: "pdf",
    label: "Download PDF",
    hint: "Save the receipt as a PDF file",
  },
];

/** Short message kept beside the PDF when a target still needs body text. */
export function buildReceiptShareText(doc: ReceiptShareDoc): string {
  const bits = [
    doc.heading,
    doc.statusBadge ? `Status: ${doc.statusBadge}` : "",
    doc.amountCaption && doc.amount ? `${doc.amountCaption}: ${doc.amount}` : doc.amount || "",
  ].filter(Boolean);
  bits.push("");
  bits.push("Receipt PDF attached / downloaded.");
  bits.push("— Mboka business payments");
  return bits.join("\n");
}

export function buildReceiptSharePayload(
  doc: ReceiptShareDoc,
  filenameStem: string,
): ReceiptSharePayload {
  const stem = filenameStem.replace(/\.(pdf|html)$/i, "").trim() || "mboka-receipt";
  return {
    title: doc.fileTitle || doc.heading,
    text: buildReceiptShareText(doc),
    filename: `${stem}.pdf`,
    doc,
  };
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function emailShareUrl(title: string, text: string): string {
  return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
}

export function smsShareUrl(text: string): string {
  // iOS wants &body=, Android often accepts ?body= — dual form works widely.
  return `sms:?&body=${encodeURIComponent(text)}`;
}

export function telegramShareUrl(text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent("https://mboka.africa")}&text=${encodeURIComponent(text)}`;
}

export function canUseDeviceShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareViaDevice(payload: ReceiptSharePayload): Promise<boolean> {
  // Prefer PDF file share — implemented in receiptPdf.shareReceiptPdf.
  // Kept for callers that only have text; prefer shareReceiptPdf at call sites.
  if (!canUseDeviceShare()) return false;
  try {
    await navigator.share({
      title: payload.title,
      text: payload.text,
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return true;
    return false;
  }
}
