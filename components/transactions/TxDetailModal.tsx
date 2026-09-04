"use client";
import MbokaMark from "@/components/brand/MbokaMark";
import React, { useEffect, useId, useRef, useState } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  buildReceiptPdfBlob,
  downloadPdfBlob,
  shareReceiptPdf,
} from "@/lib/documents/receiptPdf";
import {
  RECEIPT_SHARE_METHODS,
  buildReceiptSharePayload,
  canUseDeviceShare,
  emailShareUrl,
  smsShareUrl,
  telegramShareUrl,
  whatsappShareUrl,
  type ReceiptShareMethodId,
} from "@/lib/documents/receiptShare";
import {
  buildTransactionReceipt,
  isReceiptable,
  receiptAccountLabel,
  receiptFilename,
  receiptPartyLabel,
  receiptPaymentMethod,
  receiptPaymentRefLabel,
} from "@/lib/documents/transactionReceipt";

export type TxDetailModalProps = {
  txDetail: any;
  /** True while the fetch-by-id (GET /v1/transactions/{id}) is in flight. */
  isLoading?: boolean;
  /** Non-null while the order hasn't reached a terminal status yet. */
  liveStatus?: { label: string; isFetching: boolean } | null;
};

type StepState = "done" | "current" | "upcoming" | "failed";

type ProgressStep = {
  key: string;
  label: string;
  state: StepState;
};

function formatTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Derive a readable status progression from the canonical transaction status. */
function buildProgressSteps(status?: string): ProgressStep[] {
  const s = (status || "").toLowerCase();

  if (s === "failed") {
    return [
      { key: "created", label: "Created", state: "done" },
      { key: "processing", label: "Processing", state: "done" },
      { key: "failed", label: "Failed", state: "failed" },
    ];
  }
  if (s === "canceled") {
    return [
      { key: "created", label: "Created", state: "done" },
      { key: "canceled", label: "Canceled", state: "failed" },
    ];
  }
  if (s === "frozen") {
    return [
      { key: "created", label: "Created", state: "done" },
      { key: "processing", label: "Processing", state: "done" },
      { key: "frozen", label: "Frozen", state: "failed" },
    ];
  }
  if (s === "refunded") {
    return [
      { key: "created", label: "Created", state: "done" },
      { key: "settled", label: "Settled", state: "done" },
      { key: "refunded", label: "Refunded", state: "done" },
    ];
  }
  if (s === "completed") {
    return [
      { key: "created", label: "Created", state: "done" },
      { key: "processing", label: "Processing", state: "done" },
      { key: "settled", label: "Settled", state: "done" },
    ];
  }
  return [
    { key: "created", label: "Created", state: "done" },
    { key: "processing", label: "Processing", state: "current" },
    { key: "settled", label: "Settled", state: "upcoming" },
  ];
}

function DetailRow({
  label,
  value,
  mono = false,
  last = false,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const content = children ?? value;
  if (content == null || content === "") return null;
  return (
    <div className={`ep-txn-detail__row${last ? " ep-txn-detail__row--last" : ""}`}>
      <span className="ep-txn-detail__label">{label}</span>
      <span className={`ep-txn-detail__value${mono ? " ep-mono" : ""}`}>{content}</span>
    </div>
  );
}

function ReceiptActions({ txDetail }: { txDetail: any }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const doc = buildTransactionReceipt(txDetail);
  const filename = receiptFilename(txDetail);
  const payload = buildReceiptSharePayload(doc, filename);

  async function runShare(id: ReceiptShareMethodId) {
    const pdf = buildReceiptPdfBlob(doc, filename);

    if (id === "pdf") {
      downloadPdfBlob(pdf.blob, pdf.filename);
      setToast("PDF saved");
      setOpen(false);
      return;
    }

    const result = await shareReceiptPdf(pdf);

    if (result === "failed") {
      setToast("Couldn’t share the PDF");
      return;
    }
    if (result === "aborted") {
      setOpen(false);
      return;
    }

    // Deep links can't attach files — after PDF share/download, open the
    // channel with a short caption so the user can attach the saved PDF.
    if (result === "downloaded") {
      if (id === "whatsapp") {
        window.open(whatsappShareUrl(payload.text), "_blank", "noopener,noreferrer");
        setToast("PDF saved — attach it in WhatsApp");
      } else if (id === "email") {
        window.location.href = emailShareUrl(payload.title, payload.text);
        setToast("PDF saved — attach it to your email");
      } else if (id === "sms") {
        window.location.href = smsShareUrl(payload.text);
        setToast("PDF saved — attach it in Messages if supported");
      } else if (id === "telegram") {
        window.open(telegramShareUrl(payload.text), "_blank", "noopener,noreferrer");
        setToast("PDF saved — attach it in Telegram");
      } else {
        setToast("PDF saved");
      }
    }

    setOpen(false);
  }

  const methods = RECEIPT_SHARE_METHODS.filter(
    (m) => m.id !== "device" || canUseDeviceShare(),
  );

  return (
    <div className="ep-txn-detail__actions" ref={rootRef}>
      {open ? (
        <button
          type="button"
          className="ep-txn-detail__share-backdrop"
          aria-label="Dismiss share menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="ep-txn-detail__share-wrap">
        <button
          type="button"
          className="ep-btn-secondary ep-txn-detail__share"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          Share receipt
        </button>
        {open ? (
          <div className="ep-txn-detail__share-menu" id={menuId} role="menu">
            <div className="ep-txn-detail__share-sheet-label">Share receipt</div>
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                className="ep-txn-detail__share-item"
                onClick={() => void runShare(m.id)}
              >
                <span className="ep-txn-detail__share-label">{m.label}</span>
                <span className="ep-txn-detail__share-hint">{m.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="ep-btn-primary ep-txn-detail__receipt"
        onClick={() => {
          const pdf = buildReceiptPdfBlob(doc, filename);
          downloadPdfBlob(pdf.blob, pdf.filename);
          setToast("PDF saved");
        }}
      >
        Download PDF
      </button>
      {toast ? (
        <div className="ep-txn-detail__toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export default function TxDetailModal({ txDetail, isLoading, liveStatus }: TxDetailModalProps) {
  if (!txDetail) {
    return isLoading ? (
      <div className="ep-txn-detail__loading" role="status" aria-live="polite">
        <MbokaMark size={20} motion="inflight" title={null} />
        Loading transaction…
      </div>
    ) : null;
  }

  const created = formatTimestamp(txDetail.created_at);
  const updated = formatTimestamp(txDetail.updated_at);
  const steps = buildProgressSteps(txDetail.status);
  const showUpdated = Boolean(updated && updated !== created);
  const paymentMethod = receiptPaymentMethod(
    txDetail.provider,
    txDetail.railType,
    txDetail.networkName,
  );
  const paymentRef =
    typeof txDetail.psp_transaction_id === "string"
      ? txDetail.psp_transaction_id.trim()
      : "";
  const partyName =
    typeof txDetail.partyName === "string" ? txDetail.partyName.trim() : "";
  const accountNumber =
    typeof txDetail.accountNumber === "string" ? txDetail.accountNumber.trim() : "";

  // Web2 detail rows — what a client needs when sharing proof of payment.
  const rows: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: "Reference", value: txDetail.ref, mono: true },
    { label: "Type", value: txDetail.type },
    { label: "Payment method", value: paymentMethod },
  ];
  if (partyName) {
    rows.push({
      label: receiptPartyLabel(txDetail.direction || ""),
      value: partyName,
    });
  }
  if (accountNumber) {
    rows.push({
      label: receiptAccountLabel(
        txDetail.direction || "",
        txDetail.accountKind,
        txDetail.networkName,
        txDetail.provider,
        txDetail.railType,
      ),
      value: accountNumber,
      mono: true,
    });
  }
  if (paymentRef) {
    rows.push({
      label: receiptPaymentRefLabel(
        txDetail.provider,
        txDetail.railType,
        txDetail.networkName,
      ),
      value: paymentRef,
      mono: true,
    });
  }

  const txHash =
    typeof txDetail.tx_hash === "string" ? txDetail.tx_hash.trim() : "";
  const explorerUrl =
    typeof txDetail.explorerUrl === "string" ? txDetail.explorerUrl.trim() : "";
  if (txHash) {
    rows.push({
      label: "Tx hash",
      mono: true,
      value: explorerUrl ? (
        <>
          <span className="ep-txn-detail__hash">{txHash}</span>{" "}
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            View on chain
          </a>
        </>
      ) : (
        txHash
      ),
    });
  }

  const cryptoNetworkLabel =
    (typeof txDetail.cryptoNetworkLabel === "string" &&
      txDetail.cryptoNetworkLabel.trim()) ||
    (typeof txDetail.crypto_network === "string" && txDetail.crypto_network.trim()
      ? txDetail.crypto_network.trim()
      : "");
  if (cryptoNetworkLabel) {
    // Prefer human label when present (e.g. "Stellar" over stellar_testnet).
    const networkDisplay =
      typeof txDetail.cryptoNetworkLabel === "string" && txDetail.cryptoNetworkLabel.trim()
        ? txDetail.cryptoNetworkLabel.trim()
        : cryptoNetworkLabel;
    rows.push({ label: "Network", value: networkDisplay });
  }

  const fromAddress =
    typeof txDetail.from_address === "string" ? txDetail.from_address.trim() : "";
  if (fromAddress) {
    rows.push({ label: "From", value: fromAddress, mono: true });
  }

  const toAddress =
    typeof txDetail.to_address === "string" ? txDetail.to_address.trim() : "";
  if (toAddress) {
    rows.push({ label: "To", value: toAddress, mono: true });
  }

  const memo = typeof txDetail.memo === "string" ? txDetail.memo.trim() : "";
  if (memo) {
    rows.push({ label: "Memo", value: memo, mono: true });
  }

  if (created) rows.push({ label: "Time", value: created, mono: true });
  if (showUpdated && updated) rows.push({ label: "Last updated", value: updated, mono: true });

  return (
    <div className="ep-txn-detail">
      <header className="ep-txn-detail__hero">
        <div
          className="ep-txn-detail__amount ep-mono"
          style={{ color: txDetail.amountColor || "var(--ink)" }}
        >
          {txDetail.amount}
        </div>
        <div className="ep-txn-detail__party">
          {txDetail.flagUrl ? (
            <span
              className="ep-flag"
              style={{ backgroundImage: `url(${txDetail.flagUrl})` }}
              aria-hidden
            />
          ) : null}
          <span>{txDetail.client}</span>
        </div>
        <div className="ep-txn-detail__status">
          <StatusBadge
            label={txDetail.statusLabel}
            icon={txDetail.statusIcon}
            color={txDetail.statusColor}
            soft={txDetail.statusSoft}
            size="md"
          />
        </div>
      </header>

      {liveStatus ? (
        <div
          className={`ep-txn-detail__live${liveStatus.isFetching ? " ep-txn-detail__live--fetching" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="ep-txn-detail__live-dot" aria-hidden />
          <span>{liveStatus.label}</span>
        </div>
      ) : null}

      <ol className="ep-txn-detail__progress" aria-label="Status progression">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`ep-txn-detail__step ep-txn-detail__step--${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {index > 0 ? <span className="ep-txn-detail__step-line" aria-hidden /> : null}
            <span className="ep-txn-detail__step-dot" aria-hidden />
            <span className="ep-txn-detail__step-label">
              {step.label}
              <span className="ep-txn-detail__sr">
                {step.state === "done"
                  ? " — complete"
                  : step.state === "current"
                    ? " — current"
                    : step.state === "failed"
                      ? " — issue"
                      : " — upcoming"}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="ep-txn-detail__rows">
        {rows.map((row, i) => (
          <DetailRow
            key={row.label}
            label={row.label}
            mono={row.mono}
            last={i === rows.length - 1}
          >
            {row.value}
          </DetailRow>
        ))}
      </div>

      {isReceiptable(txDetail.status) && !txDetail.hideReceipt ? (
        <ReceiptActions txDetail={txDetail} />
      ) : null}
    </div>
  );
}
