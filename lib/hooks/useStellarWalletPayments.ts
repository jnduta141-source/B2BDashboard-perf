"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { StrKey } from "@stellar/stellar-sdk";
import { fetchStellarWalletPayments, type OnchainWalletPayment } from "@/lib/stellar/walletPayments";
import { isStellarUsdcRail, resolveStellarNetwork } from "@/lib/stellar/network";

export type UseStellarWalletPaymentsInput = {
  network: string | null | undefined;
  currency: string | null | undefined;
  address: string | null | undefined;
  limit?: number;
};

export type StellarWalletPaymentAccount = {
  id: string;
  network: string;
  currency: string;
  walletAddress?: string | null;
};

export type ContextualStellarWalletPayment = {
  accountId: string;
  network: string;
  payment: OnchainWalletPayment;
};

function isValidStellarWalletAddress(address: string | null | undefined): address is string {
  const value = String(address ?? "")
    .trim()
    .toUpperCase();
  return Boolean(value) && StrKey.isValidEd25519PublicKey(value);
}

function normalizeWalletAddress(address: string | null | undefined): string {
  return String(address ?? "")
    .trim()
    .toUpperCase();
}

async function loadStellarWalletPayments(opts: {
  network: string;
  address: string;
  limit: number;
}): Promise<OnchainWalletPayment[]> {
  try {
    const resolved = resolveStellarNetwork(opts.network);
    return await fetchStellarWalletPayments({
      horizonUrl: resolved.horizonUrl,
      account: opts.address,
      usdcIssuer: resolved.usdcIssuer,
      limit: opts.limit,
    });
  } catch {
    return [];
  }
}

export function useStellarWalletPayments(
  input: UseStellarWalletPaymentsInput,
) {
  const network = String(input.network ?? "").trim();
  const currency = String(input.currency ?? "").trim();
  const address = normalizeWalletAddress(input.address);
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit as number)) : 25;
  const enabled =
    isValidStellarWalletAddress(address) &&
    isStellarUsdcRail({
      network,
      currency,
    });

  return useQuery<OnchainWalletPayment[]>({
    queryKey: ["stellar-wallet-payments", network, address],
    enabled,
    retry: false,
    queryFn: () =>
      loadStellarWalletPayments({
        network,
        address,
        limit,
      }),
  });
}

/**
 * Horizon USDC payments for every Stellar USDC wallet — shared query keys with
 * `useStellarWalletPayments` so Account Detail and Home/Transactions share cache.
 */
export function useStellarWalletPaymentsForAccounts(
  accounts: StellarWalletPaymentAccount[],
  options: { limit?: number; enabled?: boolean } = {},
) {
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.floor(options.limit as number))
    : 25;
  const enabled = options.enabled ?? true;

  const targets = useMemo(() => {
    const seen = new Set<string>();
    const next: Array<{ id: string; network: string; address: string }> = [];
    for (const account of accounts) {
      const network = String(account.network ?? "").trim();
      const currency = String(account.currency ?? "").trim();
      const address = normalizeWalletAddress(account.walletAddress);
      if (!enabled) continue;
      if (!isValidStellarWalletAddress(address)) continue;
      if (!isStellarUsdcRail({ network, currency })) continue;
      const key = `${network}::${address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({ id: account.id, network, address });
    }
    return next;
  }, [accounts, enabled]);

  const queries = useQueries({
    queries: targets.map((target) => ({
      queryKey: ["stellar-wallet-payments", target.network, target.address],
      enabled: true,
      retry: false as const,
      queryFn: () =>
        loadStellarWalletPayments({
          network: target.network,
          address: target.address,
          limit,
        }),
    })),
  });

  const payments = useMemo(() => {
    const rows: ContextualStellarWalletPayment[] = [];
    const seenPayment = new Set<string>();
    targets.forEach((target, index) => {
      const list = queries[index]?.data ?? [];
      for (const payment of list) {
        const dedupeKey = `${payment.txHash.toLowerCase()}::${payment.direction}::${payment.pagingToken}`;
        if (seenPayment.has(dedupeKey)) continue;
        seenPayment.add(dedupeKey);
        rows.push({
          accountId: target.id,
          network: target.network,
          payment,
        });
      }
    });
    return rows;
  }, [queries, targets]);

  const isFetched = targets.length === 0 || queries.every((query) => query.isFetched);

  return {
    payments,
    isFetched,
    isFetching: queries.some((query) => query.isFetching),
  };
}
