"use client";
import DepositAddressQr from "@/components/wallets/DepositAddressQr";
import React from "react";
import dynamic from "next/dynamic";
import { isStellarUsdcRail } from "@/lib/stellar/network";

const StellarWalletDeposit = dynamic(() => import("@/components/wallets/StellarWalletDeposit"), {
  ssr: false,
});

export type ReceiveModalProps = {
  receiveGroups: any[];
  receiveIsFiat: boolean;
  receiveIsCrypto: boolean;
  receiveAcctChips: any[];
  receiveAcctRail: string;
  receiveAcctLines: any[];
  receiveAssets: any[];
  receiveNetworks: any[];
  receiveAssetCode: string;
  receiveNetwork: string;
  receiveNetworkLabel: string;
  receiveAddress: string;
  copyReceiveAddress: () => void;
  receiveAddressCopied: boolean;
  receiveAddressEmptyMessage?: string;
  /** When set, empty crypto state offers Create Account. */
  onCreateStablecoinAccount?: (() => void) | null;
  createStablecoinAccountLabel?: string;
};

export default function ReceiveModal(p: ReceiveModalProps) {
  const hasAddress = Boolean(p.receiveAddress && p.receiveAddress !== "—");
  const hasFiatLines = (p.receiveAcctLines || []).length > 0;

  return (
    <div className="ep-money-flow">
      <p className="ep-money-hint">
        Share these coordinates with whoever is paying you — no action needed on your end until
        funds land.
      </p>

      <div className="ep-money-tabs" role="group" aria-label="Receive method">
        {(p.receiveGroups || []).map((rg: any, i: number) => (
          <button
            key={i}
            type="button"
            onClick={rg.select}
            className="ep-money-tab"
            style={{ background: rg.bg, color: rg.color }}
          >
            {rg.label}
          </button>
        ))}
      </div>

      {p.receiveIsFiat ? (
        <>
          <div className="ep-money-field">
            <span className="ep-money-label" id="receive-country-label">
              Account country
            </span>
            <div
              className="ep-money-tabs ep-money-tabs--wrap"
              role="group"
              aria-labelledby="receive-country-label"
            >
              {(p.receiveAcctChips || []).map((c: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={c.select}
                  className="ep-money-chip"
                  style={{
                    borderColor: c.border,
                    background: c.bg,
                  }}
                >
                  <span
                    className="ep-money-flag"
                    style={{ backgroundImage: `url(${c.flagUrl})` }}
                    aria-hidden
                  />
                  <span className="ep-money-chip__code">{c.code}</span>
                </button>
              ))}
            </div>
          </div>

          {p.receiveAcctRail ? (
            <p className="ep-money-step-meta">{p.receiveAcctRail}</p>
          ) : null}

          {hasFiatLines ? (
            <div className="ep-money-kv" role="group" aria-label="Receive account details">
              {(p.receiveAcctLines || []).map((ln: any, i: number) => (
                <div key={i} className="ep-money-kv__row">
                  <span className="ep-money-kv__k">{ln.k}</span>
                  <span className="ep-money-kv__v">{ln.v}</span>
                  <button
                    type="button"
                    className="ep-money-copy-btn"
                    onClick={ln.copy}
                    aria-label={`Copy ${ln.k}`}
                  >
                    {ln.copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ep-money-empty" role="status">
              No local receive account for this selection yet.
            </div>
          )}
        </>
      ) : null}

      {p.receiveIsCrypto ? (
        <div className="ep-money-stack ep-money-stack--tight">
          <div className="ep-money-asset-row">
            <span className="ep-money-label" id="receive-asset-label">
              Asset
            </span>
            <div className="ep-money-seg" role="group" aria-labelledby="receive-asset-label">
              {(p.receiveAssets || []).map((as: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={as.select}
                  className="ep-money-seg__btn"
                  style={{ background: as.bg, color: as.color }}
                >
                  {as.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ep-money-field">
            <span className="ep-money-label" id="receive-network-label">
              Network
            </span>
            <div
              className="ep-money-tabs ep-money-tabs--wrap"
              role="group"
              aria-labelledby="receive-network-label"
            >
              {(p.receiveNetworks || []).map((net: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={net.select}
                  className="ep-money-network"
                  style={{
                    borderColor: net.border,
                    background: net.bg,
                    color: net.color,
                  }}
                >
                  {net.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ep-money-banner ep-money-banner--warn" role="note">
            Only accept {p.receiveAssetCode} on {p.receiveNetworkLabel} — funds sent on other
            networks cannot be recovered.
          </div>

          {hasAddress ? (
            <div className="ep-money-stack ep-money-stack--tight">
              <div className="ep-money-copy-row">
                <span className="ep-money-copy-row__value" id="receive-address-value">
                  {p.receiveAddress}
                </span>
                <button
                  type="button"
                  className="ep-money-copy-btn"
                  onClick={p.copyReceiveAddress}
                  aria-describedby="receive-address-value"
                  aria-label={p.receiveAddressCopied ? "Address copied" : "Copy deposit address"}
                >
                  <span aria-hidden>⧉</span>
                  {p.receiveAddressCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <DepositAddressQr
                address={p.receiveAddress}
                currency={p.receiveAssetCode}
                network={p.receiveNetwork}
                networkLabel={p.receiveNetworkLabel}
              />
              {isStellarUsdcRail({
                network: p.receiveNetwork,
                currency: p.receiveAssetCode,
              }) ? (
                <StellarWalletDeposit
                  destination={p.receiveAddress}
                  network={p.receiveNetwork}
                  suggestedAmount=""
                />
              ) : null}
            </div>
          ) : (
            <div className="ep-money-empty-stack">
              <div className="ep-money-empty" role="status">
                {p.receiveAddressEmptyMessage ||
                  "Receive address unavailable. Open a ready wallet on this network or try again later."}
              </div>
              {p.onCreateStablecoinAccount ? (
                <button
                  type="button"
                  className="ep-btn-primary ep-btn-primary--ink"
                  onClick={p.onCreateStablecoinAccount}
                >
                  {p.createStablecoinAccountLabel || "Create stablecoin account"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
