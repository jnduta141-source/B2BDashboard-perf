import { apiEnvelope } from "@/lib/apiClient";
import type { AuthMe } from "@/lib/services/auth";
import type { DepositAccount, DepositAccountEligibility } from "@/lib/services/depositAccounts";
import type { ExchangeRates } from "@/lib/services/dashboard";
import type { FinancialAccount } from "@/lib/services/entities";
import { normalizeExchangeRates } from "@/lib/services/dashboard";
import { toPartnerNetwork } from "@/lib/services/entities";

/**
 * `GET /v1/bootstrap` — post-login Home aggregate from Mboka.
 * See Mboka-Backend `app/schema/bootstrap.py`.
 */

export type BootstrapBalance = {
  available?: string | null;
  current?: string | null;
  currency?: string | null;
};

export type BootstrapAccount = {
  id: string;
  entity_id: string;
  kind: "fiat_deposit" | "stablecoin";
  asset_type: "fiat" | "stablecoin";
  currency: string;
  network?: string | null;
  status: string;
  display_name?: string | null;
  iban?: string | null;
  bic?: string | null;
  bank_name?: string | null;
  account_holder_name?: string | null;
  wallet_address?: string | null;
  balance?: BootstrapBalance | null;
};

export type BootstrapIdentity = {
  user_id: number | null;
  business_id: number | null;
  business_name: string | null;
  role: string | null;
  permissions: string[];
  kyb_status: string | null;
};

export type BootstrapEligibility = {
  eligible: boolean;
  can_issue_iban: boolean;
  can_open_stablecoin: boolean;
  primary_entity_id: string | null;
  verification_status: string;
};

export type BootstrapOut = {
  identity: BootstrapIdentity;
  eligibility: BootstrapEligibility;
  treasury: { wallet_address: string | null };
  fx_rates: ExchangeRates | Record<string, unknown> | null;
  accounts: BootstrapAccount[];
};

export type DashboardBootstrap = {
  raw: BootstrapOut;
  identity: BootstrapIdentity;
  eligibility: DepositAccountEligibility;
  primaryEntityId: string | null;
  treasuryWallet: string | null;
  fxRates: ExchangeRates | null;
  fiatAccounts: DepositAccount[];
  stablecoinAccounts: FinancialAccount[];
  /** Partial auth-me seed from bootstrap identity (name/role/KYB). */
  authMePatch: Partial<AuthMe> & Pick<AuthMe, "role" | "kyb_summary">;
};

function mapFiat(row: BootstrapAccount): DepositAccount {
  const status =
    row.status === "active" || row.status === "pending" || row.status === "unavailable"
      ? row.status
      : "pending";
  return {
    id: row.id,
    entity_id: row.entity_id,
    currency: row.currency,
    status,
    account_holder_name: row.account_holder_name ?? null,
    iban: row.iban ?? null,
    bic: row.bic ?? null,
    bank_name: row.bank_name ?? null,
    balance: row.balance
      ? {
          available: row.balance.available ?? null,
          current: row.balance.current ?? null,
          currency: row.balance.currency ?? row.currency,
        }
      : null,
  };
}

function mapStablecoin(row: BootstrapAccount): FinancialAccount | null {
  if (!row.id || !row.entity_id) return null;
  const partner = toPartnerNetwork(row.network) || (row.network || "").trim();
  return {
    id: String(row.id),
    entityId: String(row.entity_id),
    assetType: "stablecoin",
    currency: (row.currency || "USDC").toUpperCase(),
    network: partner || "Base",
    status: row.status || "pending",
    walletAddress: row.wallet_address ?? null,
    balance: row.balance
      ? {
          available: row.balance.available ?? null,
          current: row.balance.current ?? null,
          currency: row.balance.currency ?? row.currency,
        }
      : null,
  };
}

function normalizeBootstrapFx(
  fx: BootstrapOut["fx_rates"],
): ExchangeRates | null {
  if (!fx || typeof fx !== "object") return null;
  // Summary-shaped: { base, rates }
  if ("base" in fx && "rates" in fx) {
    return normalizeExchangeRates(fx as ExchangeRates);
  }
  // Flat map of quote → rate (USD base assumed)
  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(fx)) {
    if (key === "base" || key === "rates") continue;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    rates[key.toUpperCase()] = n;
  }
  if (Object.keys(rates).length === 0) return null;
  return normalizeExchangeRates({ base: "USD", rates });
}

export function mapBootstrap(raw: BootstrapOut): DashboardBootstrap {
  const fiatAccounts: DepositAccount[] = [];
  const stablecoinAccounts: FinancialAccount[] = [];
  for (const row of raw.accounts ?? []) {
    if (row.kind === "fiat_deposit" || row.asset_type === "fiat") {
      fiatAccounts.push(mapFiat(row));
    } else if (row.kind === "stablecoin" || row.asset_type === "stablecoin") {
      const mapped = mapStablecoin(row);
      if (mapped) stablecoinAccounts.push(mapped);
    }
  }

  const identity = raw.identity;
  const authMePatch: DashboardBootstrap["authMePatch"] = {
    role: identity.role,
    // Status-only hint for /auth/me cache. Callers must merge into an existing
    // profile — never replace a full kyb_summary with this stub alone.
    kyb_summary: identity.kyb_status
      ? { profile: { kyb_status: identity.kyb_status } }
      : null,
    business:
      typeof identity.business_id === "number"
        ? {
            id: identity.business_id,
            name: identity.business_name?.trim() || "Your business",
            legal_name: null,
            country: "",
            status: "active",
            kyb_verified: identity.kyb_status === "approved",
            registration_number: null,
          }
        : null,
  };

  return {
    raw,
    identity,
    eligibility: {
      eligible: Boolean(raw.eligibility?.eligible),
      verification_status: String(raw.eligibility?.verification_status || "pending"),
    },
    primaryEntityId: raw.eligibility?.primary_entity_id ?? null,
    treasuryWallet: raw.treasury?.wallet_address ?? null,
    fxRates: normalizeBootstrapFx(raw.fx_rates),
    fiatAccounts,
    stablecoinAccounts,
    authMePatch,
  };
}

export const bootstrapApi = {
  get: async (): Promise<DashboardBootstrap> => {
    const raw = await apiEnvelope<BootstrapOut>("GET", "/v1/bootstrap");
    return mapBootstrap(raw);
  },
};
