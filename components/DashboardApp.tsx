"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  flagUrl, COUNTRIES, MOBILE_CURRENCIES, BANK_CURRENCIES,
  DEPOSIT_NETWORKS, ACCOUNTS, ROLES, TEAM_MEMBERS,
  CORRIDORS, STATUS_MAP,
  LIGHT, DARK, DARK_HC_OVERRIDES, qp,
} from "./mockData";
import {
  dashboardApi,
  liveRateRowsFromSummary,
  mergeExchangeRates,
} from "@/lib/services/dashboard";
import { transactionsApi, type Transaction } from "@/lib/services/transactions";
import { presentTransaction } from "@/lib/services/transactionPresentation";
import { describeTransactionStatus } from "@/lib/services/transactionStatus";
import {
  PRIMARY_TX_FILTERS,
  searchTransactions,
  type PrimaryTransactionFilter,
} from "@/lib/services/transactionFilters";
import { useTransactionsPage } from "@/lib/hooks/useTransactionsPage";
import { authApi, type AuthMe } from "@/lib/services/auth";
import { bootstrapApi } from "@/lib/services/bootstrap";
import { invoicesApi, buildSimpleDraftPayload } from "@/lib/services/invoices";
import { apiKeysApi } from "@/lib/services/apiKeys";
import {
  depositAccountsApi,
  mapDepositAccountToCardView,
  buildDepositAccountDetailRows,
  currencyIso,
  currencyLabel,
  occupiedFiatCurrencyCodes,
  SUPPORTED_IBAN_CURRENCIES,
  SUPPORTED_STABLECOIN_NETWORKS,
} from "@/lib/services/depositAccounts";
import {
  ordersApi,
  buildSendQuotePayload,
  buildDepositQuotePayload,
  buildPaymentInstructionRows,
  formatQuoteFees,
  toE164,
  isQuoteExpiredError,
  isQuoteAlreadyAcceptedError,
  newIdempotencyKey,
} from "@/lib/services/orders";
import {
  accountSendsApi,
  buildSendPreviewPayload,
  explainAccountSendError,
  sendCryptoRecipientPlaceholder,
  SEND_STABLECOIN_NETWORKS,
} from "@/lib/services/accountSends";
import {
  createSavedRecipient,
  listSavedRecipients,
  type SavedRecipient,
  type SavedRecipientRail,
} from "@/lib/clients/savedRecipientsApi";
import {
  accountForNetwork,
  listSendableStablecoinAccounts,
  listStablecoinAccounts,
  resolvePrimaryEntityId,
  buildStablecoinOpenPayload,
  entitiesApi,
  describeStablecoinAccountStatus,
  buildStablecoinAccountDetailRows,
  buildFundStablecoinRails,
  formatNetworkLabel,
  isReadyStatus,
  isFundableStablecoinAccount,
  occupiedStablecoinNetworkCodes,
  isClosedStatus,
  isCloseableStablecoinAccount,
  stablecoinStatusTone,
  toPartnerNetwork,
  toUiNetworkKey,
} from "@/lib/services/entities";
import { useOrderStatus } from "@/lib/hooks/useOrderStatus";
import {
  offRampProvidersForRail,
  onRampProvidersForRail,
  networkIdForProvider,
  providerNamesFromCatalog,
} from "@/lib/services/catalog";
import { setSessionLostHandler, ApiRequestError } from "@/lib/apiClient";
import {
  resolveTreasuryWalletAddress,
} from "@/lib/services/treasuryWallet";
import {
  canEnterInLocalCurrency,
  describeAmountEquivalent,
  formatFeeDual,
  formatRateLine,
  indicativeRate,
  toPayloadUsdAmount,
} from "@/lib/services/sendAmount";
import { useViewport } from "@/lib/responsive";
import {
  buildSendDestinationSummary,
  buildSendStepDots,
  friendlySendQuoteError,
  railIndexForMethod,
  sendRailBlockedByMissingNetworkId,
  sendRailHasChoice as railHasChoice,
} from "@/lib/hooks/sendFlowHelpers";
import { buildDepositDestinationSummary, buildDepositStepDots, countryRailsLabel, countrySearchHaystack, ensureSelectedProvider, indexOfProviderName, resolveQuotedProviderName } from "@/lib/hooks/depositFlowHelpers";
import { channelLabelForRail } from "@/lib/services/channelLabels";
import { useSendCatalog } from "@/lib/hooks/useSendCatalog";
import {
  assertSufficientBalance,
  DEFAULT_DISPLAY_CURRENCY,
  displayCurrencyOptionsFromCatalog,
  formatAccountBalance,
  formatSummedBalance,
  formatHeroTotalLabel,
  formatUsdEquivalentSub,
  isDisplayCurrency,
  parseBalanceNumber,
  pendingBalanceFromAccount,
  readStoredDisplayCurrency,
  resolveDisplayCurrency,
  totalBalanceInDisplayCurrency,
  writeStoredDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/services/balances";
import {
  conversionsApi,
  secondsUntilExpiry,
  type ConversionOut,
} from "@/lib/services/conversions";
import ConvertFlow, { type ConvertMode } from "@/components/convert/ConvertFlow";
import {
  cardsApi,
  cardholderPrefillFromKybProfile,
  cardPlasticBg,
  describeCardStatus,
  describeUsdFunding,
  describeUsdFundingIssueNote,
  isValidCardE164,
  isValidCardholderEmail,
  newCardReference,
  resolveUsdFundingAccount,
  type IssuedCard,
  type UsdFundingAccount,
} from "@/lib/services/cards";

import ActivityList, { type ActivityItem } from "@/components/ui/ActivityList";
import ChoicePicker from "@/components/ui/ChoicePicker";
import InvoiceList from "@/components/ui/InvoiceList";
import ComingSoonPanel from "@/components/ui/ComingSoonPanel";
import StatusBadge from "@/components/ui/StatusBadge";
import SectionHeader from "@/components/ui/SectionHeader";
import HomeIdentity from "@/components/home/HomeIdentity";
import SendModal from "@/components/send/SendModal";
import MbokaMark from "@/components/brand/MbokaMark";
import DesktopSidebar from "@/components/navigation/DesktopSidebar";
import HeaderRates from "@/components/navigation/HeaderRates";
import MobileBottomNav from "@/components/navigation/MobileBottomNav";
import MoreSheet from "@/components/navigation/MoreSheet";
import TransactionsScreen from "@/components/transactions/TransactionsScreen";
import TxDetailModal from "@/components/transactions/TxDetailModal";
import WalletsScreen from "@/components/wallets/WalletsScreen";
import CreateAccountModal from "@/components/wallets/CreateAccountModal";
import AccountDetailModal from "@/components/wallets/AccountDetailModal";
import AccountDetailScreen from "@/components/wallets/AccountDetailScreen";

function fiatRailForCurrency(code: string): string {
  const c = code.toUpperCase();
  if (c === "EUR") return "IBAN · SEPA";
  if (c === "GBP") return "IBAN · Faster Pay";
  if (c === "USD") return "IBAN · SWIFT";
  if (c === "KES") return "Mobile money";
  return "Bank transfer";
}

import FundChooserModal, { type FundChooserOption } from "@/components/wallets/FundChooserModal";
import CloseAccountModal, { type CloseAccountAction } from "@/components/wallets/CloseAccountModal";
import FundStablecoinModal from "@/components/wallets/FundStablecoinModal";
import {
  africanFundDisabledReason,
  planAfricanFundOrchestration,
} from "@/lib/services/fundOrchestration";
import {
  describeMissingOnRampDestination,
  resolveAfricanFundOpenIntent,
  resolveOnRampDestination,
  resolveStablecoinPickerDestination,
  stablecoinNetworksForAsset,
} from "@/lib/services/depositRampDestination";
import DepositModal from "@/components/deposit/DepositModal";
import ReceiveModal from "@/components/deposit/ReceiveModal";
import VerificationScreen from "@/components/verification/VerificationScreen";
import KybWizardModal from "@/components/verification/KybWizardModal";
import KybGateBanner from "@/components/verification/KybGateBanner";
import { useKybWizard } from "@/lib/hooks/useKybWizard";
import { canOpenKybWizard, describeKybStatus, isKybApproved, kybTierDisplay, mergeKybSummaryCache } from "@/lib/services/kyb";

type Props = {
  boostDarkContrast?: boolean;
  forceMobile?: boolean;
  startScreen?: string;
  startTheme?: string;
};

export default function DashboardApp(props: Props = {}) {
  const router = useRouter();
  const viewport = useViewport(props.forceMobile);
  const isCompact = viewport.isCompact;
  const isMobile = viewport.isMobile;

  const rootRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastModalFocusRef = useRef<HTMLElement | null>(null);

  const [state, setStateRaw] = useState<any>(() => ({
    theme: props.startTheme || "light", screen: props.startScreen || "home",
    sidebarOpen: false,
    moreOpen: false,
    modal: null as string | null,
    /** Where Back from a money flow should return (home / accountDetail / …). */
    moneyFlowReturn: null as string | null,
    sendStep: 1, sendMethod: null as null | "bank" | "mobile" | "crypto" | "internal",
    sendCountryIdx: 0, sendRailIdx: 0, sendProviderIdx: 0, sendRecipient: "", sendRecipientName: "", sendAmount: "", sendAmountCurrency: "USD", sendDone: false, sendAsset: "usdc", sendChain: "base",
    sendQuote: null as any, sendQuoteLoading: false, sendQuoteError: "", sendAccept: null as any, sendAccepting: false, sendAcceptError: "",
    sendPreview: null as any, sendConfirm: null as any, sendAccountId: "",
    depositStep: 1, depositGroup: "country", depositSub: "country", depositCountryIdx: -1, depositRailIdx: -1, depositProviderIdx: -1, depositProviderName: "", depositPhone: "", depositAmount: "", depositPromptSent: false, depositAsset: "usdc", depositNetwork: "base",
    depositQuote: null as any, depositQuoteLoading: false, depositQuoteError: "", depositAccept: null as any, depositAccepting: false, depositAcceptError: "", depositDone: false, depositIdempotencyKey: "",
    receiveGroup: "fiat", receiveAcctIdx: 0, receiveAsset: "usdc", receiveNetwork: "base", copiedKey: "",
    bulkSelected: [0,3,6], bulkLoaded: false, bulkDone: false,
    onrampDir: "onramp", quoteSeconds: 87, swapAccepted: false,
    convertMode: "fiat_to_stable" as ConvertMode,
    convertSourceAccountId: "",
    convertDestAccountId: "",
    convertAmount: "",
    convertQuote: null as ConversionOut | null,
    convertQuoteLoading: false,
    convertAccepting: false,
    convertError: "",
    convertHop: 1 as 1 | 2,
    convertBridgeUsdcId: "" as string,
    convertFiatPair: ["EUR", "USD"] as [string, string],
    stableSel: "USDC",
    txFilter: "all" as PrimaryTransactionFilter,
    txSearch: "",
    txCurrency: "all",
    txDateRange: "all" as "all" | "7d" | "30d",
    selectedTxId: null as number | null,
    /** Stable key: `fiat:EUR` or `stablecoin:{accountId}` — not list index. */
    selectedAcctKey: "" as string,
    selectedAcctKind: "fiat" as "fiat" | "stablecoin",
    selectedCardId: "" as string,
    /** "details" | "fund" — same coords modal, fund reframes copy for bank transfer. */
    acctDetailIntent: "details" as "details" | "fund",
    /** When set, Deposit OnRamp is funding this fiat or stablecoin account (African path). */
    fundAfricanTargetCurrency: null as string | null,
    /** Stablecoin account to credit; pins asset/network so quotes are not Polygon USDT. */
    fundTargetAccountId: null as string | null,
    fundConvertStatus: "" as string,
    fundConvertError: "" as string,
    apiKeyRevealed: {}, secretRevealed: {}, copiedField: "",
    apiKeyName: "", apiKeyEnvironment: "sandbox", apiKeyCreating: false, apiKeyError: "", newlyCreatedKey: null as any,
    addAccountMenu: false, createAccountKind: "bank", createAccountName: "",
    createAccountCurrency: "", createAccountStablecoin: "", createAccountNetwork: "",
    createAccountSaving: false, createAccountError: "",
    teamMembers: TEAM_MEMBERS, inviteOpen: false, inviteName: "", inviteEmail: "", inviteRole: "operator",
    newCardLabel: "",
    newCardFirstName: "",
    newCardLastName: "",
    newCardEmail: "",
    newCardPhone: "",
    newCardDone: false,
    newCardIssuing: false,
    newCardError: "",
    newlyIssuedCard: null as IssuedCard | null,
    cardFreezeBusy: false,
    cardFreezeError: "",
    invClient: "", invAmount: "", invoiceDone: false, invoiceError: "", invoiceSubmitting: false,
    cardFrozen: false, tierDone: false,
    balanceView: "all", sendGroup: "country",
    displayCurrency: DEFAULT_DISPLAY_CURRENCY as DisplayCurrency,
  }));
  const setState = useCallback((update: any) => {
    setStateRaw((prev: any) => ({ ...prev, ...(typeof update === "function" ? update(prev) : update) }));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setState((s: any) => {
        if (s.convertQuote?.expires_at) {
          return { quoteSeconds: secondsUntilExpiry(s.convertQuote.expires_at) };
        }
        return { quoteSeconds: Math.max(0, s.quoteSeconds - 1) };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setState]);

  useEffect(() => {
    setState({ displayCurrency: readStoredDisplayCurrency() });
  }, [setState]);

  // Deep-link query params (screen/modal/theme) — applied after mount so SSR
  // and the first client render stay identical (avoids hydration mismatch).
  useEffect(() => {
    const screen = qp("screen");
    const modal = qp("modal");
    const theme = qp("theme");
    if (!screen && !modal && !theme) return;
    setState((s: any) => ({
      ...(screen ? { screen } : {}),
      ...(modal ? { modal } : {}),
      ...(theme ? { theme } : {}),
    }));
  }, [setState]);

  // Close compact navigation when crossing into desktop chrome.
  useEffect(() => {
    if (!isCompact && (state.sidebarOpen || state.moreOpen)) {
      setState({ sidebarOpen: false, moreOpen: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompact]);

  // Real backend data. Session-expiry from any of these bounces to /login —
  // registered once here rather than per-call, matching the mobile client's
  // single global session-lost handler.
  const queryClient = useQueryClient();
  const [saveRecipientBusy, setSaveRecipientBusy] = useState(false);
  const [saveRecipientMessage, setSaveRecipientMessage] = useState("");
  useEffect(() => {
    setSessionLostHandler(() => {
      queryClient.clear();
      router.push("/login");
    });
    return () => setSessionLostHandler(null);
  }, [router, queryClient]);

  const meQuery = useQuery({ queryKey: ["auth-me"], queryFn: authApi.me, retry: false });
  const businessId = meQuery.data?.business?.id ?? null;
  const meKybStatus =
    (meQuery.data?.kyb_summary?.profile?.kyb_status as string | undefined) ?? null;
  const meKybApproved = isKybApproved(meKybStatus);
  // Gate off-screen fetches so Home/Accounts win connection slots after login.
  const screen = state.screen;
  const needsActivityFeed =
    screen === "home" ||
    screen === "wallets" ||
    screen === "accountDetail" ||
    screen === "cards" ||
    screen === "reports" ||
    screen === "transactions";
  const activityPoll =
    screen === "home" || screen === "transactions" || screen === "wallets";
  const kybWizard = useKybWizard({
    businessId,
    kybSummary: meQuery.data?.kyb_summary,
    business: meQuery.data?.business,
    enabled: state.modal === "kyb",
    onSubmitted: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-accounts-eligibility"] });
    },
  });
  // One-shot Home aggregate: identity slice, eligibility, treasury, FX, all accounts.
  const bootstrapQuery = useQuery({
    queryKey: ["dashboard-bootstrap"],
    queryFn: bootstrapApi.get,
    retry: false,
    staleTime: 30_000,
  });
  const bootstrapReady = bootstrapQuery.isSuccess;
  const bootstrapFailed = bootstrapQuery.isError;
  // When bootstrap lands first, lift business name / KYB into auth-me cache.
  useEffect(() => {
    const patch = bootstrapQuery.data?.authMePatch;
    if (!patch?.business?.name) return;
    queryClient.setQueryData(["auth-me"], (prev: AuthMe | undefined) => {
      if (!prev) return prev;
      const prevName = prev.business?.name?.trim() || "";
      const mergedKyb = mergeKybSummaryCache(prev.kyb_summary, patch.kyb_summary);
      if (prevName && prevName !== "Your business") {
        return {
          ...prev,
          role: patch.role ?? prev.role,
          kyb_summary: mergedKyb,
        };
      }
      return {
        ...prev,
        role: patch.role ?? prev.role,
        kyb_summary: mergedKyb,
        business: patch.business
          ? {
              ...(prev.business ?? patch.business),
              ...patch.business,
              // Keep richer /auth/me business fields when bootstrap only has a name stub.
              legal_name: patch.business.legal_name ?? prev.business?.legal_name ?? null,
              registration_number:
                patch.business.registration_number ?? prev.business?.registration_number ?? null,
              country: patch.business.country || prev.business?.country || "",
            }
          : prev.business,
      };
    });
  }, [bootstrapQuery.data, queryClient]);
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: dashboardApi.summary,
    retry: false,
    // Bootstrap already carries treasury + FX; keep summary for money-in/out when needed.
    enabled: true,
  });
  const exchangeRatesQuery = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: dashboardApi.exchangeRates,
    retry: false,
    staleTime: 60_000,
    // Skip when bootstrap already supplied usable FX.
    enabled: !bootstrapQuery.data?.fxRates,
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: transactionsApi.list,
    retry: false,
    enabled: needsActivityFeed,
    refetchInterval: activityPoll ? 15_000 : false,
  });
  const txFilterStatus =
    state.txFilter === "processing" || state.txFilter === "failed"
      ? state.txFilter
      : "all";
  const transactionsPageQuery = useTransactionsPage(txFilterStatus, {
    enabled: screen === "transactions",
  });
  // Tx detail modal fetches by id, not by list index/position — the list can
  // reorder or refetch (15s poll above) while the modal is open, and an
  // index would silently point at a different transaction.
  const txDetailQuery = useQuery({
    queryKey: ["transaction", state.selectedTxId],
    queryFn: () => transactionsApi.get(state.selectedTxId as number),
    enabled: state.selectedTxId != null && state.modal === "txDetail",
    retry: false,
  });
  // Live order-status polling (backoff) for whichever order is currently
  // in view: the tx detail modal, or the send modal's just-accepted order.
  // See lib/hooks/useOrderStatus.ts for why this polls rather than using
  // the backend's WebSocket (which requires a JWT in the browser).
  const txStatusQuery = useOrderStatus(state.selectedTxId, {
    enabled: state.modal === "txDetail" && state.selectedTxId != null,
  });
  const sendStatusQuery = useOrderStatus(state.sendAccept?.merchant_order_id, {
    enabled: state.modal === "send" && state.sendDone && !!state.sendAccept,
  });
  const depositStatusQuery = useOrderStatus(state.depositAccept?.merchant_order_id, {
    enabled:
      (state.modal === "deposit" || !!state.fundAfricanTargetCurrency) &&
      state.depositDone &&
      !!state.depositAccept,
  });
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list(),
    retry: false,
    enabled: screen === "invoices" || state.modal === "invoice",
  });
  const apiKeysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
    retry: false,
    enabled: screen === "developer" || state.modal === "apiKey",
  });
  // Public supported-catalog, used by the Send ("by country") flow to
  // resolve a real aggregator networkId per provider instead of relying on
  // the hardcoded corridor list alone. See lib/services/catalog.ts.
  // Also powers Home display-currency options — keep warm on Home.
  const sendCatalogQuery = useSendCatalog({
    enabled:
      screen === "home" ||
      state.modal === "send" ||
      state.modal === "deposit" ||
      state.modal === "bulk" ||
      !!state.fundAfricanTargetCurrency,
  });

  // Settled once the first catalog fetch finishes (success or error). Until
  // then, Send provider chips must not fall back to hardcoded rail.options.
  const sendCatalogSettled = sendCatalogQuery.isFetched;

  // When the catalog (or corridor) changes the provider list, clamp the
  // selection so sendProviderIdx never points past the active options.
  useEffect(() => {
    const country = COUNTRIES[state.sendCountryIdx];
    if (!country) return;
    const rail = country.rails[state.sendRailIdx] || country.rails[0];
    if (!rail) return;
    const catalogProviders = offRampProvidersForRail(
      sendCatalogQuery.data,
      country.iso,
      rail.type,
      country.code,
    );
    const options = providerNamesFromCatalog(
      catalogProviders,
      rail.options,
      sendCatalogSettled,
    );
    if (!options.length) return;
    setState((s: any) => {
      if (s.sendProviderIdx < options.length) return {};
      return { sendProviderIdx: options.length - 1 };
    });
  }, [sendCatalogQuery.data, sendCatalogSettled, state.sendCountryIdx, state.sendRailIdx, setState]);

  useEffect(() => {
    const country = COUNTRIES[state.depositCountryIdx];
    if (!country) return;
    if (state.depositRailIdx < 0 || !state.depositProviderName) return;
    const rail = country.rails[state.depositRailIdx] || country.rails[0];
    if (!rail) return;
    const catalogProviders = onRampProvidersForRail(
      sendCatalogQuery.data,
      country.iso,
      rail.type,
      country.code,
    );
    const options =
      catalogProviders && catalogProviders.length > 0
        ? catalogProviders.map((p) => p.name)
        : rail.options;
    if (!options.length) return;
    const resolvedIdx = indexOfProviderName(options, state.depositProviderName);
    setState((s: any) => {
      if (s.depositProviderIdx === resolvedIdx) return {};
      return { depositProviderIdx: resolvedIdx };
    });
  }, [sendCatalogQuery.data, state.depositCountryIdx, state.depositRailIdx, state.depositProviderName, setState]);

  // Prefer bootstrap accounts. Fall back to eligibility → IBAN + entities walk
  // only when bootstrap fails (older backends / outage).
  const depositEligibilityQuery = useQuery({
    queryKey: ["deposit-accounts-eligibility"],
    queryFn: depositAccountsApi.eligibility,
    retry: false,
    enabled: bootstrapFailed,
  });
  const depositAccountsQuery = useQuery({
    queryKey: ["deposit-accounts"],
    queryFn: depositAccountsApi.list,
    retry: false,
    enabled:
      bootstrapFailed &&
      (depositEligibilityQuery.data?.eligible === true ||
        (meKybApproved && depositEligibilityQuery.data?.eligible !== false) ||
        // Soft-fail list: try directly once eligibility isn't known false.
        depositEligibilityQuery.isFetched),
  });
  const stablecoinAccountsQuery = useQuery({
    queryKey: ["stablecoin-accounts"],
    queryFn: listStablecoinAccounts,
    retry: false,
    enabled: bootstrapFailed,
  });

  const cardsSurfaceOpen =
    state.screen === "cards" ||
    state.modal === "newCard" ||
    state.modal === "cardDetail";
  const bootstrapFiatAccounts = bootstrapQuery.data?.fiatAccounts ?? [];
  const fundingDepositAccounts = bootstrapReady
    ? bootstrapFiatAccounts
    : (depositAccountsQuery.data?.accounts ?? []);
  // Prefer IBAN USD once eligibility+list settle; still allow entity-account fallback.
  const usdFundingReady =
    bootstrapReady ||
    (depositEligibilityQuery.isFetched &&
      (depositEligibilityQuery.data?.eligible !== true ||
        depositAccountsQuery.isFetched));
  const usdFundingQuery = useQuery({
    queryKey: [
      "usd-funding-account",
      bootstrapReady ? "boot" : "legacy",
      bootstrapReady
        ? bootstrapQuery.dataUpdatedAt
        : depositAccountsQuery.dataUpdatedAt,
    ],
    queryFn: () =>
      resolveUsdFundingAccount({
        depositAccounts: fundingDepositAccounts,
      }),
    enabled: cardsSurfaceOpen && usdFundingReady,
    retry: false,
    staleTime: 30_000,
  });

  const issuedCardsQuery = useQuery({
    queryKey: [
      "issued-cards",
      usdFundingQuery.data?.entityId,
      usdFundingQuery.data?.accountId,
    ],
    queryFn: () =>
      cardsApi.list(
        usdFundingQuery.data!.entityId,
        usdFundingQuery.data!.accountId,
      ),
    enabled: Boolean(
      cardsSurfaceOpen &&
        usdFundingQuery.data?.entityId &&
        usdFundingQuery.data?.accountId,
    ),
    retry: false,
    staleTime: 15_000,
  });

  // Prefill convert accounts once lists load so the form isn't empty.
  useEffect(() => {
    if (state.screen !== "convert" && state.modal !== "convert") return;
    const fiat = (
      bootstrapReady
        ? (bootstrapQuery.data?.fiatAccounts ?? [])
        : (depositAccountsQuery.data?.accounts ?? [])
    )
      .filter((a) => a.id && ["EUR", "USD", "GBP"].includes(a.currency.toUpperCase()))
      .map((a) => String(a.id));
    const usdc = (
      bootstrapReady
        ? (bootstrapQuery.data?.stablecoinAccounts ?? [])
        : (stablecoinAccountsQuery.data ?? [])
    )
      .filter((a) => a.currency === "USDC" && isReadyStatus(a.status) && a.id)
      .map((a) => String(a.id));
    const mode = state.convertMode;
    const hop = state.convertHop;
    const sources =
      mode === "stable_to_fiat" || (mode === "fiat_to_fiat" && hop === 2) ? usdc : fiat;
    const dests =
      mode === "fiat_to_stable"
        ? usdc
        : fiat.filter((id) => id !== (state.convertSourceAccountId || sources[0]));
    setState((s: any) => {
      const next: Record<string, string> = {};
      if (!s.convertSourceAccountId && sources[0]) next.convertSourceAccountId = sources[0];
      if (!s.convertDestAccountId && dests[0]) next.convertDestAccountId = dests[0];
      if (!s.convertBridgeUsdcId && usdc[0]) next.convertBridgeUsdcId = usdc[0];
      return Object.keys(next).length ? next : {};
    });
  }, [
    state.screen,
    state.modal,
    state.convertMode,
    state.convertHop,
    state.convertSourceAccountId,
    state.convertDestAccountId,
    state.convertBridgeUsdcId,
    bootstrapReady,
    bootstrapQuery.data,
    depositAccountsQuery.data,
    stablecoinAccountsQuery.data,
    setState,
  ]);

  // Best-effort post-OnRamp convert status (skipped until entity fiat id + FX network_id exist).
  useEffect(() => {
    const order = depositStatusQuery.data;
    const targetFiat = state.fundAfricanTargetCurrency;
    if (!targetFiat || !order || order.status !== "completed") return;
    if (state.fundConvertStatus) return;

    const usdcAccount =
      (stablecoinAccountsQuery.data ?? []).find(
        (a) => isReadyStatus(a.status) && a.currency === "USDC" && a.walletAddress,
      ) ??
      (stablecoinAccountsQuery.data ?? []).find(
        (a) => isReadyStatus(a.status) && a.currency === "USDC",
      );
    const plan = planAfricanFundOrchestration({
      fiatCurrency: targetFiat,
      fiatAccountId: null,
      entityId: usdcAccount?.entityId ?? null,
      usdcAccountId: usdcAccount?.id ?? null,
      usdcWalletAddress: usdcAccount?.walletAddress ?? null,
      treasuryWalletAddress: resolveTreasuryWalletAddress({
        summaryWallet: summaryQuery.data?.totals.wallet_address,
        stablecoinAccounts: stablecoinAccountsQuery.data,
      }),
      convertNetworkId: null,
    });
    setState({
      fundConvertStatus: `skipped: ${plan.blockers[0] || "Auto-convert not ready"}`,
      fundConvertError: plan.blockers.join(" "),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositStatusQuery.data?.status, depositStatusQuery.data?.id, state.fundAfricanTargetCurrency, stablecoinAccountsQuery.data]);

  // The list endpoint deliberately omits webhook_url / webhook_secret
  // (ApiKeyListOut); only the per-key detail endpoint returns them. Fetch
  // details so the Developer screen's webhook rows show real values.
  const apiKeyDetailQueries = useQueries({
    queries: (apiKeysQuery.data ?? []).map((k) => ({
      queryKey: ["api-key", k.id],
      queryFn: () => apiKeysApi.get(k.id),
      retry: false,
      enabled: screen === "developer" || state.modal === "apiKey",
    })),
  });
  const apiKeyDetailById = new Map<number, any>();
  (apiKeysQuery.data ?? []).forEach((k, i) => {
    const d = apiKeyDetailQueries[i]?.data;
    if (d) apiKeyDetailById.set(k.id, d);
  });

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      router.push("/login");
    }
  };



  const toggleTheme = () => setState(s => ({ theme: s.theme === "light" ? "dark" : "light" }));
  const closeMore = useCallback(() => setState({ moreOpen: false }), [setState]);
  const setScreen = (screen: string) => () =>
    setState({ screen, sidebarOpen: false, moreOpen: false });
  const navigateToScreen = (screen: string) =>
    setState({ screen, sidebarOpen: false, moreOpen: false });
  const goTransactions = () => navigateToScreen("transactions");

  const moneyFlowReset = {
    sendStep: 1, sendDone: false, sendRecipient: "", sendRecipientName: "", sendAmount: "", sendAmountCurrency: "USD", sendCountryIdx: 0, sendRailIdx: 0, sendProviderIdx: 0, sendGroup: "country", sendMethod: null,
    sendQuote: null, sendQuoteLoading: false, sendQuoteError: "", sendAccept: null, sendAccepting: false, sendAcceptError: "",
    sendPreview: null, sendConfirm: null, sendAccountId: "", sendAsset: "usdc", sendChain: "base",
    bulkLoaded: false, bulkDone: false, depositStep: 1, depositPromptSent: false, depositCountryIdx: -1, depositRailIdx: -1, depositProviderIdx: -1, depositProviderName: "", depositGroup: "country", depositSub: "country",
    depositAmount: "", depositQuote: null, depositQuoteLoading: false, depositQuoteError: "", depositAccept: null, depositAccepting: false, depositAcceptError: "", depositDone: false, depositIdempotencyKey: "",
    receiveGroup: "fiat", receiveAcctIdx: 0, receiveAsset: "usdc", receiveNetwork: "base", copiedKey: "",
    swapAccepted: false, onrampDir: "onramp", quoteSeconds: 87,
    convertMode: "fiat_to_stable" as ConvertMode,
    convertSourceAccountId: "",
    convertDestAccountId: "",
    convertAmount: "",
    convertQuote: null,
    convertQuoteLoading: false,
    convertAccepting: false,
    convertError: "",
    convertHop: 1,
    convertBridgeUsdcId: "",
    fundAfricanTargetCurrency: null, fundTargetAccountId: null, fundConvertStatus: "", fundConvertError: "",
    depositAsset: "usdc", depositNetwork: "base",
  };
  /** Non-money overlays (tx detail, KYB, cards, …). Money moves use screens. */
  const openModal = (name) => () => setState({
    modal: name,
    moreOpen: false,
    sidebarOpen: false,
    ...moneyFlowReset,
  });
  const isMoneyFlowScreen = (screen: string) =>
    screen === "send" || screen === "deposit" || screen === "receive" || screen === "convert";
  /** Money moves open as bottom sheets (compact) / centered dialogs (desktop). */
  const openMoneyFlow = (name: "send" | "deposit" | "receive" | "convert") => () =>
    setState({
      modal: name,
      moreOpen: false,
      sidebarOpen: false,
      ...moneyFlowReset,
      ...(name === "convert"
        ? { swapAccepted: false, onrampDir: "onramp", quoteSeconds: 87 }
        : {}),
    });
  const exitMoneyFlow = () =>
    setState((prev: any) => ({
      screen: prev.moneyFlowReturn || "home",
      moneyFlowReturn: null,
      fundAfricanTargetCurrency: null,
      fundTargetAccountId: null,
      fundConvertStatus: "",
      fundConvertError: "",
    }));

  // Ready USDC Base/Polygon FinancialAccounts for the Stablecoin send tab
  // (Phase 4 `/v1/accounts/{id}/sends`). Fetched when the Send screen opens.
  const sendableAccountsQuery = useQuery({
    queryKey: ["sendable-stablecoin-accounts"],
    queryFn: listSendableStablecoinAccounts,
    enabled: state.modal === "send",
    retry: false,
    staleTime: 30_000,
  });
  const savedRecipientsQuery = useQuery({
    queryKey: ["saved-recipients"],
    queryFn: listSavedRecipients,
    enabled: state.modal === "send",
    retry: false,
    staleTime: 30_000,
  });

  const sendNext = async () => {
    // Country tab step 1: wait for catalog so provider chips / networkId match.
    if (state.sendStep === 1 && state.sendGroup === "country" && !sendCatalogSettled) {
      return;
    }
    // A bank rail with no catalog-backed provider has no `networkId`, and the
    // backend rejects that payload outright. Stop here rather than collect a
    // recipient and an amount first and fail at the quote.
    if (state.sendStep === 1 && state.sendGroup === "country") {
      const country = COUNTRIES[state.sendCountryIdx];
      const rail = country.rails[state.sendRailIdx] || country.rails[0];
      const providers = offRampProvidersForRail(
        sendCatalogQuery.data,
        country.iso,
        rail.type,
        country.code,
      );
      const options = providerNamesFromCatalog(providers, rail.options, sendCatalogSettled);
      const name = options[Math.min(state.sendProviderIdx, Math.max(0, options.length - 1))] || "";
      if (
        sendRailBlockedByMissingNetworkId({
          sendGroup: state.sendGroup,
          networkId: networkIdForProvider(providers, name),
          catalogSettled: sendCatalogSettled,
        })
      ) {
        setState({
          sendQuoteError: friendlySendQuoteError("network_id is required"),
        });
        return;
      }
    }
    // Stablecoin tab step 1 → 2: require a ready USDC account on the chosen
    // network before collecting the recipient (Phase 4).
    if (state.sendStep === 1 && state.sendGroup === "crypto") {
      const accounts = sendableAccountsQuery.data ?? [];
      const account = accountForNetwork(accounts, state.sendChain);
      if (!account) {
        setState({
          sendQuoteError: sendableAccountsQuery.isLoading
            ? "Loading your USDC accounts…"
            : `No ready USDC account on ${SEND_STABLECOIN_NETWORKS.find((n) => n.key === state.sendChain)?.label || state.sendChain}. Open a Base, Polygon, or Stellar USDC account first.`,
        });
        return;
      }
      setState({
        sendStep: 2,
        sendAccountId: account.id,
        sendQuoteError: "",
        sendPreview: null,
        sendAcceptError: "",
      });
      return;
    }
    // Step 2 -> 3: OffRamp quote (by country) or account-send preview (stablecoin).
    if (state.sendStep === 2 && state.sendGroup === "country") {
      if (!state.sendRecipient.trim() || !state.sendRecipientName.trim() || !state.sendAmount.trim()) return;
      // The box may be in the destination currency; the payload always prices
      // from USD. Converting here (not at keystroke time) keeps the entered
      // figure exactly as typed in the field.
      const amountRates = mergeExchangeRates(
        summaryQuery.data?.fx_rates,
        exchangeRatesQuery.data,
      );
      const amountRate = indicativeRate(
        amountRates?.rates,
        COUNTRIES[state.sendCountryIdx].code,
      );
      const usdAmount = toPayloadUsdAmount(state.sendAmount, {
        currency: amountRate ? state.sendAmountCurrency : "USD",
        rate: amountRate,
      });
      if (!usdAmount) {
        setState({
          sendQuoteError: "Enter an amount greater than zero.",
        });
        return;
      }
      setState({ sendQuoteLoading: true, sendQuoteError: "" });
      try {
        // Prefer the selected chain's ready USDC account so the quote can
        // tag asset/network; fall back to summary or any ready USDC wallet
        // so a 500 from /dashboard/summary is not reported as unprovisioned.
        const rampDest = resolveOnRampDestination({
          accounts: stablecoinAccountsQuery.data ?? [],
          selectedAccountId: state.sendAccountId || undefined,
          depositNetworkKey: state.sendChain,
          depositAsset: state.sendAsset,
          summaryWallet: summaryQuery.data?.totals.wallet_address,
        });
        if (!rampDest) {
          throw new Error(
            describeMissingOnRampDestination({
              selectedAccountId: state.sendAccountId || undefined,
              summaryFailed: summaryQuery.isError,
            }),
          );
        }
        const refundAddress = rampDest.walletAddress;
        const country = COUNTRIES[state.sendCountryIdx];
        const rail = country.rails[state.sendRailIdx] || country.rails[0];
        // Real catalog providers for this corridor, when available, carry
        // the aggregator's networkId — falling back to the hardcoded
        // option list (and no networkId, same as pre-catalog behavior)
        // when the catalog has no match yet. Must mirror the same lookup
        // used to build the provider chips below so the id sent on quote
        // always matches what the user actually selected.
        const catalogProviders = offRampProvidersForRail(
          sendCatalogQuery.data,
          country.iso,
          rail.type,
          country.code,
        );
        const providerOptions = providerNamesFromCatalog(
          catalogProviders,
          rail.options,
          sendCatalogSettled,
        );
        if (!providerOptions.length) {
          throw new Error("Providers are still loading. Try again in a moment.");
        }
        const providerIdx =
          providerOptions.length === 0
            ? 0
            : Math.min(state.sendProviderIdx, providerOptions.length - 1);
        const providerName = providerOptions[providerIdx] || providerOptions[0];
        const networkId = networkIdForProvider(catalogProviders, providerName);
        // Sync the input to E.164 before quote so the user sees +254… and
        // the payload matches (mobile rails only).
        const recipientRaw = state.sendRecipient.trim();
        const recipientAccountNumber =
          rail.type === "mobile"
            ? toE164(recipientRaw, country.dialCode)
            : recipientRaw;
        if (rail.type === "mobile" && recipientAccountNumber !== recipientRaw) {
          setState({ sendRecipient: recipientAccountNumber });
        }
        const payload = buildSendQuotePayload({
          currency: country.code,
          countryIso: country.iso,
          railType: rail.type,
          recipientAccountNumber,
          recipientName: state.sendRecipientName.trim(),
          amount: usdAmount,
          refundAddress,
          asset: rampDest.asset,
          // Mobile rails need E.164; the field's placeholder is local format.
          dialCode: country.dialCode,
          networkId,
        });
        const quote = await ordersApi.quote(payload);
        setState({ sendQuoteLoading: false, sendQuote: quote, sendStep: 3 });
      } catch (err) {
        setState({
          sendQuoteLoading: false,
          sendQuoteError:
            err instanceof ApiRequestError || err instanceof Error
              ? friendlySendQuoteError(err.message)
              : "Couldn't get a quote. Try again.",
        });
      }
      return;
    }
    if (state.sendStep === 2 && state.sendGroup === "crypto") {
      if (!state.sendRecipient.trim() || !state.sendAmount.trim()) return;
      setState({ sendQuoteLoading: true, sendQuoteError: "" });
      try {
        const accounts = sendableAccountsQuery.data ?? [];
        const account =
          accountForNetwork(accounts, state.sendChain) ||
          accounts.find((a) => a.id === state.sendAccountId);
        if (!account) {
          throw new Error("No ready USDC account on this network.");
        }
        assertSufficientBalance({
          amount: state.sendAmount.trim(),
          balance: account.balance,
          currency: account.currency || "USDC",
        });
        const payload = buildSendPreviewPayload({
          toAddress: state.sendRecipient.trim(),
          amount: state.sendAmount.trim(),
          networkKey: state.sendChain,
          accountNetwork: account.network,
        });
        const preview = await accountSendsApi.preview(account.id, payload);
        setState({
          sendQuoteLoading: false,
          sendPreview: preview,
          sendAccountId: account.id,
          sendStep: 3,
        });
      } catch (err) {
        setState({
          sendQuoteLoading: false,
          sendQuoteError:
            err instanceof ApiRequestError || err instanceof Error
              ? friendlySendQuoteError(explainAccountSendError(err.message, state.sendChain))
              : "Couldn't preview this send. Try again.",
        });
      }
      return;
    }
    setState((s: any) => ({ sendStep: Math.min(3, s.sendStep + 1) }));
  };
  const sendBack = () =>
    setState((s: any) => {
      // Step 1 (destination) is the first step after the method chooser, so
      // Back from there returns to the chooser and clears the draft.
      if (s.sendStep <= 1) {
        return {
          sendMethod: null,
          sendStep: 1,
          sendQuoteError: "",
          sendAcceptError: "",
          sendPreview: null,
          sendQuote: null,
          sendRecipient: "",
          sendRecipientName: "",
          sendAmount: "",
        };
      }
      return {
        sendStep: s.sendStep - 1,
        sendQuoteError: "",
        sendAcceptError: "",
        sendPreview: null,
        sendQuote: null,
      };
    });
  const depositNext = async () => {
    if (state.depositGroup === "crypto") {
      setState((s: any) => ({ depositStep: Math.min(2, s.depositStep + 1) }));
      return;
    }
    if (
      state.depositStep === 1 &&
      (state.depositSub !== "method" || state.depositRailIdx < 0 || !state.depositProviderName)
    ) {
      return;
    }
    if (state.depositStep === 2) {
      if (!state.depositPhone.trim() || !state.depositAmount.trim()) return;
      setState({ depositQuoteLoading: true, depositQuoteError: "" });
      try {
        const rampDest = resolveOnRampDestination({
          accounts: stablecoinAccountsQuery.data ?? [],
          selectedAccountId: state.fundTargetAccountId,
          depositNetworkKey: state.depositNetwork,
          depositAsset: state.depositAsset,
          fundAfricanTargetCurrency: state.fundAfricanTargetCurrency,
          summaryWallet: summaryQuery.data?.totals.wallet_address,
        });
        if (!rampDest) {
          throw new Error(
            describeMissingOnRampDestination({
              selectedAccountId: state.fundTargetAccountId,
              summaryFailed: summaryQuery.isError,
            }),
          );
        }
        const walletAddress = rampDest.walletAddress;
        const country = COUNTRIES[state.depositCountryIdx];
        const rail = country.rails[state.depositRailIdx] || country.rails[0];
        const catalogProviders = onRampProvidersForRail(
          sendCatalogQuery.data,
          country.iso,
          rail.type,
          country.code,
        );
        const providerOptions =
          catalogProviders && catalogProviders.length > 0
            ? catalogProviders.map((p) => p.name)
            : rail.options;
        const providerName = resolveQuotedProviderName(
          providerOptions,
          state.depositProviderName,
        );
        const networkId = networkIdForProvider(catalogProviders, providerName);
        const payerName =
          meQuery.data?.business?.legal_name ||
          meQuery.data?.business?.name ||
          "Business account";
        const idempotencyKey = newIdempotencyKey();
        const payload = buildDepositQuotePayload({
          currency: country.code,
          countryIso: country.iso,
          railType: rail.type,
          payerAccountNumber: state.depositPhone.trim(),
          payerName,
          amount: state.depositAmount.trim(),
          walletAddress,
          asset: rampDest.asset,
          dialCode: country.dialCode,
          networkId,
        });
        const quote = await ordersApi.quote(payload, idempotencyKey);
        setState({
          depositQuoteLoading: false,
          depositQuote: quote,
          depositStep: 3,
          depositIdempotencyKey: idempotencyKey,
        });
      } catch (err) {
        setState({
          depositQuoteLoading: false,
          depositQuoteError:
            err instanceof ApiRequestError || err instanceof Error
              ? err.message
              : "Couldn't get a quote. Try again.",
        });
      }
      return;
    }
    setState((s: any) => ({ depositStep: Math.min(3, s.depositStep + 1) }));
  };
  const depositBack = () =>
    setState((s: any) => {
      if (s.depositStep === 1 && s.depositGroup === "country" && s.depositSub === "method") {
        return {
          depositSub: "country",
          depositQuoteError: "",
          depositAcceptError: "",
        };
      }
      return {
        depositStep: Math.max(1, s.depositStep - 1),
        depositQuoteError: "",
        depositAcceptError: "",
      };
    });
  const closeModal = () => {
    if (isMoneyFlowScreen(state.screen)) {
      exitMoneyFlow();
      return;
    }
    setState({
      modal: null,
      fundAfricanTargetCurrency: null,
      fundTargetAccountId: null,
      fundConvertStatus: "",
      fundConvertError: "",
    });
  };
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;

  useEffect(() => {
    if (!state.modal) return;
    const node = modalRef.current;
    if (!node) return;

    lastModalFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const pickerOpen = () =>
      Boolean(document.querySelector(".ep-choice-overlay, .ep-choice-popover"));
    const focusables = () =>
      [
        ...node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.closest(".ep-choice-overlay, .ep-choice-popover"));

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (pickerOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeModalRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastModalFocusRef.current?.focus();
    };
  }, [state.modal]);

  const stopClick = (e) => e.stopPropagation();
  const openTxDetail = (id: number) => () => setState({ modal: "txDetail", selectedTxId: id });
  // UX redesign: account card → full Account detail screen; Details button → modal.
  const openAcctDetail = (kind: "fiat" | "stablecoin", key: string) => () =>
    setState({
      screen: "accountDetail",
      selectedAcctKind: kind,
      selectedAcctKey: key,
      modal: null,
      sidebarOpen: false,
    });
  const openAcctDetailsModal = () =>
    setState({ modal: "acctDetail", acctDetailIntent: "details", copiedField: "" });
  /** Partner docs: fund fiat EUR/USD via bank transfer to deposit-instructions — not OnRamp quote. */
  const openAcctFundModal = () =>
    setState({ modal: "acctDetail", acctDetailIntent: "fund", copiedField: "" });
  const openAcctFundChooser = () =>
    setState({
      modal: "fundChooser",
      fundConvertStatus: "",
      fundConvertError: "",
      fundAfricanTargetCurrency: null,
      fundTargetAccountId: null,
    });
  const openCloseAccountChooser = () =>
    setState({ modal: "closeAccount" });
  const openAfricanFundOnRamp = () => {
    const fiatList = depositAccountsQuery.data?.accounts ?? [];
    const currencyKey =
      state.selectedAcctKind === "fiat" && state.selectedAcctKey.startsWith("fiat:")
        ? state.selectedAcctKey.slice("fiat:".length)
        : "";
    const selectedStablecoin =
      state.selectedAcctKind === "stablecoin" && state.selectedAcctKey.startsWith("stablecoin:")
        ? (stablecoinAccountsQuery.data ?? []).find(
            (a) => a.id === state.selectedAcctKey.slice("stablecoin:".length),
          ) ?? null
        : null;
    const intent = resolveAfricanFundOpenIntent({
      selectedKind: state.selectedAcctKind,
      selectedFiatCurrency:
        state.selectedAcctKind === "fiat"
          ? fiatList.find((a) => a.currency.toUpperCase() === currencyKey)?.currency ||
            currencyKey ||
            "EUR"
          : null,
      selectedStablecoin: selectedStablecoin
        ? {
            id: selectedStablecoin.id,
            currency: selectedStablecoin.currency,
            network: selectedStablecoin.network,
          }
        : null,
    });
    setState({
      ...moneyFlowReset,
      modal: "deposit",
      moreOpen: false,
      sidebarOpen: false,
      depositStep: 1,
      depositGroup: "country",
      depositDone: false,
      depositQuote: null,
      depositAccept: null,
      depositQuoteError: "",
      depositAcceptError: "",
      fundAfricanTargetCurrency: intent.fundAfricanTargetCurrency,
      fundTargetAccountId: intent.fundTargetAccountId,
      depositNetwork: intent.depositNetwork,
      depositAsset: intent.depositAsset,
      fundConvertStatus: "",
      fundConvertError: "",
    });
  };
  const backToWallets = () => setState({ screen: "wallets", modal: null });
  const openCardDetail = (cardId: string) => () =>
    setState({ modal: "cardDetail", selectedCardId: cardId, cardFreezeBusy: false, cardFreezeError: "" });
  const openNewCard = () => {
    const prefill = cardholderPrefillFromKybProfile(
      meQuery.data?.kyb_summary?.profile ?? null,
    );
    const sessionEmail = meQuery.data?.user?.email?.trim() || "";
    setState({
      modal: "newCard",
      newCardLabel: "",
      newCardDone: false,
      newCardIssuing: false,
      newCardError: "",
      newlyIssuedCard: null,
      // Cardholder must be a person — never the business legal name.
      newCardFirstName: prefill.first_name || "",
      newCardLastName: prefill.last_name || "",
      newCardEmail: prefill.email || sessionEmail,
      newCardPhone: prefill.phone_number || "",
    });
  };
  const openModalInvoice = () => setState({ modal: "invoice", invClient: "", invAmount: "", invoiceDone: false, invoiceError: "", invoiceSubmitting: false });
  const openModalTier = () => setState({ modal: "tier", tierDone: false });
  const openModalKyb = () => setState({ modal: "kyb" });
  const goVerification = () => setState({ screen: "verification", sidebarOpen: false, moreOpen: false });
  const guardMoneyModal = (name: string) => () => {
    // Wait for /auth/me before treating KYB as pending — otherwise approved
    // businesses get bounced to verification while the profile is still loading.
    if (meQuery.isLoading || meQuery.isPending) return;
    const status = (meQuery.data?.kyb_summary?.profile?.kyb_status as string | undefined) ?? "pending";
    if (!isKybApproved(status)) {
      goVerification();
      if (canOpenKybWizard(status)) openModalKyb();
      return;
    }
    if (name === "send" || name === "deposit" || name === "receive" || name === "convert") {
      openMoneyFlow(name)();
      return;
    }
    openModal(name)();
  };
  const openSelectedAccountSend = () => {
    guardMoneyModal("send")();
    if (
      state.selectedAcctKind === "stablecoin" &&
      state.selectedAcctKey.startsWith("stablecoin:")
    ) {
      const accountId = state.selectedAcctKey.slice("stablecoin:".length);
      const account = (stablecoinAccountsQuery.data ?? []).find((row) => row.id === accountId);
      if (account) {
        setState({
          sendChain: toUiNetworkKey(account.network),
          sendAccountId: account.id,
        });
      }
    }
  };

  /** Changing country keeps the rail the chosen method implies, so a "Mobile
   *  money" send does not silently become a bank transfer when the user picks
   *  a different country. Falls back to the first rail where the country has
   *  no rail of that type. */
  const selectSendCountry = (i) => () =>
    setState((prev: any) => ({
      sendCountryIdx: i,
      sendRailIdx: railIndexForMethod(COUNTRIES[i].rails, prev.sendMethod),
      sendProviderIdx: 0,
    }));
  const selectSendRail = (i) => () => setState({ sendRailIdx: i, sendProviderIdx: 0 });
  const selectSendProvider = (i) => () => setState({ sendProviderIdx: i });
  const resetSendMethod = () => {
    setSaveRecipientMessage("");
    setState({
      sendMethod: null,
      sendStep: 1,
      sendDone: false,
      sendRecipient: "",
      sendRecipientName: "",
      sendAmount: "",
      sendQuote: null,
      sendQuoteError: "",
      sendAcceptError: "",
      sendPreview: null,
      sendConfirm: null,
      sendAccountId: "",
    });
  };
  const openConvert = openMoneyFlow("convert");
  const openModalSwapFromAcct = openConvert;
  const setSendRecipient = (e) => setState({ sendRecipient: e.target.value });
  const setSendRecipientName = (e) => setState({ sendRecipientName: e.target.value });
  const setSendAmount = (e) => setState({ sendAmount: e.target.value });
  /** Mobile money: rewrite local numbers (07…) to E.164 (+254…) in the field. */
  const normalizeSendRecipientPhone = (e?: React.FocusEvent<HTMLInputElement>) => {
    setState((prev: any) => {
      if (prev.sendGroup !== "country") return {};
      const country = COUNTRIES[prev.sendCountryIdx] || COUNTRIES[0];
      const rail = country.rails[prev.sendRailIdx] || country.rails[0];
      const isMobile = prev.sendMethod === "mobile" || rail?.type === "mobile";
      if (!isMobile || !country.dialCode) return {};
      const raw = String(e?.currentTarget?.value ?? prev.sendRecipient ?? "").trim();
      if (!raw) return {};
      const next = toE164(raw, country.dialCode);
      if (next === prev.sendRecipient) return {};
      return { sendRecipient: next };
    });
  };
  const pickSendProvider = (index: number) => setState({ sendProviderIdx: index });
  const applySavedRecipient = (r: SavedRecipient) => {
    setSaveRecipientMessage("");
    const patch: Record<string, unknown> = {
      sendRecipientName: r.label,
      sendRecipient: r.accountNumber,
    };
    let countryIdx = state.sendCountryIdx;
    if (state.sendGroup === "country" && (r.countryCode || r.currency)) {
      const match = COUNTRIES.findIndex((c) => {
        if (r.countryCode && c.iso.toUpperCase() === String(r.countryCode).toUpperCase()) return true;
        if (r.currency && c.code.toUpperCase() === String(r.currency).toUpperCase()) return true;
        return false;
      });
      if (match >= 0) {
        countryIdx = match;
        patch.sendCountryIdx = match;
        patch.sendRailIdx = railIndexForMethod(COUNTRIES[match].rails, state.sendMethod);
        patch.sendProviderIdx = 0;
      }
    }
    const country = COUNTRIES[countryIdx] || COUNTRIES[0];
    const railIdx =
      typeof patch.sendRailIdx === "number" ? (patch.sendRailIdx as number) : state.sendRailIdx;
    const rail = country.rails[railIdx] || country.rails[0];
    const isMobile =
      state.sendMethod === "mobile" || r.railType === "mobile" || rail?.type === "mobile";
    if (isMobile && country.dialCode) {
      patch.sendRecipient = toE164(String(r.accountNumber || ""), country.dialCode);
    }
    if (r.provider && state.sendGroup === "country") {
      const catalogProviders = offRampProvidersForRail(
        sendCatalogQuery.data,
        country.iso,
        rail.type,
        country.code,
      );
      const options = providerNamesFromCatalog(
        catalogProviders,
        rail.options,
        sendCatalogSettled,
      );
      const idx = options.findIndex(
        (name) => name.toLowerCase() === String(r.provider).toLowerCase(),
      );
      if (idx >= 0) patch.sendProviderIdx = idx;
    }
    setState(patch);
  };
  const saveCurrentRecipientDetails = async () => {
    const name = state.sendRecipientName.trim();
    let account = state.sendRecipient.trim();
    if (!account || (state.sendGroup === "country" && !name)) return;
    const rail: SavedRecipientRail =
      state.sendGroup === "crypto"
        ? "crypto"
        : state.sendMethod === "mobile"
          ? "mobile"
          : "bank";
    const country = COUNTRIES[state.sendCountryIdx] || COUNTRIES[0];
    if (rail === "mobile" && country.dialCode) {
      account = toE164(account, country.dialCode);
      if (account !== state.sendRecipient.trim()) setState({ sendRecipient: account });
    }
    const countryRail = country.rails[state.sendRailIdx] || country.rails[0];
    const catalogProviders = offRampProvidersForRail(
      sendCatalogQuery.data,
      country.iso,
      countryRail.type,
      country.code,
    );
    const providerOptions = providerNamesFromCatalog(
      catalogProviders,
      countryRail.options,
      sendCatalogSettled,
    );
    const provider =
      state.sendGroup === "country"
        ? providerOptions[Math.min(state.sendProviderIdx, Math.max(0, providerOptions.length - 1))] ||
          undefined
        : undefined;
    setSaveRecipientBusy(true);
    setSaveRecipientMessage("");
    try {
      await createSavedRecipient({
        name: name || account,
        account,
        rail,
        countryCode: state.sendGroup === "country" ? country.iso.toUpperCase() : undefined,
        countryName: state.sendGroup === "country" ? country.name : undefined,
        currency: state.sendGroup === "country" ? country.code : state.sendAsset.toUpperCase(),
        provider,
        network: state.sendGroup === "crypto" ? state.sendChain : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["saved-recipients"] });
      setSaveRecipientMessage("Recipient saved. You can pick them next time from saved details.");
    } catch (err) {
      setSaveRecipientMessage(
        err instanceof Error ? err.message : "Couldn't save recipient details. Try again.",
      );
    } finally {
      setSaveRecipientBusy(false);
    }
  };
  const submitSend = async () => {
    if (state.sendGroup === "crypto") {
      if (!state.sendPreview?.preview_token || !state.sendAccountId) return;
      setState({ sendAccepting: true, sendAcceptError: "" });
      try {
        // Idempotency-Key is REQUIRED (8–64 chars) — mint once per confirm
        // attempt; retries of the exact same confirm should reuse the key,
        // but a new preview gets a new confirm key.
        const idempotencyKey = newIdempotencyKey();
        const confirmed = await accountSendsApi.confirm(
          state.sendAccountId,
          { preview_token: state.sendPreview.preview_token },
          idempotencyKey,
        );
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-page"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        queryClient.invalidateQueries({ queryKey: ["sendable-stablecoin-accounts"] });
        setState({ sendAccepting: false, sendConfirm: confirmed, sendDone: true });
      } catch (err) {
        setState({
          sendAccepting: false,
          sendAcceptError:
            err instanceof ApiRequestError || err instanceof Error
              ? err.message
              : "Couldn't confirm this send. Try again.",
        });
      }
      return;
    }
    if (!state.sendQuote) return;
    setState({ sendAccepting: true, sendAcceptError: "" });
    try {
      const accepted = await ordersApi.accept(state.sendQuote.quote_id);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-page"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setState({ sendAccepting: false, sendAccept: accepted, sendDone: true });
    } catch (err) {
      if (isQuoteExpiredError(err)) {
        // The quote_id is dead server-side — send the user back to fetch a
        // fresh quote with the same inputs rather than retrying accept.
        setState({
          sendAccepting: false,
          sendQuote: null,
          sendStep: 2,
          sendAcceptError: "",
          sendQuoteError: "That quote expired. Press Review to get a fresh price, then try again.",
        });
        return;
      }
      if (isQuoteAlreadyAcceptedError(err)) {
        // A duplicate accept (e.g. a double-click) already produced an
        // order for this quote_id — the payout went through, so this is
        // not a failure to show the user.
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-page"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        setState({ sendAccepting: false, sendAccept: null, sendDone: true });
        return;
      }
      setState({
        sendAccepting: false,
        sendAcceptError: err instanceof ApiRequestError
          ? friendlySendQuoteError(err.message)
          : "Couldn't send the payment. Try again.",
      });
    }
  };

  const setDepositGroup = (g) => () => setState({ depositGroup: g, depositSub: "country", depositCountryIdx: -1, depositRailIdx: -1, depositProviderIdx: -1, depositProviderName: "", depositPromptSent: false, depositStep: 1, depositQuote: null, depositQuoteError: "", depositAccept: null, depositAcceptError: "", depositDone: false });
  const selectDepositCountry = (i) => () => setState({ depositCountryIdx: i, depositSub: "method", depositRailIdx: -1, depositProviderIdx: -1, depositProviderName: "", depositPromptSent: false, depositQuote: null, depositQuoteError: "" });
  const selectDepositMethod = (railIdx: number, providerIdx: number, providerName: string) => () =>
    setState({ depositRailIdx: railIdx, depositProviderIdx: providerIdx, depositProviderName: providerName, depositQuote: null, depositQuoteError: "" });
  const setDepositPhone = (e) => setState({ depositPhone: e.target.value });
  const setDepositAmount = (e) => setState({ depositAmount: e.target.value });
  const submitDeposit = async () => {
    if (state.depositGroup !== "country") return;
    if (!state.depositQuote) return;
    const country = COUNTRIES[state.depositCountryIdx];
    const rail = country.rails[state.depositRailIdx] || country.rails[0];
    setState({ depositAccepting: true, depositAcceptError: "" });
    try {
      const accepted = await ordersApi.accept(
        state.depositQuote.quote_id,
        undefined,
        state.depositQuote.quote_id,
      );
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      const isMobile = rail.type === "mobile";
      setState({
        depositAccepting: false,
        depositAccept: accepted,
        depositDone: true,
        depositPromptSent: isMobile,
      });
    } catch (err) {
      if (isQuoteExpiredError(err)) {
        setState({
          depositAccepting: false,
          depositQuote: null,
          depositStep: 2,
          depositAcceptError: "",
          depositQuoteError: "That quote expired. Press Review to get a fresh price, then try again.",
        });
        return;
      }
      if (isQuoteAlreadyAcceptedError(err)) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        setState({
          depositAccepting: false,
          depositAccept: null,
          depositDone: true,
          depositPromptSent: rail.type === "mobile",
        });
        return;
      }
      setState({
        depositAccepting: false,
        depositAcceptError:
          err instanceof ApiRequestError ? err.message : "Couldn't confirm the top-up. Try again.",
      });
    }
  };
  const setSendAsset = (k) => () => setState({ sendAsset: k, sendPreview: null, sendQuoteError: "" });
  const setSendChain = (k) => () => setState({ sendChain: k, sendPreview: null, sendAccountId: "", sendQuoteError: "" });
  const setDepositAsset = (k) => () =>
    setState({
      depositAsset: k,
      depositNetwork:
        k === "usdt" && state.depositNetwork === "stellar" ? "base" : state.depositNetwork,
    });
  const setDepositNetwork = (k) => () => setState({ depositNetwork: k });

  const setReceiveGroup = (g) => () => setState({ receiveGroup: g, copiedKey: "" });
  const selectReceiveAcct = (i) => () => setState({ receiveAcctIdx: i, copiedKey: "" });
  const setReceiveAsset = (k) => () =>
    setState({
      receiveAsset: k,
      receiveNetwork:
        k === "usdt" && state.receiveNetwork === "stellar" ? "base" : state.receiveNetwork,
      copiedKey: "",
    });
  const setReceiveNetwork = (k) => () => setState({ receiveNetwork: k, copiedKey: "" });
  const copyReceiveField = (key, val) => async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(val);
      setState({ copiedKey: key });
    } catch {
      // Don't show "Copied" when the write failed (permission / insecure context).
      setState({ copiedKey: "" });
    }
  };

  const toggleBulkCountry = (i) => () => setState(s => ({ bulkSelected: s.bulkSelected.includes(i) ? s.bulkSelected.filter(x => x !== i) : [...s.bulkSelected, i] }));
  // Bulk payouts UI is waitlisted.

  const setStable = (k) => () => setState({ stableSel: k });
  const setConvertMode = (mode: ConvertMode) =>
    setState({
      convertMode: mode,
      convertSourceAccountId: "",
      convertDestAccountId: "",
      convertQuote: null,
      convertError: "",
      convertHop: 1,
      swapAccepted: false,
      quoteSeconds: 0,
    });
  /** Resolve a ready USDC FinancialAccount id for fiat↔fiat bridging. */
  const resolveUsdcBridgeId = (): string => {
    const fromState = (state.convertBridgeUsdcId || "").trim();
    if (fromState) return fromState;
    const ready = (stablecoinAccountsQuery.data ?? []).find(
      (a) => a.currency === "USDC" && isReadyStatus(a.status) && a.id,
    );
    return ready?.id ? String(ready.id) : "";
  };
  const refreshConvertQuote = async () => {
    const sourceId = state.convertSourceAccountId;
    const selectedDestId = state.convertDestAccountId;
    const amount = state.convertAmount;
    const twoHopHop1 =
      state.convertMode === "fiat_to_fiat" && state.convertHop === 1;
    const bridgeId = twoHopHop1 ? resolveUsdcBridgeId() : "";
    // Hop 1 of EUR↔USD quotes source fiat → USDC; selectedDestId is the final fiat.
    const quoteDestId = twoHopHop1 ? bridgeId : selectedDestId;

    if (!sourceId || !selectedDestId || !amount.trim()) {
      setState({ convertError: "Pick both accounts and enter an amount (min 1.00)." });
      return;
    }
    if (twoHopHop1 && !bridgeId) {
      setState({
        convertError:
          "Open a ready USDC account first — fiat↔fiat converts via USDC.",
      });
      return;
    }

    // Client-side available-balance guard when the partner exposed a balance.
    const fiatSource = (depositAccountsQuery.data?.accounts ?? []).find(
      (a) => String(a.id) === sourceId,
    );
    const stableSource = (stablecoinAccountsQuery.data ?? []).find(
      (a) => String(a.id) === sourceId,
    );
    try {
      if (fiatSource) {
        assertSufficientBalance({
          amount,
          balance: fiatSource.balance,
          currency: fiatSource.currency,
        });
      } else if (stableSource) {
        assertSufficientBalance({
          amount,
          balance: stableSource.balance,
          currency: stableSource.currency,
        });
      }
    } catch (err) {
      setState({
        convertError: err instanceof Error ? err.message : "Insufficient balance.",
      });
      return;
    }

    setState({
      convertQuoteLoading: true,
      convertError: "",
      convertQuote: null,
      swapAccepted: false,
      ...(bridgeId ? { convertBridgeUsdcId: bridgeId } : {}),
    });
    try {
      const quote = await conversionsApi.quote({
        source_account_id: sourceId,
        destination_account_id: quoteDestId,
        amount,
      });
      setState({
        convertQuoteLoading: false,
        convertQuote: quote,
        quoteSeconds: secondsUntilExpiry(quote.expires_at) || 120,
      });
    } catch (err) {
      setState({
        convertQuoteLoading: false,
        convertError:
          err instanceof Error ? err.message : "Couldn't get a conversion quote.",
      });
    }
  };
  const acceptConvertQuote = async () => {
    const quote = state.convertQuote;
    if (!quote?.quote_id || state.quoteSeconds <= 0) return;
    const bridgeId = resolveUsdcBridgeId();
    const finalFiatId = state.convertDestAccountId;
    setState({ convertAccepting: true, convertError: "" });
    try {
      const accepted = await conversionsApi.accept(quote.quote_id);
      queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["stablecoin-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });

      // EUR↔USD two-hop: after hop 1 (fiat→USDC), quote hop 2 (USDC→other fiat).
      if (
        state.convertMode === "fiat_to_fiat" &&
        state.convertHop === 1 &&
        bridgeId &&
        finalFiatId
      ) {
        const hop2Amount = accepted.destination_amount || quote.destination_amount;
        if (!hop2Amount) {
          throw new Error("First hop settled but no USDC amount returned for hop 2.");
        }
        // Hop 1 has settled — the funds are in the USDC bridge account. Pin the
        // flow to hop 2 *before* quoting, so a failed quote leaves a retryable
        // state instead of one that re-accepts the spent hop-1 quote_id.
        setState({
          convertHop: 2,
          convertBridgeUsdcId: bridgeId,
          convertSourceAccountId: bridgeId,
          convertDestAccountId: finalFiatId,
          convertQuote: null,
          convertAmount: String(hop2Amount),
        });
        const hop2 = await conversionsApi.quote({
          source_account_id: bridgeId,
          destination_account_id: finalFiatId,
          amount: String(hop2Amount),
        });
        setState({
          convertAccepting: false,
          convertHop: 2,
          convertBridgeUsdcId: bridgeId,
          convertSourceAccountId: bridgeId,
          convertDestAccountId: finalFiatId,
          convertQuote: hop2,
          convertAmount: String(hop2Amount),
          quoteSeconds: secondsUntilExpiry(hop2.expires_at) || 120,
          convertError: "",
        });
        return;
      }

      setState({
        convertAccepting: false,
        swapAccepted: true,
        convertQuote: accepted,
      });
    } catch (err) {
      setState({
        convertAccepting: false,
        convertError:
          err instanceof Error ? err.message : "Couldn't accept this conversion.",
      });
    }
  };
  const setTxFilter = (filter: PrimaryTransactionFilter) => () =>
    setState({ txFilter: filter });
  // Add Account: a small menu that branches into two create modals.
  const toggleAddAccountMenu = () => setState(s => ({ addAccountMenu: !s.addAccountMenu }));
  const closeAddAccountMenu = () => setState({ addAccountMenu: false });
  const openCreateAccount = (kind) => () => {
    const stableOccupied = occupiedStablecoinNetworkCodes(
      stablecoinAccountsQuery.data ?? [],
    );
    const fiatOccupied = occupiedFiatCurrencyCodes(
      depositAccountsQuery.data?.accounts ?? [],
    );
    if (kind === "stablecoin") {
      const available = SUPPORTED_STABLECOIN_NETWORKS.filter(
        (code) => !stableOccupied.has(code),
      );
      setState({
        modal: "createAccount",
        addAccountMenu: false,
        createAccountKind: "stablecoin",
        createAccountName: "",
        createAccountCurrency: "",
        createAccountStablecoin: available.length > 0 ? "USDC" : "",
        createAccountNetwork: available.length === 1 ? available[0] : "",
        createAccountError:
          available.length === 0
            ? "You already have a USDC account on every available network."
            : "",
      });
      return;
    }
    const availableFiat = SUPPORTED_IBAN_CURRENCIES.filter(
      (code) => !fiatOccupied.has(code),
    );
    setState({
      modal: "createAccount",
      addAccountMenu: false,
      createAccountKind: "bank",
      createAccountName: "",
      createAccountCurrency: availableFiat.length === 1 ? availableFiat[0] : "",
      createAccountStablecoin: "",
      createAccountNetwork: "",
      createAccountError:
        availableFiat.length === 0
          ? "You already have fiat accounts for USD and EUR."
          : "",
    });
  };
  const setCreateAccountName = (e) => setState({ createAccountName: e.target.value });
  const setCreateAccountCurrency = (e) => setState({ createAccountCurrency: e.target.value, createAccountError: "" });
  const setCreateAccountStablecoin = (e) => setState({ createAccountStablecoin: e.target.value, createAccountError: "" });
  const setCreateAccountNetwork = (e) => setState({ createAccountNetwork: e.target.value, createAccountError: "" });

  const copyField = (fieldKey, val) => () => { if (navigator.clipboard) navigator.clipboard.writeText(val).catch(()=>{}); setState({ copiedField: fieldKey }); };
  const toggleRevealKey = (id) => () => setState(s => ({ apiKeyRevealed: { ...s.apiKeyRevealed, [id]: !s.apiKeyRevealed[id] } }));
  const toggleRevealSecret = (id) => () => setState(s => ({ secretRevealed: { ...s.secretRevealed, [id]: !s.secretRevealed[id] } }));

  // Cards: issue / list / freeze against an active fiat USD funding account.
  const setNewCardLabel = (e) => setState({ newCardLabel: e.target.value, newCardError: "" });
  const setNewCardFirstName = (e) => setState({ newCardFirstName: e.target.value, newCardError: "" });
  const setNewCardLastName = (e) => setState({ newCardLastName: e.target.value, newCardError: "" });
  const setNewCardEmail = (e) => setState({ newCardEmail: e.target.value, newCardError: "" });
  const setNewCardPhone = (e) => setState({ newCardPhone: e.target.value, newCardError: "" });
  const issueCard = async () => {
    const label = state.newCardLabel.trim();
    const funding = usdFundingQuery.data;
    const firstName = state.newCardFirstName.trim();
    const lastName = state.newCardLastName.trim();
    const email = state.newCardEmail.trim();
    const phone = state.newCardPhone.trim();
    if (!funding) {
      setState({
        newCardError:
          "Open an active USD deposit account first — every card must be linked to USD.",
      });
      return;
    }
    if (!label) {
      setState({ newCardError: "Enter a card label." });
      return;
    }
    if (!firstName || !lastName) {
      setState({ newCardError: "Enter the cardholder’s first and last name." });
      return;
    }
    if (!isValidCardholderEmail(email)) {
      setState({ newCardError: "Enter a valid cardholder email." });
      return;
    }
    if (!isValidCardE164(phone)) {
      setState({
        newCardError: "Enter phone in E.164 format (e.g. +12125550198).",
      });
      return;
    }
    setState({ newCardIssuing: true, newCardError: "" });
    try {
      const issued = await cardsApi.create(funding.entityId, funding.accountId, {
        type: "virtual",
        reference: newCardReference(label),
        card_name: label,
        cardholder: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phone,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["issued-cards"] });
      setState({
        newCardIssuing: false,
        newCardDone: true,
        newlyIssuedCard: issued,
        selectedCardId: issued.id,
      });
    } catch (err) {
      setState({
        newCardIssuing: false,
        newCardError:
          err instanceof Error ? err.message : "Couldn't issue this card.",
      });
    }
  };
  const toggleFreezeCard = async () => {
    const funding = usdFundingQuery.data;
    const cardId = state.selectedCardId;
    const card = (issuedCardsQuery.data?.cards ?? []).find((c) => c.id === cardId);
    if (!funding || !card) return;
    setState({ cardFreezeBusy: true, cardFreezeError: "" });
    try {
      const frozen = (card.status || "").toLowerCase() === "frozen";
      const updated = frozen
        ? await cardsApi.unfreeze(funding.entityId, funding.accountId, card.id)
        : await cardsApi.freeze(funding.entityId, funding.accountId, card.id);
      await queryClient.invalidateQueries({ queryKey: ["issued-cards"] });
      setState({ cardFreezeBusy: false, selectedCardId: updated.id });
    } catch (err) {
      // Own field: the card detail modal renders this one. `newCardError` only
      // surfaces inside the issue-card modal, so a failed toggle looked silent.
      setState({
        cardFreezeBusy: false,
        cardFreezeError:
          err instanceof Error ? err.message : "Couldn't update card freeze state.",
      });
    }
  };
  const fundCard = () =>
    setState({
      modal: "acctDetail",
      acctDetailIntent: "fund",
      selectedAcctKind: "fiat",
      selectedAcctKey: "fiat:USD",
    });
  const openFundCardDirect = (_cardId: string) => (e) => {
    e.stopPropagation();
    fundCard();
  };
  const terminateCard = () => setState({ modal: null });

  const openInvite = () => setState({ inviteOpen: true, inviteName: "", inviteEmail: "", inviteRole: "operator" });
  const closeInvite = () => setState({ inviteOpen: false });
  const setInviteName = (e) => setState({ inviteName: e.target.value });
  const setInviteEmail = (e) => setState({ inviteEmail: e.target.value });
  const setInviteRole = (k) => () => setState({ inviteRole: k });
  const submitInvite = () => {
    const { inviteName, inviteEmail, inviteRole, teamMembers } = state;
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    const id = "u" + (teamMembers.length + 1) + "_" + Date.now();
    setState({
      teamMembers: [...teamMembers, { id, name: inviteName.trim(), email: inviteEmail.trim(), role: inviteRole, status: "invited" }],
      inviteOpen: false,
    });
  };
  const setMemberRole = (id) => (e) => {
    const role = e.target.value;
    setState(s => ({ teamMembers: s.teamMembers.map(m => m.id === id ? { ...m, role } : m) }));
  };
  const removeMember = (id) => () => setState(s => ({ teamMembers: s.teamMembers.filter(m => m.id !== id) }));

  const openCreateApiKeyModal = () => setState({ modal: "apiKey", apiKeyName: "", apiKeyEnvironment: "sandbox", apiKeyError: "" });
  const setApiKeyName = (e) => setState({ apiKeyName: e.target.value });
  const setApiKeyEnvironment = (env: string) => () => setState({ apiKeyEnvironment: env });
  const submitApiKey = async () => {
    if (!state.apiKeyName.trim()) return;
    setState({ apiKeyCreating: true, apiKeyError: "" });
    try {
      const created = await apiKeysApi.create({ name: state.apiKeyName.trim(), environment: state.apiKeyEnvironment });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      // Auto-reveal the new key in its own row — it's the only moment the
      // plaintext exists, so it must be visible without an extra click.
      setState((prev: any) => ({
        apiKeyCreating: false,
        modal: null,
        newlyCreatedKey: created,
        apiKeyRevealed: { ...prev.apiKeyRevealed, [created.id]: true },
      }));
    } catch (err) {
      setState({ apiKeyCreating: false, apiKeyError: err instanceof ApiRequestError ? err.message : "Couldn't create the key." });
    }
  };
  const submitCreateAccount = async () => {
    if (depositEligibilityQuery.data?.eligible !== true) {
      return setState({
        createAccountError: "Complete business verification before issuing currency accounts.",
      });
    }
    if (!state.createAccountName.trim()) {
      return setState({ createAccountError: "Give the account a name." });
    }
    if (state.createAccountKind === "stablecoin") {
      if (!state.createAccountStablecoin || !state.createAccountNetwork) {
        return setState({ createAccountError: "Choose a stablecoin and a network." });
      }
      const occupied = occupiedStablecoinNetworkCodes(
        bootstrapReady
          ? (bootstrapQuery.data?.stablecoinAccounts ?? [])
          : (stablecoinAccountsQuery.data ?? []),
      );
      if (occupied.has(state.createAccountNetwork.trim().toUpperCase())) {
        return setState({
          createAccountError:
            "You already have a USDC account on this network.",
        });
      }
      setState({ createAccountSaving: true, createAccountError: "" });
      try {
        const payload = buildStablecoinOpenPayload({
          currency: state.createAccountStablecoin,
          network: state.createAccountNetwork,
          displayName: state.createAccountName.trim(),
        });
        const entityId = await resolvePrimaryEntityId();
        await entitiesApi.openAccount(entityId, payload);
        queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
        queryClient.invalidateQueries({ queryKey: ["stablecoin-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["sendable-stablecoin-accounts"] });
        setState({ createAccountSaving: false, modal: null });
      } catch (err) {
        setState({
          createAccountSaving: false,
          createAccountError: err instanceof Error ? err.message : "Couldn't create the account.",
        });
      }
      return;
    }
    if (!state.createAccountCurrency) {
      return setState({ createAccountError: "Choose a currency." });
    }
    const occupiedFiat = occupiedFiatCurrencyCodes(
      depositAccountsQuery.data?.accounts ?? [],
    );
    if (occupiedFiat.has(state.createAccountCurrency.trim().toUpperCase())) {
      return setState({
        createAccountError: `You already have a ${state.createAccountCurrency.toUpperCase()} account.`,
      });
    }
    setState({ createAccountSaving: true, createAccountError: "" });
    try {
      await depositAccountsApi.create({
        currency: state.createAccountCurrency,
        accountName: state.createAccountName.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-accounts"] });
      setState({ createAccountSaving: false, modal: null });
    } catch (err) {
      setState({
        createAccountSaving: false,
        createAccountError: err instanceof Error ? err.message : "Couldn't create the account.",
      });
    }
  };
  const revokeApiKey = (id: number) => async () => {
    await apiKeysApi.revoke(id);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
  };
  const deleteApiKey = (id: number) => async () => {
    await apiKeysApi.remove(id);
    queryClient.invalidateQueries({ queryKey: ["api-keys"] });
  };

  const setInvClient = (e) => setState({ invClient: e.target.value });
  const setInvAmount = (e) => setState({ invAmount: e.target.value });
  const submitInvoice = async () => {
    if (!state.invClient.trim() || !state.invAmount.trim()) return;
    setState({ invoiceSubmitting: true, invoiceError: "" });
    try {
      const draft = await invoicesApi.createDraft(null, buildSimpleDraftPayload(state.invClient, state.invAmount));
      await invoicesApi.issue(draft.id, "none");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setState({ invoiceDone: true, invoiceSubmitting: false });
    } catch (err) {
      setState({
        invoiceSubmitting: false,
        invoiceError: err instanceof ApiRequestError ? err.message : "Couldn't create the invoice. Try again.",
      });
    }
  };
  const uploadTierDoc = () => {};
  const submitTier = () => setState({ tierDone: true });
  const setBalanceView = (v) => () => setState({ balanceView: v });
  const setDisplayCurrency = (currency: string) => {
    const code = currency.trim().toUpperCase();
    if (!isDisplayCurrency(code)) return;
    const options = displayCurrencyOptionsFromCatalog(
      sendCatalogQuery.data,
      mergeExchangeRates(summaryQuery.data?.fx_rates, exchangeRatesQuery.data),
    );
    if (!options.includes(code)) return;
    writeStoredDisplayCurrency(code);
    setState({ displayCurrency: code });
  };
  /** Send opens on a method chooser. Bank/mobile preselect that rail, then the
   *  flow runs the design's three steps: destination → recipient → review. */
  const chooseSendMethod = (m) => () => {
    if (m === "internal") return;
    const common = {
      sendMethod: m,
      sendStep: 1,
      sendCountryIdx: 0,
      sendProviderIdx: 0,
      sendRecipient: "",
      sendRecipientName: "",
      sendAmount: "",
      sendAmountCurrency: "USD",
      sendQuoteError: "",
      sendAcceptError: "",
      sendPreview: null,
      sendConfirm: null,
      sendAccountId: "",
      sendAsset: "usdc",
    };
    if (m === "crypto") {
      setState({ ...common, sendGroup: "crypto" });
      return;
    }
    const prefer = m === "mobile" ? "mobile" : "bank";
    const countryIdx = COUNTRIES.findIndex((c) => c.rails.some((r) => r.type === prefer));
    const idx = countryIdx >= 0 ? countryIdx : 0;
    setState({
      ...common,
      sendGroup: "country",
      sendCountryIdx: idx,
      sendRailIdx: railIndexForMethod(COUNTRIES[idx].rails, m),
    });
  };

    const s = state;
    const boostDark = props.boostDarkContrast ?? true;
    const vars = s.theme === "dark" ? (boostDark ? { ...DARK, ...DARK_HC_OVERRIDES } : DARK) : LIGHT;

    const titles: Record<string, [string, string]> = {
      home: ["Home", "Your balances, actions, and activity at a glance"],
      wallets: ["Accounts", "One main stablecoin wallet, currency accounts around it"],
      accountDetail: ["Account", "Balance, details, and activity for this account"],
      cards: ["Cards", "Virtual USD cards for team spend"],
      transactions: ["Transactions", "Every payout, deposit, and swap across rails"],
      invoices: ["Invoices", "Request and track incoming payments"],
      reports: ["Reports", "Volume, corridors, and settlement performance"],
      verification: ["Verification", "Higher tiers unlock higher limits"],
      team: ["Team", "Invite teammates and manage their access"],
      developer: ["Developer", "API keys and webhooks"],
      send: ["Send money", "Pick a method, recipient, and amount"],
      deposit: [
        s.fundAfricanTargetCurrency
          ? `Fund ${s.fundAfricanTargetCurrency}`
          : "Top up balance",
        s.fundAfricanTargetCurrency
          ? "Fund via African rails"
          : "Add funds from any supported rail",
      ],
      receive: ["Receive globally", "Share IBAN, Paybill, or wallet details"],
      convert: ["Convert", "Swap fiat and stablecoin at a locked quote"],
    };
    const [currentTitle, currentSubtitle] = titles[s.screen] || titles.wallets;

    const sendCountryChips = COUNTRIES.map((c, i) => ({
      idx: i,
      flagUrl: flagUrl(c.iso), name: c.name, code: c.code, select: selectSendCountry(i),
      bg: i === s.sendCountryIdx ? "var(--indigo-tint)" : "var(--surface2)", border: i === s.sendCountryIdx ? "var(--indigo)" : "transparent",
      selectSend: selectSendCountry(i), sendBg: i === s.sendCountryIdx ? "var(--indigo-tint)" : "var(--surface2)", sendBorder: i === s.sendCountryIdx ? "var(--indigo)" : "transparent",
      _rails: c.rails,
    })).filter((c) => {
      if (s.sendMethod === "mobile") return c._rails.some((r) => r.type === "mobile");
      if (s.sendMethod === "bank") return c._rails.some((r) => r.type === "bank");
      return true;
    });
    const sendCountry = COUNTRIES[s.sendCountryIdx];
    const sendRailChips = sendCountry.rails.map((r, i) => ({ label: r.label, select: selectSendRail(i), selected: i === s.sendRailIdx, bg: i === s.sendRailIdx ? "var(--ink)" : "var(--surface2)", color: i === s.sendRailIdx ? "var(--bg)" : "var(--ink)" }));
    const sendRail = sendCountry.rails[s.sendRailIdx] || sendCountry.rails[0];
    // Real catalog providers for this corridor when the aggregator has one
    // (carries a real networkId — see sendNext). While the first catalog
    // fetch is in flight, show no chips (not hardcoded fallback); after
    // settle with no match, fall back so un-onboarded corridors still render.
    const sendCatalogProviders = offRampProvidersForRail(
      sendCatalogQuery.data,
      sendCountry.iso,
      sendRail.type,
      sendCountry.code,
    );
    const sendProviderOptions = providerNamesFromCatalog(
      sendCatalogProviders,
      sendRail.options,
      sendCatalogSettled,
    );
    const sendCatalogLoading = !sendCatalogSettled;
    const sendProviderIdx =
      sendProviderOptions.length === 0
        ? 0
        : Math.min(s.sendProviderIdx, sendProviderOptions.length - 1);
    const sendProvider = sendProviderOptions[sendProviderIdx] || sendProviderOptions[0] || "";
    const sendProviderChips = sendProviderOptions.map((name, i) => ({
      name,
      select: selectSendProvider(i),
      bg: i === sendProviderIdx ? "var(--indigo-tint)" : "var(--surface2)",
      border: i === sendProviderIdx ? "var(--indigo)" : "transparent",
    }));

    const depositCountryPicked = s.depositCountryIdx >= 0 && Boolean(COUNTRIES[s.depositCountryIdx]);
    const depositCountry = COUNTRIES[s.depositCountryIdx] || COUNTRIES[0];
    const depositRail = depositCountry.rails[s.depositRailIdx] || depositCountry.rails[0];
    const depositCatalogProviders = onRampProvidersForRail(
      sendCatalogQuery.data,
      depositCountry.iso,
      depositRail.type,
      depositCountry.code,
    );
    const depositProviderOptions =
      depositCatalogProviders && depositCatalogProviders.length > 0
        ? depositCatalogProviders.map((p) => p.name)
        : depositRail.options;
    const depositProvider = resolveQuotedProviderName(
      depositProviderOptions,
      s.depositProviderName,
    );
    const depositProviderIdx = indexOfProviderName(depositProviderOptions, s.depositProviderName);
    const depositCountryRows = COUNTRIES.map((c, i) => {
      const extraNames = c.rails.flatMap((rail) => {
        const catalog = onRampProvidersForRail(
          sendCatalogQuery.data,
          c.iso,
          rail.type,
          c.code,
        );
        return catalog ? catalog.map((p) => p.name) : [];
      });
      return {
        idx: i,
        flagUrl: flagUrl(c.iso),
        name: c.name,
        code: c.code,
        railsLabel: countryRailsLabel(c),
        searchText: countrySearchHaystack(c, extraNames),
        select: selectDepositCountry(i),
      };
    });
    const depositMethodGroups = depositCountryPicked
      ? depositCountry.rails.map((rail, railIdx) => {
          const catalogProviders = onRampProvidersForRail(
            sendCatalogQuery.data,
            depositCountry.iso,
            rail.type,
            depositCountry.code,
          );
          const options = ensureSelectedProvider(
            catalogProviders && catalogProviders.length > 0
              ? catalogProviders.map((p) => p.name)
              : rail.options,
            s.depositRailIdx === railIdx ? s.depositProviderName : "",
          );
          return {
            railIdx,
            type: rail.type,
            label: rail.label,
            providers: options.map((name, providerIdx) => ({
              name,
              selected:
                s.depositRailIdx === railIdx &&
                indexOfProviderName([name], s.depositProviderName) === 0,
              select: selectDepositMethod(railIdx, providerIdx, name),
            })),
          };
        })
      : [];

    const bulkCountryChips = COUNTRIES.slice(0, 10).map((c, i) => ({
      flagUrl: flagUrl(c.iso), code: c.code, toggleBulk: toggleBulkCountry(i),
      bulkBg: s.bulkSelected.includes(i) ? "var(--indigo-tint)" : "var(--surface2)",
      bulkBorder: s.bulkSelected.includes(i) ? "var(--indigo)" : "transparent",
    }));

    const decorateTx = (t: Transaction) => {
      return {
        ...presentTransaction(t),
        openDetail: openTxDetail(t.id),
      };
    };
    const decoratedAll = (transactionsQuery.data?.items ?? []).map(decorateTx);
    const txUsesLatestFifty =
      s.txFilter === "incoming" ||
      s.txFilter === "outgoing" ||
      Boolean(s.txSearch.trim()) ||
      s.txCurrency !== "all" ||
      s.txDateRange !== "all";
    const latestFiftyMatches = searchTransactions(transactionsQuery.data?.items ?? [], {
      primary: s.txFilter,
      query: s.txSearch,
      currency: s.txCurrency,
      dateRange: s.txDateRange,
    }).map(decorateTx);
    const filteredTransactions = txUsesLatestFifty
      ? latestFiftyMatches
      : transactionsPageQuery.items.map(decorateTx);
    // Fetched by id (txDetailQuery), independent of the list above — see
    // openTxDetail. Falls back to the list's cached copy while the detail
    // fetch is in flight so the modal isn't blank on first open.
    const txDetail = txDetailQuery.data
      ? decorateTx(txDetailQuery.data)
      : decoratedAll.find((t) => t.id === s.selectedTxId)
        ?? filteredTransactions.find((t) => t.id === s.selectedTxId);
    const txLiveStatus =
      s.modal === "txDetail" && txDetail && !txStatusQuery.isTerminal
        ? {
            label: txStatusQuery.isFrozen ? "Frozen — needs review" : "Tracking live — updates automatically",
            isFetching: txStatusQuery.isFetching,
          }
        : null;
    // Deposit account status pills — balances come from partner `balance`
    // when present (see docs/api-contract.md / lib/services/balances.ts).
    const depositStatusPalette: Record<string, [string, string]> = {
      active: ["var(--indigo-text)", "var(--indigo-tint)"],
      pending: ["var(--amber)", "var(--amber-tint)"],
      unavailable: ["var(--red)", "var(--red-tint)"],
    };
    const depositStatusColors = (status: string): [string, string] =>
      depositStatusPalette[status] || ["var(--muted)", "var(--surface2)"];
    const depositAccountsList = bootstrapReady
      ? (bootstrapQuery.data?.fiatAccounts ?? [])
      : (depositAccountsQuery.data?.accounts ?? []);
    const stablecoinAccountsList = bootstrapReady
      ? (bootstrapQuery.data?.stablecoinAccounts ?? [])
      : (stablecoinAccountsQuery.data ?? []);
    const selectedDepositAccount =
      s.selectedAcctKind === "fiat" && s.selectedAcctKey.startsWith("fiat:")
        ? depositAccountsList.find(
            (a) => a.currency.toUpperCase() === s.selectedAcctKey.slice("fiat:".length),
          ) ?? null
        : null;
    const selectedStablecoinAccount =
      s.selectedAcctKind === "stablecoin" && s.selectedAcctKey.startsWith("stablecoin:")
        ? stablecoinAccountsList.find(
            (a) => a.id === s.selectedAcctKey.slice("stablecoin:".length),
          ) ?? null
        : null;
    const acctDetail = selectedDepositAccount
      ? (() => {
          const view = mapDepositAccountToCardView(selectedDepositAccount);
          const [statusColor, statusSoft] = depositStatusColors(view.status);
          const rows = buildDepositAccountDetailRows(selectedDepositAccount);
          const bankRows = rows.filter((r) =>
            /^(iban|bic|swift|bank|account name)/i.test(r.label),
          );
          const settleRows = rows.filter(
            (r) => !/^(iban|bic|swift|bank|account name)/i.test(r.label),
          );
          return {
            currency: view.currency,
            name: view.name,
            beneficiary: selectedDepositAccount.account_holder_name || view.name,
            flagUrl: view.iso ? flagUrl(view.iso) : null,
            statusLabel: view.statusLabel,
            statusColor,
            statusSoft,
            balance: view.balance,
            balanceSub: view.hasBalance ? "Available balance" : "Balance not yet available",
            rows,
            sections: [
              ...(bankRows.length ? [{ title: "Bank details", rows: bankRows }] : []),
              ...(settleRows.length ? [{ title: "Settlement", rows: settleRows }] : []),
            ],
            instructions: selectedDepositAccount.instructions,
            railLabel: fiatRailForCurrency(view.currency),
            showConvert: true,
            showDownloadLetter: rows.length > 0,
          };
        })()
      : selectedStablecoinAccount
        ? (() => {
            const networkLabel = formatNetworkLabel(selectedStablecoinAccount.network);
            const statusKey = stablecoinStatusTone(selectedStablecoinAccount.status);
            const [statusColor, statusSoft] = depositStatusColors(statusKey);
            const rows = buildStablecoinAccountDetailRows(selectedStablecoinAccount);
            return {
              currency: selectedStablecoinAccount.currency,
              name: `${selectedStablecoinAccount.currency} · ${networkLabel}`,
              beneficiary: `${selectedStablecoinAccount.currency} · ${networkLabel}`,
              flagUrl: null as string | null,
              statusLabel: describeStablecoinAccountStatus(selectedStablecoinAccount.status),
              statusColor,
              statusSoft,
              balance: formatAccountBalance(selectedStablecoinAccount.balance, {
                maximumFractionDigits: 6,
              }),
              balanceSub: formatAccountBalance(selectedStablecoinAccount.balance) !== "—"
                ? "Available balance"
                : "Balance not yet available",
              rows,
              sections: [{ title: "Account", rows }],
              instructions: null as string | null,
              railLabel: `Stablecoin · ${networkLabel}`,
              showConvert: false,
              showDownloadLetter: false,
            };
          })()
      : null;
    const acctSummaryLines = (acctDetail?.rows ?? [])
      .filter((row) => !row.copyValue)
      .slice(0, 3)
      .map((row) => ({ k: row.label, v: row.value }));
    // Prefer a short readable summary when coords-only rows would leave the strip empty.
    const acctDetailLines =
      acctSummaryLines.length > 0
        ? acctSummaryLines
        : acctDetail
          ? [
              { k: "Rail", v: acctDetail.railLabel ?? acctDetail.currency },
              { k: "Status", v: acctDetail.statusLabel },
              ...(acctDetail.rows[0]
                ? [{ k: acctDetail.rows[0].label, v: acctDetail.rows[0].value }]
                : []),
            ]
          : [];
    const issuedCardsList = issuedCardsQuery.data?.cards ?? [];
    const cardSel =
      issuedCardsList.find((c) => c.id === s.selectedCardId) || null;
    const usdFunding: UsdFundingAccount | null = usdFundingQuery.data ?? null;
    const usdSpendLabel =
      usdFunding && usdFunding.balanceLabel !== "—"
        ? `$${usdFunding.balanceLabel}`
        : "—";
  const rootStyle: React.CSSProperties = { minHeight: "100vh", position: "relative", background: "var(--bg)", color: "var(--ink)", fontFamily: "'DM Sans',sans-serif", ...vars };
  const themeIcon = s.theme === "dark" ? "☀" : "☾";
  const isHome = s.screen === "home";
  const isWallets = s.screen === "wallets";
  const isAccountDetail = s.screen === "accountDetail";
  const isCards = s.screen === "cards";
  const isTransactions = s.screen === "transactions";
  const isInvoices = s.screen === "invoices";
  const isReports = s.screen === "reports";
  const isVerification = s.screen === "verification";
  const isTeam = s.screen === "team";
  const isDeveloper = s.screen === "developer";
  const balanceViewTabs = ["all","fiat","stablecoin"].map(v => ({ key: v, label: v === "all" ? "All" : v === "fiat" ? "Fiat" : "Stablecoin", select: setBalanceView(v), bg: s.balanceView === v ? "#fff" : "transparent", color: s.balanceView === v ? "var(--indigo)" : "#fff" }));
  // Total / available / pending: native per-account amounts — never FX-converted.
  const usdcBalances = stablecoinAccountsList
    .filter((a) => a.currency === "USDC")
    .map((a) => a.balance);
  const usdcTotalLabel = formatSummedBalance(usdcBalances, { maximumFractionDigits: 2 });
  const anyStableBalance = usdcTotalLabel !== "—";
  const fiatLedgerItems = depositAccountsList.map((a) => ({
    currency: a.currency,
    balance: a.balance,
  }));
  const stableLedgerItems = stablecoinAccountsList.map((a) => ({
    currency: a.currency,
    balance: a.balance,
  }));
  const homeAvailableLedgerItems =
    s.balanceView === "stablecoin"
      ? stableLedgerItems.filter((a) => (a.currency || "").toUpperCase() === "USDC")
      : s.balanceView === "fiat"
        ? fiatLedgerItems
        : [...fiatLedgerItems, ...stableLedgerItems];
  const pendingLedgerItems = homeAvailableLedgerItems
    .map((item) => ({
      currency: item.currency,
      balance: pendingBalanceFromAccount(item.balance),
    }))
    .filter((item) => item.balance !== null);
  const homeFxRates = mergeExchangeRates(
    bootstrapQuery.data?.fxRates,
    summaryQuery.data?.fx_rates,
    exchangeRatesQuery.data,
  );
  const displayCurrencyOptions = displayCurrencyOptionsFromCatalog(
    sendCatalogQuery.data,
    homeFxRates,
  );
  const displayCurrency: DisplayCurrency = resolveDisplayCurrency(
    s.displayCurrency,
    displayCurrencyOptions,
  );
  const homeDisplayTotal = totalBalanceInDisplayCurrency(
    homeAvailableLedgerItems,
    displayCurrency,
    homeFxRates,
    { maximumFractionDigits: 2 },
  );
  const homeUsdTotal = totalBalanceInDisplayCurrency(
    homeAvailableLedgerItems,
    "USD",
    homeFxRates,
    { maximumFractionDigits: 2 },
  );
  const homeHeroLabel = formatHeroTotalLabel(homeDisplayTotal.total, displayCurrency, {
    maximumFractionDigits: 2,
  });
  const homeUsdSub =
    displayCurrency === "USD"
      ? null
      : formatUsdEquivalentSub(homeUsdTotal.total);
  const homePendingUsd = totalBalanceInDisplayCurrency(
    pendingLedgerItems,
    "USD",
    homeFxRates,
    { maximumFractionDigits: 0 },
  );
  const homePendingAmountComplete =
    homeAvailableLedgerItems.length > 0 &&
    pendingLedgerItems.length === homeAvailableLedgerItems.length;
  const awaitingSettlementLabel = homePendingAmountComplete
    ? (homePendingUsd.total == null
        ? "—"
        : `$${homePendingUsd.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
    : "—";
  // Fiat IBAN chips + partner stablecoin account chips.
  const fiatBalanceRows = depositAccountsList.map((a) => {
    const view = mapDepositAccountToCardView(a);
    return { flagUrl: view.iso ? flagUrl(view.iso) : null, code: view.currency, balance: view.balance };
  });
  const stableBalanceRows = stablecoinAccountsList.map((a) => ({
    flagUrl: null as string | null,
    code: `${a.currency}/${formatNetworkLabel(a.network)}`,
    balance: formatAccountBalance(a.balance, { maximumFractionDigits: 2 }),
  }));
  const homeCurrencyChips =
    s.balanceView === "stablecoin"
      ? stableBalanceRows
      : s.balanceView === "fiat"
        ? fiatBalanceRows
        : [...fiatBalanceRows, ...stableBalanceRows];
  // Unknown while /auth/me is in flight — distinct from a real "pending" KYB
  // status, so we don't flash "Start verification" for already-approved businesses.
  const kybStatusLoading = (meQuery.isLoading || meQuery.isPending) && !meQuery.data;
  const kybStatus = kybStatusLoading
    ? undefined
    : ((meQuery.data?.kyb_summary?.profile?.kyb_status as string | undefined) ?? "pending");
  const kybApproved = isKybApproved(kybStatus);
  const quickActionTiles = [
        { label: "Send", icon: "↗", desc: "Mobile money, bank, SEPA or stablecoin.", open: guardMoneyModal("send"), iconBg: "var(--indigo)", iconColor: "var(--indigo-on)" },
        { label: "Bulk payouts", icon: "⇉", desc: "Coming soon — join the waitlist.", open: guardMoneyModal("bulk"), iconBg: "var(--ink-panel)", iconColor: "#fff" },
        { label: "Receive globally", icon: "↙", desc: "Share your IBAN, Paybill or wallet details.", open: guardMoneyModal("receive"), iconBg: "var(--amber)", iconColor: "#fff" },
        { label: "Top up", icon: "＋", desc: "Fund your balance from any rail.", open: guardMoneyModal("deposit"), iconBg: "var(--indigo-tint)", iconColor: "var(--indigo-text)" },
      ];
  const totals = summaryQuery.data?.totals;
  const liveRates = liveRateRowsFromSummary(homeFxRates);
  const fmtUsd = (v: string | number | undefined) => {
    if (v == null) return "—";
    const amount = Number(v);
    return Number.isFinite(amount)
      ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : "—";
  };
  const homeStats = [
        { label: "Money in · 30 days", value: fmtUsd(totals?.money_in_30d), icon: "↑", iconBg: "var(--indigo-tint)", iconColor: "var(--indigo-text)" },
        { label: "Money out · 30 days", value: fmtUsd(totals?.money_out_30d), icon: "↓", iconBg: "var(--surface3)", iconColor: "var(--muted)" },
        { label: "Awaiting settlement", value: awaitingSettlementLabel, icon: "◔", iconBg: "var(--amber-tint)", iconColor: "var(--amber)" },
      ];
  const homeBalanceSub = !homeCurrencyChips.length
    ? "Balance not yet available"
    : homeDisplayTotal.excluded.length
      ? `Across all wallets and accounts · excludes ${homeDisplayTotal.excluded.join(", ")}`
      : "Across all wallets and accounts";
  const homeRecent = decoratedAll.slice(0, 4);
  const mainWalletBalance =
    usdcTotalLabel === "—" ? "—" : `${usdcTotalLabel} USDC`;
  const mainWalletSub = anyStableBalance
    ? "Available across ready USDC rails"
    : "Stablecoin balance not yet available";
  const stableTabs = ["USDC","USDT"].map(k => ({ label: k, select: setStable(k), bg: s.stableSel === k ? "var(--indigo)" : "transparent", color: s.stableSel === k ? "var(--indigo-on)" : "var(--muted)" }));
  const fiatAccountCards = depositAccountsList.map((a) => {
    const view = mapDepositAccountToCardView(a);
    const [statusColor, statusSoft] = depositStatusColors(view.status);
    const key = `fiat:${view.currency.toUpperCase()}`;
    return {
      key,
      currency: view.currency,
      name: view.name,
      label: view.name,
      flagUrl: view.iso ? flagUrl(view.iso) : null,
      rail: fiatRailForCurrency(view.currency),
      balance: view.balance,
      detail: view.primaryDetail,
      statusLabel: view.statusLabel,
      statusColor,
      statusSoft,
      openDetail: openAcctDetail("fiat", key),
    };
  });
  const stablecoinAccountCards = stablecoinAccountsList.map((a) => {
    const networkLabel = formatNetworkLabel(a.network);
    const statusKey = stablecoinStatusTone(a.status);
    const [statusColor, statusSoft] = depositStatusColors(statusKey);
    const key = `stablecoin:${a.id}`;
    const balance = formatAccountBalance(a.balance, { maximumFractionDigits: 2 });
    return {
      key,
      currency: a.currency,
      name: a.currency,
      label: `${a.currency} · ${networkLabel}`,
      flagUrl: null as string | null,
      rail: `Stablecoin · ${networkLabel}`,
      balance,
      detail: networkLabel,
      statusLabel: describeStablecoinAccountStatus(a.status),
      statusColor,
      statusSoft,
      openDetail: openAcctDetail("stablecoin", key),
    };
  });
  const accounts = [...fiatAccountCards, ...stablecoinAccountCards];
  const accountsCount = accounts.length;
  const depositEligible = bootstrapReady
    ? Boolean(bootstrapQuery.data?.eligibility.eligible)
    : depositEligibilityQuery.data?.eligible === true;
  const depositEligibilityErrorMessage = bootstrapReady
    ? undefined
    : depositEligibilityQuery.isError
      ? (depositEligibilityQuery.error instanceof Error
          ? depositEligibilityQuery.error.message
          : "Couldn't check account eligibility. Try again.")
      : bootstrapQuery.isError
        ? (bootstrapQuery.error instanceof Error
            ? bootstrapQuery.error.message
            : "Couldn't load accounts. Try again.")
        : undefined;
  const depositAccountsErrorMessage =
    !bootstrapReady &&
    (depositAccountsQuery.isError || stablecoinAccountsQuery.isError)
      ? (depositAccountsQuery.error instanceof Error
          ? depositAccountsQuery.error.message
          : stablecoinAccountsQuery.error instanceof Error
            ? stablecoinAccountsQuery.error.message
            : "Couldn't load currency accounts. Try again.")
      : undefined;
  const walletsRecent = decoratedAll.slice(0, 5);
  const fundingUsdcAccount =
    stablecoinAccountsList.find(
      (a) => isFundableStablecoinAccount(a) && a.currency === "USDC",
    ) ??
    stablecoinAccountsList.find((a) => isFundableStablecoinAccount(a)) ??
    null;
  const fundingOnRampAccount =
    (selectedStablecoinAccount && isFundableStablecoinAccount(selectedStablecoinAccount)
      ? selectedStablecoinAccount
      : null) ??
    fundingUsdcAccount;
  const fundStablecoinRails = buildFundStablecoinRails(stablecoinAccountsList);
  const africanFundPlan = acctDetail
    ? planAfricanFundOrchestration({
        fiatCurrency: acctDetail.currency,
        fiatAccountId: null,
        entityId: fundingOnRampAccount?.entityId ?? null,
        usdcAccountId: fundingOnRampAccount?.id ?? null,
        usdcWalletAddress: fundingOnRampAccount?.walletAddress ?? null,
        treasuryWalletAddress: resolveTreasuryWalletAddress({
          summaryWallet: summaryQuery.data?.totals.wallet_address,
          stablecoinAccounts: stablecoinAccountsQuery.data,
        }),
        convertNetworkId: null,
      })
    : null;
  const cardsRecent: ActivityItem[] = [];
  const corridors = CORRIDORS.map(c => ({
        ...c,
        flagUrl: flagUrl(c.iso),
        statusLabel: c.status === "live" ? "Live" : "Degraded",
        statusColor: c.status === "live" ? "var(--indigo-text)" : "var(--amber)",
        statusSoft: c.status === "live" ? "var(--indigo-tint)" : "var(--amber-tint)",
      }));
  const cards = issuedCardsList.map((c, i) => {
    const frozen = (c.status || "").toLowerCase() === "frozen";
    return {
      id: c.id,
      label: c.card_name || `Card ···· ${c.last_four || ""}`,
      last4: c.last_four || "————",
      balance: usdSpendLabel,
      bg: cardPlasticBg(i),
      status: frozen ? "frozen" : "active",
      statusLabel: describeCardStatus(c.status),
      filter: frozen ? "saturate(0.2) opacity(0.7)" : "none",
      openDetail: openCardDetail(c.id),
      fund: openFundCardDirect(c.id),
      freeze: openCardDetail(c.id),
    };
  });
  const cardsLoading = usdFundingQuery.isLoading || issuedCardsQuery.isLoading;
  const cardsError =
    usdFundingQuery.isError || issuedCardsQuery.isError
      ? (usdFundingQuery.error instanceof Error
          ? usdFundingQuery.error.message
          : issuedCardsQuery.error instanceof Error
            ? issuedCardsQuery.error.message
            : "Couldn't load cards.")
      : !usdFunding && !usdFundingQuery.isLoading
        ? "Open an active USD deposit account to issue cards."
        : "";
  const cardsFundingHint = describeUsdFunding(usdFunding);
  const txFilters = PRIMARY_TX_FILTERS.map((filter) => ({
    key: filter.key,
    label: filter.label,
    select: setTxFilter(filter.key),
    active: s.txFilter === filter.key,
  }));
  const txCurrencyOptions = Array.from(
    new Set((transactionsQuery.data?.items ?? []).map((transaction) => transaction.currency.toUpperCase())),
  ).sort();
  const invoices = (invoicesQuery.data?.items ?? []).map((inv) => {
    const [l, c, soft] = STATUS_MAP[inv.status] || ["Draft", "var(--muted)", "var(--surface2)"];
    const clientName = inv.payload?.client_name || "—";
    const lineItem = inv.payload?.line_items?.[0];
    const amount = lineItem
      ? `${inv.payload.currency} ${lineItem.unit_amount ?? lineItem.amount ?? ""}`.trim()
      : inv.payload?.currency || "";
    return { id: inv.invoice_number, client: clientName, amount, statusLabel: l, statusColor: c, statusSoft: soft };
  });

  // Reports screen is waitlisted — keep nav entry, skip derived report metrics.

  // Tier 1 reflects real account/email verification. Tier 2 is the real Mboka
  // KYB wizard (`/api/businesses/{id}/kyb/*`). Tier 3 has no backend yet.
  const emailVerified = !!meQuery.data?.user.email_verified;
  const tier2Display = kybStatusLoading
    ? { label: "Loading…", color: "var(--muted)", soft: "var(--surface2)" }
    : kybTierDisplay(kybStatus);
  const tier2Approved = kybApproved;
  const hasKybProfile = !!meQuery.data?.kyb_summary?.profile;
  const kybActionLabel = hasKybProfile ? "Continue verification" : "Start verification";
  const tiers = [
        { num: "TIER 1", title: "Basic", reqs: ["Business email verified","Director ID verified","Phone linked"], limit: "Limit · $1,000 / day", statusLabel: emailVerified ? "Complete" : "Pending", statusColor: emailVerified ? "var(--indigo-text)" : "var(--muted)", statusSoft: emailVerified ? "var(--indigo-tint)" : "var(--surface2)", locked: false },
        { num: "TIER 2", title: "Registered Business", reqs: ["Business profile & address","Beneficial owner (UBO)","Supporting documents"], limit: "Limit · $25,000 / day", statusLabel: tier2Display.label, statusColor: tier2Display.color, statusSoft: tier2Display.soft, locked: false, showKybAction: !kybStatusLoading && canOpenKybWizard(kybStatus), kybActionLabel },
        { num: "TIER 3", title: "Institutional", reqs: ["Audited financials","AML/CFT policy","Beneficial ownership"], limit: "Limit · $250,000 / day", statusLabel: kybStatusLoading ? "…" : !tier2Approved ? "Requires Tier 2" : s.tierDone ? "In review" : "Locked", statusColor: s.tierDone ? "var(--amber)" : "var(--muted)", statusSoft: s.tierDone ? "var(--amber-tint)" : "var(--surface2)", locked: !tier2Approved || !s.tierDone },
      ];
  // The backend only ever returns the full plaintext key once, in the
  // create/rotate response — list/detail always return it masked. So
  // "Reveal"/"Copy" on the secret-key row can only do something real for a
  // key minted in this session (held in `newlyCreatedKey`); for every other
  // key they render in the same place but disabled, with a title saying why.
  // The webhook rows come from the per-key detail endpoint, since the list
  // endpoint omits them.
  const justMintedKey = s.newlyCreatedKey;
  const apiKeys = (apiKeysQuery.data ?? [])
    .filter((k) => !k.revoked)
    .map((k) => {
      const detail = apiKeyDetailById.get(k.id);
      const plaintext = justMintedKey && justMintedKey.id === k.id ? justMintedKey.key : null;
      const revealed = !!s.apiKeyRevealed[k.id];
      const secretRevealed = !!s.secretRevealed[k.id];
      const webhookSecret = detail?.webhook_secret ?? null;
      return {
        ...k,
        label: k.name,
        modeLabel: k.environment === "live" ? "Live" : "Test",
        modeBg: k.environment === "live" ? "var(--indigo-tint)" : "var(--surface2)",
        modeColor: k.environment === "live" ? "var(--indigo-text)" : "var(--muted)",

        keyDisplay: plaintext && revealed ? plaintext : k.key,
        canRevealKey: !!plaintext,
        revealLabel: revealed ? "Hide" : "Reveal",
        revealTitle: plaintext ? "" : "The full key is shown only once, when it's created.",
        toggleReveal: plaintext ? toggleRevealKey(k.id) : () => {},
        copyKey: plaintext ? copyField("key:" + k.id, plaintext) : () => {},
        copyKeyLabel: s.copiedField === "key:" + k.id ? "Copied" : "Copy",

        webhookUrl: detail?.webhook_url || "Not configured",
        copyWebhook: detail?.webhook_url ? copyField("wh:" + k.id, detail.webhook_url) : () => {},
        copyWebhookLabel: s.copiedField === "wh:" + k.id ? "Copied" : "Copy",
        canCopyWebhook: !!detail?.webhook_url,
        events: detail?.scopes?.length ? detail.scopes.join(" · ") : "No scopes set",

        webhookSecretDisplay: webhookSecret ? (secretRevealed ? webhookSecret : "whsec_••••••••••••••••") : "Not configured",
        canRevealSecret: !!webhookSecret,
        revealSecretLabel: secretRevealed ? "Hide" : "Reveal",
        toggleRevealSecret: webhookSecret ? toggleRevealSecret(k.id) : () => {},
        copySecret: webhookSecret && secretRevealed ? copyField("whsec:" + k.id, webhookSecret) : () => {},
        copySecretLabel: s.copiedField === "whsec:" + k.id ? "Copied" : "Copy",
        canCopySecret: !!(webhookSecret && secretRevealed),
        isJustMinted: !!(plaintext),

        revoke: revokeApiKey(k.id),
      };
    });
  const apiKeysLoading = apiKeysQuery.isLoading;
  const apiKeysEmpty = !apiKeysLoading && apiKeys.length === 0;
  const dismissNewApiKey = () => setState({ newlyCreatedKey: null });
  const showNewApiKeyBanner = !!justMintedKey;
  const isModalApiKey = s.modal === "apiKey";
  const apiKeyName = s.apiKeyName;
  const apiKeyError = s.apiKeyError;
  const apiKeyCreating = s.apiKeyCreating;
  const apiKeyEnvironmentChips = ["sandbox", "live"].map((env) => ({
    key: env,
    label: env === "live" ? "Live" : "Sandbox",
    select: setApiKeyEnvironment(env),
    selected: s.apiKeyEnvironment === env,
    bg: s.apiKeyEnvironment === env ? "var(--ink)" : "var(--surface2)",
    color: s.apiKeyEnvironment === env ? "var(--bg)" : "var(--ink)",
  }));
  // Team has no backend yet — these stay local/simulated exactly as the
  // original design prototype had them. See docs/api-contract.md.
  const roleOptions = ROLES;
  const teamCount = s.teamMembers.length;
  const inviteOpen = s.inviteOpen;
  const inviteName = s.inviteName;
  const inviteEmail = s.inviteEmail;
  const inviteRoleChips = ROLES.map(r => ({
    key: r.key,
    label: r.label,
    desc: r.desc,
    select: setInviteRole(r.key),
    selected: s.inviteRole === r.key,
    bg: s.inviteRole === r.key ? "var(--indigo)" : "var(--surface2)",
    color: s.inviteRole === r.key ? "var(--indigo-on)" : "var(--ink)",
  }));
  const inviteCanSubmit = !!(s.inviteName.trim() && s.inviteEmail.trim());
  const inviteCannotSubmit = !(s.inviteName.trim() && s.inviteEmail.trim());
  const teamRows = s.teamMembers.map(m => ({
        ...m,
        initials: m.name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase(),
        statusLabel: m.status === "active" ? "Active" : "Invited",
        statusColor: m.status === "active" ? "var(--indigo-text)" : "var(--amber)",
        statusSoft: m.status === "active" ? "var(--indigo-tint)" : "var(--amber-tint)",
        roleLabel: ROLES.find((r) => r.key === m.role)?.label ?? m.role,
        roleOptions: ROLES,
        setRole: setMemberRole(m.id),
        remove: removeMember(m.id),
      }));
  const modalOpen = !!s.modal;
  const modalTitle = { send: "Send money", deposit: s.fundAfricanTargetCurrency ? `Fund ${s.fundAfricanTargetCurrency}` : "Top up balance", receive: "Receive globally", convert: "Convert", bulk: "Bulk payouts", swap: "Convert", txDetail: "Transaction", acctDetail: s.acctDetailIntent === "fund" ? "Fund via bank transfer" : "Account details", fundChooser: "Fund account", fundStablecoin: "Fund account", closeAccount: "Close account", cardDetail: "Card", newCard: "Create virtual card", invoice: "Create invoice", tier: "Upgrade to Tier 3", kyb: "Business verification", fundCard: "Fund card", apiKey: "Create API key",
    createAccount: s.createAccountKind === "stablecoin" ? "Create Stablecoin Account" : "Create Account" }[s.modal] || "";
  const isModalCreateAccount = s.modal === "createAccount";
  const isSendFlow = s.modal === "send";
  const isDepositFlow = s.modal === "deposit";
  const isReceiveFlow = s.modal === "receive";
  const isConvertFlow = s.modal === "convert";
  const isModalBulk = s.modal === "bulk";
  const isModalTxDetail = s.modal === "txDetail";
  const isModalAcctDetail = s.modal === "acctDetail";
  const isModalFundChooser = s.modal === "fundChooser";
  const isModalFundStablecoin = s.modal === "fundStablecoin";
  const isModalCloseAccount = s.modal === "closeAccount";
  const isModalCardDetail = s.modal === "cardDetail";
  const isModalNewCard = s.modal === "newCard";
  const isModalInvoice = s.modal === "invoice";
  const isModalTier = s.modal === "tier";
  const isModalKyb = s.modal === "kyb";
  const isModalFundCard = s.modal === "fundCard";
  const sendIsCountry = s.sendGroup === "country";
  const sendIsCrypto = s.sendGroup === "crypto";
  const sendRailHasChoice = railHasChoice(sendCountry.rails, s.sendMethod);
  const sendMethodChosen = !!s.sendMethod;
  const sendMethodOptions = [
    {
      key: "bank",
      label: "Bank transfer",
      desc: "Send to a bank account, locally or internationally",
      select: chooseSendMethod("bank"),
    },
    {
      key: "mobile",
      label: "Mobile money",
      desc: "Send to a mobile money wallet across Africa",
      select: chooseSendMethod("mobile"),
    },
    {
      key: "crypto",
      label: "Stablecoin",
      desc: "Send USDC to a wallet address",
      select: chooseSendMethod("crypto"),
    },
    {
      // No account-to-account transfer endpoint exists yet — the backend has
      // OffRamp orders and account-native sends only (docs/api-contract.md).
      // Shown but disabled rather than hidden, so the option set still reads
      // like the design and the reason is stated instead of guessed at.
      key: "internal",
      label: "Internal transfer",
      desc: "Move funds between your own accounts",
      disabled: true,
      disabledReason: "Not available yet",
      select: () => {},
    },
  ];
  const sendRecipient = s.sendRecipient;
  const sendRecipientName = s.sendRecipientName;
  const sendAmount = s.sendAmount;
  const sendDone = s.sendDone;
  const sendNotDone = !s.sendDone;
  const sendQuoteLoading = s.sendQuoteLoading;
  const sendQuoteError = s.sendQuoteError;
  const sendAccepting = s.sendAccepting;
  const sendAcceptError = s.sendAcceptError;
  const sendResultText = s.sendConfirm
    ? `${s.sendConfirm.amount} ${s.sendConfirm.currency} · ${s.sendConfirm.status}${s.sendConfirm.id ? ` · ${s.sendConfirm.id}` : ""}`
    : s.sendAccept
      ? `Order #${s.sendAccept.merchant_order_id} · ${s.sendAccept.status}`
      : null;
  // Live status on the send-success step, via the same polling hook the tx
  // detail modal uses. `sendStatusQuery.data` starts undefined right after
  // accept (first poll hasn't landed yet) — fall back to the accept
  // response's own "processing" status rather than showing nothing.
  const sendLiveOrderStatus = s.sendAccept ? sendStatusQuery.data?.status ?? "processing" : null;
  const sendLiveDescriptor = sendLiveOrderStatus
    ? describeTransactionStatus(sendLiveOrderStatus)
    : null;
  const sendLiveStatus = sendLiveDescriptor
    ? { label: sendLiveDescriptor.label, color: sendLiveDescriptor.color, soft: sendLiveDescriptor.soft, isSettling: !sendStatusQuery.isTerminal }
    : null;
  const sendRecipientLabel = s.sendGroup === "crypto" ? "Recipient wallet address" : sendRail.field;
  const sendRecipientPlaceholder =
    s.sendGroup === "crypto"
      ? sendCryptoRecipientPlaceholder(s.sendChain)
      : sendRail.type === "mobile" && sendCountry.dialCode
        ? `+${sendCountry.dialCode}712345678`
        : sendRail.placeholder;
  const sendCorridorText = s.sendGroup === "crypto"
    ? `Sends USDC on ${SEND_STABLECOIN_NETWORKS.find((n) => n.key === s.sendChain)?.label || "Base, Polygon, or Stellar"} via account send — min 1.00 USDC.`
    : `${sendCountry.name} via ${channelLabelForRail(sendRail.type)} · ${sendRail.arrival}`;
  const sendProviderHasChoice = sendProviderOptions.length > 1;
  const sendProviderLabel = sendRail.type === "mobile" ? "Mobile money network" : "Bank account";
  // The catalog settled with no live provider for this corridor, so the chips
  // came from the hardcoded standby list (see providerNamesFromCatalog). The
  // corridor still works — traffic is just not on a live-listed provider —
  // which is the product's one real "rerouting" state.
  const sendProvidersAreFallback =
    sendCatalogSettled &&
    (sendCatalogProviders?.length ?? 0) === 0 &&
    sendProviderOptions.length > 0;
  // Bank rails can't be quoted without the aggregator's institution id, which
  // only the catalog carries — so this corridor is a dead end until it loads.
  // Dual-currency amount entry. The toggle only appears for corridors the
  // summary carries a rate for — without one we cannot turn local input into
  // the USD the payload prices from, so USD-only is the honest option.
  const sendLocalCurrency = sendCountry.code;
  const sendIndicativeRate = indicativeRate(homeFxRates?.rates, sendLocalCurrency);
  const sendCanEnterLocal = sendIsCountry && canEnterInLocalCurrency(homeFxRates?.rates, sendLocalCurrency);
  const sendAmountCurrency = sendCanEnterLocal ? s.sendAmountCurrency : "USD";
  // Indicative only — flagged with "≈" and never sent anywhere. The binding
  // figures come back on the quote.
  const sendAmountEquivalent = sendIsCountry
    ? describeAmountEquivalent(
        s.sendAmount,
        { currency: sendAmountCurrency, rate: sendIndicativeRate },
        sendLocalCurrency,
      )
    : null;
  const sendIndicativeRateLine = sendIsCountry
    ? formatRateLine(sendIndicativeRate, sendLocalCurrency)
    : null;
  const sendBlockedNoNetworkId = sendRailBlockedByMissingNetworkId({
    sendGroup: s.sendGroup,
    networkId: networkIdForProvider(sendCatalogProviders, sendProvider),
    catalogSettled: sendCatalogSettled,
  });
  const depositMethods = ["country","crypto"].map(g => ({ key: g, label: g === "country" ? "By country" : "Stablecoin", select: setDepositGroup(g), bg: s.depositGroup === g ? "var(--ink)" : "var(--surface2)", color: s.depositGroup === g ? "var(--bg)" : "var(--muted)" }));
  const depositIsCountry = s.depositGroup === "country";
  const depositIsCrypto = s.depositGroup === "crypto";
  const depositSub = s.depositSub === "method" ? "method" : "country";
  const depositMethodChosen = s.depositRailIdx >= 0 && Boolean(s.depositProviderName);
  const depositIsMobileRail = depositRail.type === "mobile";
  const depositIsBankRail = depositRail.type === "bank";
  const depositChannelLabel = channelLabelForRail(depositRail.type);
  const depositOperator = depositChannelLabel;
  const depositMobileCode = depositCountry.code;
  const depositPhone = s.depositPhone;
  const depositAmount = s.depositAmount;
  const depositPromptSent = s.depositPromptSent;
  const depositBankLabel = depositRail.label;
  const depositBankArrival = depositRail.arrival;
  const depositPaymentInstructionRows = s.depositAccept
    ? buildPaymentInstructionRows(s.depositAccept.payment_instructions).map((row) => ({
        k: row.k,
        v: row.v,
      }))
    : [];
  const depositBankLines =
    s.depositAccept?.payment_instructions?.type === "bank"
      ? depositPaymentInstructionRows
      : depositRail.type === "bank" && !s.depositAccept
        ? [{ k: "Account number", v: depositRail.placeholder }, { k: "Method", v: depositChannelLabel }]
        : depositPaymentInstructionRows;
  const depositNetworkOptions = stablecoinNetworksForAsset(DEPOSIT_NETWORKS, s.depositAsset);
  const depositNetworks = depositNetworkOptions.map(n => ({ key: n.key, label: n.label, select: setDepositNetwork(n.key), bg: s.depositNetwork === n.key ? "var(--indigo-tint)" : "var(--surface2)", border: s.depositNetwork === n.key ? "var(--indigo)" : "transparent", color: s.depositNetwork === n.key ? "var(--indigo-text)" : "var(--ink)" }));
  const treasuryWalletAddress = resolveTreasuryWalletAddress({
    summaryWallet:
      bootstrapQuery.data?.treasuryWallet ??
      summaryQuery.data?.totals.wallet_address,
    stablecoinAccounts: stablecoinAccountsList,
  });
  const depositAssets = ["usdc","usdt"].map(k => ({ key: k, label: k.toUpperCase(), select: setDepositAsset(k), bg: s.depositAsset === k ? "var(--ink)" : "var(--surface2)", color: s.depositAsset === k ? "var(--bg)" : "var(--ink)" }));
  const pinnedOnRampDest = resolveOnRampDestination({
    accounts: stablecoinAccountsList,
    selectedAccountId: s.fundTargetAccountId,
    depositNetworkKey: s.depositNetwork,
    depositAsset: s.depositAsset,
    fundAfricanTargetCurrency: s.fundAfricanTargetCurrency,
    summaryWallet:
      bootstrapQuery.data?.treasuryWallet ??
      summaryQuery.data?.totals.wallet_address,
  });
  const depositAssetCode = (pinnedOnRampDest?.asset.currency || s.depositAsset).toUpperCase();
  const sendStep = s.sendStep;
  const sendStepDots = buildSendStepDots(s.sendStep, 3);
  const sendStepIs1 = s.sendStep === 1;
  const sendStepIs2 = s.sendStep === 2;
  const sendStepIs3 = s.sendStep === 3;
  // Phase 4: USDC only (USDT has no account-send path).
  const sendAssets = ["usdc"].map(k => ({ key: k, label: k.toUpperCase(), select: setSendAsset(k), selected: s.sendAsset === k, bg: s.sendAsset === k ? "var(--ink)" : "var(--surface2)", color: s.sendAsset === k ? "var(--bg)" : "var(--ink)" }));
  const sendChains = SEND_STABLECOIN_NETWORKS.map(n => ({ key: n.key, label: n.label, select: setSendChain(n.key), selected: s.sendChain === n.key, bg: s.sendChain === n.key ? "var(--indigo-tint)" : "var(--surface2)", border: s.sendChain === n.key ? "var(--indigo)" : "transparent", color: s.sendChain === n.key ? "var(--indigo-text)" : "var(--ink)" }));
  const sendAssetCode = s.sendAsset.toUpperCase();
  const sendChainLabel = SEND_STABLECOIN_NETWORKS.find(n => n.key === s.sendChain)?.label || s.sendChain;
  const sendDestinationSummary = buildSendDestinationSummary({
    sendGroup: s.sendGroup,
    sendAsset: s.sendAsset,
    sendChainLabel,
    countryName: sendCountry.name,
    channelLabel: channelLabelForRail(sendRail.type),
  });
  // OffRamp quote (by country) or account-send preview (stablecoin).
  const sendQuote = s.sendQuote;
  const sendPreview = s.sendPreview;
  // Fee in both currencies, converted at the *quote's* rate so it lines up
  // with the figures beside it rather than with a rate that has since moved.
  const sendFeeText = s.sendGroup === "crypto"
    ? (sendPreview?.fee_amount != null ? `${sendPreview.fee_amount} USDC` : "Fee from preview")
    : sendQuote
      ? formatFeeDual(
          formatQuoteFees(sendQuote.amounts.fees),
          sendQuote.amounts.rate,
          sendQuote.amounts.rate_currency || sendQuote.amounts.user_receives.currency,
        )
      : (sendRail.type === "mobile" ? "No fee · instant local transfer" : "Fee ≈ $1.20 · bank transfer");
  // Binding rate from the quote — exact, no "≈". Falls back to the indicative
  // line only before a quote exists, where the UI labels it as an estimate.
  // What actually leaves the account. Once quoted this is the aggregator's
  // own `user_pays`, never the raw input — which may have been typed in the
  // destination currency and must not be re-labelled as dollars.
  const sendYouPayText = s.sendGroup === "crypto"
    ? `${s.sendAmount} USDC`
    : sendQuote
      ? `${sendQuote.amounts.user_pays.amount} ${sendQuote.amounts.user_pays.currency}`
      : `${s.sendAmount} ${sendAmountCurrency}`;
  const sendQuotedRateLine = sendQuote
    ? formatRateLine(
        sendQuote.amounts.rate,
        sendQuote.amounts.rate_currency || sendQuote.amounts.user_receives.currency,
      )
    : null;
  const sendArrivalText = s.sendGroup === "crypto"
    ? (sendPreview?.expires_at
      ? `Preview valid until ${new Date(sendPreview.expires_at).toLocaleTimeString()}`
      : "On-chain settlement · status via account.send.* webhooks")
    : sendQuote?.expires_at
      ? `Quote valid until ${new Date(sendQuote.expires_at).toLocaleTimeString()}`
      : sendRail.arrival;
  const sendQuoteRateText = s.sendGroup === "crypto"
    ? (sendPreview?.receive_amount != null ? `${sendPreview.receive_amount} ${sendPreview.currency || "USDC"}` : null)
    : sendQuote?.amounts.rate
      ? `${sendQuote.amounts.user_receives.amount} ${sendQuote.amounts.user_receives.currency}`
      : null;
  const depositStep = s.depositStep;
  const depositStepDots = buildDepositStepDots(s.depositStep, s.depositGroup === "country" ? 3 : 2);
  const depositStepIs1 = s.depositStep === 1;
  const depositStepIs2 = s.depositStep === 2;
  const depositStepIs3 = s.depositStep === 3;
  const depositNetworkLabel =
    depositNetworkOptions.find((n) => n.key === s.depositNetwork)?.label ||
    pinnedOnRampDest?.asset.network ||
    formatNetworkLabel(s.depositNetwork);
  const depositPickerDest = resolveStablecoinPickerDestination({
    accounts: stablecoinAccountsQuery.data ?? [],
    asset: s.depositAsset,
    networkKey: s.depositNetwork,
    treasuryWallet: treasuryWalletAddress,
  });
  const depositAddress = s.fundTargetAccountId
    ? pinnedOnRampDest?.walletAddress || "—"
    : depositPickerDest.address || "—";
  const depositAddressEmptyMessage = s.fundTargetAccountId
    ? describeMissingOnRampDestination({
        selectedAccountId: s.fundTargetAccountId,
        summaryFailed: summaryQuery.isError,
      })
    : depositPickerDest.emptyMessage;
  const depositDestinationSummary = buildDepositDestinationSummary({
    depositGroup: s.depositGroup,
    depositAsset: (pinnedOnRampDest?.asset.currency || s.depositAsset).toLowerCase(),
    depositNetworkLabel,
    countryName: depositCountry.name,
    channelLabel: depositChannelLabel,
  });
  const depositNotDone = !s.depositDone;
  const depositDone = s.depositDone;
  const depositPayerLabel = depositIsMobileRail ? "Your mobile number" : "Your bank account number";
  const depositPayerPlaceholder = depositIsMobileRail ? "712 345 678" : depositRail.placeholder;
  const depositAmountLabel = `Amount (${depositCountry.code})`;
  const depositQuote = s.depositQuote;
  const depositQuoteLoading = s.depositQuoteLoading;
  const depositQuoteError = s.depositQuoteError;
  const depositAccepting = s.depositAccepting;
  const depositAcceptError = s.depositAcceptError;
  const depositFeeText = depositQuote ? formatQuoteFees(depositQuote.amounts.fees) : (depositRail.type === "mobile" ? "No fee · instant local transfer" : "Fee ≈ $1.20 · bank transfer");
  const depositArrivalText = depositQuote?.expires_at
    ? new Date(depositQuote.expires_at).toLocaleTimeString()
    : depositRail.arrival;
  const depositQuoteRateText = depositQuote?.amounts.rate
    ? `${depositQuote.amounts.user_receives.amount} ${depositQuote.amounts.user_receives.currency}`
    : null;
  const depositResultText = s.depositAccept
    ? `Order #${s.depositAccept.merchant_order_id} · ${s.depositAccept.status}`
    : null;
  const depositLiveOrderStatus = s.depositAccept ? depositStatusQuery.data?.status ?? "processing" : null;
  const depositLiveDescriptor = depositLiveOrderStatus
    ? describeTransactionStatus(depositLiveOrderStatus)
    : null;
  const depositLiveStatus = depositLiveDescriptor
    ? { label: depositLiveDescriptor.label, color: depositLiveDescriptor.color, soft: depositLiveDescriptor.soft, isSettling: !depositStatusQuery.isTerminal }
    : null;
  const receiveGroups = ["fiat","crypto"].map(g => ({ key: g, label: g === "fiat" ? "Fiat account" : "Stablecoin", select: setReceiveGroup(g), bg: s.receiveGroup === g ? "var(--ink)" : "var(--surface2)", color: s.receiveGroup === g ? "var(--bg)" : "var(--muted)" }));
  const receiveIsFiat = s.receiveGroup === "fiat";
  const receiveIsCrypto = s.receiveGroup === "crypto";
  const receiveAccountsList = depositAccountsQuery.data?.accounts ?? [];
  const receiveAcctChips = receiveAccountsList.map((a, i) => ({
    flagUrl: flagUrl(currencyIso(a.currency) ?? "eu"),
    code: a.currency,
    select: selectReceiveAcct(i),
    bg: i === s.receiveAcctIdx ? "var(--indigo-tint)" : "var(--surface2)",
    border: i === s.receiveAcctIdx ? "var(--indigo)" : "transparent",
  }));
  const selectedReceiveAccount = receiveAccountsList[s.receiveAcctIdx] ?? null;
  const receiveAcctLines = selectedReceiveAccount
    ? buildDepositAccountDetailRows(selectedReceiveAccount).map((row) => ({
        k: row.label,
        v: row.value,
        copy: copyReceiveField(row.label, row.copyValue ?? row.value),
        copied: s.copiedKey === row.label,
      }))
    : [];
  const receiveAcctRail = selectedReceiveAccount
    ? `${currencyLabel(selectedReceiveAccount.currency)} bank deposit`
    : receiveAccountsList.length === 0
      ? "Issue a currency account from Accounts to receive bank transfers."
      : "—";
  const receiveAssets = ["usdc","usdt"].map(k => ({ key: k, label: k.toUpperCase(), select: setReceiveAsset(k), bg: s.receiveAsset === k ? "var(--ink)" : "var(--surface2)", color: s.receiveAsset === k ? "var(--bg)" : "var(--ink)" }));
  const receiveNetworkOptions = stablecoinNetworksForAsset(DEPOSIT_NETWORKS, s.receiveAsset);
  const receiveNetworks = receiveNetworkOptions.map(n => ({ key: n.key, label: n.label, select: setReceiveNetwork(n.key), bg: s.receiveNetwork === n.key ? "var(--indigo-tint)" : "var(--surface2)", border: s.receiveNetwork === n.key ? "var(--indigo)" : "transparent", color: s.receiveNetwork === n.key ? "var(--indigo-text)" : "var(--ink)" }));
  const receiveNetworkLabel =
    receiveNetworkOptions.find((n) => n.key === s.receiveNetwork)?.label ||
    formatNetworkLabel(s.receiveNetwork);
  const receiveAssetCode = s.receiveAsset.toUpperCase();
  const receivePickerDest = resolveStablecoinPickerDestination({
    accounts: stablecoinAccountsQuery.data ?? [],
    asset: s.receiveAsset,
    networkKey: s.receiveNetwork,
    treasuryWallet: treasuryWalletAddress,
  });
  const receiveAddress = receivePickerDest.address || "—";
  const receiveAddressEmptyMessage = receivePickerDest.emptyMessage;
  const copyReceiveAddress = receivePickerDest.address
    ? copyReceiveField("addr", receivePickerDest.address)
    : () => {};
  const receiveAddressCopied = s.copiedKey === "addr";
  const fiatConvertAccounts = depositAccountsList
    .filter((a) => a.id && ["EUR", "USD", "GBP"].includes(a.currency.toUpperCase()))
    .map((a) => {
      const view = mapDepositAccountToCardView(a);
      return {
        id: String(a.id),
        currency: a.currency.toUpperCase(),
        label: `${view.name} (${a.currency.toUpperCase()})`,
        balanceLabel: view.hasBalance ? view.balance : "—",
        balanceAmount: parseBalanceNumber(a.balance),
      };
    });
  const usdcConvertAccounts = stablecoinAccountsList
    .filter((a) => a.currency === "USDC" && isReadyStatus(a.status) && a.id)
    .map((a) => ({
      id: String(a.id),
      currency: "USDC",
      label: `USDC · ${formatNetworkLabel(a.network)}`,
      balanceLabel: formatAccountBalance(a.balance, { maximumFractionDigits: 2 }),
      balanceAmount: parseBalanceNumber(a.balance),
    }));
  const convertMode: ConvertMode =
    s.convertMode === "stable_to_fiat" || s.convertMode === "fiat_to_fiat"
      ? s.convertMode
      : "fiat_to_stable";
  const convertBridgeUsdcId = s.convertBridgeUsdcId || usdcConvertAccounts[0]?.id || "";
  const convertSourceAccounts =
    convertMode === "stable_to_fiat" || (convertMode === "fiat_to_fiat" && s.convertHop === 2)
      ? usdcConvertAccounts
      : fiatConvertAccounts;
  // Fiat↔fiat hop 1: pick final fiat dest in the UI; quote uses USDC under the hood.
  const convertDestAccounts =
    convertMode === "fiat_to_stable"
      ? usdcConvertAccounts
      : convertMode === "fiat_to_fiat" && s.convertHop === 1
        ? fiatConvertAccounts.filter((a) => a.id !== s.convertSourceAccountId)
        : fiatConvertAccounts.filter((a) => a.id !== s.convertSourceAccountId);
  const convertHopLabel =
    convertMode === "fiat_to_fiat"
      ? s.convertHop === 1
        ? "Hop 1 of 2 — convert source fiat to USDC (then USDC → destination)"
        : "Hop 2 of 2 — convert USDC to destination fiat"
      : null;
  const swapAccepted = s.swapAccepted;
  const cardIsFrozen = (cardSel?.status || "").toLowerCase() === "frozen";
  const cardDetail: any = cardSel
    ? {
        id: cardSel.id,
        label: cardSel.card_name || `Card ···· ${cardSel.last_four || ""}`,
        last4: cardSel.last_four || "————",
        balance: usdSpendLabel,
        bg: cardPlasticBg(
          Math.max(
            0,
            issuedCardsList.findIndex((c) => c.id === cardSel.id),
          ),
        ),
        status: cardSel.status,
        freezeTrack: cardIsFrozen ? "var(--indigo)" : "var(--surface3)",
        freezeKnobLeft: cardIsFrozen ? "23px" : "3px",
        exp:
          cardSel.expiration_month && cardSel.expiration_year
            ? `${cardSel.expiration_month}/${cardSel.expiration_year}`
            : null,
      }
    : {};
  const newCardLabel = s.newCardLabel;
  const newCardFirstName = s.newCardFirstName;
  const newCardLastName = s.newCardLastName;
  const newCardEmail = s.newCardEmail;
  const newCardPhone = s.newCardPhone;
  const newCardNotDone = !s.newCardDone;
  const newCardDone = s.newCardDone;
  const newCardIssuing = s.newCardIssuing;
  const newCardError = s.newCardError;
  const newlyIssuedCard = s.newlyIssuedCard as IssuedCard | null;
  const cardFreezeBusy = s.cardFreezeBusy;
  const cardFreezeError = s.cardFreezeError;
  const invClient = s.invClient;
  const invAmount = s.invAmount;
  const invoiceNotDone = !s.invoiceDone;
  const invoiceDone = s.invoiceDone;
  const invoiceError = s.invoiceError;
  const invoiceSubmitting = s.invoiceSubmitting;
  const tierDocs = ["Audited financial statements","AML/CFT policy document","Beneficial ownership register"];
  const tierNotDone = !s.tierDone;
  const tierDone = s.tierDone;


  return (
    <div ref={rootRef} style={rootStyle}>
<div data-screen-label="App" className={`ep-shell${s.sidebarOpen ? " ep-shell--drawer-open" : ""}`}>

{!isCompact ? (
<DesktopSidebar
  screen={s.screen}
  businessName={meQuery.data?.business?.name || "Loading…"}
  role={meQuery.data?.role}
  themeIcon={themeIcon}
  onHome={() => navigateToScreen("home")}
  onNavigate={navigateToScreen}
  onToggleTheme={toggleTheme}
  onLogout={logout}
/>
) : null}

<main className="ep-main">
<header className="ep-header">
<div className="ep-header__lead">
{isMoneyFlowScreen(s.screen) ? (
<button type="button" className="ep-header__back" onClick={exitMoneyFlow} aria-label="Back">←</button>
) : isCompact ? (
<span className="ep-header__brand-mark"><MbokaMark size={28} title="Mboka" /></span>
) : null}
<div className="ep-header__titles">
<h1>{currentTitle}</h1>
<p>{currentSubtitle}</p>
</div>
</div>
<div className="ep-header__actions">
{!isCompact ? <HeaderRates rates={liveRates} /> : null}
</div>
</header>

<div className="ep-content ep-content-cap">

{(isHome) ? (<>
<div data-screen-label="Home" className="ep-home">

<HomeIdentity
  businessName={meQuery.data?.business?.name || "Loading…"}
  role={meQuery.data?.role}
  kybApproved={kybApproved}
  kybLabel={describeKybStatus(kybStatus)}
  kybLoading={kybStatusLoading}
/>

{/* Hero: design total-balance card + three summary stats. Identity
    strip is compact-only; desktop carries the same identity in the sidebar. */}
<div className="ep-grid-home-balance">
<div className="ep-home__balance">
<div className="ep-home__balance-top">
<div className="ep-home__balance-heading">
<span className="ep-home__balance-label">Total balance</span>
<div className="ep-home__display-currency">
<span className="ep-home__display-currency-label">Show in</span>
<ChoicePicker
  id="home-display-currency"
  className="ep-home__display-currency-picker"
  triggerClassName="ep-home__display-currency-select"
  hideLabel
  label="Display currency"
  title="Show balance in"
  value={displayCurrency}
  options={displayCurrencyOptions.map((code) => ({ value: code, label: code }))}
  onChange={setDisplayCurrency}
  loading={sendCatalogQuery.isLoading && !sendCatalogQuery.data}
  loadingLabel="…"
  searchable={displayCurrencyOptions.length > 8}
  compactSheet
/>
</div>
</div>
<div className="ep-home__balance-tabs">
{(balanceViewTabs || []).map((bv: any, __i1: number) => (
<React.Fragment key={__i1}>
<button onClick={bv.select} className="ep-home__balance-tab" style={{background: (bv.bg), color: (bv.color)}}>{bv.label}</button>
</React.Fragment>
))}
</div>
</div>
<div className="ep-home__balance-value">{homeHeroLabel}</div>
{homeUsdSub ? (
<div className="ep-home__balance-usd">{homeUsdSub}</div>
) : null}
<div className="ep-home__balance-sub">{homeBalanceSub}</div>
</div>

<div className="ep-home__stats-desktop" aria-label="Cash flow">
{(homeStats || []).map((hs: any, __i1: number) => (
<div key={__i1} className="ep-home__stat">
<span className="ep-home__stat-icon" style={{background: (hs.iconBg), color: (hs.iconColor)}}>{hs.icon}</span>
<div><div className="ep-home__stat-label">{hs.label}</div><div className="ep-home__stat-value">{hs.value}</div></div>
</div>
))}
</div>
</div>

{!kybStatusLoading && !kybApproved ? (
<KybGateBanner verificationStatus={describeKybStatus(kybStatus)} reviewerNotes={typeof meQuery.data?.kyb_summary?.profile?.reviewer_notes === "string" ? meQuery.data.kyb_summary.profile.reviewer_notes : null} showAction={canOpenKybWizard(kybStatus)} actionLabel={kybActionLabel} onStartVerification={() => { goVerification(); openModalKyb(); }} />
) : null}

<div className="ep-home__qa-row" aria-label="Quick actions">
{(quickActionTiles || []).map((qa: any, __i1: number) => (
<button key={__i1} type="button" onClick={qa.open} className="ep-home__qa">
<span className="ep-home__qa-icon" style={{background: (qa.iconBg), color: (qa.iconColor)}} aria-hidden>{qa.icon}</span>
<span className="ep-home__qa-text">
<span className="ep-home__qa-label">{qa.label}</span>
<span className="ep-home__qa-desc">{qa.desc}</span>
</span>
</button>
))}
</div>

{(homeCurrencyChips?.length) ? (
<div className="ep-home__chips" aria-label="Currency balances">
{(homeCurrencyChips || []).map((hc: any, __i1: number) => (
<button key={__i1} type="button" className="ep-home__chip" onClick={setScreen("wallets")}>
{hc.flagUrl ? (
  <span className="ep-flag" style={{backgroundImage: `url(${hc.flagUrl})`}} aria-hidden />
) : (
  <span className="ep-home__balance-row-avatar" aria-hidden>{String(hc.code).slice(0, 2)}</span>
)}
<span className="ep-home__chip-copy">{hc.code} {hc.balance}</span>
</button>
))}
</div>
) : null}

<SectionHeader title="Recent Activity" actionLabel="See All" onAction={goTransactions} />
<ActivityList title="Recent activity" items={homeRecent} showHeader={false} emptyLabel={transactionsQuery.isLoading ? "Loading…" : "No recent activity"} />

</div>
</>) : null}

{(isWallets) ? (<>
<WalletsScreen
  isMobile={isMobile}
  mainWalletBalance={mainWalletBalance}
  mainWalletSub={mainWalletSub}
  stableTabs={stableTabs}
  accountsCount={accountsCount}
  addAccountMenu={s.addAccountMenu}
  toggleAddAccountMenu={toggleAddAccountMenu}
  closeAddAccountMenu={closeAddAccountMenu}
  openCreateAccount={openCreateAccount}
  canCreateStablecoin={
    occupiedStablecoinNetworkCodes(stablecoinAccountsList).size <
    SUPPORTED_STABLECOIN_NETWORKS.length
  }
  canCreateBank={
    occupiedFiatCurrencyCodes(depositAccountsList).size <
    SUPPORTED_IBAN_CURRENCIES.length
  }
  accounts={accounts}
  eligible={depositEligible}
  eligibilityLoading={
    bootstrapQuery.isLoading ||
    (!bootstrapReady && depositEligibilityQuery.isLoading)
  }
  verificationStatus={
    bootstrapReady
      ? bootstrapQuery.data?.eligibility.verification_status
      : depositEligibilityQuery.data?.verification_status
  }
  eligibilityErrorMessage={depositEligibilityErrorMessage}
  accountsLoading={
    accounts.length === 0 &&
    (bootstrapQuery.isLoading ||
      (!bootstrapReady &&
        ((depositEligible && depositAccountsQuery.isLoading) ||
          stablecoinAccountsQuery.isLoading ||
          depositEligibilityQuery.isLoading)))
  }
  accountsPendingMore={
    accounts.length > 0 &&
    (bootstrapQuery.isFetching ||
      (!bootstrapReady &&
        ((depositEligible && depositAccountsQuery.isLoading) ||
          stablecoinAccountsQuery.isLoading)))
  }
  accountsErrorMessage={depositAccountsErrorMessage}
  onRetryAccounts={() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
    queryClient.invalidateQueries({ queryKey: ["deposit-accounts-eligibility"] });
    queryClient.invalidateQueries({ queryKey: ["deposit-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["stablecoin-accounts"] });
  }}
  walletsRecent={walletsRecent}
  goTransactions={goTransactions}
  onConvert={openConvert}
/>
</>) : null}

{(isAccountDetail && acctDetail) ? (<>
<AccountDetailScreen
  name={acctDetail.name}
  currency={acctDetail.currency}
  flagUrl={acctDetail.flagUrl}
  railLabel={acctDetail.railLabel ?? `${acctDetail.currency} · Fiat`}
  statusLabel={acctDetail.statusLabel}
  statusColor={acctDetail.statusColor}
  statusSoft={acctDetail.statusSoft}
  balance={acctDetail.balance ?? "—"}
  balanceSub={acctDetail.balanceSub ?? "Balance not yet available"}
  summaryLines={acctDetailLines}
  recent={walletsRecent}
  canConvert={Boolean(acctDetail.showConvert)}
  canFund={!selectedStablecoinAccount || !isClosedStatus(selectedStablecoinAccount.status)}
  canSend={!selectedStablecoinAccount || !isClosedStatus(selectedStablecoinAccount.status)}
  canClose={
    selectedStablecoinAccount
      ? isCloseableStablecoinAccount(selectedStablecoinAccount)
      : false
  }
  closeDisabledReason={
    selectedDepositAccount
      ? "Bank accounts can't be closed from the dashboard yet."
      : undefined
  }
  onBack={backToWallets}
  onOpenDetails={openAcctDetailsModal}
  onFund={openAcctFundChooser}
  onSend={openSelectedAccountSend}
  onConvert={openConvert}
  onCloseAccount={selectedStablecoinAccount ? openCloseAccountChooser : undefined}
  onViewAllTx={goTransactions}
/>
</>) : null}
{(isAccountDetail && !acctDetail) ? (<>
<div className="ep-acct-detail" data-screen-label="Account detail">
<button type="button" onClick={backToWallets} className="ep-acct-detail__back">← Accounts</button>
<div className="ep-wallets__empty">
<div className="ep-wallets__empty-title">Account not found</div>
<div className="ep-wallets__empty-body">This account is no longer available. Go back to Accounts to pick another.</div>
</div>
</div>
</>) : null}

{(isCards) ? (<>
<div data-screen-label="Cards" className="ep-cards">
<div className="ep-cards__head">
<h2 className="ep-cards__title">Virtual cards · {cards.length}</h2>
<button type="button" onClick={openNewCard} className="ep-cards__cta" disabled={!usdFunding}>+ New card</button>
</div>
<p className="ep-cards__funding-hint">{cardsFundingHint}</p>
{cardsError ? (
  <div className="ep-cards__preview" role="alert">
    <span className="ep-cards__preview-badge">USD required</span>
    <span className="ep-cards__preview-text">{cardsError}</span>
  </div>
) : null}
{cardsLoading ? (
  <div className="ep-cards__empty">Loading cards…</div>
) : cards.length === 0 && !cardsError ? (
  <div className="ep-cards__empty">No cards yet. Issue a virtual card linked to your USD account.</div>
) : (
<div className="ep-cards__grid">
{(cards || []).map((c: any) => (
<div key={c.id} className="ep-cards__item">
<button type="button" onClick={c.openDetail} className="ep-cards__plastic" style={{background: c.bg, filter: c.filter}} aria-label={`${c.label}, ${c.balance} available`}>
<div className="ep-cards__plastic-top">
<span className="ep-cards__plastic-label">{c.label}</span>
<span className="ep-cards__plastic-status">{c.statusLabel}</span>
</div>
<div className="ep-cards__plastic-body">
<span className="ep-cards__plastic-eyebrow">Linked USD available</span>
<span className="ep-cards__plastic-balance">{c.balance}</span>
<span className="ep-cards__plastic-pan">•••• •••• •••• {c.last4}</span>
</div>
</button>
<div className="ep-cards__actions">
<button type="button" onClick={c.fund} className="ep-cards__action">Fund USD</button>
<button type="button" onClick={c.freeze} className="ep-cards__action">Manage</button>
</div>
</div>
))}
</div>
)}
<ActivityList
  title="Card transactions"
  items={cardsRecent}
  emptyLabel="No card spend yet. Authorizations show here after the card is used (sandbox may stay empty)."
/>
</div>
</>) : null}

{(isTransactions) ? (<>
<TransactionsScreen
  txFilters={txFilters}
  filteredTransactions={filteredTransactions}
  emptyLabel={
    (txUsesLatestFifty ? transactionsQuery.isLoading : transactionsPageQuery.isLoading)
      ? "Loading…"
      : (txUsesLatestFifty ? transactionsQuery.isError : transactionsPageQuery.isError)
        ? "Couldn't load transactions"
        : "No transactions match this filter"
  }
  pageNumber={txUsesLatestFifty ? 1 : transactionsPageQuery.pageNumber}
  pageCount={txUsesLatestFifty ? 1 : transactionsPageQuery.pageCount}
  total={txUsesLatestFifty ? filteredTransactions.length : transactionsPageQuery.total}
  hasNext={!txUsesLatestFifty && transactionsPageQuery.hasNext}
  hasPrev={!txUsesLatestFifty && transactionsPageQuery.hasPrev}
  onNextPage={transactionsPageQuery.nextPage}
  onPrevPage={transactionsPageQuery.prevPage}
  isFetching={txUsesLatestFifty ? transactionsQuery.isFetching : transactionsPageQuery.isFetching}
  search={s.txSearch}
  onSearchChange={(value) => setState({ txSearch: value })}
  currency={s.txCurrency}
  currencyOptions={txCurrencyOptions}
  onCurrencyChange={(value) => setState({ txCurrency: value })}
  dateRange={s.txDateRange}
  onDateRangeChange={(value) => setState({ txDateRange: value })}
  usesLatestFifty={txUsesLatestFifty}
/>
</>) : null}

{(isInvoices) ? (<>
<div data-screen-label="Invoices" style={{display: "flex", flexDirection: "column", gap: "14px"}}>
<div className="ep-team__preview" role="note">
<span className="ep-team__preview-badge">Early access</span>
<span className="ep-team__preview-text">Invoicing is live for drafts and issue — richer workflows are on the way.</span>
</div>
<div style={{display: "flex", justifyContent: "flex-end"}}>
<button onClick={openModalInvoice} style={{padding: "10px 18px", borderRadius: "999px", border: "none", background: "var(--indigo)", color: "var(--indigo-on)", fontFamily: "'Space Grotesk',sans-serif", fontSize: "12.5px", fontWeight: "700", cursor: "pointer"}}>+ New invoice</button>
</div>
<InvoiceList items={invoices} emptyLabel={invoicesQuery.isLoading ? "Loading…" : "No invoices yet"} />
</div>
</>) : null}

{(isReports) ? (<>
<div data-screen-label="Reports" className="ep-reports">
<ComingSoonPanel
  featureKey="reports"
  title="Reports"
  description="Volume, corridor, and settlement reports are coming soon. Join the waitlist and we’ll notify you when they’re ready."
/>
</div>
</>) : null}

{(isVerification) ? (<>
<VerificationScreen tiers={tiers} onUpgradeTier3={openModalTier} onStartKyb={openModalKyb} reviewerNotes={kybStatus === "rejected" && typeof meQuery.data?.kyb_summary?.profile?.reviewer_notes === "string" ? meQuery.data.kyb_summary.profile.reviewer_notes : null} />
</>) : null}

{(isTeam) ? (<>
<div data-screen-label="Team" className="ep-team">
<div className="ep-team__preview" role="note">
<span className="ep-team__preview-badge">Preview</span>
<span className="ep-team__preview-text">Team members are simulated demo data — invites stay local to this session.</span>
</div>
<div className="ep-team__head">
<h2 className="ep-team__title">Members · {teamCount}</h2>
<button type="button" onClick={openInvite} className="ep-team__cta">+ Invite person</button>
</div>

<section className="ep-panel ep-team__list">
{(teamRows || []).map((m: any, __i1: number) => (
<div key={__i1} className="ep-team-row">
<span className="ep-team__avatar" aria-hidden>{m.initials}</span>
<div className="ep-team__identity">
<div className="ep-team__name">{m.name}</div>
<div className="ep-team__email">{m.email}</div>
</div>
<div className="ep-team__meta">
<StatusBadge label={m.statusLabel} color={m.statusColor} soft={m.statusSoft} />
<span className="ep-team__role-pill">{m.roleLabel}</span>
</div>
<div className="ep-team-row__actions">
<select value={m.role} onChange={m.setRole} aria-label={`Role for ${m.name}`}>
{(m.roleOptions || []).map((ro: any, __i2: number) => (
<option key={__i2} value={ro.key}>{ro.label}</option>
))}
</select>
<button type="button" onClick={m.remove} className="ep-team__remove" aria-label={`Remove ${m.name}`}>✕</button>
</div>
</div>
))}
</section>

{(inviteOpen) ? (<>
<div className="ep-team__invite-overlay" onClick={closeInvite} role="presentation">
<div className="ep-team__invite" onClick={stopClick} role="dialog" aria-modal="true" aria-labelledby="ep-team-invite-title">
<div className="ep-team__invite-head">
<h3 id="ep-team-invite-title" className="ep-team__invite-title">Invite a teammate</h3>
<button type="button" onClick={closeInvite} className="ep-team__invite-close" aria-label="Close invite">✕</button>
</div>
<label className="ep-team__field">
<span className="ep-team__field-label">Full name</span>
<input value={inviteName} onChange={setInviteName} placeholder="e.g. Amina Bello" className="ep-team__input" autoComplete="name" />
</label>
<label className="ep-team__field">
<span className="ep-team__field-label">Email address</span>
<input value={inviteEmail} onChange={setInviteEmail} placeholder="name@company.com" className="ep-team__input" type="email" autoComplete="email" />
</label>
<div className="ep-team__field">
<span className="ep-team__field-label">Role</span>
<div className="ep-team__roles" role="radiogroup" aria-label="Invite role">
{(inviteRoleChips || []).map((r: any) => (
<button
  key={r.key}
  type="button"
  role="radio"
  aria-checked={r.selected}
  onClick={r.select}
  className={`ep-team__role${r.selected ? " ep-team__role--selected" : ""}`}
>
<span className="ep-team__role-label">{r.label}</span>
<span className="ep-team__role-desc">{r.desc}</span>
</button>
))}
</div>
</div>
<button type="button" onClick={submitInvite} disabled={inviteCannotSubmit} className="ep-team__invite-submit">Send invite</button>
</div>
</div>
</>) : null}
</div>
</>) : null}

{(isDeveloper) ? (<>
<div data-screen-label="Developer" className="ep-developer">
<div className="ep-developer__head">
<h2 className="ep-developer__title">API keys</h2>
<button type="button" onClick={openCreateApiKeyModal} className="ep-developer__cta">+ Create key</button>
</div>

{(showNewApiKeyBanner) ? (
<div className="ep-developer__banner" role="status">
<div className="ep-developer__banner-copy">
<span className="ep-developer__banner-badge">Copy now</span>
<span className="ep-developer__banner-text">Your new secret key is shown once below. Store it securely — it can’t be recovered later.</span>
</div>
<button type="button" onClick={dismissNewApiKey} className="ep-developer__banner-dismiss">Dismiss</button>
</div>
) : null}

{(apiKeysLoading) ? (
<div className="ep-developer__empty" role="status">Loading API keys…</div>
) : null}

{(apiKeysEmpty) ? (
<div className="ep-developer__empty">
<p className="ep-developer__empty-title">No API keys yet</p>
<p className="ep-developer__empty-text">Create a sandbox key to integrate webhooks and server-side payouts.</p>
<button type="button" onClick={openCreateApiKeyModal} className="ep-developer__cta">+ Create key</button>
</div>
) : null}

{(apiKeys || []).map((k: any) => (
<section key={k.id} className={`ep-developer__card${k.isJustMinted ? " ep-developer__card--new" : ""}`}>
<div className="ep-developer__card-head">
<div className="ep-developer__card-identity">
<b className="ep-developer__card-name">{k.label}</b>
<span className={`ep-developer__env${k.modeLabel === "Live" ? " ep-developer__env--live" : ""}`}>{k.modeLabel}</span>
</div>
<button type="button" onClick={k.revoke} className="ep-developer__revoke">Revoke</button>
</div>

<div className="ep-developer__field">
<span className="ep-developer__field-label">Secret key</span>
<div className="ep-secret-row">
<span className="ep-secret-row__value">{k.keyDisplay}</span>
<div className="ep-secret-row__actions">
<button type="button" onClick={k.toggleReveal} disabled={!k.canRevealKey} title={k.revealTitle || undefined} className="ep-developer__btn ep-developer__btn--soft" style={{opacity: k.canRevealKey ? 1 : 0.5, cursor: k.canRevealKey ? "pointer" : "not-allowed"}}>{k.revealLabel}</button>
<button type="button" onClick={k.copyKey} disabled={!k.canRevealKey} title={k.revealTitle || undefined} className="ep-developer__btn ep-developer__btn--solid" style={{opacity: k.canRevealKey ? 1 : 0.5, cursor: k.canRevealKey ? "pointer" : "not-allowed"}}>{k.copyKeyLabel}</button>
</div>
</div>
{!k.canRevealKey ? <span className="ep-developer__hint">Full key available only at creation time.</span> : null}
</div>

<div className="ep-developer__field">
<span className="ep-developer__field-label">Webhook URL</span>
<div className="ep-secret-row">
<span className="ep-secret-row__value">{k.webhookUrl}</span>
<div className="ep-secret-row__actions">
<button type="button" onClick={k.copyWebhook} disabled={!k.canCopyWebhook} className="ep-developer__btn ep-developer__btn--solid" style={{opacity: k.canCopyWebhook ? 1 : 0.5, cursor: k.canCopyWebhook ? "pointer" : "not-allowed"}}>{k.copyWebhookLabel}</button>
</div>
</div>
<span className="ep-developer__hint">{k.events}</span>
</div>

<div className="ep-developer__field">
<span className="ep-developer__field-label">Webhook signing secret</span>
<div className="ep-secret-row">
<span className="ep-secret-row__value">{k.webhookSecretDisplay}</span>
<div className="ep-secret-row__actions">
<button type="button" onClick={k.toggleRevealSecret} disabled={!k.canRevealSecret} className="ep-developer__btn ep-developer__btn--soft" style={{opacity: k.canRevealSecret ? 1 : 0.5, cursor: k.canRevealSecret ? "pointer" : "not-allowed"}}>{k.revealSecretLabel}</button>
<button type="button" onClick={k.copySecret} disabled={!k.canCopySecret} className="ep-developer__btn ep-developer__btn--solid" style={{opacity: k.canCopySecret ? 1 : 0.5, cursor: k.canCopySecret ? "pointer" : "not-allowed"}}>{k.copySecretLabel}</button>
</div>
</div>
</div>
</section>
))}
</div>
</>) : null}


</div>

{isCompact ? (
<MobileBottomNav
  screen={s.screen}
  moreOpen={s.moreOpen}
  onNavigate={navigateToScreen}
  onOpenMore={() => setState({ moreOpen: true })}
/>
) : null}
</main>
</div>

{isCompact ? (
<MoreSheet
  open={s.moreOpen}
  screen={s.screen}
  businessName={meQuery.data?.business?.name || "Loading…"}
  role={meQuery.data?.role}
  themeIcon={themeIcon}
  onClose={closeMore}
  onNavigate={navigateToScreen}
  onOpenBulk={guardMoneyModal("bulk")}
  onOpenTopUp={guardMoneyModal("deposit")}
  onToggleTheme={toggleTheme}
  onLogout={logout}
/>
) : null}

{modalOpen ? (<>
<div onClick={closeModal} className="ep-modal-overlay" role="presentation">
<div ref={modalRef} onClick={stopClick} className="ep-modal" role="dialog" aria-modal="true" aria-labelledby="ep-modal-title">

<div className="ep-modal__grabber" aria-hidden="true">
<span className="ep-modal__grabber-bar" />
</div>

<div className="ep-modal__header">
<h3 id="ep-modal-title" className="ep-modal__title">{modalTitle}</h3>
<button type="button" onClick={closeModal} className="ep-modal__close" aria-label="Close">✕</button>
</div>

{(isSendFlow) ? (<section className="ep-flow ep-flow--sheet" data-screen-label="Send">
<SendModal
  sendNotDone={sendNotDone}
  sendDone={sendDone}
  sendMethodChosen={sendMethodChosen}
  sendMethodOptions={sendMethodOptions}
  resetSendMethod={resetSendMethod}
  sendStepDots={sendStepDots}
  sendStepIs1={sendStepIs1}
  sendStepIs2={sendStepIs2}
  sendStepIs3={sendStepIs3}
  sendIsCountry={sendIsCountry}
  sendIsCrypto={sendIsCrypto}
  sendCountryChips={sendCountryChips}
  sendRailHasChoice={sendRailHasChoice}
  sendRailChips={sendRailChips}
  sendProviderHasChoice={sendProviderHasChoice}
  sendProviderChips={sendProviderChips}
  sendCatalogLoading={sendCatalogLoading}
  sendAssets={sendAssets}
  sendChains={sendChains}
  sendAssetCode={sendAssetCode}
  sendChainLabel={sendChainLabel}
  sendNext={sendNext}
  sendBack={sendBack}
  sendDestinationSummary={sendDestinationSummary}
  sendCountryName={sendCountry.name}
  sendCountryFlagUrl={flagUrl(sendCountry.iso)}
  sendCurrencyCode={sendCountry.code}
  sendCurrencyName={currencyLabel(sendCountry.code)}
  sendCountryIdx={s.sendCountryIdx}
  selectSendCountry={(i) => selectSendCountry(i)()}
  sendProviderLabel={sendProviderLabel}
  sendProviderOptions={sendProviderOptions}
  selectSendProvider={pickSendProvider}
  sendProviderIdx={sendProviderIdx}
  sendIsBankRail={sendIsCountry && sendRail.type === "bank"}
  sendProvidersAreFallback={sendProvidersAreFallback}
  sendBlockedNoNetworkId={sendBlockedNoNetworkId}
  sendAmountCurrency={sendAmountCurrency}
  sendYouPayText={sendYouPayText}
  sendLocalCurrency={sendLocalCurrency}
  sendCanEnterLocal={sendCanEnterLocal}
  setSendAmountCurrency={(c: string) => setState({ sendAmountCurrency: c })}
  sendAmountEquivalent={sendAmountEquivalent}
  sendIndicativeRateLine={sendIndicativeRateLine}
  sendQuotedRateLine={sendQuotedRateLine}
  savedRecipients={(savedRecipientsQuery.data ?? []).filter((r) => {
    if (sendIsCrypto) return r.railType === "crypto";
    if (s.sendMethod === "mobile") return r.railType === "mobile";
    if (s.sendMethod === "bank") return r.railType === "bank";
    return r.railType !== "crypto";
  })}
  savedRecipientsLoading={savedRecipientsQuery.isLoading}
  onSelectSavedRecipient={applySavedRecipient}
  onSaveRecipientDetails={saveCurrentRecipientDetails}
  saveRecipientBusy={saveRecipientBusy}
  saveRecipientMessage={saveRecipientMessage}
  sendRecipientName={sendRecipientName}
  setSendRecipientName={setSendRecipientName}
  sendRecipientLabel={sendRecipientLabel}
  sendRecipient={sendRecipient}
  setSendRecipient={setSendRecipient}
  normalizeSendRecipientPhone={normalizeSendRecipientPhone}
  sendRecipientPlaceholder={sendRecipientPlaceholder}
  sendAmount={sendAmount}
  setSendAmount={setSendAmount}
  sendQuoteError={sendQuoteError}
  sendQuoteLoading={sendQuoteLoading}
  sendQuoteRateText={sendQuoteRateText}
  sendFeeText={sendFeeText}
  sendArrivalText={sendArrivalText}
  sendAcceptError={sendAcceptError}
  sendAccepting={sendAccepting}
  submitSend={submitSend}
  sendResultText={sendResultText}
  sendLiveStatus={sendLiveStatus}
  closeModal={closeModal}
/>
</section>) : null}

{(isDepositFlow) ? (<section className="ep-flow ep-flow--sheet" data-screen-label="Top up">
<DepositModal
  depositNotDone={depositNotDone}
  depositDone={depositDone}
  depositStepDots={depositStepDots}
  depositStepIs1={depositStepIs1}
  depositStepIs2={depositStepIs2}
  depositStepIs3={depositStepIs3}
  depositMethods={depositMethods}
  depositIsCountry={depositIsCountry}
  depositIsCrypto={depositIsCrypto}
  depositSub={depositSub}
  depositCountryRows={depositCountryRows}
  depositMethodGroups={depositMethodGroups}
  depositSelectedCountryName={depositCountryPicked ? depositCountry.name : ""}
  depositMethodChosen={depositMethodChosen}
  depositAssets={depositAssets}
  depositNetworks={depositNetworks}
  depositNext={depositNext}
  depositBack={depositBack}
  depositDestinationSummary={depositDestinationSummary}
  depositIsMobileRail={depositIsMobileRail}
  depositIsBankRail={depositIsBankRail}
  depositPayerLabel={depositPayerLabel}
  depositPayerPlaceholder={depositPayerPlaceholder}
  depositOperator={depositOperator}
  depositMobileCode={depositMobileCode}
  depositPhone={depositPhone}
  setDepositPhone={setDepositPhone}
  depositAmount={depositAmount}
  setDepositAmount={setDepositAmount}
  depositAmountLabel={depositAmountLabel}
  depositQuoteError={depositQuoteError}
  depositQuoteLoading={depositQuoteLoading}
  depositQuoteRateText={depositQuoteRateText}
  depositFeeText={depositFeeText}
  depositArrivalText={depositArrivalText}
  depositAcceptError={depositAcceptError}
  depositAccepting={depositAccepting}
  submitDeposit={submitDeposit}
  depositResultText={depositResultText}
  depositLiveStatus={depositLiveStatus}
  depositPromptSent={depositPromptSent}
  depositBankLabel={depositBankLabel}
  depositBankArrival={depositBankArrival}
  depositBankLines={depositBankLines}
  depositAssetCode={depositAssetCode}
  depositNetworkLabel={depositNetworkLabel}
  depositAddress={depositAddress}
  depositAddressEmptyMessage={depositAddressEmptyMessage}
  closeModal={closeModal}
  fundTargetCurrency={s.fundAfricanTargetCurrency}
  fundConvertStatus={s.fundConvertStatus}
  fundConvertError={s.fundConvertError}
/>
</section>) : null}

{(isReceiveFlow) ? (<section className="ep-flow ep-flow--sheet" data-screen-label="Receive">
<ReceiveModal
  receiveGroups={receiveGroups}
  receiveIsFiat={receiveIsFiat}
  receiveIsCrypto={receiveIsCrypto}
  receiveAcctChips={receiveAcctChips}
  receiveAcctRail={receiveAcctRail}
  receiveAcctLines={receiveAcctLines}
  receiveAssets={receiveAssets}
  receiveNetworks={receiveNetworks}
  receiveAssetCode={receiveAssetCode}
  receiveNetworkLabel={receiveNetworkLabel}
  receiveAddress={receiveAddress}
  copyReceiveAddress={copyReceiveAddress}
  receiveAddressCopied={receiveAddressCopied}
  receiveAddressEmptyMessage={receiveAddressEmptyMessage}
/>
</section>) : null}

{(isConvertFlow) ? (<section className="ep-flow ep-flow--sheet" data-screen-label="Convert">
<ConvertFlow
  mode={convertMode}
  onMode={(mode) => {
    setConvertMode(mode);
    if (mode === "fiat_to_fiat" && convertBridgeUsdcId) {
      setState({ convertBridgeUsdcId });
    }
  }}
  sourceAccounts={convertSourceAccounts}
  destinationAccounts={convertDestAccounts}
  sourceAccountId={s.convertSourceAccountId}
  destinationAccountId={s.convertDestAccountId}
  onSourceAccount={(id) =>
    setState({
      convertSourceAccountId: id,
      convertQuote: null,
      convertError: "",
      swapAccepted: false,
    })
  }
  onDestinationAccount={(id) =>
    setState({
      convertDestAccountId: id,
      convertBridgeUsdcId: convertBridgeUsdcId || s.convertBridgeUsdcId,
      convertQuote: null,
      convertError: "",
      swapAccepted: false,
    })
  }
  amount={s.convertAmount}
  onAmount={(value) => setState({ convertAmount: value, convertQuote: null, convertError: "" })}
  quote={s.convertQuote}
  quoteSeconds={s.quoteSeconds}
  quoteLoading={s.convertQuoteLoading}
  acceptLoading={s.convertAccepting}
  error={s.convertError}
  hopLabel={convertHopLabel}
  done={swapAccepted}
  doneBody={
    s.convertQuote
      ? `${s.convertQuote.source_amount} ${s.convertQuote.source_currency} → ${s.convertQuote.destination_amount ?? "—"} ${s.convertQuote.destination_currency}`
      : undefined
  }
  onRefreshQuote={() => void refreshConvertQuote()}
  onAccept={() => void acceptConvertQuote()}
  onDone={closeModal}
/>
</section>) : null}


{(isModalBulk) ? (<>
<ComingSoonPanel
  compact
  featureKey="bulk-payouts"
  title="Bulk payouts"
  description="CSV bulk payouts aren’t live yet. Join the waitlist and we’ll email you when you can pay many recipients in one go."
/>
</>) : null}

{(isModalTxDetail) ? (<>
<TxDetailModal txDetail={txDetail} isLoading={txDetailQuery.isLoading} liveStatus={txLiveStatus} />
</>) : null}

{(isModalFundChooser && acctDetail) ? (<>
<FundChooserModal
  currency={acctDetail.currency}
  accountName={acctDetail.name}
  isStablecoinAccount={Boolean(selectedStablecoinAccount)}
  networkLabel={
    selectedStablecoinAccount
      ? formatNetworkLabel(selectedStablecoinAccount.network)
      : undefined
  }
  onCancel={closeModal}
  onContinue={(option: FundChooserOption) => {
    if (option === "bank") {
      openAcctFundModal();
      return;
    }
    if (option === "stablecoin") {
      setState({ modal: "fundStablecoin" });
      return;
    }
    if (meQuery.isLoading || meQuery.isPending) return;
    const status =
      (meQuery.data?.kyb_summary?.profile?.kyb_status as string | undefined) ?? "pending";
    if (!isKybApproved(status)) {
      goVerification();
      if (canOpenKybWizard(status)) openModalKyb();
      return;
    }
    openAfricanFundOnRamp();
  }}
  africanDisabled={Boolean(africanFundPlan && !africanFundPlan.canRunAfricanOnRamp)}
  africanDisabledReason={
    africanFundPlan ? africanFundDisabledReason(africanFundPlan) : undefined
  }
  stablecoinDisabled={fundStablecoinRails.length === 0}
  stablecoinDisabledReason={
    fundStablecoinRails.length > 0
      ? undefined
      : "No ready stablecoin deposit rails yet. Open a stablecoin account and wait until it is active."
  }
/>
</>) : null}

{(isModalFundStablecoin && acctDetail) ? (<>
<FundStablecoinModal
  targetCurrency={acctDetail.currency}
  targetName={acctDetail.name}
  rails={fundStablecoinRails}
  onBack={() => setState({ modal: "fundChooser" })}
/>
</>) : null}

{(isModalCloseAccount && acctDetail && selectedStablecoinAccount) ? (<>
<CloseAccountModal
  accountName={acctDetail.name}
  currency={acctDetail.currency}
  networkLabel={formatNetworkLabel(selectedStablecoinAccount.network)}
  alreadyClosed={isClosedStatus(selectedStablecoinAccount.status)}
  onCancel={closeModal}
  onContinue={async (action: CloseAccountAction) => {
    await entitiesApi.closeAccount(
      selectedStablecoinAccount.entityId,
      selectedStablecoinAccount.id,
      action,
    );
    await queryClient.invalidateQueries({ queryKey: ["dashboard-bootstrap"] });
        queryClient.invalidateQueries({ queryKey: ["stablecoin-accounts"] });
    if (action === "delete") {
      backToWallets();
      return;
    }
    closeModal();
  }}
/>
</>) : null}

{(isModalAcctDetail) ? (<>
<AccountDetailModal
  acctDetail={acctDetail}
  intent={s.acctDetailIntent === "fund" ? "fund" : "details"}
  copiedField={s.copiedField}
  copyField={copyField}
  openModalSwapFromAcct={openModalSwapFromAcct}
/>
</>) : null}

{(isModalCardDetail) ? (<>
<div className="ep-cards__modal">
<div className="ep-cards__modal-plastic" style={{background: cardDetail.bg}}>
<span className="ep-cards__plastic-label">{cardDetail.label}</span>
<span className="ep-cards__plastic-pan">•••• •••• •••• {cardDetail.last4}</span>
</div>
<div className="ep-cards__modal-row">
<span>Linked USD available</span>
<b className="ep-mono">{cardDetail.balance}</b>
</div>
{cardDetail.exp ? (
<div className="ep-cards__modal-row">
<span>Expires</span>
<b className="ep-mono">{cardDetail.exp}</b>
</div>
) : null}
<div className="ep-cards__note">Cards spend against your linked USD deposit account — not a separate card wallet.</div>
<div className="ep-cards__modal-actions">
<button type="button" onClick={fundCard} className="ep-cards__modal-primary">Fund USD account</button>
</div>
<div className="ep-cards__modal-row">
<span className="ep-cards__freeze-label">{cardIsFrozen ? "Unfreeze card" : "Freeze card"}</span>
<button type="button" onClick={() => void toggleFreezeCard()} className="ep-cards__toggle" style={{background: cardDetail.freezeTrack}} aria-pressed={cardIsFrozen} disabled={cardFreezeBusy} aria-label={cardIsFrozen ? "Unfreeze card" : "Freeze card"}>
<span className="ep-cards__toggle-knob" style={{left: cardDetail.freezeKnobLeft}} />
</button>
</div>
{cardFreezeError ? (
  <div className="ep-cards__note" role="alert" style={{color: "var(--red)"}}>{cardFreezeError}</div>
) : null}
<button type="button" onClick={terminateCard} className="ep-cards__modal-danger">Close</button>
</div>
</>) : null}

{(isModalFundCard) ? (<>
<div className="ep-cards__modal">
<div className="ep-cards__note">
Cards spend your linked USD deposit balance — there is no separate card wallet to load.
</div>
<button type="button" onClick={fundCard} className="ep-cards__modal-primary">Fund USD account</button>
</div>
</>) : null}

{(isModalNewCard) ? (<>
{(newCardNotDone) ? (<>
<div className="ep-cards__modal">
{!usdFunding ? (
  <div className="ep-cards__note" role="alert">
    Open an active USD deposit account before issuing cards. Every card must be linked to USD.
  </div>
) : (
  <div className="ep-cards__note">
    {describeUsdFundingIssueNote(usdFunding)}
  </div>
)}
<label className="ep-cards__field">
<span className="ep-cards__field-label">Card label</span>
<input value={newCardLabel} onChange={setNewCardLabel} placeholder="e.g. Marketing Ads" className="ep-cards__input" autoComplete="off" />
</label>
<label className="ep-cards__field">
<span className="ep-cards__field-label">Cardholder first name</span>
<input value={newCardFirstName} onChange={setNewCardFirstName} placeholder="Jane" className="ep-cards__input" autoComplete="given-name" />
</label>
<label className="ep-cards__field">
<span className="ep-cards__field-label">Cardholder last name</span>
<input value={newCardLastName} onChange={setNewCardLastName} placeholder="Doe" className="ep-cards__input" autoComplete="family-name" />
</label>
<label className="ep-cards__field">
<span className="ep-cards__field-label">Cardholder email</span>
<input value={newCardEmail} onChange={setNewCardEmail} type="email" placeholder="jane@company.com" className="ep-cards__input" autoComplete="email" />
</label>
<label className="ep-cards__field">
<span className="ep-cards__field-label">Phone (E.164)</span>
<input value={newCardPhone} onChange={setNewCardPhone} placeholder="+12125550198" className="ep-cards__input" inputMode="tel" autoComplete="tel" />
</label>
{newCardError ? (
  <div className="ep-cards__note" role="alert" style={{color: "var(--red)"}}>{newCardError}</div>
) : null}
<button type="button" onClick={() => void issueCard()} className="ep-cards__modal-primary" disabled={!usdFunding || newCardIssuing}>
{newCardIssuing ? "Issuing…" : "Issue card on USD"}
</button>
</div>
</>) : null}
{(newCardDone) ? (<>
<div className="ep-cards__success">
<span className="ep-cards__success-icon" aria-hidden>✓</span>
<span className="ep-cards__success-title">Card issued</span>
<span className="ep-cards__success-text">
{newlyIssuedCard?.card_name || "Virtual card"} ···· {newlyIssuedCard?.last_four || "————"}
</span>
{newlyIssuedCard?.number ? (
  <div className="ep-cards__secrets" role="status">
    <div className="ep-cards__note">PAN and CVV are shown once — copy them now.</div>
    <div className="ep-cards__modal-row"><span>Number</span><b className="ep-mono">{newlyIssuedCard.number}</b></div>
    <div className="ep-cards__modal-row"><span>CVV</span><b className="ep-mono">{newlyIssuedCard.cvv}</b></div>
  </div>
) : (
  <div className="ep-cards__note">Credentials were not returned (same reference replay). Use Manage to view last four.</div>
)}
<button type="button" onClick={closeModal} className="ep-cards__modal-secondary">Done</button>
</div>
</>) : null}
</>) : null}

{(isModalInvoice) ? (<>
{(invoiceNotDone) ? (<>
<div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
<div><span style={{fontSize: "11px", fontWeight: "700", color: "var(--muted2)", textTransform: "uppercase"}}>Client name</span><input value={invClient} onChange={setInvClient} placeholder="e.g. Acme GmbH" style={{width: "100%", marginTop: "6px", padding: "12px 14px", borderRadius: "14px", border: "1.5px solid var(--input-border)", background: "var(--input-bg)", outline: "none", fontSize: "13.5px", color: "var(--ink)", boxSizing: "border-box"}} /></div>
<div><span style={{fontSize: "11px", fontWeight: "700", color: "var(--muted2)", textTransform: "uppercase"}}>Amount (USD)</span><input value={invAmount} onChange={setInvAmount} placeholder="0.00" style={{width: "100%", marginTop: "6px", padding: "12px 14px", borderRadius: "14px", border: "1.5px solid var(--input-border)", background: "var(--input-bg)", outline: "none", fontSize: "13.5px", color: "var(--ink)", boxSizing: "border-box"}} /></div>
{invoiceError ? (<div style={{padding: "10px 12px", borderRadius: "12px", background: "var(--red-tint)", color: "var(--red)", fontSize: "11.5px", fontWeight: 600}}>{invoiceError}</div>) : null}
<button onClick={submitInvoice} disabled={invoiceSubmitting} style={{padding: "13px", borderRadius: "14px", border: "none", background: "var(--indigo)", color: "var(--indigo-on)", fontFamily: "'Space Grotesk',sans-serif", fontSize: "13.5px", fontWeight: "700", cursor: invoiceSubmitting ? "wait" : "pointer", opacity: invoiceSubmitting ? 0.7 : 1}}>{invoiceSubmitting ? "Creating…" : "Create & get link"}</button>
</div>
</>) : null}
{(invoiceDone) ? (<>
<div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "12px 0 6px", textAlign: "center"}}>
<span style={{width: "48px", height: "48px", borderRadius: "50%", background: "var(--indigo-tint)", color: "var(--indigo-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px"}}>✓</span>
<span style={{fontFamily: "'Space Grotesk',sans-serif", fontSize: "14.5px", fontWeight: "700"}}>Invoice created</span>
<span style={{fontSize: "12.5px", color: "var(--muted)"}}>{invClient} will get a payment link by email.</span>
<button onClick={closeModal} style={{marginTop: "6px", padding: "10px 20px", borderRadius: "999px", border: "none", background: "var(--surface2)", color: "var(--ink)", fontSize: "12.5px", fontWeight: "700", cursor: "pointer"}}>Done</button>
</div>
</>) : null}
</>) : null}

{(isModalKyb) ? (<>
<KybWizardModal
  step={kybWizard.step}
  stepDots={kybWizard.stepDots}
  draft={kybWizard.draft}
  patchDraft={kybWizard.patchDraft}
  patchAssociate={kybWizard.patchAssociate}
  error={kybWizard.error}
  busy={kybWizard.busy}
  docRows={kybWizard.docRows}
  setDocumentFile={kybWizard.setDocumentFile}
  uploadDocumentRow={kybWizard.uploadDocumentRow}
  docsComplete={kybWizard.docsComplete}
  submitted={kybWizard.submitted}
  nextStep={kybWizard.nextStep}
  backStep={kybWizard.backStep}
  closeModal={closeModal}
/>
</>) : null}

{(isModalTier) ? (<>
{(tierNotDone) ? (<>
<div className="ep-cards__tier">
<p className="ep-cards__tier-intro">Upload three documents. Review usually takes 1–2 business days.</p>
{(tierDocs || []).map((d: any, __i2: number) => (
<div key={__i2} className="ep-cards__tier-doc">
<span className="ep-cards__tier-doc-title">{d}</span>
<button type="button" onClick={uploadTierDoc} className="ep-cards__tier-upload">Upload</button>
</div>
))}
<button type="button" onClick={submitTier} className="ep-cards__submit">Submit for review</button>
</div>
</>) : null}
{(tierDone) ? (<>
<div className="ep-cards__success">
<span className="ep-cards__success-icon" aria-hidden>✓</span>
<span className="ep-cards__success-title">Documents submitted</span>
<span className="ep-cards__success-text">Compliance will follow up within 1–2 business days.</span>
<button type="button" onClick={closeModal} className="ep-cards__modal-secondary">Done</button>
</div>
</>) : null}
</>) : null}

{(isModalCreateAccount) ? (<>
<CreateAccountModal
  createAccountName={s.createAccountName}
  setCreateAccountName={setCreateAccountName}
  createAccountKind={s.createAccountKind}
  createAccountCurrency={s.createAccountCurrency}
  setCreateAccountCurrency={setCreateAccountCurrency}
  createAccountStablecoin={s.createAccountStablecoin}
  setCreateAccountStablecoin={setCreateAccountStablecoin}
  createAccountNetwork={s.createAccountNetwork}
  setCreateAccountNetwork={setCreateAccountNetwork}
  createAccountError={s.createAccountError}
  createAccountSaving={s.createAccountSaving}
  occupiedNetworks={[...occupiedStablecoinNetworkCodes(stablecoinAccountsList)]}
  occupiedCurrencies={[...occupiedFiatCurrencyCodes(depositAccountsList)]}
  closeModal={closeModal}
  submitCreateAccount={submitCreateAccount}
/>
</>) : null}

{(isModalApiKey) ? (<>
<div className="ep-developer__modal">
<label className="ep-developer__field">
<span className="ep-developer__field-label">Key name</span>
<input value={apiKeyName} onChange={setApiKeyName} placeholder="e.g. Server integration" className="ep-developer__input" />
</label>
<div className="ep-developer__field">
<span className="ep-developer__field-label">Environment</span>
<div className="ep-developer__env-chips" role="radiogroup" aria-label="API key environment">
{(apiKeyEnvironmentChips || []).map((e: any) => (
<button
  key={e.key}
  type="button"
  role="radio"
  aria-checked={e.selected}
  onClick={e.select}
  className={`ep-developer__env-chip${e.selected ? " ep-developer__env-chip--selected" : ""}${e.key === "live" ? " ep-developer__env-chip--live" : ""}`}
>
{e.label}
</button>
))}
</div>
{apiKeyEnvironmentChips.find((e: any) => e.selected)?.key === "live" ? (
<span className="ep-developer__hint">Live keys can move real money. Prefer sandbox while integrating.</span>
) : (
<span className="ep-developer__hint">Sandbox keys are safe for testing — no live funds.</span>
)}
</div>
{apiKeyError ? (<div className="ep-developer__error">{apiKeyError}</div>) : null}
<button type="button" onClick={submitApiKey} disabled={apiKeyCreating} className="ep-developer__submit">{apiKeyCreating ? "Creating…" : "Create key"}</button>
</div>
</>) : null}

</div>
</div>

</>) : null}
    </div>
  );
}
