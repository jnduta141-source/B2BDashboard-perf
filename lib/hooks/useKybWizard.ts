"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildProfilePayload,
  buildShareholderPayload,
  buildUploadFormData,
  formatKybServiceError,
  inferWizardStartStep,
  kybApi,
  labelForDocumentType,
  newKybIdempotencyKey,
  profileDraftFromSummary,
  validateAddressUboStep,
  validateBusinessStep,
  validateProfileDraft,
  type KybDocumentRequirements,
  type KybWizardProfileDraft,
} from "@/lib/services/kyb";

export type UseKybWizardOptions = {
  businessId: number | null | undefined;
  defaultCountry?: string;
  /** Prefill from auth/me kyb_summary + business. */
  kybSummary?: { profile: Record<string, unknown> | null } | null;
  business?: {
    legal_name?: string | null;
    country?: string;
    registration_number?: string | null;
  } | null;
  enabled: boolean;
  onSubmitted?: () => void;
};

export type KybWizardStep = 1 | 2 | 3 | 4;

export type DocumentUploadState = {
  requirementType: string;
  label: string;
  category: "business" | "shareholder";
  associateRefId?: string;
  issuingCountryRequired: boolean;
  file: File | null;
  uploadedDocId: number | null;
  submitted: boolean;
  uploading: boolean;
  error: string;
};

const STEP_LABELS = ["Business", "Address & UBO", "Documents", "Submit"];

const POST_SUBMIT_POLL_ATTEMPTS = 3;
const POST_SUBMIT_POLL_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useKybWizard(opts: UseKybWizardOptions) {
  const [step, setStep] = useState<KybWizardStep>(1);
  const [draft, setDraft] = useState<KybWizardProfileDraft>(() =>
    profileDraftFromSummary(opts.kybSummary, opts.business),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requirements, setRequirements] = useState<KybDocumentRequirements | null>(null);
  const [docRows, setDocRows] = useState<DocumentUploadState[]>([]);
  const [shareholderId, setShareholderId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  /** Only full-reset when business changes or first open — keep mid-flow on reopen. */
  const sessionBusinessIdRef = useRef<number | null | undefined>(undefined);
  const sessionInitializedRef = useRef(false);
  const resumeLoadIdRef = useRef(0);

  useEffect(() => {
    if (!opts.enabled) return;

    const businessChanged = sessionBusinessIdRef.current !== opts.businessId;
    const firstOpen = !sessionInitializedRef.current;

    if (!businessChanged && !firstOpen) {
      return;
    }

    sessionBusinessIdRef.current = opts.businessId;
    sessionInitializedRef.current = true;
    const loadId = ++resumeLoadIdRef.current;

    const nextDraft = profileDraftFromSummary(opts.kybSummary, opts.business);
    const profile = opts.kybSummary?.profile ?? null;
    setDraft(nextDraft);
    setError("");
    setSubmitted(false);
    setRequirements(null);
    setDocRows([]);
    setShareholderId(null);

    // Optimistic step from profile only; refined after document state loads.
    setStep(inferWizardStartStep({ profile }));

    const businessId = opts.businessId;
    if (!businessId) return;

    void (async () => {
      let reqs: KybDocumentRequirements | null = null;
      let hasUploadedDocuments = false;

      try {
        const listed = await kybApi.listDocuments(businessId);
        hasUploadedDocuments = listed.documents.some((d) => d.is_active);
      } catch {
        // Best-effort resume — fall back to requirements / profile-only step.
      }

      try {
        reqs = await kybApi.documentRequirements(
          businessId,
          nextDraft.country || undefined,
        );
        if (
          reqs.business_documents.some((d) => d.uploaded) ||
          reqs.shareholder_documents.some((d) => d.uploaded)
        ) {
          hasUploadedDocuments = true;
        }
      } catch {
        // Requirements may be unavailable before initiate; keep profile step.
      }

      // Ignore stale loads when business changes mid-flight (not on every re-render).
      if (loadId !== resumeLoadIdRef.current) return;

      const hasDocumentRequirements = !!reqs && hasUploadedDocuments;
      if (reqs && hasUploadedDocuments) {
        const associateRef = nextDraft.associates[0]?.id;
        setRequirements(reqs);
        setDocRows([
          ...reqs.business_documents.map((d) => ({
            requirementType: d.type,
            label: d.label?.trim() || labelForDocumentType(d.type),
            category: "business" as const,
            issuingCountryRequired: d.issuing_country_required,
            file: null,
            uploadedDocId: null,
            submitted: d.uploaded,
            uploading: false,
            error: "",
          })),
          ...reqs.shareholder_documents.map((d) => ({
            requirementType: d.type,
            label: d.label?.trim() || labelForDocumentType(d.type),
            category: "shareholder" as const,
            associateRefId: associateRef,
            issuingCountryRequired: d.issuing_country_required,
            file: null,
            uploadedDocId: null,
            submitted: d.uploaded,
            uploading: false,
            error: "",
          })),
        ]);
      }

      setStep(
        inferWizardStartStep({
          profile,
          hasDocumentRequirements,
          hasUploadedDocuments,
        }),
      );
    })();
  }, [opts.enabled, opts.businessId, opts.kybSummary, opts.business]);

  const patchDraft = useCallback((patch: Partial<KybWizardProfileDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // Keep address + UBO tax country aligned when the business country changes
      // and those fields still match the previous business country (or are empty).
      if (patch.country && patch.country !== prev.country) {
        if (!prev.addressCountry || prev.addressCountry === prev.country) {
          next.addressCountry = patch.country;
        }
        next.associates = next.associates.map((a) =>
          !a.country || a.country === prev.country ? { ...a, country: patch.country! } : a,
        );
      }
      return next;
    });
  }, []);

  const patchAssociate = useCallback((index: number, patch: Partial<KybWizardProfileDraft["associates"][0]>) => {
    setDraft((prev) => ({
      ...prev,
      associates: prev.associates.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }, []);

  const saveProfile = useCallback(async (): Promise<boolean> => {
    const validationError = validateProfileDraft(draft);
    if (validationError) {
      setError(validationError);
      return false;
    }
    if (!opts.businessId) {
      setError("No business is linked to this session.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const payload = buildProfilePayload(draft);
      const summary = await kybApi.summary(opts.businessId);
      if (summary.profile) {
        await kybApi.patchProfile(opts.businessId, payload);
      } else {
        await kybApi.createProfile(opts.businessId, payload);
      }
      await kybApi.upsertAddress(opts.businessId, payload.registered_address!);
      setBusy(false);
      return true;
    } catch (err) {
      setBusy(false);
      setError(formatKybServiceError(err));
      return false;
    }
  }, [draft, opts.businessId]);

  const rowsFromRequirements = useCallback(
    (reqs: KybDocumentRequirements): DocumentUploadState[] => {
      const associateRef = draft.associates[0]?.id;
      return [
        ...reqs.business_documents.map((d) => ({
          requirementType: d.type,
          label: d.label?.trim() || labelForDocumentType(d.type),
          category: "business" as const,
          issuingCountryRequired: d.issuing_country_required,
          file: null,
          uploadedDocId: null,
          submitted: d.uploaded,
          uploading: false,
          error: "",
        })),
        ...reqs.shareholder_documents.map((d) => ({
          requirementType: d.type,
          label: d.label?.trim() || labelForDocumentType(d.type),
          category: "shareholder" as const,
          associateRefId: associateRef,
          issuingCountryRequired: d.issuing_country_required,
          file: null,
          uploadedDocId: null,
          submitted: d.uploaded,
          uploading: false,
          error: "",
        })),
      ];
    },
    [draft.associates],
  );

  const prepareDocuments = useCallback(async (): Promise<boolean> => {
    if (!opts.businessId) return false;
    setBusy(true);
    setError("");
    try {
      let reqs = requirements;
      if (!reqs) {
        try {
          const initiated = await kybApi.initiate(opts.businessId, newKybIdempotencyKey());
          reqs = initiated.document_requirements ?? null;
        } catch (initiateErr) {
          // Aggregator/sandbox can 502 on enroll while profile is already saved.
          // Fall back to the requirements endpoint so the user can continue.
          try {
            reqs = await kybApi.documentRequirements(opts.businessId, draft.country || undefined);
          } catch {
            setBusy(false);
            setError(formatKybServiceError(initiateErr));
            return false;
          }
        }
        if (!reqs) {
          reqs = await kybApi.documentRequirements(opts.businessId, draft.country || undefined);
        }
        setRequirements(reqs);
      }
      setDocRows(rowsFromRequirements(reqs));
      setBusy(false);
      return true;
    } catch (err) {
      setBusy(false);
      setError(formatKybServiceError(err));
      return false;
    }
  }, [draft.country, opts.businessId, requirements, rowsFromRequirements]);

  const ensureShareholderRegistered = useCallback(async (): Promise<string | null> => {
    if (!opts.businessId) return null;
    if (shareholderId) return shareholderId;
    const associate = draft.associates[0];
    await kybApi.addShareholder(opts.businessId, buildShareholderPayload(associate));
    const list = await kybApi.listShareholders(opts.businessId);
    const match = list.shareholders.find((sh) => {
      const first = String(sh.firstName ?? sh.first_name ?? "").toLowerCase();
      const last = String(sh.lastName ?? sh.last_name ?? "").toLowerCase();
      return (
        first === associate.firstName.trim().toLowerCase() &&
        last === associate.lastName.trim().toLowerCase()
      );
    });
    const id = String(match?.id ?? match?.shareholderId ?? match?.shareholder_id ?? "");
    if (id) setShareholderId(id);
    return id || null;
  }, [draft.associates, opts.businessId, shareholderId]);

  const uploadDocumentRow = useCallback(
    async (index: number, fileOverride?: File | null): Promise<boolean> => {
      if (!opts.businessId) return false;
      const row = docRows[index];
      const file = fileOverride ?? row?.file ?? null;
      if (!row || !file) {
        setDocRows((rows) =>
          rows.map((r, i) => (i === index ? { ...r, error: "Choose a file first." } : r)),
        );
        return false;
      }
      setDocRows((rows) =>
        rows.map((r, i) =>
          i === index ? { ...r, file, uploading: true, error: "", submitted: false } : r,
        ),
      );
      try {
        const form = buildUploadFormData({
          file,
          documentType: row.requirementType,
          issuingCountry: row.issuingCountryRequired ? draft.country : undefined,
          associateRefId: row.associateRefId,
        });
        const uploaded = await kybApi.uploadDocument(opts.businessId, form);
        if (row.category === "business") {
          await kybApi.submitDocument(opts.businessId, uploaded.id, newKybIdempotencyKey());
        } else {
          const shId = await ensureShareholderRegistered();
          if (!shId) throw new Error("Register the beneficial owner with the verifier first.");
          await kybApi.submitShareholderDocument(opts.businessId, uploaded.id, shId);
        }
        setDocRows((rows) =>
          rows.map((r, i) =>
            i === index
              ? {
                  ...r,
                  file,
                  uploading: false,
                  uploadedDocId: uploaded.id,
                  submitted: true,
                  error: "",
                }
              : r,
          ),
        );
        return true;
      } catch (err) {
        setDocRows((rows) =>
          rows.map((r, i) =>
            i === index
              ? {
                  ...r,
                  file,
                  uploading: false,
                  error: formatKybServiceError(err),
                }
              : r,
          ),
        );
        return false;
      }
    },
    [docRows, draft.country, ensureShareholderRegistered, opts.businessId],
  );

  const setDocumentFile = useCallback(
    (index: number, file: File | null) => {
      setDocRows((rows) =>
        rows.map((r, i) =>
          i === index ? { ...r, file, submitted: false, error: "" } : r,
        ),
      );
      // Selecting a file starts upload immediately — no separate Upload click needed.
      if (file) {
        void uploadDocumentRow(index, file);
      }
    },
    [uploadDocumentRow],
  );

  const pollAfterSubmit = useCallback(async (businessId: number) => {
    for (let attempt = 0; attempt < POST_SUBMIT_POLL_ATTEMPTS; attempt += 1) {
      try {
        const status = await kybApi.pollVerifierStatus(businessId);
        if (status.kyb_status === "approved" || status.kyb_status === "rejected") {
          return status;
        }
      } catch {
        // Poll is best-effort after a successful submit — don't fail the UX.
      }
      if (attempt < POST_SUBMIT_POLL_ATTEMPTS - 1) {
        await sleep(POST_SUBMIT_POLL_DELAY_MS);
      }
    }
    return null;
  }, []);

  const submitForReview = useCallback(async (): Promise<boolean> => {
    if (!opts.businessId) return false;
    setBusy(true);
    setError("");
    try {
      await kybApi.submitForReview(opts.businessId, newKybIdempotencyKey());
      await pollAfterSubmit(opts.businessId);
      setSubmitted(true);
      setBusy(false);
      opts.onSubmitted?.();
      return true;
    } catch (err) {
      setBusy(false);
      setError(formatKybServiceError(err));
      return false;
    }
  }, [opts, pollAfterSubmit]);

  const nextStep = useCallback(async () => {
    if (step === 1) {
      const validationError = validateBusinessStep(draft);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError("");
      setStep(2);
      return;
    }
    if (step === 2) {
      const validationError = validateAddressUboStep(draft);
      if (validationError) {
        setError(validationError);
        return;
      }
      const ok = await saveProfile();
      if (!ok) return;
      const docsOk = await prepareDocuments();
      if (!docsOk) return;
      setStep(3);
      return;
    }
    if (step === 3) {
      const missingFile = docRows.some((r) => !r.submitted && !r.file);
      if (missingFile) {
        setError("Choose a file for every required document before continuing.");
        return;
      }
      const pending = docRows
        .map((r, i) => ({ row: r, index: i }))
        .filter(({ row }) => !row.submitted);
      if (pending.length) {
        setBusy(true);
        setError("");
        for (const { row, index } of pending) {
          const ok = await uploadDocumentRow(index, row.file);
          if (!ok) {
            setBusy(false);
            setError("Some documents failed to upload. Fix the errors above and try again.");
            return;
          }
        }
        setBusy(false);
      }
      setError("");
      setStep(4);
      return;
    }
    await submitForReview();
  }, [docRows, draft, prepareDocuments, saveProfile, step, submitForReview, uploadDocumentRow]);

  const backStep = useCallback(() => {
    setError("");
    setStep((s) => Math.max(1, s - 1) as KybWizardStep);
  }, []);

  const stepDots = STEP_LABELS.map((_, i) => ({ on: i + 1 <= step }));
  const docsComplete = docRows.length > 0 && docRows.every((r) => r.submitted);

  return {
    step,
    stepLabels: STEP_LABELS,
    stepDots,
    draft,
    patchDraft,
    patchAssociate,
    error,
    busy,
    docRows,
    setDocumentFile,
    uploadDocumentRow,
    docsComplete,
    submitted,
    nextStep,
    backStep,
  };
}
