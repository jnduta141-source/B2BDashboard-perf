// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchStellarWalletPayments = vi.fn();

vi.mock("@/lib/stellar/walletPayments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar/walletPayments")>();
  return {
    ...actual,
    fetchStellarWalletPayments: (...args: unknown[]) => fetchStellarWalletPayments(...args),
  };
});

import {
  useStellarWalletPayments,
  useStellarWalletPaymentsForAccounts,
} from "./useStellarWalletPayments";

const ACCOUNT = "GBXCJB6GSHU7DBYBQ7OQQRD4GWDNYRSNU5KSAVQBJ4LXAZIA23CXOKEE";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("useStellarWalletPayments", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeClient();
    fetchStellarWalletPayments.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("loads Stellar USDC wallet payments under the network+address query key", async () => {
    fetchStellarWalletPayments.mockResolvedValue([
      {
        txHash: "abc123",
        amount: "10.50",
        direction: "in",
        from: "GFROM",
        to: ACCOUNT,
        memo: null,
        createdAt: "2026-08-20T12:00:00Z",
        pagingToken: "1",
      },
    ]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useStellarWalletPayments({
          network: "stellar_public",
          currency: "USDC",
          address: ACCOUNT,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    expect(fetchStellarWalletPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        account: ACCOUNT,
        limit: 25,
        horizonUrl: "https://horizon.stellar.org",
      }),
    );
    expect(
      queryClient.getQueryData(["stellar-wallet-payments", "stellar_public", ACCOUNT]),
    ).toEqual(result.current.data);
  });

  it("stays disabled for non-Stellar rails or invalid wallet addresses", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(
      () =>
        useStellarWalletPayments({
          network: "Base",
          currency: "USDC",
          address: ACCOUNT,
        }),
      { wrapper },
    );
    renderHook(
      () =>
        useStellarWalletPayments({
          network: "stellar_public",
          currency: "USDT",
          address: ACCOUNT,
        }),
      { wrapper },
    );
    renderHook(
      () =>
        useStellarWalletPayments({
          network: "stellar_public",
          currency: "USDC",
          address: "not-a-wallet",
        }),
      { wrapper },
    );

    await Promise.resolve();
    expect(fetchStellarWalletPayments).not.toHaveBeenCalled();
  });

  it("fails closed to an empty list when Horizon errors", async () => {
    fetchStellarWalletPayments.mockRejectedValue(new Error("Horizon unavailable"));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useStellarWalletPayments({
          network: "stellar_testnet",
          currency: "USDC",
          address: ACCOUNT,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([]);
    });
    expect(result.current.isError).toBe(false);
  });
});

describe("useStellarWalletPaymentsForAccounts", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeClient();
    fetchStellarWalletPayments.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("loads payments for every Stellar USDC wallet and skips other rails", async () => {
    fetchStellarWalletPayments.mockResolvedValue([
      {
        txHash: "abc123",
        amount: "10.50",
        direction: "in",
        from: "GFROM",
        to: ACCOUNT,
        memo: null,
        createdAt: "2026-08-20T12:00:00Z",
        pagingToken: "1",
      },
    ]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useStellarWalletPaymentsForAccounts([
          {
            id: "stellar-1",
            network: "stellar_public",
            currency: "USDC",
            walletAddress: ACCOUNT,
          },
          {
            id: "base-1",
            network: "Base",
            currency: "USDC",
            walletAddress: "0xabc",
          },
        ]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.payments).toHaveLength(1);
    });
    expect(fetchStellarWalletPayments).toHaveBeenCalledTimes(1);
    expect(result.current.payments[0]?.accountId).toBe("stellar-1");
    expect(result.current.isFetched).toBe(true);
  });
});
