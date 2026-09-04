import { describe, expect, it } from "vitest";
import {
  RECEIPT_SHARE_METHODS,
  buildReceiptSharePayload,
  buildReceiptShareText,
  emailShareUrl,
  telegramShareUrl,
  whatsappShareUrl,
} from "@/lib/documents/receiptShare";
import { buildReceiptPdfBlob } from "@/lib/documents/receiptPdf";

const doc = {
  fileTitle: "Mboka — payout receipt",
  heading: "Payout receipt",
  statusBadge: "Settled",
  amount: "KES 1,000.00",
  amountCaption: "Amount sent",
  party: "Payout · KES",
  sections: [
    {
      title: "Payment",
      rows: [
        { label: "Recipient", value: "Jane Wanjiku" },
        { label: "M-Pesa number", value: "+254712345678" },
      ],
    },
  ],
  footnote: "Keep this receipt for your records.",
};

describe("receipt share methods", () => {
  it("lists PDF-first channels (no plain-text copy/html)", () => {
    expect(RECEIPT_SHARE_METHODS.map((m) => m.id)).toEqual([
      "device",
      "whatsapp",
      "email",
      "sms",
      "telegram",
      "pdf",
    ]);
    for (const method of RECEIPT_SHARE_METHODS) {
      expect(method.hint.toLowerCase()).toContain("pdf");
    }
  });

  it("builds a short caption that points at the PDF", () => {
    const text = buildReceiptShareText(doc);
    expect(text).toContain("Payout receipt");
    expect(text).toContain("Receipt PDF attached / downloaded");
    expect(text).toContain("Mboka business payments");
  });

  it("builds a .pdf payload and channel deep links for fallback captions", () => {
    const payload = buildReceiptSharePayload(doc, "mboka-receipt-inv-1");
    expect(payload.filename).toBe("mboka-receipt-inv-1.pdf");
    expect(payload.doc.heading).toBe("Payout receipt");
    expect(whatsappShareUrl(payload.text)).toContain("wa.me/?text=");
    expect(emailShareUrl(payload.title, payload.text)).toMatch(/^mailto:\?subject=/);
    expect(telegramShareUrl(payload.text)).toContain("t.me/share/url");
  });
});

describe("receipt PDF", () => {
  it("renders an application/pdf blob with the receipt amount", async () => {
    const { blob, filename, title } = buildReceiptPdfBlob(doc, "mboka-receipt-inv-1");
    expect(filename).toBe("mboka-receipt-inv-1.pdf");
    expect(title).toContain("payout receipt");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
    const header = await blob.slice(0, 5).text();
    expect(header).toBe("%PDF-");
  });
});
