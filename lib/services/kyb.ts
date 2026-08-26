import {
  ApiRequestError,
  apiEnvelope,
  apiUpload,
  type RequestOptions,
} from "@/lib/apiClient";
import { isValidIsoCountryCode } from "@/lib/data/isoCountries";
import { newIdempotencyKey } from "@/lib/services/orders";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** E.164: + then 7–15 digits, first digit non-zero. */
const E164_RE = /^\+[1-9]\d{6,14}$/;
const NAME_RE = /^[\p{L}][\p{L}\s'.-]{0,78}$/u;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Normalize common DOB inputs to YYYY-MM-DD, or null if unparseable. */
export function normalizeDateOfBirth(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let y: number, m: number, d: number;
  const iso = value.match(ISO_DATE_RE);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const slash = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!slash) return null;
    // Prefer DD/MM/YYYY (common outside US); calendar check rejects impossible dates.
    d = Number(slash[1]);
    m = Number(slash[2]);
    y = Number(slash[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ageYearsUtc(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (month < m || (month === m && day < d)) age -= 1;
  return age;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function missingFieldsFromErrorData(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.missing)) {
    return record.missing.map((item) => String(item)).filter(Boolean);
  }
  return [];
}

export function formatKybServiceError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 422) {
      const missing = missingFieldsFromErrorData(err.data);
      if (missing.length > 0) {
        return `Missing required items: ${missing.join(", ")}.`;
      }
    }
    if (err.status === 502 || /aggregator returned 502/i.test(err.message)) {
      return "Verification service is temporarily unavailable. Your details were saved — please try again in a few minutes.";
    }
    if (err.status >= 500) {
      return "Verification service error. Your details were saved — please try again shortly.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export type KybStatus = "pending" | "submitted" | "approved" | "rejected" | "expired";

export type BusinessType =
  | "SoleTrader"
  | "LimitedCompany"
  | "LimitedLiabilityCompany"
  | "Partnership"
  | "NonProfit"
  | "Other";

export type EmployeeRange = "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";
export type AnnualRevenueRange = "LessThan100k" | "100kTo1M" | "1MTo10M" | "MoreThan10M";
export type SourceOfFunds = "Revenue" | "Investment" | "Loans" | "Grants" | "Other";

export type BusinessAddress = {
  street: string;
  street2?: string | null;
  city: string;
  post_code: string;
  state?: string | null;
  country: string;
};

export type AssociateIdentity = {
  issuing_country: string;
  id_type: "Passport" | "NationalIDCard" | "DrivingLicense" | "ResidencePermit";
  id_number: string;
  issued_date?: string | null;
  expiry_date?: string | null;
};

export type AssociateInput = {
  id: string;
  relationship_types: ("UBO" | "Representative" | "Director" | "Shareholder")[];
  full_name: { first_name: string; last_name: string };
  date_of_birth: string;
  email?: string | null;
  phone_number?: string | null;
  tax_residence_country?: string | null;
  residential_address?: BusinessAddress | null;
  identities?: AssociateIdentity[];
  ubo?: { ownership_percentage: number } | null;
};

export type KybProfileInput = {
  legal_name?: string | null;
  registration_number?: string | null;
  country?: string | null;
  tax_id?: string | null;
  business_type?: BusinessType | null;
  industry?: string | null;
  website?: string | null;
  estimated_employees?: EmployeeRange | null;
  annual_revenue_range?: AnnualRevenueRange | null;
  source_of_funds?: SourceOfFunds | null;
  incorporation_date?: string | null;
  registered_address?: BusinessAddress | null;
  associates?: AssociateInput[] | null;
};

export type KybProfile = KybProfileInput & {
  business_id?: number;
  kyb_status?: KybStatus;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewer_notes?: string | null;
  registered_address?: BusinessAddress | null;
  associates?: AssociateInput[] | null;
};

export type KybSummary = { profile: KybProfile | null };

export type KybRequiredDocument = {
  type: string;
  category: "business" | "shareholder";
  label: string;
  requires_associate_ref_id: boolean;
  issuing_country_required: boolean;
  uploaded: boolean;
};

export type KybDocumentRequirements = {
  provider: "international_ramp";
  corridor: string | null;
  business_documents: KybRequiredDocument[];
  shareholder_documents: KybRequiredDocument[];
  disclaimer: string | null;
};

export type KybInitiateResult = {
  provider: "international_ramp" | "noah";
  kyb_status: KybStatus;
  document_requirements: KybDocumentRequirements | null;
};

export type KybDocument = {
  id: number;
  document_type: string;
  provider_document_type: string;
  issuing_country?: string | null;
  associate_ref_id?: string | null;
  is_active: boolean;
};

export type KybDocumentList = { documents: KybDocument[] };

export type KybStatusResult = {
  kyb_status: KybStatus;
  profile_exists: boolean;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewer_notes?: string | null;
};

export type KybShareholderList = { shareholders: Record<string, unknown>[] };

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "SoleTrader", label: "Sole trader" },
  { value: "LimitedCompany", label: "Limited company" },
  { value: "LimitedLiabilityCompany", label: "LLC" },
  { value: "Partnership", label: "Partnership" },
  { value: "NonProfit", label: "Non-profit" },
  { value: "Other", label: "Other" },
];

export const EMPLOYEE_RANGE_OPTIONS: { value: EmployeeRange; label: string }[] = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-1000", label: "201–1,000" },
  { value: "1000+", label: "1,000+" },
];

export const REVENUE_RANGE_OPTIONS: { value: AnnualRevenueRange; label: string }[] = [
  { value: "LessThan100k", label: "Under $100k" },
  { value: "100kTo1M", label: "$100k – $1M" },
  { value: "1MTo10M", label: "$1M – $10M" },
  { value: "MoreThan10M", label: "Over $10M" },
];

export const SOURCE_OF_FUNDS_OPTIONS: { value: SourceOfFunds; label: string }[] = [
  { value: "Revenue", label: "Revenue" },
  { value: "Investment", label: "Investment" },
  { value: "Loans", label: "Loans" },
  { value: "Grants", label: "Grants" },
  { value: "Other", label: "Other" },
];

export type KybTierDisplay = { label: string; color: string; soft: string };

const KYB_TIER_DISPLAY: Record<KybStatus, KybTierDisplay> = {
  approved: { label: "Complete", color: "var(--indigo-text)", soft: "var(--indigo-tint)" },
  submitted: { label: "In review", color: "var(--amber)", soft: "var(--amber-tint)" },
  rejected: { label: "Rejected", color: "var(--red)", soft: "var(--red-tint)" },
  expired: { label: "Expired", color: "var(--red)", soft: "var(--red-tint)" },
  /** Vault `incomplete` maps to pending — profile/docs may still be open. */
  pending: { label: "In progress", color: "var(--muted)", soft: "var(--surface2)" },
};

/** Human labels for Mboka / vault document type keys. */
export const KYB_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate_of_incorporation: "Certificate of incorporation",
  memorandum_of_association: "Memorandum of association",
  proof_of_address: "Proof of address",
  identity: "Identity document",
  address: "Proof of address",
  power_of_attorney: "Power of attorney",
  corporate_structure: "Corporate structure",
  director_structure: "Director structure",
  bank_statement: "Bank statement",
  tax_registration: "Tax registration",
  passport_front: "Passport (front)",
  passport_back: "Passport (back)",
  national_id_front: "National ID (front)",
  national_id_back: "National ID (back)",
  drivers_license_front: "Driver's license (front)",
  drivers_license_back: "Driver's license (back)",
  other: "Other document",
};

export function labelForDocumentType(type: string): string {
  const key = type.trim().toLowerCase();
  return KYB_DOCUMENT_TYPE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function kybTierDisplay(status: string | null | undefined): KybTierDisplay {
  return KYB_TIER_DISPLAY[(status as KybStatus) || "pending"] ?? KYB_TIER_DISPLAY.pending;
}

export function isKybApproved(status: string | null | undefined): boolean {
  return status === "approved";
}

/** Profile/docs still open — vault `incomplete` → Mboka `pending`. */
export function isKybInProgress(status: string | null | undefined): boolean {
  return status === "pending";
}

export function isStatusOnlyKybSummary(
  summary: { profile?: Record<string, unknown> | null } | null | undefined,
): boolean {
  const profile = summary?.profile;
  if (!profile || typeof profile !== "object") return false;
  const keys = Object.keys(profile).filter((k) => profile[k] != null && profile[k] !== "");
  return keys.length > 0 && keys.every((k) => k === "kyb_status");
}

/** Merge bootstrap/login status stubs into a full /auth/me KYB summary without wiping fields. */
export function mergeKybSummaryCache(
  previous: { profile?: Record<string, unknown> | null } | null | undefined,
  incoming: { profile?: Record<string, unknown> | null } | null | undefined,
): { profile: Record<string, unknown> | null } | null {
  if (incoming == null) return previous ?? null;
  if (!previous?.profile) return incoming as { profile: Record<string, unknown> | null };
  if (isStatusOnlyKybSummary(incoming)) {
    const status = incoming.profile?.kyb_status;
    return {
      profile: {
        ...previous.profile,
        ...(status != null ? { kyb_status: status } : {}),
      },
    };
  }
  return incoming as { profile: Record<string, unknown> | null };
}

/** Final submit done — vault `pending_review` → Mboka `submitted`. */
export function isKybInReview(status: string | null | undefined): boolean {
  return status === "submitted";
}

export function canOpenKybWizard(status: string | null | undefined): boolean {
  return status === "pending" || status === "rejected" || status === "expired";
}

export function describeKybStatus(status: string | null | undefined): string {
  return kybTierDisplay(status).label;
}

/** Fresh Idempotency-Key for KYB initiate / submit / document mutations. */
export function newKybIdempotencyKey(): string {
  return newIdempotencyKey();
}

function idempotencyHeaders(key?: string): RequestOptions | undefined {
  return key ? { headers: { "Idempotency-Key": key } } : undefined;
}

export type InferWizardStartStepInput = {
  profile?: KybProfile | Record<string, unknown> | null;
  business?: { legal_name?: string | null; country?: string; registration_number?: string | null } | null;
  hasDocumentRequirements?: boolean;
  hasUploadedDocuments?: boolean;
};

/**
 * Restore wizard step from an existing pending profile.
 * Address+associates → 2; known requirements / uploaded docs → 3.
 * Legal name / registration often live on the business row, not the KYB profile.
 */
export function inferWizardStartStep(input: InferWizardStartStepInput): 1 | 2 | 3 {
  const profile = input.profile as KybProfile | null | undefined;
  if (!profile && !input.business) return 1;

  const legalName =
    String(profile?.legal_name || input.business?.legal_name || "").trim();
  const registration =
    String(profile?.registration_number || input.business?.registration_number || "").trim();
  const hasBusinessBasics = !!(legalName && registration && profile?.business_type);
  if (!hasBusinessBasics) return 1;

  const addr = profile?.registered_address;
  const hasAddress = !!(addr && String(addr.street || "").trim() && String(addr.city || "").trim());
  const associates = profile?.associates ?? [];
  const hasAssociates =
    Array.isArray(associates) &&
    associates.some((a) => String(a?.full_name?.first_name || "").trim());

  if (!hasAddress || !hasAssociates) return 2;

  if (input.hasDocumentRequirements || input.hasUploadedDocuments) return 3;
  return 2;
}

/** Stable UUID v4-ish id for a new associate row. */
export function newAssociateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `assoc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type KybWizardAssociateDraft = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phoneNumber: string;
  ownershipPercentage: string;
  country: string;
};

export type KybWizardProfileDraft = {
  legalName: string;
  registrationNumber: string;
  country: string;
  taxId: string;
  businessType: BusinessType | "";
  industry: string;
  website: string;
  estimatedEmployees: EmployeeRange | "";
  annualRevenueRange: AnnualRevenueRange | "";
  sourceOfFunds: SourceOfFunds | "";
  street: string;
  street2: string;
  city: string;
  postCode: string;
  state: string;
  addressCountry: string;
  associates: KybWizardAssociateDraft[];
};

export function emptyKybWizardDraft(defaultCountry = "KE"): KybWizardProfileDraft {
  return {
    legalName: "",
    registrationNumber: "",
    country: defaultCountry,
    taxId: "",
    businessType: "",
    industry: "",
    website: "",
    estimatedEmployees: "",
    annualRevenueRange: "",
    sourceOfFunds: "",
    street: "",
    street2: "",
    city: "",
    postCode: "",
    state: "",
    addressCountry: defaultCountry,
    associates: [
      {
        id: newAssociateId(),
        firstName: "",
        lastName: "",
        dateOfBirth: "",
        email: "",
        phoneNumber: "",
        ownershipPercentage: "",
        country: defaultCountry,
      },
    ],
  };
}

export function profileDraftFromSummary(
  summary: KybSummary | null | undefined,
  business?: { legal_name?: string | null; country?: string; registration_number?: string | null } | null,
): KybWizardProfileDraft {
  const draft = emptyKybWizardDraft(business?.country || "KE");
  const profile = summary?.profile;
  if (!profile) {
    if (business?.legal_name) draft.legalName = business.legal_name;
    if (business?.registration_number) draft.registrationNumber = business.registration_number;
    if (business?.country) draft.country = business.country;
    return draft;
  }
  draft.legalName = (profile.legal_name as string) || business?.legal_name || "";
  draft.registrationNumber = (profile.registration_number as string) || business?.registration_number || "";
  draft.country = (profile.country as string) || business?.country || draft.country;
  draft.taxId = (profile.tax_id as string) || "";
  draft.businessType = (profile.business_type as BusinessType) || "";
  draft.industry = (profile.industry as string) || "";
  draft.website = (profile.website as string) || "";
  draft.estimatedEmployees = (profile.estimated_employees as EmployeeRange) || "";
  draft.annualRevenueRange = (profile.annual_revenue_range as AnnualRevenueRange) || "";
  draft.sourceOfFunds = (profile.source_of_funds as SourceOfFunds) || "";
  const addr = profile.registered_address as BusinessAddress | null | undefined;
  if (addr) {
    draft.street = addr.street || "";
    draft.street2 = addr.street2 || "";
    draft.city = addr.city || "";
    draft.postCode = addr.post_code || "";
    draft.state = addr.state || "";
    draft.addressCountry = addr.country || draft.addressCountry;
  }
  const associates = (profile.associates as AssociateInput[] | null | undefined) ?? [];
  if (associates.length > 0) {
    draft.associates = associates.map((a) => ({
      id: a.id,
      firstName: a.full_name?.first_name || "",
      lastName: a.full_name?.last_name || "",
      dateOfBirth: a.date_of_birth || "",
      email: a.email || "",
      phoneNumber: a.phone_number || "",
      ownershipPercentage: a.ubo?.ownership_percentage != null ? String(a.ubo.ownership_percentage) : "",
      country: a.tax_residence_country || a.residential_address?.country || draft.country,
    }));
  }
  return draft;
}

export function validateBusinessStep(draft: KybWizardProfileDraft): string | null {
  if (!draft.legalName.trim() || draft.legalName.trim().length < 2) {
    return "Legal business name is required.";
  }
  if (!draft.registrationNumber.trim()) return "Registration number is required.";
  if (!isValidIsoCountryCode(draft.country)) {
    return "Select a valid business country from the list.";
  }
  if (draft.country.trim().toUpperCase() === "US" && !draft.taxId.trim()) {
    return "Tax ID (EIN) is required for US-incorporated businesses.";
  }
  if (!draft.businessType) return "Choose a business type.";
  if (!draft.industry.trim()) return "Industry is required.";
  if (draft.website.trim() && !isValidHttpUrl(draft.website)) {
    return "Website must be a valid URL starting with https://";
  }
  if (!draft.estimatedEmployees) return "Select estimated employees.";
  if (!draft.annualRevenueRange) return "Select annual revenue range.";
  if (!draft.sourceOfFunds) return "Select source of funds.";
  return null;
}

export function validateAddressUboStep(draft: KybWizardProfileDraft): string | null {
  if (!draft.street.trim() || draft.street.trim().length < 3) {
    return "Street address is required.";
  }
  if (!draft.city.trim()) return "City is required.";
  if (/^(kenya|nigeria|uganda|ghana|tanzania|south africa)$/i.test(draft.city.trim())) {
    return "City looks like a country name — enter the city (e.g. Nairobi), not the country.";
  }
  if (!draft.postCode.trim()) return "Post code is required.";
  if (!isValidIsoCountryCode(draft.addressCountry)) {
    return "Select a valid address country from the list.";
  }
  const associate = draft.associates[0];
  if (!associate) return "At least one beneficial owner is required.";
  if (!NAME_RE.test(associate.firstName.trim())) {
    return "Enter a valid UBO first name (letters only).";
  }
  if (!NAME_RE.test(associate.lastName.trim())) {
    return "Enter a valid UBO last name (letters only).";
  }
  const dob = normalizeDateOfBirth(associate.dateOfBirth);
  if (!dob) {
    return "Date of birth must be a valid calendar date (use the date picker).";
  }
  const age = ageYearsUtc(dob);
  if (age < 18) return "Beneficial owner must be at least 18 years old.";
  if (age > 120) return "Check the beneficial owner date of birth.";
  if (!associate.email.trim() || !EMAIL_RE.test(associate.email.trim())) {
    return "A valid beneficial owner email is required.";
  }
  if (!associate.phoneNumber.trim() || !E164_RE.test(associate.phoneNumber.trim())) {
    return "Phone must be E.164 format, e.g. +254700000000.";
  }
  const ownership = Number(associate.ownershipPercentage);
  if (!Number.isInteger(ownership) || ownership < 1 || ownership > 100) {
    return "Ownership must be a whole number between 1 and 100.";
  }
  if (!isValidIsoCountryCode(associate.country || draft.addressCountry)) {
    return "Select a valid tax residence country for the beneficial owner.";
  }
  return null;
}

export function validateProfileDraft(draft: KybWizardProfileDraft): string | null {
  return validateBusinessStep(draft) ?? validateAddressUboStep(draft);
}

export function buildProfilePayload(draft: KybWizardProfileDraft): KybProfileInput {
  const associate = draft.associates[0];
  const dob = normalizeDateOfBirth(associate.dateOfBirth) || associate.dateOfBirth.trim();
  const taxCountry = (associate.country || draft.addressCountry).trim().toUpperCase();
  const registered_address: BusinessAddress = {
    street: draft.street.trim(),
    street2: draft.street2.trim() || undefined,
    city: draft.city.trim(),
    post_code: draft.postCode.trim(),
    state: draft.state.trim() || undefined,
    country: draft.addressCountry.trim().toUpperCase(),
  };
  const associates: AssociateInput[] = [
    {
      id: associate.id,
      relationship_types: ["UBO", "Representative"],
      full_name: {
        first_name: associate.firstName.trim(),
        last_name: associate.lastName.trim(),
      },
      date_of_birth: dob,
      email: associate.email.trim() || undefined,
      phone_number: associate.phoneNumber.trim() || undefined,
      tax_residence_country: taxCountry,
      ubo: { ownership_percentage: Number(associate.ownershipPercentage) },
    },
  ];
  return {
    legal_name: draft.legalName.trim(),
    registration_number: draft.registrationNumber.trim(),
    country: draft.country.trim().toUpperCase(),
    tax_id: draft.taxId.trim() || undefined,
    business_type: draft.businessType || undefined,
    industry: draft.industry.trim() || undefined,
    website: draft.website.trim() || undefined,
    estimated_employees: draft.estimatedEmployees || undefined,
    annual_revenue_range: draft.annualRevenueRange || undefined,
    source_of_funds: draft.sourceOfFunds || undefined,
    registered_address,
    associates,
  };
}

export function buildShareholderPayload(associate: KybWizardAssociateDraft): Record<string, unknown> {
  return {
    firstName: associate.firstName.trim(),
    lastName: associate.lastName.trim(),
    birthDate: normalizeDateOfBirth(associate.dateOfBirth) || associate.dateOfBirth.trim(),
    email: associate.email.trim() || undefined,
    phoneNumber: associate.phoneNumber.trim() || undefined,
    ownershipPercentage: Number(associate.ownershipPercentage),
  };
}

export function buildUploadFormData(input: {
  file: File;
  documentType: string;
  issuingCountry?: string;
  associateRefId?: string;
}): FormData {
  const form = new FormData();
  form.set("file", input.file);
  form.set("document_type", input.documentType);
  if (input.issuingCountry) form.set("issuing_country", input.issuingCountry);
  if (input.associateRefId) form.set("associate_ref_id", input.associateRefId);
  return form;
}

function businessPath(businessId: number, suffix: string): string {
  return `/businesses/${businessId}/kyb${suffix}`;
}

export const kybApi = {
  summary: (businessId: number) => apiEnvelope<KybSummary>("GET", businessPath(businessId, "")),
  status: (businessId: number) => apiEnvelope<KybStatusResult>("GET", businessPath(businessId, "/status")),
  /** Sync status from the upstream vault / verifier after submit. */
  pollVerifierStatus: (businessId: number) =>
    apiEnvelope<KybStatusResult>("POST", businessPath(businessId, "/status/poll"), {}),
  createProfile: (businessId: number, payload: KybProfileInput) =>
    apiEnvelope<KybProfile>("POST", businessPath(businessId, "/profile"), payload),
  patchProfile: (businessId: number, payload: Partial<KybProfileInput>) =>
    apiEnvelope<KybProfile>("PATCH", businessPath(businessId, "/profile"), payload),
  upsertAddress: (businessId: number, payload: BusinessAddress) =>
    apiEnvelope<BusinessAddress & { id: number }>("PUT", businessPath(businessId, "/address"), payload),
  initiate: (businessId: number, idempotencyKey?: string) =>
    apiEnvelope<KybInitiateResult>(
      "POST",
      businessPath(businessId, "/initiate"),
      { provider: "international_ramp" },
      idempotencyHeaders(idempotencyKey),
    ),
  documentRequirements: (businessId: number, corridor?: string) => {
    const qs = corridor ? `?corridor=${encodeURIComponent(corridor)}` : "";
    return apiEnvelope<KybDocumentRequirements>(
      "GET",
      `/businesses/${businessId}/kyb/document-requirements${qs}`,
    );
  },
  listDocuments: (businessId: number) =>
    apiEnvelope<KybDocumentList>("GET", businessPath(businessId, "/documents")),
  uploadDocument: (businessId: number, formData: FormData) =>
    apiUpload<KybDocument>("POST", businessPath(businessId, "/documents"), formData),
  submitDocument: (businessId: number, docId: number, idempotencyKey?: string) =>
    apiEnvelope<unknown>(
      "POST",
      businessPath(businessId, "/documents/submit"),
      { doc_id: docId },
      idempotencyHeaders(idempotencyKey),
    ),
  listShareholders: (businessId: number) =>
    apiEnvelope<KybShareholderList>("GET", businessPath(businessId, "/shareholders")),
  addShareholder: (businessId: number, shareholder: Record<string, unknown>) =>
    apiEnvelope<unknown>("POST", businessPath(businessId, "/shareholders"), { shareholder }),
  submitShareholderDocument: (businessId: number, docId: number, shareholderId: string) =>
    apiEnvelope<unknown>("POST", businessPath(businessId, "/shareholders/documents"), {
      doc_id: docId,
      shareholder_id: shareholderId,
    }),
  submitForReview: (businessId: number, idempotencyKey?: string) =>
    apiEnvelope<unknown>(
      "POST",
      businessPath(businessId, "/submit"),
      {},
      idempotencyHeaders(idempotencyKey),
    ),
};
