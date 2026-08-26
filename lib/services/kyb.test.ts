import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/apiClient", () => ({
  apiEnvelope: vi.fn(),
  apiUpload: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    data: unknown;
    constructor(message: string, status: number, data: unknown = null) {
      super(message);
      this.name = "ApiRequestError";
      this.status = status;
      this.data = data;
    }
  },
}));

import { ApiRequestError, apiEnvelope } from "@/lib/apiClient";
import {
  buildProfilePayload,
  buildShareholderPayload,
  buildUploadFormData,
  canOpenKybWizard,
  describeKybStatus,
  emptyKybWizardDraft,
  formatKybServiceError,
  inferWizardStartStep,
  isKybApproved,
  isKybInProgress,
  isKybInReview,
  isStatusOnlyKybSummary,
  mergeKybSummaryCache,
  kybApi,
  kybTierDisplay,
  labelForDocumentType,
  newKybIdempotencyKey,
  normalizeDateOfBirth,
  profileDraftFromSummary,
  validateAddressUboStep,
  validateBusinessStep,
  validateProfileDraft,
  type KybWizardProfileDraft,
} from "./kyb";

beforeEach(() => {
  vi.clearAllMocks();
});

function validDraft(): KybWizardProfileDraft {
  const draft = emptyKybWizardDraft("KE");
  draft.legalName = "ElementPay Ltd";
  draft.registrationNumber = "BN123456";
  draft.businessType = "LimitedCompany";
  draft.industry = "Fintech";
  draft.estimatedEmployees = "1-10";
  draft.annualRevenueRange = "100kTo1M";
  draft.sourceOfFunds = "Revenue";
  draft.street = "1 Finance Street";
  draft.city = "Nairobi";
  draft.postCode = "00100";
  draft.associates[0].firstName = "Jane";
  draft.associates[0].lastName = "Doe";
  draft.associates[0].dateOfBirth = "1985-03-15";
  draft.associates[0].email = "jane@example.com";
  draft.associates[0].phoneNumber = "+254700000000";
  draft.associates[0].ownershipPercentage = "60";
  return draft;
}

describe("kyb status helpers", () => {
  it("maps known statuses to tier display labels", () => {
    expect(describeKybStatus("approved")).toBe("Complete");
    expect(describeKybStatus("submitted")).toBe("In review");
    expect(kybTierDisplay("rejected").label).toBe("Rejected");
    expect(describeKybStatus("pending")).toBe("In progress");
  });

  it("treats only approved as cleared for money actions", () => {
    expect(isKybApproved("approved")).toBe(true);
    expect(isKybApproved("submitted")).toBe(false);
    expect(isKybApproved("pending")).toBe(false);
  });

  it("treats pending as in-progress (profile/docs still open)", () => {
    expect(isKybInProgress("pending")).toBe(true);
    expect(isKybInProgress("submitted")).toBe(false);
    expect(isKybInProgress("approved")).toBe(false);
    expect(isKybInProgress(undefined)).toBe(false);
  });

  it("treats submitted as in-review", () => {
    expect(isKybInReview("submitted")).toBe(true);
    expect(isKybInReview("pending")).toBe(false);
    expect(isKybInReview("approved")).toBe(false);
  });

  it("allows the wizard for pending, rejected, and expired", () => {
    expect(canOpenKybWizard("pending")).toBe(true);
    expect(canOpenKybWizard("rejected")).toBe(true);
    expect(canOpenKybWizard("expired")).toBe(true);
    expect(canOpenKybWizard("submitted")).toBe(false);
    expect(canOpenKybWizard("approved")).toBe(false);
  });

  it("does not treat unknown/loading status as pending for the wizard", () => {
    expect(canOpenKybWizard(undefined)).toBe(false);
    expect(canOpenKybWizard(null)).toBe(false);
    expect(isKybApproved(undefined)).toBe(false);
  });
});

describe("validateProfileDraft", () => {
  it("accepts a minimally complete draft", () => {
    expect(validateProfileDraft(validDraft())).toBeNull();
  });

  it("requires core business and UBO fields", () => {
    const draft = validDraft();
    draft.legalName = "";
    expect(validateProfileDraft(draft)).toMatch(/legal business name/i);
  });

  it("rejects unknown country codes", () => {
    const draft = validDraft();
    draft.country = "XX";
    expect(validateBusinessStep(draft)).toMatch(/valid business country/i);
  });

  it("rejects city values that are country names", () => {
    const draft = validDraft();
    draft.city = "Kenya";
    expect(validateAddressUboStep(draft)).toMatch(/city looks like a country/i);
  });

  it("requires E.164 phone and adult DOB", () => {
    const draft = validDraft();
    draft.associates[0].phoneNumber = "0700000000";
    expect(validateAddressUboStep(draft)).toMatch(/E\.164/i);
    draft.associates[0].phoneNumber = "+254700000000";
    draft.associates[0].dateOfBirth = "2015-01-01";
    expect(validateAddressUboStep(draft)).toMatch(/18/);
  });

  it("allows an optional website when it is a valid https URL", () => {
    const draft = validDraft();
    draft.website = "https://acme.example";
    expect(validateBusinessStep(draft)).toBeNull();
  });

  it("rejects a malformed website when provided", () => {
    const draft = validDraft();
    draft.website = "not-a-url";
    expect(validateBusinessStep(draft)).toMatch(/website/i);
  });

  it("requires tax_id (EIN) when country is US", () => {
    const draft = validDraft();
    draft.country = "US";
    draft.taxId = "";
    expect(validateBusinessStep(draft)).toMatch(/tax id|ein/i);
    draft.taxId = "12-3456789";
    expect(validateBusinessStep(draft)).toBeNull();
  });

  it("accepts financials when present as known enum values", () => {
    const draft = validDraft();
    draft.estimatedEmployees = "11-50";
    draft.annualRevenueRange = "1MTo10M";
    draft.sourceOfFunds = "Investment";
    expect(validateBusinessStep(draft)).toBeNull();
  });
});

describe("normalizeDateOfBirth", () => {
  it("accepts ISO and DD/MM/YYYY", () => {
    expect(normalizeDateOfBirth("2002-02-01")).toBe("2002-02-01");
    expect(normalizeDateOfBirth("01/02/2002")).toBe("2002-02-01");
  });
});

describe("formatKybServiceError", () => {
  it("maps aggregator 502 to a user-friendly message", () => {
    expect(
      formatKybServiceError(
        new ApiRequestError("Aggregator returned 502 for /internal/partner/enrollments/kyb", 502),
      ),
    ).toMatch(/temporarily unavailable/i);
  });

  it("surfaces 422 missing[] fields from submit", () => {
    expect(
      formatKybServiceError(
        new ApiRequestError("Incomplete package", 422, { missing: ["website", "tax_id", "identity"] }),
      ),
    ).toMatch(/website.*tax_id.*identity/i);
  });
});

describe("labelForDocumentType", () => {
  it("maps vault document categories to readable labels", () => {
    expect(labelForDocumentType("certificate_of_incorporation")).toMatch(/certificate of incorporation/i);
    expect(labelForDocumentType("memorandum_of_association")).toMatch(/memorandum/i);
    expect(labelForDocumentType("proof_of_address")).toMatch(/proof of address/i);
    expect(labelForDocumentType("identity")).toMatch(/identity/i);
    expect(labelForDocumentType("address")).toMatch(/address/i);
  });
});

describe("mergeKybSummaryCache", () => {
  it("detects status-only stubs", () => {
    expect(isStatusOnlyKybSummary({ profile: { kyb_status: "pending" } })).toBe(true);
    expect(
      isStatusOnlyKybSummary({
        profile: { kyb_status: "pending", industry: "Fintech" },
      }),
    ).toBe(false);
  });

  it("preserves full profile fields when merging a bootstrap status stub", () => {
    const merged = mergeKybSummaryCache(
      {
        profile: {
          kyb_status: "pending",
          business_type: "LimitedCompany",
          industry: "Fintech",
          estimated_employees: "1-10",
        },
      },
      { profile: { kyb_status: "submitted" } },
    );
    expect(merged?.profile?.business_type).toBe("LimitedCompany");
    expect(merged?.profile?.industry).toBe("Fintech");
    expect(merged?.profile?.kyb_status).toBe("submitted");
  });
});

describe("inferWizardStartStep", () => {
  it("starts at step 1 with no profile", () => {
    expect(inferWizardStartStep({ profile: null })).toBe(1);
  });

  it("uses business legal name / registration when profile omits them", () => {
    expect(
      inferWizardStartStep({
        profile: {
          business_type: "LimitedCompany",
          registered_address: { street: "Main", city: "Lagos", post_code: "100001", country: "NG" },
          associates: [
            {
              id: "a1",
              relationship_types: ["UBO"],
              full_name: { first_name: "Sam", last_name: "Lee" },
              date_of_birth: "1990-01-01",
            },
          ],
        },
        business: { legal_name: "Acme", registration_number: "R1", country: "NG" },
      }),
    ).toBe(2);
  });

  it("starts at step 2 when address and associates exist but docs are unknown", () => {
    expect(
      inferWizardStartStep({
        profile: {
          legal_name: "Acme",
          registration_number: "R1",
          business_type: "LimitedCompany",
          registered_address: { street: "Main", city: "Lagos", post_code: "100001", country: "NG" },
          associates: [
            {
              id: "a1",
              relationship_types: ["UBO"],
              full_name: { first_name: "Sam", last_name: "Lee" },
              date_of_birth: "1990-01-01",
            },
          ],
        },
      }),
    ).toBe(2);
  });

  it("starts at step 3 when requirements or docs are already known", () => {
    expect(
      inferWizardStartStep({
        profile: {
          legal_name: "Acme",
          registration_number: "R1",
          business_type: "LimitedCompany",
          registered_address: { street: "Main", city: "Lagos", post_code: "100001", country: "NG" },
          associates: [
            {
              id: "a1",
              relationship_types: ["UBO"],
              full_name: { first_name: "Sam", last_name: "Lee" },
              date_of_birth: "1990-01-01",
            },
          ],
        },
        hasDocumentRequirements: true,
      }),
    ).toBe(3);
    expect(
      inferWizardStartStep({
        profile: {
          legal_name: "Acme",
          registration_number: "R1",
          business_type: "LimitedCompany",
          registered_address: { street: "Main", city: "Lagos", post_code: "100001", country: "NG" },
          associates: [
            {
              id: "a1",
              relationship_types: ["UBO"],
              full_name: { first_name: "Sam", last_name: "Lee" },
              date_of_birth: "1990-01-01",
            },
          ],
        },
        hasUploadedDocuments: true,
      }),
    ).toBe(3);
  });
});

describe("newKybIdempotencyKey", () => {
  it("returns a non-empty unique key", () => {
    expect(newKybIdempotencyKey().length).toBeGreaterThan(0);
    expect(newKybIdempotencyKey()).not.toBe(newKybIdempotencyKey());
  });
});

describe("kybApi poll and idempotency", () => {
  it("pollVerifierStatus POSTs to …/kyb/status/poll", async () => {
    const mocked = vi.mocked(apiEnvelope);
    mocked.mockResolvedValue({ kyb_status: "submitted", profile_exists: true } as never);

    await kybApi.pollVerifierStatus(42);

    expect(mocked).toHaveBeenCalledWith("POST", "/businesses/42/kyb/status/poll", {});
  });

  it("status GETs the cached …/kyb/status endpoint", async () => {
    const mocked = vi.mocked(apiEnvelope);
    mocked.mockResolvedValue({ kyb_status: "pending", profile_exists: true } as never);

    await kybApi.status(7);

    expect(mocked).toHaveBeenCalledWith("GET", "/businesses/7/kyb/status");
  });

  it("passes Idempotency-Key on initiate and submit when provided", async () => {
    const mocked = vi.mocked(apiEnvelope);
    mocked.mockResolvedValue({} as never);

    await kybApi.initiate(9, "kyb-init-1");
    await kybApi.submitForReview(9, "kyb-submit-1");

    expect(mocked.mock.calls[0][3]).toEqual({ headers: { "Idempotency-Key": "kyb-init-1" } });
    expect(mocked.mock.calls[1][3]).toEqual({ headers: { "Idempotency-Key": "kyb-submit-1" } });
  });
});

describe("buildProfilePayload", () => {
  it("maps the wizard draft to Mboka KybProfileIn shape", () => {
    const payload = buildProfilePayload(validDraft());
    expect(payload.legal_name).toBe("ElementPay Ltd");
    expect(payload.country).toBe("KE");
    expect(payload.registered_address?.city).toBe("Nairobi");
    expect(payload.associates?.[0].relationship_types).toContain("UBO");
    expect(payload.associates?.[0].ubo?.ownership_percentage).toBe(60);
  });
});

describe("buildShareholderPayload", () => {
  it("uses camelCase keys expected by the aggregator pass-through", () => {
    const associate = validDraft().associates[0];
    expect(buildShareholderPayload(associate)).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      birthDate: "1985-03-15",
      email: "jane@example.com",
      phoneNumber: "+254700000000",
      ownershipPercentage: 60,
    });
  });
});

describe("buildUploadFormData", () => {
  it("sets multipart fields for KYB document upload", () => {
    const file = new File(["x"], "coi.pdf", { type: "application/pdf" });
    const form = buildUploadFormData({
      file,
      documentType: "certificate_of_incorporation",
      issuingCountry: "KE",
    });
    expect(form.get("document_type")).toBe("certificate_of_incorporation");
    expect(form.get("issuing_country")).toBe("KE");
    expect(form.get("file")).toBe(file);
  });
});

describe("profileDraftFromSummary", () => {
  it("prefills from an existing KYB profile", () => {
    const draft = profileDraftFromSummary(
      {
        profile: {
          legal_name: "Acme",
          registration_number: "R1",
          country: "NG",
          business_type: "Partnership",
          registered_address: {
            street: "Main",
            city: "Lagos",
            post_code: "100001",
            country: "NG",
          },
          associates: [
            {
              id: "a1",
              relationship_types: ["UBO"],
              full_name: { first_name: "Sam", last_name: "Lee" },
              date_of_birth: "1990-01-01",
              ubo: { ownership_percentage: 100 },
            },
          ],
        },
      },
      { legal_name: "Fallback", country: "KE" },
    );
    expect(draft.legalName).toBe("Acme");
    expect(draft.city).toBe("Lagos");
    expect(draft.associates[0].firstName).toBe("Sam");
  });
});
