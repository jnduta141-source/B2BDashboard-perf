// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TxDetailModal from "./TxDetailModal";

const STELLAR_HASH =
  "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";

function stellarDepositDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "acr_01hqxyzcredit0001",
    direction: "in",
    status: "completed",
    type: "Stellar deposit",
    client: "Deposit · USDC",
    amount: "+25.50 USDC",
    amountColor: "var(--success)",
    ref: STELLAR_HASH,
    statusLabel: "Completed",
    statusIcon: "✓",
    statusColor: "var(--success)",
    statusSoft: "var(--success-soft)",
    created_at: "2026-08-20T12:00:00Z",
    updated_at: "2026-08-20T12:00:00Z",
    tx_hash: STELLAR_HASH,
    crypto_network: "stellar_testnet",
    cryptoNetworkLabel: "Stellar",
    memo: null,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${STELLAR_HASH}`,
    provider: null,
    railType: null,
    networkName: null,
    partyName: null,
    accountNumber: null,
    psp_transaction_id: null,
    ...overrides,
  };
}

describe("TxDetailModal Stellar inbound rows", () => {
  it("shows Tx hash, explorer link, and network for a Stellar credit", () => {
    render(<TxDetailModal txDetail={stellarDepositDetail()} />);

    expect(screen.getByText("Tx hash")).toBeInTheDocument();
    expect(screen.getAllByText(STELLAR_HASH).length).toBeGreaterThanOrEqual(1);
    const link = screen.getByRole("link", { name: /view on chain/i });
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${STELLAR_HASH}`,
    );
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Stellar")).toBeInTheDocument();
    expect(screen.queryByText("Memo")).not.toBeInTheDocument();
  });

  it("shows memo when the API returned one", () => {
    render(<TxDetailModal txDetail={stellarDepositDetail({ memo: "invoice-9" })} />);
    expect(screen.getByText("Memo")).toBeInTheDocument();
    expect(screen.getByText("invoice-9")).toBeInTheDocument();
  });

  it("does not invent a Tx hash row when hash is missing", () => {
    render(
      <TxDetailModal
        txDetail={stellarDepositDetail({
          tx_hash: null,
          explorerUrl: null,
          ref: "acr_01hqxyzcredit0001",
        })}
      />,
    );
    expect(screen.queryByText("Tx hash")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view on chain/i })).not.toBeInTheDocument();
  });

  it("shows From, To, and Time for an on-chain Stellar payment", () => {
    render(
      <TxDetailModal
        txDetail={stellarDepositDetail({
          from_address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX",
          to_address: "GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFED",
          type: "Stellar send",
          client: "Payout · USDC",
          amount: "−2.00 USDC",
          direction: "out",
          hideReceipt: true,
        })}
      />,
    );

    expect(screen.getByText("From")).toBeInTheDocument();
    expect(
      screen.getByText("GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX"),
    ).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(
      screen.getByText("GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFED"),
    ).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view on chain/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download pdf/i })).not.toBeInTheDocument();
  });
});

describe("TxDetailModal receipt share sheet", () => {
  it("opens an opaque share sheet with a dismiss backdrop", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <TxDetailModal
        txDetail={stellarDepositDetail({
          type: "Deposit",
          client: "Deposit · KES",
          amount: "+300.00 KES",
          currency: "KES",
          amount_fiat: "300.00",
          hideReceipt: false,
          provider: "yellowcard",
          networkName: "M-PESA",
          partyName: "Elementpay",
          accountNumber: "+254720752314",
          accountKind: "phone",
          psp_transaction_id: "ws_CO_test",
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /share receipt/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss share menu/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /whatsapp/i })).toBeInTheDocument();
  });
});
