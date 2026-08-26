"use client";

import React, { useRef } from "react";
import {
  REVENUE_RANGE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  EMPLOYEE_RANGE_OPTIONS,
  SOURCE_OF_FUNDS_OPTIONS,
  type KybWizardProfileDraft,
} from "@/lib/services/kyb";
import type { DocumentUploadState, KybWizardStep } from "@/lib/hooks/useKybWizard";
import CountrySelect from "@/components/ui/CountrySelect";

const fieldLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "700",
  color: "var(--muted2)",
  textTransform: "uppercase",
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  marginTop: "6px",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1.5px solid var(--input-border)",
  background: "var(--input-bg)",
  outline: "none",
  fontSize: "13.5px",
  color: "var(--ink)",
  boxSizing: "border-box",
};

export type KybWizardModalProps = {
  step: KybWizardStep;
  stepDots: { on: boolean }[];
  draft: KybWizardProfileDraft;
  patchDraft: (patch: Partial<KybWizardProfileDraft>) => void;
  patchAssociate: (index: number, patch: Partial<KybWizardProfileDraft["associates"][0]>) => void;
  error: string;
  busy: boolean;
  docRows: DocumentUploadState[];
  setDocumentFile: (index: number, file: File | null) => void;
  uploadDocumentRow: (index: number, fileOverride?: File | null) => void | Promise<boolean>;
  docsComplete: boolean;
  submitted: boolean;
  nextStep: () => void;
  backStep: () => void;
  closeModal: () => void;
};

function SelectField(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <span style={fieldLabel}>{p.label}</span>
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={fieldInput}>
        <option value="">{p.placeholder || "Select…"}</option>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  hint?: string;
}) {
  return (
    <div>
      <span style={fieldLabel}>{p.label}</span>
      <input
        type={p.type || "text"}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        inputMode={p.inputMode}
        autoComplete={p.autoComplete}
        min={p.min}
        max={p.max}
        step={p.step}
        style={fieldInput}
      />
      {p.hint ? (
        <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>{p.hint}</div>
      ) : null}
    </div>
  );
}

function maxAdultDob(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export default function KybWizardModal(p: KybWizardModalProps) {
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const associate = p.draft.associates[0];

  if (p.submitted) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "12px 0 6px", textAlign: "center" }}>
        <span style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--indigo-tint)", color: "var(--indigo-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>✓</span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "14.5px", fontWeight: "700" }}>In review</span>
        <span style={{ fontSize: "12.5px", color: "var(--muted)" }}>
          Compliance usually takes 1–2 business days. Deposit accounts unlock once KYB is approved.
        </span>
        <button type="button" onClick={p.closeModal} style={{ marginTop: "6px", padding: "10px 20px", borderRadius: "999px", border: "none", background: "var(--surface2)", color: "var(--ink)", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        {(p.stepDots || []).map((d, i) => (
          <span key={i} style={{ height: "4px", flex: "1", borderRadius: "999px", background: d.on ? "var(--indigo)" : "var(--surface3)" }} />
        ))}
      </div>

      {p.step === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: "var(--muted)" }}>Step 1 · Business details</span>
          <TextField label="Legal name" value={p.draft.legalName} onChange={(v) => p.patchDraft({ legalName: v })} placeholder="Mboka Ltd" autoComplete="organization" />
          <TextField label="Registration number" value={p.draft.registrationNumber} onChange={(v) => p.patchDraft({ registrationNumber: v })} placeholder="BN123456" />
          <CountrySelect
            label="Country of incorporation"
            value={p.draft.country}
            onChange={(code) => p.patchDraft({ country: code })}
            required
          />
          {p.draft.country.trim().toUpperCase() === "US" ? (
            <TextField
              label="Tax ID (EIN)"
              value={p.draft.taxId}
              onChange={(v) => p.patchDraft({ taxId: v })}
              placeholder="12-3456789"
              hint="Required for US-incorporated businesses"
            />
          ) : (
            <TextField
              label="Tax ID"
              value={p.draft.taxId}
              onChange={(v) => p.patchDraft({ taxId: v })}
              placeholder="Optional"
              hint="Optional — include if your corridor requires it"
            />
          )}
          <SelectField label="Business type" value={p.draft.businessType} onChange={(v) => p.patchDraft({ businessType: v as KybWizardProfileDraft["businessType"] })} options={BUSINESS_TYPE_OPTIONS} />
          <TextField label="Industry" value={p.draft.industry} onChange={(v) => p.patchDraft({ industry: v })} placeholder="Fintech" />
          <TextField label="Website" value={p.draft.website} onChange={(v) => p.patchDraft({ website: v })} placeholder="https://example.com" type="url" hint="Optional — must start with https://" />
          <SelectField label="Employees" value={p.draft.estimatedEmployees} onChange={(v) => p.patchDraft({ estimatedEmployees: v as KybWizardProfileDraft["estimatedEmployees"] })} options={EMPLOYEE_RANGE_OPTIONS} />
          <SelectField label="Annual revenue" value={p.draft.annualRevenueRange} onChange={(v) => p.patchDraft({ annualRevenueRange: v as KybWizardProfileDraft["annualRevenueRange"] })} options={REVENUE_RANGE_OPTIONS} />
          <SelectField label="Source of funds" value={p.draft.sourceOfFunds} onChange={(v) => p.patchDraft({ sourceOfFunds: v as KybWizardProfileDraft["sourceOfFunds"] })} options={SOURCE_OF_FUNDS_OPTIONS} />
        </div>
      ) : null}

      {p.step === 2 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: "var(--muted)" }}>Step 2 · Registered address & beneficial owner</span>
          <TextField label="Street" value={p.draft.street} onChange={(v) => p.patchDraft({ street: v })} autoComplete="street-address" />
          <TextField label="Street line 2" value={p.draft.street2} onChange={(v) => p.patchDraft({ street2: v })} />
          <TextField label="City" value={p.draft.city} onChange={(v) => p.patchDraft({ city: v })} placeholder="Nairobi" autoComplete="address-level2" />
          <TextField label="Post code" value={p.draft.postCode} onChange={(v) => p.patchDraft({ postCode: v })} autoComplete="postal-code" />
          <TextField label="State / county" value={p.draft.state} onChange={(v) => p.patchDraft({ state: v })} placeholder="Nairobi County" autoComplete="address-level1" />
          <CountrySelect
            label="Address country"
            value={p.draft.addressCountry}
            onChange={(code) => p.patchDraft({ addressCountry: code })}
            required
          />
          {associate ? (
            <>
              <TextField label="UBO first name" value={associate.firstName} onChange={(v) => p.patchAssociate(0, { firstName: v })} autoComplete="given-name" />
              <TextField label="UBO last name" value={associate.lastName} onChange={(v) => p.patchAssociate(0, { lastName: v })} autoComplete="family-name" />
              <TextField
                label="Date of birth"
                value={associate.dateOfBirth}
                onChange={(v) => p.patchAssociate(0, { dateOfBirth: v })}
                type="date"
                max={maxAdultDob()}
                min="1900-01-01"
                hint="Must be 18+"
              />
              <TextField label="Email" value={associate.email} onChange={(v) => p.patchAssociate(0, { email: v })} type="email" autoComplete="email" />
              <TextField
                label="Phone"
                value={associate.phoneNumber}
                onChange={(v) => p.patchAssociate(0, { phoneNumber: v.replace(/[^\d+]/g, "") })}
                placeholder="+254700000000"
                inputMode="tel"
                autoComplete="tel"
                hint="International format with country code"
              />
              <TextField
                label="Ownership %"
                value={associate.ownershipPercentage}
                onChange={(v) => p.patchAssociate(0, { ownershipPercentage: v })}
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
              />
              <CountrySelect
                label="Tax residence country"
                value={associate.country}
                onChange={(code) => p.patchAssociate(0, { country: code })}
                required
              />
            </>
          ) : null}
        </div>
      ) : null}

      {p.step === 3 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: "var(--muted)" }}>Step 3 · Upload documents</span>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
            PDF, JPEG, or PNG — max 10 MB each. Choosing a file uploads it automatically; wait until each row shows Submitted.
          </p>
          {(p.docRows || []).map((row, i) => (
            <div key={row.requirementType + i} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "var(--surface2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1", minWidth: "140px" }}>
                  <b style={{ fontSize: "13px" }}>{row.label}</b>
                  <div style={{ fontSize: "11px", color: row.submitted ? "var(--indigo-text)" : "var(--muted)", marginTop: "2px", fontWeight: row.submitted ? 700 : 500 }}>
                    {row.category === "shareholder" ? "Shareholder ID" : "Business document"}
                    {row.uploading ? " · uploading…" : row.submitted ? " · submitted ✓" : row.file ? " · ready to upload" : ""}
                  </div>
                </div>
                <input
                  ref={(el) => {
                    fileRefs.current[i] = el;
                  }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  style={{ display: "none" }}
                  onChange={(e) => p.setDocumentFile(i, e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={row.uploading || row.submitted}
                  onClick={() => fileRefs.current[i]?.click()}
                  style={{ padding: "6px 13px", borderRadius: "999px", border: "none", background: row.submitted ? "var(--indigo-tint)" : "var(--indigo)", color: row.submitted ? "var(--indigo-text)" : "var(--indigo-on)", fontSize: "11px", fontWeight: "700", cursor: row.submitted ? "default" : "pointer", opacity: row.uploading ? 0.7 : 1 }}
                >
                  {row.uploading ? "Uploading…" : row.submitted ? "Done" : row.file ? row.file.name.slice(0, 18) : "Choose file"}
                </button>
                {!row.submitted && row.file && !row.uploading ? (
                  <button
                    type="button"
                    onClick={() => void p.uploadDocumentRow(i, row.file)}
                    style={{ padding: "6px 13px", borderRadius: "999px", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                  >
                    Retry upload
                  </button>
                ) : null}
              </div>
              {row.error ? (
                <div style={{ fontSize: "11px", color: "var(--red)", fontWeight: 600 }}>{row.error}</div>
              ) : null}
            </div>
          ))}
          {!p.docRows.length ? (
            <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>Loading document checklist…</p>
          ) : null}
        </div>
      ) : null}

      {p.step === 4 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: "var(--muted)" }}>Step 4 · Submit for review</span>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>
            Your business profile, address, beneficial owner, and documents will be sent to compliance for review.
          </p>
          <div style={{ padding: "12px 14px", borderRadius: "12px", background: "var(--indigo-tint)", color: "var(--indigo-text)", fontSize: "12px", fontWeight: 600 }}>
            {p.docsComplete ? "All required documents are submitted." : "Complete document uploads on the previous step first."}
          </div>
        </div>
      ) : null}

      {p.error ? (
        <div style={{ padding: "10px 12px", borderRadius: "12px", background: "var(--red-tint)", color: "var(--red)", fontSize: "11.5px", fontWeight: 600 }}>
          {p.error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "8px" }}>
        {p.step > 1 ? (
          <button type="button" onClick={p.backStep} disabled={p.busy} style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "1.5px solid var(--border)", background: "var(--surface2)", color: "var(--ink)", fontFamily: "'Space Grotesk',sans-serif", fontSize: "13.5px", fontWeight: "700", cursor: "pointer" }}>
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={p.nextStep}
          disabled={p.busy || (p.step === 4 && !p.docsComplete)}
          style={{ flex: 2, padding: "13px", borderRadius: "14px", border: "none", background: "var(--indigo)", color: "var(--indigo-on)", fontFamily: "'Space Grotesk',sans-serif", fontSize: "13.5px", fontWeight: "700", cursor: p.busy ? "wait" : "pointer", opacity: p.busy ? 0.7 : 1 }}
        >
          {p.busy ? "Saving…" : p.step === 4 ? "Submit for review" : "Continue"}
        </button>
      </div>
    </div>
  );
}
