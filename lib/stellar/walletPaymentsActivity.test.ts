// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityItem } from "@/components/ui/ActivityList";
import {
  mergeWalletPaymentsWithElementActivity,
  walletPaymentToActivityItem,
  type LinkedWalletActivityItem,
} from "./walletPaymentsActivity";
import type { OnchainWalletPayment } from "./walletPayments";

const HASH =
  "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";
const OTHER_HASH =
  "f1e2d3c4b5a6789012345678901234567890abcdef1234567890abcdef123456";

function payment(overrides: Partial<OnchainWalletPayment> = {}): OnchainWalletPayment {
  return {
    txHash: HASH,
    amount: "25.50",
    direction: "in",
    from: "GFROMACCOUNT12345678901234567890123456789012345678901234",
    to: "GDESTACCOUNT12345678901234567890123456789012345678901234",
    memo: "INV-42",
    createdAt: "2026-08-20T12:00:00Z",
    pagingToken: "123",
    ...overrides,
  };
}

function elementActivity(
  overrides: Partial<LinkedWalletActivityItem> = {},
): LinkedWalletActivityItem {
  const base: ActivityItem = {
    id: "acr_1",
    client: "Deposit · USDC",
    type: "Stellar deposit",
    amount: "+25.50 USDC",
    amountColor: "var(--success)",
    statusLabel: "Settled",
    statusIcon: "✓",
    statusColor: "var(--success)",
    statusSoft: "var(--success-tint)",
    dateLabel: "Today, 03:00 PM",
    meta: "Today, 03:00 PM · Ref a1b2c3d4e5…123456",
    openDetail: vi.fn(),
  };
  return {
    ...base,
    tx_hash: HASH,
    created_at: "2026-08-20T12:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("walletPaymentToActivityItem", () => {
  it("maps inbound on-chain payments into the existing ActivityList shape", () => {
    const item = walletPaymentToActivityItem(payment(), {
      network: "stellar_testnet",
    });

    expect(item.client).toBe("Deposit · USDC");
    expect(item.type).toBe("Stellar deposit");
    expect(item.amount).toBe("+25.50 USDC");
    expect(item.statusLabel).toBe("Settled");
    expect(item.meta).toContain("Tx a1b2c3d4e5");
  });

  it("maps outbound on-chain payments and opens in-app detail (not the explorer)", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const onOpenDetail = vi.fn();
    const outbound = payment({
      direction: "out",
      amount: "9",
      txHash: OTHER_HASH,
    });
    const item = walletPaymentToActivityItem(outbound, {
      network: "stellar_public",
      onOpenDetail,
    });

    expect(item.client).toBe("Payout · USDC");
    expect(item.type).toBe("Stellar send");
    expect(item.amount).toBe("−9.00 USDC");
    item.openDetail?.();
    expect(onOpenDetail).toHaveBeenCalledWith(outbound);
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("presentOnchainWalletPayment", () => {
  it("includes from, to, time, and explorer URL for the detail modal", async () => {
    const { presentOnchainWalletPayment } = await import("./walletPaymentsActivity");
    const presented = presentOnchainWalletPayment(payment(), {
      network: "stellar_testnet",
    });

    expect(presented.from_address).toBe(payment().from);
    expect(presented.to_address).toBe(payment().to);
    expect(presented.created_at).toBe("2026-08-20T12:00:00Z");
    expect(presented.tx_hash).toBe(HASH);
    expect(presented.explorerUrl).toContain("/testnet/tx/");
    expect(presented.hideReceipt).toBe(true);
    expect(presented.id).toBe(`onchain:${HASH}`);
  });
});

describe("mergeWalletPaymentsWithElementActivity", () => {
  it("prefers ElementPay presentation when the tx hash already exists there", () => {
    const linked = elementActivity();
    const merged = mergeWalletPaymentsWithElementActivity({
      payments: [
        payment(),
        payment({
          txHash: OTHER_HASH,
          amount: "9.50",
          direction: "out",
          createdAt: "2026-08-19T10:00:00Z",
          pagingToken: "122",
        }),
      ],
      elementActivity: [linked],
      network: "stellar_testnet",
      limit: 25,
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(linked);
    expect(merged[1]).toMatchObject({
      type: "Stellar send",
      amount: "−9.50 USDC",
    });
  });

  it("keeps only the requested number of on-chain rows", () => {
    const merged = mergeWalletPaymentsWithElementActivity({
      payments: [
        payment({ txHash: "hash-1", pagingToken: "1", createdAt: "2026-08-20T12:00:00Z" }),
        payment({ txHash: "hash-2", pagingToken: "2", createdAt: "2026-08-20T11:00:00Z" }),
      ],
      elementActivity: [],
      network: "stellar_testnet",
      limit: 1,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("onchain:hash-1");
  });

  it("preserves ElementPay activity when Horizon returns no payments", () => {
    const linked = elementActivity();
    const older = elementActivity({
      id: "acr_older",
      tx_hash: "olderhash",
      created_at: "2026-08-19T10:00:00Z",
    });
    const merged = mergeWalletPaymentsWithElementActivity({
      payments: [],
      elementActivity: [linked, older],
      network: "stellar_testnet",
      limit: 25,
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(linked);
    expect(merged[1]).toBe(older);
  });
});

describe("presentUnmatchedOnchainPayments + mergePresentedActivityRows", () => {
  it("surfaces unmatched on-chain rows for Home / Transactions merges", async () => {
    const {
      collectPresentedTxHashes,
      mergePresentedActivityRows,
      presentUnmatchedOnchainPayments,
    } = await import("./walletPaymentsActivity");

    const linked = elementActivity();
    const unmatched = presentUnmatchedOnchainPayments({
      payments: [
        { network: "stellar_testnet", payment: payment() },
        {
          network: "stellar_testnet",
          payment: payment({
            txHash: OTHER_HASH,
            amount: "9.50",
            direction: "out",
            createdAt: "2026-08-21T10:00:00Z",
            pagingToken: "122",
          }),
        },
      ],
      elementTxHashes: collectPresentedTxHashes([linked]),
    });

    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.id).toBe(`onchain:${OTHER_HASH}`);

    const merged = mergePresentedActivityRows([linked], unmatched, 4);
    expect(merged[0]?.id).toBe(`onchain:${OTHER_HASH}`);
    expect(merged[1]).toBe(linked);
  });

  it("filters presented on-chain rows by direction and currency", async () => {
    const { filterPresentedActivityRows, presentUnmatchedOnchainPayments } =
      await import("./walletPaymentsActivity");
    const rows = presentUnmatchedOnchainPayments({
      payments: [
        { network: "stellar_testnet", payment: payment({ direction: "in" }) },
        {
          network: "stellar_testnet",
          payment: payment({
            txHash: OTHER_HASH,
            direction: "out",
            amount: "2",
            createdAt: "2026-08-21T10:00:00Z",
            pagingToken: "122",
          }),
        },
      ],
      elementTxHashes: new Set(),
    });

    expect(
      filterPresentedActivityRows(rows, { primary: "outgoing", currency: "USDC" }),
    ).toHaveLength(1);
    expect(
      filterPresentedActivityRows(rows, { primary: "incoming" })[0]?.direction,
    ).toBe("in");
  });
});
