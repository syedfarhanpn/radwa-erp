/**
 * Radwa Gulf and Co — API ↔ domain adapters.
 *
 * The frontend domain types in `src/domain/types.ts` are the contract the UI is
 * written against. Laravel will serialize differently (snake_case keys, nested
 * `data` envelopes, `created_at` timestamps, numeric strings for decimals). All
 * of that translation belongs here and nowhere else, so a change in API
 * serialization never reaches a component.
 *
 * The functions below are worked examples covering the patterns the backend
 * developer will hit. The remaining entities follow the same shape.
 */

import type {
  BidPackageDocument,
  Enquiry,
  Estimate,
  Id,
  IsoDate,
  IsoTimestamp,
} from "@/domain/types";

/* ---------------------------------------------------- primitive mappers --- */

/** Laravel often emits `2026-10-15T09:30:00.000000Z` or `2026-10-15 09:30:00`. */
export function toIsoTimestamp(value: string | null | undefined): IsoTimestamp | undefined {
  if (!value) return undefined;
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function toIsoDate(value: string | null | undefined): IsoDate | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

/** Decimal columns arrive as strings from PostgreSQL via Eloquent. */
export function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function requireNumber(value: string | number | null | undefined, fallback = 0): number {
  return toNumber(value) ?? fallback;
}

/** Unwrap `{ data: ... }` resource envelopes. */
export function unwrap<T>(payload: T | { data: T }): T {
  return payload && typeof payload === "object" && "data" in (payload as object)
    ? (payload as { data: T }).data
    : (payload as T);
}

/* ------------------------------------------------------- example shapes --- */

/** Shape the Laravel `EnquiryResource` is expected to produce. */
export interface ApiEnquiry {
  id: Id;
  reference: string;
  client_id: Id;
  contact_id: Id;
  project_title: string;
  project_types: string[];
  project_location: string;
  scope_of_work: string;
  source: string;
  source_reference: string | null;
  bid_submission_type: string;
  submission_deadline: string;
  estimated_value: string | null;
  currency: string;
  priority: string;
  stage: string;
  closure_reason: string | null;
  assigned_mcp_id: Id | null;
  assigned_estimator_id: Id | null;
  responsible_manager_id: Id | null;
  registered_by_id: Id;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export function mapEnquiry(api: ApiEnquiry): Enquiry {
  return {
    id: api.id,
    reference: api.reference,
    clientId: api.client_id,
    contactId: api.contact_id,
    projectTitle: api.project_title,
    projectTypes: (api.project_types ?? []) as Enquiry["projectTypes"],
    projectLocation: api.project_location,
    scopeOfWork: api.scope_of_work,
    source: api.source as Enquiry["source"],
    sourceReference: api.source_reference ?? undefined,
    bidSubmissionType: api.bid_submission_type as Enquiry["bidSubmissionType"],
    submissionDeadline: toIsoDate(api.submission_deadline)!,
    estimatedValue: toNumber(api.estimated_value),
    currency: api.currency,
    priority: api.priority as Enquiry["priority"],
    stage: api.stage as Enquiry["stage"],
    closureReason: api.closure_reason ?? undefined,
    assignedMcpId: api.assigned_mcp_id ?? undefined,
    assignedEstimatorId: api.assigned_estimator_id ?? undefined,
    responsibleManagerId: api.responsible_manager_id ?? undefined,
    registeredById: api.registered_by_id,
    registeredAt: toIsoTimestamp(api.created_at)!,
    updatedAt: toIsoTimestamp(api.updated_at)!,
    notes: api.notes ?? undefined,
    isSampleData: false,
  };
}

/** Request body for `POST /api/v1/enquiries`. */
export function toCreateEnquiryBody(input: {
  clientId: Id;
  contactId: Id;
  projectTitle: string;
  projectTypes: string[];
  projectLocation: string;
  scopeOfWork: string;
  source: string;
  sourceReference?: string;
  bidSubmissionType: string;
  submissionDeadline: string;
  estimatedValue?: number;
  priority: string;
  notes?: string;
}) {
  return {
    client_id: input.clientId,
    contact_id: input.contactId,
    project_title: input.projectTitle,
    project_types: input.projectTypes,
    project_location: input.projectLocation,
    scope_of_work: input.scopeOfWork,
    source: input.source,
    source_reference: input.sourceReference ?? null,
    bid_submission_type: input.bidSubmissionType,
    submission_deadline: input.submissionDeadline,
    estimated_value: input.estimatedValue ?? null,
    priority: input.priority,
    notes: input.notes ?? null,
  };
}

export interface ApiEstimate {
  id: Id;
  enquiry_id: Id;
  version: number;
  status: string;
  currency: string;
  overhead_percent: string;
  profit_percent: string;
  contingency_percent: string;
  vat_percent: string;
  notes: string | null;
  assumptions: string | null;
  prepared_by_id: Id;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  superseded_by_estimate_id: Id | null;
  revision_note: string | null;
}

export function mapEstimate(api: ApiEstimate): Estimate {
  return {
    id: api.id,
    enquiryId: api.enquiry_id,
    version: api.version,
    status: api.status as Estimate["status"],
    currency: api.currency,
    overheadPercent: requireNumber(api.overhead_percent),
    profitPercent: requireNumber(api.profit_percent),
    contingencyPercent: requireNumber(api.contingency_percent),
    vatPercent: requireNumber(api.vat_percent),
    notes: api.notes ?? undefined,
    assumptions: api.assumptions ?? undefined,
    preparedById: api.prepared_by_id,
    createdAt: toIsoTimestamp(api.created_at)!,
    updatedAt: toIsoTimestamp(api.updated_at)!,
    submittedAt: toIsoTimestamp(api.submitted_at),
    supersededByEstimateId: api.superseded_by_estimate_id ?? undefined,
    revisionNote: api.revision_note ?? undefined,
  };
}

/**
 * Bid-package documents must arrive with their versions eagerly loaded —
 * `GET /api/v1/bid-packages/{id}/documents?include=versions`. The selective
 * re-approval rule depends on knowing the review status of *every* version, not
 * just the latest, so a flattened response would break it.
 */
export interface ApiBidPackageDocument {
  id: Id;
  bid_package_id: Id;
  enquiry_id: Id;
  name: string;
  category: string;
  is_required: boolean;
  department: string;
  assigned_reviewer_id: Id;
  current_version_no: number;
  sort_order: number;
  added_after_package_approval: boolean | null;
  versions: Array<{
    id: Id;
    version_no: number;
    created_by_id: Id;
    created_at: string;
    file_name: string;
    file_size_label: string | null;
    change_summary: string | null;
    review_status: string;
    submitted_at: string | null;
    reviewed_by_id: Id | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    corrective_instructions: string | null;
  }>;
}

export function mapBidPackageDocument(api: ApiBidPackageDocument): BidPackageDocument {
  return {
    id: api.id,
    packageId: api.bid_package_id,
    enquiryId: api.enquiry_id,
    name: api.name,
    category: api.category as BidPackageDocument["category"],
    isRequired: api.is_required,
    department: api.department as BidPackageDocument["department"],
    assignedReviewerId: api.assigned_reviewer_id,
    currentVersionNo: api.current_version_no,
    addedAfterPackageApproval: api.added_after_package_approval ?? undefined,
    sortOrder: api.sort_order,
    versions: api.versions.map((v) => ({
      id: v.id,
      documentId: api.id,
      versionNo: v.version_no,
      createdById: v.created_by_id,
      createdAt: toIsoTimestamp(v.created_at)!,
      fileName: v.file_name,
      fileSizeLabel: v.file_size_label ?? "—",
      changeSummary: v.change_summary ?? undefined,
      reviewStatus: v.review_status as BidPackageDocument["versions"][number]["reviewStatus"],
      submittedAt: toIsoTimestamp(v.submitted_at),
      reviewedById: v.reviewed_by_id ?? undefined,
      reviewedAt: toIsoTimestamp(v.reviewed_at),
      rejectionReason: v.rejection_reason ?? undefined,
      correctiveInstructions: v.corrective_instructions ?? undefined,
    })),
  };
}

/**
 * Expected FastAPI response for BOQ suggestions. In the demo the `ai*` columns
 * come from the seed; with the service live, the Estimator action "fetch
 * suggestions" would call this and populate `aiQuantity` / `aiUnitRate` only —
 * never the estimator columns.
 */
export interface AiBoqSuggestionResponse {
  enquiry_id: Id;
  generated_at: string;
  model_label: string;
  lines: Array<{
    item_code: string;
    description: string;
    unit: string;
    suggested_quantity: number | null;
    suggested_unit_rate: number | null;
    confidence: number | null;
  }>;
}
