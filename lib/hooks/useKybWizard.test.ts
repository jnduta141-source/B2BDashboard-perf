/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pollVerifierStatus = vi.fn();
const submitForReview = vi.fn();
const initiate = vi.fn();
const summary = vi.fn();
const patchProfile = vi.fn();
const createProfile = vi.fn();
const upsertAddress = vi.fn();
const documentRequirements = vi.fn();
const listDocuments = vi.fn();
const uploadDocument = vi.fn();
const submitDocument = vi.fn();

vi.mock("@/lib/services/kyb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/kyb")>();
  return {
    ...actual,
    kybApi: {
      ...actual.kybApi,
      pollVerifierStatus: (...args: unknown[]) => pollVerifierStatus(...args),
      submitForReview: (...args: unknown[]) => submitForReview(...args),
      initiate: (...args: unknown[]) => initiate(...args),
      summary: (...args: unknown[]) => summary(...args),
      patchProfile: (...args: unknown[]) => patchProfile(...args),
      createProfile: (...args: unknown[]) => createProfile(...args),
      upsertAddress: (...args: unknown[]) => upsertAddress(...args),
      documentRequirements: (...args: unknown[]) => documentRequirements(...args),
      listDocuments: (...args: unknown[]) => listDocuments(...args),
      uploadDocument: (...args: unknown[]) => uploadDocument(...args),
      submitDocument: (...args: unknown[]) => submitDocument(...args),
      listShareholders: vi.fn().mockResolvedValue({ shareholders: [] }),
      addShareholder: vi.fn(),
      submitShareholderDocument: vi.fn(),
      status: vi.fn(),
    },
  };
});

import { useKybWizard } from "./useKybWizard";
import { ApiRequestError } from "@/lib/apiClient";

const completePendingProfile = {
  kyb_status: "pending",
  legal_name: "Acme",
  registration_number: "R1",
  business_type: "LimitedCompany",
  industry: "Fintech",
  estimated_employees: "1-10",
  annual_revenue_range: "100kTo1M",
  source_of_funds: "Revenue",
  country: "KE",
  registered_address: {
    street: "1 Main",
    city: "Nairobi",
    post_code: "00100",
    country: "KE",
  },
  associates: [
    {
      id: "a1",
      relationship_types: ["UBO"],
      full_name: { first_name: "Jane", last_name: "Doe" },
      date_of_birth: "1985-03-15",
      email: "jane@example.com",
      phone_number: "+254700000000",
      tax_residence_country: "KE",
      ubo: { ownership_percentage: 60 },
    },
  ],
};

function emptyRequirements() {
  return {
    provider: "international_ramp" as const,
    corridor: "KE",
    business_documents: [] as const,
    shareholder_documents: [] as const,
    disclaimer: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pollVerifierStatus.mockResolvedValue({ kyb_status: "submitted", profile_exists: true });
  submitForReview.mockResolvedValue({});
  listDocuments.mockResolvedValue({ documents: [] });
  documentRequirements.mockResolvedValue(emptyRequirements());
  initiate.mockResolvedValue({
    provider: "international_ramp",
    kyb_status: "pending",
    document_requirements: null,
  });
  summary.mockResolvedValue({ profile: completePendingProfile });
  patchProfile.mockResolvedValue({});
  upsertAddress.mockResolvedValue({});
});

describe("useKybWizard restore + submit poll", () => {
  it("restores to step 2 when pending profile has address and associates but no docs", async () => {
    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 1,
        enabled: true,
        kybSummary: { profile: completePendingProfile },
        business: { legal_name: "Acme", country: "KE", registration_number: "R1" },
      }),
    );

    await waitFor(() => {
      expect(result.current.step).toBe(2);
    });
    expect(listDocuments).toHaveBeenCalledWith(1);
    expect(documentRequirements).toHaveBeenCalled();
    expect(result.current.draft.legalName).toBe("Acme");
    expect(result.current.draft.city).toBe("Nairobi");
  });

  it("restores to step 3 with shareholder rows marked submitted from uploaded flags", async () => {
    listDocuments.mockResolvedValue({
      documents: [{ id: 9, document_type: "identity", provider_document_type: "identity", is_active: true }],
    });
    documentRequirements.mockResolvedValue({
      provider: "international_ramp",
      corridor: "KE",
      business_documents: [
        {
          type: "certificate_of_incorporation",
          category: "business",
          label: "Certificate",
          requires_associate_ref_id: false,
          issuing_country_required: false,
          uploaded: true,
        },
      ],
      shareholder_documents: [
        {
          type: "identity",
          category: "shareholder",
          label: "Officer ID",
          requires_associate_ref_id: true,
          issuing_country_required: true,
          uploaded: true,
        },
      ],
      disclaimer: null,
    });

    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 2,
        enabled: true,
        kybSummary: { profile: completePendingProfile },
        business: { legal_name: "Acme", country: "KE", registration_number: "R1" },
      }),
    );

    await waitFor(() => {
      expect(result.current.step).toBe(3);
    });
    expect(result.current.docsComplete).toBe(true);
    expect(result.current.docRows.every((r) => r.submitted)).toBe(true);
    expect(result.current.docRows.some((r) => r.category === "shareholder" && r.submitted)).toBe(
      true,
    );
  });

  it("does not wipe step when reopening the same business mid-flow", async () => {
    summary.mockResolvedValue({ profile: { kyb_status: "pending", legal_name: "Acme" } });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useKybWizard({
          businessId: 1,
          enabled,
          kybSummary: { profile: { kyb_status: "pending", legal_name: "Acme" } },
          business: { legal_name: "Acme", country: "KE" },
        }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.step).toBe(1));

    act(() => {
      result.current.patchDraft({ legalName: "Edited Name" });
    });
    rerender({ enabled: false });
    rerender({ enabled: true });

    expect(result.current.draft.legalName).toBe("Edited Name");
    expect(result.current.step).toBe(1);
  });

  it("reloads saved profile fields from GET …/kyb on open", async () => {
    summary.mockResolvedValue({
      profile: {
        ...completePendingProfile,
        business_type: "LimitedCompany",
        industry: "Fintech",
        estimated_employees: "1-10",
        annual_revenue_range: "100kTo1M",
        source_of_funds: "Revenue",
      },
    });

    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 7,
        enabled: true,
        // Status-only stub like bootstrap used to leave in auth-me cache.
        kybSummary: { profile: { kyb_status: "pending" } },
        business: {
          legal_name: "element",
          country: "KE",
          registration_number: "PV123456",
        },
      }),
    );

    await waitFor(() => {
      expect(summary).toHaveBeenCalledWith(7);
      expect(result.current.draft.businessType).toBe("LimitedCompany");
      expect(result.current.draft.industry).toBe("Fintech");
      expect(result.current.draft.estimatedEmployees).toBe("1-10");
      expect(result.current.step).toBe(2);
    });
  });

  it("polls verifier status after submitForReview succeeds", async () => {
    const onSubmitted = vi.fn();
    // Walk the wizard from step 2 to submit with one already-uploaded document.
    documentRequirements.mockResolvedValue({
      provider: "international_ramp",
      corridor: "KE",
      business_documents: [
        {
          type: "certificate_of_incorporation",
          category: "business",
          label: "Certificate of incorporation",
          requires_associate_ref_id: false,
          issuing_country_required: false,
          uploaded: true,
        },
      ],
      shareholder_documents: [],
      disclaimer: null,
    });

    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 5,
        enabled: true,
        kybSummary: { profile: completePendingProfile },
        business: { legal_name: "Acme", country: "KE", registration_number: "R1" },
        onSubmitted,
      }),
    );

    // Init sees uploaded flag → step 3 with docs already complete.
    await waitFor(() => expect(result.current.step).toBe(3));
    expect(result.current.docsComplete).toBe(true);
    await act(async () => {
      await result.current.nextStep();
    });
    await waitFor(() => expect(result.current.step).toBe(4));
    await act(async () => {
      await result.current.nextStep();
    });

    await waitFor(() => {
      expect(submitForReview).toHaveBeenCalled();
      expect(pollVerifierStatus).toHaveBeenCalledWith(5);
      expect(onSubmitted).toHaveBeenCalled();
      expect(result.current.submitted).toBe(true);
    });
  });

  it("surfaces 422 missing[] on submit failure", async () => {
    submitForReview.mockRejectedValue(
      new ApiRequestError("Incomplete", 422, { missing: ["identity", "tax_id"] }),
    );
    documentRequirements.mockResolvedValue({
      provider: "international_ramp",
      corridor: null,
      business_documents: [
        {
          type: "identity",
          category: "business",
          label: "Identity",
          requires_associate_ref_id: false,
          issuing_country_required: false,
          uploaded: true,
        },
      ],
      shareholder_documents: [],
      disclaimer: null,
    });

    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 3,
        enabled: true,
        kybSummary: { profile: completePendingProfile },
        business: { legal_name: "Acme", country: "KE", registration_number: "R1" },
      }),
    );

    await waitFor(() => expect(result.current.step).toBe(3));
    await act(async () => {
      await result.current.nextStep();
    });
    await waitFor(() => expect(result.current.step).toBe(4));
    await act(async () => {
      await result.current.nextStep();
    });

    await waitFor(() => {
      expect(result.current.error).toMatch(/identity.*tax_id/i);
      expect(result.current.submitted).toBe(false);
    });
  });

  it("auto-uploads when a file is selected", async () => {
    uploadDocument.mockResolvedValue({
      id: 11,
      document_type: "certificate_of_incorporation",
      provider_document_type: "certificate_of_incorporation",
      is_active: true,
    });
    submitDocument.mockResolvedValue({});
    documentRequirements.mockResolvedValue({
      provider: "international_ramp",
      corridor: "KE",
      business_documents: [
        {
          type: "certificate_of_incorporation",
          category: "business",
          label: "Certificate",
          requires_associate_ref_id: false,
          issuing_country_required: false,
          uploaded: false,
        },
      ],
      shareholder_documents: [],
      disclaimer: null,
    });

    const { result } = renderHook(() =>
      useKybWizard({
        businessId: 9,
        enabled: true,
        kybSummary: { profile: completePendingProfile },
        business: { legal_name: "Acme", country: "KE", registration_number: "R1" },
      }),
    );

    await waitFor(() => expect(result.current.step).toBe(2));
    await act(async () => {
      await result.current.nextStep();
    });
    await waitFor(() => expect(result.current.step).toBe(3));

    const file = new File(["%PDF"], "cert.pdf", { type: "application/pdf" });
    await act(async () => {
      result.current.setDocumentFile(0, file);
    });
    await waitFor(() => {
      expect(uploadDocument).toHaveBeenCalled();
      expect(submitDocument).toHaveBeenCalled();
      expect(result.current.docRows[0]?.submitted).toBe(true);
    });

    await act(async () => {
      await result.current.nextStep();
    });
    await waitFor(() => expect(result.current.step).toBe(4));
  });
});
