import { describe, expect, it } from "vitest";
import { renderBrandedDocument } from "@/lib/documents/brandedDocument";
import {
  buildTransactionReceipt,
  isReceiptable,
  receiptFilename,
  receiptPaymentMethod,
  receiptPaymentRefLabel,
  type ReceiptTransaction,
} from "@/lib/documents/transactionReceipt";

const settledPayout: ReceiptTransaction = {
  id: 4821,
  direction: "out",
  status: "completed",
  amount_fiat: "41300.00",
  currency: "KES",
  aggregator_order_id: "YC-f423126f-9666-53e3-ab99-d5d0da4a284e",
  external_order_id: "inv-2026-014",
  psp_transaction_id: "QJH7K2M0X1",
  provider: "yellowcard",
  networkName: "M-PESA",
  partyName: "Jane Wanjiku",
  accountNumber: "+254712345678",
  accountKind: "phone",
  methodType: "mobile_money",
  created_at: "2026-08-14T09:15:00Z",
  updated_at: "2026-08-14T09:17:30Z",
  client: "Payout · KES",
};

describe("isReceiptable", () => {
  it("only offers a receipt once the order has settled", () => {
    expect(isReceiptable("completed")).toBe(true);
    expect(isReceiptable("processing")).toBe(false);
    expect(isReceiptable("failed")).toBe(false);
    expect(isReceiptable("refunded")).toBe(false);
    expect(isReceiptable(undefined)).toBe(false);
  });
});

describe("receiptPaymentMethod", () => {
  it("surfaces M-Pesa and bank rails without aggregator brands", () => {
    expect(receiptPaymentMethod("M-Pesa")).toBe("M-Pesa");
    expect(receiptPaymentMethod("yellowcard")).toBe("Local transfer");
    expect(receiptPaymentMethod("yellowcard", null, "M-PESA")).toBe("M-Pesa");
    expect(receiptPaymentMethod("NCBA Bank Kenya")).toBe("Bank transfer");
    expect(receiptPaymentMethod(null, "mobile")).toBe("Mobile money");
  });
});

describe("buildTransactionReceipt", () => {
  it("builds a web2 payout receipt with payment refs and no crypto fields", () => {
    const doc = buildTransactionReceipt(settledPayout);
    expect(doc.heading).toBe("Payout receipt");
    expect(doc.amount).toBe("KES 41,300.00");
    expect(doc.amountCaption).toBe("Amount sent");
    expect(doc.statusBadge).toBe("Settled");
    expect(doc.party).toBe("Payout · KES");

    const payment = doc.sections.find((s) => s.title === "Payment");
    expect(payment?.rows).toEqual(
      expect.arrayContaining([
        { label: "Payment method", value: "M-Pesa" },
        { label: "Currency", value: "KES" },
        { label: "Recipient", value: "Jane Wanjiku" },
        { label: "M-Pesa number", value: "+254712345678", mono: true },
        { label: "M-Pesa reference", value: "QJH7K2M0X1", mono: true },
      ]),
    );

    const html = renderBrandedDocument(doc);
    expect(html).not.toContain("Wallet");
    expect(html).not.toContain("Settlement asset");
    expect(html).not.toContain("0x9F2c");
    expect(html).not.toContain("USDC");
    expect(html).toContain("Download PDF");
    expect(html).toContain("Nairobi, Kenya");
    expect(html).toContain("info@elementpay.net");
    expect(html).not.toContain("support@mboka.africa");
    expect(html).not.toContain("Wilmington, DE 19801");
    expect(html).not.toContain("Fedha Plaza");
    expect(html).toContain('aria-label="Mboka"');
    expect(html).toContain("Recipient");
    expect(html).toContain("+254712345678");
    expect(html).toContain("M-Pesa reference");
    expect(html).toContain('id="share-toggle"');
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Messages / SMS");
    expect(html).toContain("Telegram");
    expect(html).toContain("Share PDF");
    expect(html).not.toContain("Copy details");
    expect(html).not.toContain("Save as file");
  });

  it("labels an inbound order as a deposit", () => {
    const doc = buildTransactionReceipt({ ...settledPayout, direction: "in" });
    expect(doc.heading).toBe("Deposit receipt");
    expect(doc.amountCaption).toBe("Amount received");
  });

  it("omits payment reference when the PSP id is missing", () => {
    const doc = buildTransactionReceipt({
      id: 7,
      direction: "unknown",
      status: "completed",
      amount_fiat: "10.00",
      currency: "USD",
      aggregator_order_id: null,
      external_order_id: null,
      psp_transaction_id: null,
      created_at: null,
      updated_at: null,
    });
    expect(doc.heading).toBe("Payment receipt");
    const payment = doc.sections.find((s) => s.title === "Payment");
    expect(payment?.rows.map((r) => r.label)).toEqual(["Payment method", "Currency"]);
    expect(
      doc.sections.find((s) => s.title === "References")?.rows.map((r) => r.label),
    ).toContain("Receipt number");
  });

  it("uses bank reference label for bank rails", () => {
    expect(receiptPaymentRefLabel("Equity Bank", "bank")).toBe("Bank reference");
  });
  it("includes the on-chain tx hash in References when present", () => {
    const hash =
      "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";
    const doc = buildTransactionReceipt({
      id: "acr_01hqxyzcredit0001",
      direction: "in",
      status: "completed",
      amount_fiat: "25.50",
      currency: "USDC",
      aggregator_order_id: null,
      external_order_id: null,
      psp_transaction_id: null,
      tx_hash: hash,
      created_at: "2026-08-20T12:00:00Z",
      updated_at: "2026-08-20T12:00:00Z",
      client: "Deposit · USDC",
    });
    const refs = doc.sections.find((s) => s.title === "References");
    expect(refs?.rows).toEqual(
      expect.arrayContaining([
        { label: "Tx hash", value: hash, mono: true },
      ]),
    );
  });

  it("omits Tx hash when the API did not return one", () => {
    const doc = buildTransactionReceipt(settledPayout);
    const refs = doc.sections.find((s) => s.title === "References");
    expect(refs?.rows.map((r) => r.label)).not.toContain("Tx hash");
  });
});

describe("receiptFilename", () => {
  it("prefers the customer reference and stays filesystem-safe", () => {
    expect(receiptFilename(settledPayout)).toBe("mboka-receipt-inv-2026-014");
    expect(
      receiptFilename({ ...settledPayout, external_order_id: "AGG/77 123" }),
    ).toBe("mboka-receipt-agg-77-123");
  });

  it("falls back to a Mboka id", () => {
    expect(
      receiptFilename({
        ...settledPayout,
        aggregator_order_id: null,
        external_order_id: null,
      }),
    ).toBe("mboka-receipt-mbk-4821");
  });
});

describe("renderBrandedDocument", () => {
  it("escapes values so a recipient name cannot inject markup", () => {
    const html = renderBrandedDocument(
      buildTransactionReceipt({
        ...settledPayout,
        external_order_id: '<img src=x onerror="alert(1)">',
      }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("embeds the wordmark inline rather than linking an asset", () => {
    const html = renderBrandedDocument(buildTransactionReceipt(settledPayout));
    expect(html).toContain('viewBox="0 0 166 44"');
    expect(html).toContain("#3B2ED3");
    expect(html).toContain('fill-opacity="0.45"');
  });
});
