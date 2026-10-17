/**
 * Radwa Gulf and Co — domain enumerations.
 *
 * Statuses are modelled as string union types with a companion label map so the
 * UI never hard-codes display strings. When the Laravel backend lands, these
 * unions are the contract the API adapter must map onto (see
 * `src/services/api/adapters.ts`).
 */

/* ------------------------------------------------------------------ roles -- */

export const DEMO_ROLES = [
  "CRM_MANAGER",
  "MD",
  "ESTIMATOR",
  "MCP",
  "SURVEYOR",
  "DEPARTMENT_REVIEWER",
  // The HR Manager's portal. Distinct from the HR_ADMIN *department* below:
  // that is a bid-document reviewer, this is the people system. Same two
  // letters, two different things.
  "HR",
] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const ROLE_LABELS: Record<DemoRole, string> = {
  CRM_MANAGER: "CRM Manager",
  MD: "MD",
  ESTIMATOR: "Estimator",
  MCP: "MCP / Project Manager",
  SURVEYOR: "Surveyor",
  DEPARTMENT_REVIEWER: "Department Reviewer",
  HR: "HR Manager",
};

export const ROLE_SHORT_LABELS: Record<DemoRole, string> = {
  CRM_MANAGER: "CRM",
  MD: "MD",
  ESTIMATOR: "Estimator",
  MCP: "MCP",
  SURVEYOR: "Surveyor",
  DEPARTMENT_REVIEWER: "Reviewer",
  HR: "HR",
};

/* -------------------------------------------------------- departments ----- */

export const DEPARTMENTS = [
  "TECHNICAL",
  "COMMERCIAL",
  "PLANNING",
  "PROCUREMENT",
  "HSE",
  "QUALITY",
  "HR_ADMIN",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  TECHNICAL: "Technical",
  COMMERCIAL: "Commercial",
  PLANNING: "Planning",
  PROCUREMENT: "Procurement",
  HSE: "HSE",
  QUALITY: "Quality",
  HR_ADMIN: "HR / Administration",
};

/* ---------------------------------------------------- enquiry lifecycle --- */

export const ENQUIRY_STAGES = [
  "PURSUIT_DECISION",
  "AWAITING_ASSIGNMENT",
  "DOCUMENT_REVIEW",
  "SITE_SURVEY",
  "ESTIMATION",
  "ESTIMATE_APPROVAL",
  "BID_PACKAGE_PREPARATION",
  "DEPARTMENTAL_REVIEW",
  "DOCUMENTS_APPROVED",
  "FINAL_BID_APPROVAL",
  "CLIENT_SUBMISSION",
  "AWAITING_CLIENT_RESPONSE",
  "REVISION_REQUESTED",
  "AWARDED",
  "WORK_ORDER_FINALIZED",
  "KICKOFF_COMPLETE",
  "PCP_APPOINTED",
  "READY_FOR_HANDOVER",
  "HANDED_OVER",
  "LOST",
  "VOID",
] as const;
export type EnquiryStage = (typeof ENQUIRY_STAGES)[number];

export const STAGE_LABELS: Record<EnquiryStage, string> = {
  PURSUIT_DECISION: "Pursuit Decision",
  AWAITING_ASSIGNMENT: "Awaiting Assignment",
  DOCUMENT_REVIEW: "Document Review",
  SITE_SURVEY: "Site Survey",
  ESTIMATION: "Estimation / BOQ",
  ESTIMATE_APPROVAL: "Estimate Approval",
  BID_PACKAGE_PREPARATION: "Bid Package Preparation",
  DEPARTMENTAL_REVIEW: "Departmental Review",
  DOCUMENTS_APPROVED: "Documents Approved",
  FINAL_BID_APPROVAL: "Final Bid Approval",
  CLIENT_SUBMISSION: "Client Submission",
  AWAITING_CLIENT_RESPONSE: "Awaiting Client Response",
  REVISION_REQUESTED: "Revision Requested",
  AWARDED: "Awarded",
  WORK_ORDER_FINALIZED: "Work Order Finalized",
  KICKOFF_COMPLETE: "Kickoff Complete",
  PCP_APPOINTED: "PCP Appointed",
  READY_FOR_HANDOVER: "Ready for Handover",
  HANDED_OVER: "Handed Over to Operations",
  LOST: "Lost",
  VOID: "Void / Not Pursued",
};

/**
 * Coarse phase grouping used for progress indicators and dashboard rollups, so
 * the 21 detailed stages do not overwhelm summary views.
 */
export const ENQUIRY_PHASES = ["QUALIFY", "ESTIMATE", "BID", "CLIENT", "AWARD", "CLOSED"] as const;
export type EnquiryPhase = (typeof ENQUIRY_PHASES)[number];

export const PHASE_LABELS: Record<EnquiryPhase, string> = {
  QUALIFY: "Qualify",
  ESTIMATE: "Estimate",
  BID: "Bid Package",
  CLIENT: "Client",
  AWARD: "Award & Handover",
  CLOSED: "Closed",
};

export const STAGE_PHASE: Record<EnquiryStage, EnquiryPhase> = {
  PURSUIT_DECISION: "QUALIFY",
  AWAITING_ASSIGNMENT: "QUALIFY",
  DOCUMENT_REVIEW: "QUALIFY",
  SITE_SURVEY: "QUALIFY",
  ESTIMATION: "ESTIMATE",
  ESTIMATE_APPROVAL: "ESTIMATE",
  BID_PACKAGE_PREPARATION: "BID",
  DEPARTMENTAL_REVIEW: "BID",
  DOCUMENTS_APPROVED: "BID",
  FINAL_BID_APPROVAL: "BID",
  CLIENT_SUBMISSION: "CLIENT",
  AWAITING_CLIENT_RESPONSE: "CLIENT",
  REVISION_REQUESTED: "CLIENT",
  AWARDED: "AWARD",
  WORK_ORDER_FINALIZED: "AWARD",
  KICKOFF_COMPLETE: "AWARD",
  PCP_APPOINTED: "AWARD",
  READY_FOR_HANDOVER: "AWARD",
  HANDED_OVER: "CLOSED",
  LOST: "CLOSED",
  VOID: "CLOSED",
};

/** Stages after which no further workflow action is possible. */
export const TERMINAL_STAGES: readonly EnquiryStage[] = ["HANDED_OVER", "LOST", "VOID"];

/* --------------------------------------------------------- misc statuses -- */

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const ENQUIRY_SOURCES = [
  "EMAIL",
  "TENDER_PORTAL",
  "DIRECT_INVITATION",
  "CLIENT_CALL",
  "EXISTING_CLIENT",
  "AGENT_REFERRAL",
  "PUBLIC_ADVERTISEMENT",
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];
export const SOURCE_LABELS: Record<EnquirySource, string> = {
  EMAIL: "Email",
  TENDER_PORTAL: "Tender Portal",
  DIRECT_INVITATION: "Direct Invitation",
  CLIENT_CALL: "Client Call",
  EXISTING_CLIENT: "Existing Client",
  AGENT_REFERRAL: "Agent / Referral",
  PUBLIC_ADVERTISEMENT: "Public Advertisement",
};

export const PROJECT_TYPES = [
  "CIVIL_CONSTRUCTION",
  "MECHANICAL",
  "ELECTRICAL",
  "PIPELINE",
  "INFRASTRUCTURE",
  "FIT_OUT",
  "MAINTENANCE",
  "FABRICATION",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  CIVIL_CONSTRUCTION: "Civil Construction",
  MECHANICAL: "Mechanical Works",
  ELECTRICAL: "Electrical Works",
  PIPELINE: "Pipeline",
  INFRASTRUCTURE: "Infrastructure",
  FIT_OUT: "Fit-out",
  MAINTENANCE: "Maintenance / Shutdown",
  FABRICATION: "Fabrication",
};

/** Joined labels for an enquiry's disciplines, e.g. "Civil Construction + Electrical Works". */
export function formatProjectTypes(types: readonly ProjectType[]): string {
  if (types.length === 0) return "—";
  return types.map((type) => PROJECT_TYPE_LABELS[type]).join(" + ");
}

export const BID_SUBMISSION_TYPES = [
  "ONLINE_PORTAL",
  "EMAIL",
  "SEALED_HARD_COPY",
  "HAND_DELIVERY",
] as const;
export type BidSubmissionType = (typeof BID_SUBMISSION_TYPES)[number];
export const BID_SUBMISSION_TYPE_LABELS: Record<BidSubmissionType, string> = {
  ONLINE_PORTAL: "Online Portal",
  EMAIL: "Email",
  SEALED_HARD_COPY: "Sealed Hard Copy",
  HAND_DELIVERY: "Hand Delivery",
};

/* ---------------------------------------------------- pursuit decisions --- */

export type PursuitVote = "PURSUE" | "REJECT";
export const PURSUIT_VOTE_LABELS: Record<PursuitVote, string> = {
  PURSUE: "Pursue",
  REJECT: "Reject",
};

export type PursuitOutcome = "PENDING" | "PURSUE" | "REJECTED";

/* ------------------------------------------------------------- documents -- */

/** Review state of one immutable document version. */
export const VERSION_REVIEW_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"] as const;
export type VersionReviewStatus = (typeof VERSION_REVIEW_STATUSES)[number];
export const VERSION_REVIEW_STATUS_LABELS: Record<VersionReviewStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const TENDER_DOC_CATEGORIES = [
  "INVITATION",
  "DRAWINGS",
  "SPECIFICATIONS",
  "BOQ",
  "CONTRACT",
  "ADDENDUM",
  "OTHER",
] as const;
export type TenderDocCategory = (typeof TENDER_DOC_CATEGORIES)[number];
export const TENDER_DOC_CATEGORY_LABELS: Record<TenderDocCategory, string> = {
  INVITATION: "Invitation / RFQ",
  DRAWINGS: "Drawings",
  SPECIFICATIONS: "Specifications",
  BOQ: "Client BOQ",
  CONTRACT: "Contract Conditions",
  ADDENDUM: "Addendum",
  OTHER: "Other",
};

export const BID_DOC_CATEGORIES = [
  "TECHNICAL",
  "COMMERCIAL",
  "PLANNING",
  "PROCUREMENT",
  "HSE",
  "QUALITY",
  "CORPORATE",
  "CLOSEOUT",
] as const;
export type BidDocCategory = (typeof BID_DOC_CATEGORIES)[number];
export const BID_DOC_CATEGORY_LABELS: Record<BidDocCategory, string> = {
  TECHNICAL: "Technical",
  COMMERCIAL: "Commercial",
  PLANNING: "Planning & Schedule",
  PROCUREMENT: "Procurement & Resources",
  HSE: "HSE",
  QUALITY: "Quality & QA/QC",
  CORPORATE: "Corporate & Statutory",
  CLOSEOUT: "Closeout & Demobilization",
};

/* ----------------------------------------------------------- estimation --- */

export const ESTIMATE_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

export type ApprovalDecision = "PENDING" | "APPROVED" | "REJECTED";
export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/* ------------------------------------------------------------- surveying -- */

export const SURVEY_STATUSES = [
  "NOT_REQUIRED",
  "REQUIRED_UNASSIGNED",
  "SCHEDULED",
  "IN_PROGRESS",
  "SUBMITTED",
  "RETURNED_FOR_CLARIFICATION",
  "ACCEPTED",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  NOT_REQUIRED: "Not Required",
  REQUIRED_UNASSIGNED: "Required — Unassigned",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted to MCP",
  RETURNED_FOR_CLARIFICATION: "Returned for Clarification",
  ACCEPTED: "Accepted",
};

export type ChecklistItemStatus = "PENDING" | "COMPLETE" | "INCOMPLETE";
export const CHECKLIST_ITEM_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  PENDING: "Pending",
  COMPLETE: "Complete",
  INCOMPLETE: "Incomplete",
};

/** MCP ruling on a checklist item the surveyor could not complete. */
export type ExceptionRuling = "PENDING" | "ACCEPTED" | "RETURNED";
export const EXCEPTION_RULING_LABELS: Record<ExceptionRuling, string> = {
  PENDING: "Awaiting MCP Review",
  ACCEPTED: "Exception Approved",
  RETURNED: "Returned for Clarification",
};

/* ------------------------------------------------- bid package & client --- */

export const BID_PACKAGE_STATUSES = [
  "PREPARING",
  "IN_DEPARTMENTAL_REVIEW",
  "DOCUMENTS_APPROVED",
  "PENDING_FINAL_APPROVAL",
  "APPROVED_FOR_SUBMISSION",
  "RETURNED_FOR_CORRECTION",
] as const;
export type BidPackageStatus = (typeof BID_PACKAGE_STATUSES)[number];
export const BID_PACKAGE_STATUS_LABELS: Record<BidPackageStatus, string> = {
  PREPARING: "Preparing",
  IN_DEPARTMENTAL_REVIEW: "In Departmental Review",
  DOCUMENTS_APPROVED: "Documents Approved",
  PENDING_FINAL_APPROVAL: "Pending Final Approval",
  APPROVED_FOR_SUBMISSION: "Approved for Submission",
  RETURNED_FOR_CORRECTION: "Returned for Correction",
};

export const SUBMISSION_STATUSES = ["NOT_SUBMITTED", "SUBMITTED_ON_TIME", "SUBMITTED_LATE"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  NOT_SUBMITTED: "Not Submitted",
  SUBMITTED_ON_TIME: "Submitted — On Time",
  SUBMITTED_LATE: "Submitted — Delayed",
};

export type ClientResponseType = "REVISION_REQUESTED" | "REJECTED" | "AWARDED";
export const CLIENT_RESPONSE_LABELS: Record<ClientResponseType, string> = {
  REVISION_REQUESTED: "Revision Requested",
  REJECTED: "Rejected",
  AWARDED: "Awarded",
};

/**
 * Revision classification drives whether management approval is needed again.
 * The demo deliberately avoids numeric thresholds — see
 * `src/domain/config.ts` (revisionPolicy) for the configurable rule.
 */
export const REVISION_CLASSES = [
  "MAJOR_COMMERCIAL",
  "MAJOR_SCOPE",
  "MAJOR_MATERIAL",
  "MINOR_ADMIN",
] as const;
export type RevisionClass = (typeof REVISION_CLASSES)[number];
export const REVISION_CLASS_LABELS: Record<RevisionClass, string> = {
  MAJOR_COMMERCIAL: "Major — Commercial / Price",
  MAJOR_SCOPE: "Major — Scope",
  MAJOR_MATERIAL: "Major — Material",
  MINOR_ADMIN: "Minor — Administrative only",
};

export const REVISION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_MANAGEMENT_APPROVAL",
  "READY_TO_RESUBMIT",
  "RESUBMITTED",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING_MANAGEMENT_APPROVAL: "Pending Management Approval",
  READY_TO_RESUBMIT: "Ready to Resubmit",
  RESUBMITTED: "Resubmitted",
};

/* ---------------------------------------------- work order and handover --- */

export const WORK_ORDER_STATUSES = ["DRAFT", "FINALIZED", "HANDED_OVER"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  HANDED_OVER: "Handed Over",
};

export const PO_STATUSES = ["PENDING", "RECEIVED", "PARTIAL", "EXPIRED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  PENDING: "Pending",
  RECEIVED: "Received",
  PARTIAL: "Partially Received",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export type TaskStatus = "OPEN" | "DONE" | "CANCELLED";
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  DONE: "Completed",
  CANCELLED: "Cancelled",
};

export type ActionItemStatus = "OPEN" | "IN_PROGRESS" | "DONE";
export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};
