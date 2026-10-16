/**
 * Radwa Gulf and Co — domain entity types.
 *
 * These are *frontend domain types*, deliberately independent of any backend
 * response shape. The future Laravel API is mapped onto these in
 * `src/services/api/adapters.ts`, so a change in API serialization never
 * propagates into components.
 *
 * Conventions
 * -----------
 * - `id` fields are opaque stable strings. Human-readable references (enquiry
 *   number, work order number) are separate fields.
 * - Dates are ISO-8601 strings. Calendar-only values use `YYYY-MM-DD`;
 *   timestamps use full ISO with timezone. See `src/lib/dates.ts`.
 * - Money is a `number` of currency minor-unit-agnostic major units (e.g.
 *   1250.5 = AED 1,250.50) plus a currency code on the owning record.
 * - `version` / `versionNo` are 1-based integers.
 * - Optional fields use `?` and are genuinely optional in the workflow.
 */

import type {
  ActionItemStatus,
  ApprovalDecision,
  BidDocCategory,
  BidPackageStatus,
  BidSubmissionType,
  ChecklistItemStatus,
  ClientResponseType,
  DemoRole,
  Department,
  EnquirySource,
  EnquiryStage,
  EstimateStatus,
  ExceptionRuling,
  PoStatus,
  Priority,
  ProjectType,
  PursuitVote,
  RevisionClass,
  RevisionStatus,
  SubmissionStatus,
  SurveyStatus,
  TaskStatus,
  TenderDocCategory,
  VersionReviewStatus,
  WorkOrderStatus,
} from "./enums";

export type Id = string;
/** Full ISO-8601 timestamp, e.g. `2026-10-15T09:30:00.000Z`. */
export type IsoTimestamp = string;
/** Calendar date without time, e.g. `2026-10-15`. */
export type IsoDate = string;

/* ----------------------------------------------------------- people -------- */

export interface User {
  id: Id;
  name: string;
  initials: string;
  jobTitle: string;
  email: string;
  /** Demo roles this person can act as. Backend must enforce real permissions. */
  roles: DemoRole[];
  /** Set for department reviewers. */
  department?: Department;
  /** True for the three Management Team members (one of whom is the MD). */
  isManagementTeam?: boolean;
  isMD?: boolean;
}

export interface Client {
  id: Id;
  name: string;
  shortName: string;
  sector: string;
  address: string;
  city: string;
  country: string;
  trn?: string;
  notes?: string;
}

export interface Contact {
  id: Id;
  clientId: Id;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

/* ---------------------------------------------------------- enquiry ------- */

export interface Enquiry {
  id: Id;
  /** Human-readable reference, e.g. `ENQ-2026-0041`. */
  reference: string;
  clientId: Id;
  contactId: Id;
  projectTitle: string;
  /**
   * One or more disciplines. A package can span disciplines (civil plus
   * electrical, say), and the mix drives both the starter BOQ template and the
   * project-specific survey checklist. Always holds at least one entry.
   */
  projectTypes: ProjectType[];
  projectLocation: string;
  scopeOfWork: string;
  source: EnquirySource;
  sourceReference?: string;
  bidSubmissionType: BidSubmissionType;
  submissionDeadline: IsoDate;
  estimatedValue?: number;
  currency: string;
  priority: Priority;
  stage: EnquiryStage;
  /** Set when the enquiry closes as LOST or VOID. */
  closureReason?: string;
  assignedMcpId?: Id;
  assignedEstimatorId?: Id;
  /** Management Team member accountable for this enquiry (approves estimate). */
  responsibleManagerId?: Id;
  registeredById: Id;
  registeredAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  notes?: string;
  /** Marks data shipped with the demo, as opposed to records created in-session. */
  isSampleData: boolean;
}

export interface PursuitDecision {
  id: Id;
  enquiryId: Id;
  /** One of the three Management Team members. */
  managerId: Id;
  vote: PursuitVote;
  /** Required when `vote === "REJECT"`; optional rationale when pursuing. */
  reason?: string;
  decidedAt: IsoTimestamp;
}

export interface Assignment {
  id: Id;
  enquiryId: Id;
  mcpId: Id;
  estimatorId: Id;
  responsibleManagerId: Id;
  assignedById: Id;
  assignedAt: IsoTimestamp;
  /** Present when the MD overrode a previous CRM assignment. */
  overriddenFromAssignmentId?: Id;
  overrideReason?: string;
  isCurrent: boolean;
}

export interface TenderDocument {
  id: Id;
  enquiryId: Id;
  name: string;
  category: TenderDocCategory;
  /** Demo metadata only — nothing is uploaded to a server. */
  fileName: string;
  fileSizeLabel: string;
  pageCount?: number;
  receivedAt: IsoTimestamp;
  addedById: Id;
  /** Independent read-receipts prove MCP and Estimator receive docs in parallel. */
  reviewedByMcpAt?: IsoTimestamp;
  reviewedByEstimatorAt?: IsoTimestamp;
  notes?: string;
}

/* ----------------------------------------------------------- survey ------- */

export interface SurveyChecklistItem {
  id: Id;
  surveyId: Id;
  group: string;
  title: string;
  guidance?: string;
  status: ChecklistItemStatus;
  findings?: string;
  /** Mandatory when `status === "INCOMPLETE"`. */
  incompleteReason?: string;
  /** MCP ruling on an incomplete item. */
  exceptionRuling: ExceptionRuling;
  exceptionNote?: string;
  ruledById?: Id;
  ruledAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
}

export interface Survey {
  id: Id;
  enquiryId: Id;
  status: SurveyStatus;
  /** Estimator decision and justification. */
  requiredDecisionById?: Id;
  requiredDecisionAt?: IsoTimestamp;
  requirementReason?: string;
  surveyorId?: Id;
  scheduledDate?: IsoDate;
  assignedById?: Id;
  submittedAt?: IsoTimestamp;
  /** The surveyor's overall remarks, captured on submission. */
  summary?: string;
  /**
   * The checklist the surveyor printed, filled in on site and brought back.
   * Demo metadata only — the file itself is never uploaded or stored.
   */
  completedChecklistFileName?: string;
  completedChecklistSizeLabel?: string;
  acceptedById?: Id;
  acceptedAt?: IsoTimestamp;
  returnNote?: string;
}

/* --------------------------------------------------------- estimation ----- */

export interface BoqLineItem {
  id: Id;
  estimateId: Id;
  itemCode: string;
  description: string;
  unit: string;
  /** Simulated demo suggestion — not produced by a real AI model. */
  aiQuantity: number | null;
  aiUnitRate: number | null;
  estimatorQuantity: number;
  estimatorUnitRate: number;
  /** Author note / assumption for this line. */
  note?: string;
  sortOrder: number;
}

export interface Estimate {
  id: Id;
  enquiryId: Id;
  /** 1-based estimate revision number. */
  version: number;
  status: EstimateStatus;
  currency: string;
  /** Percentage applied on top of the priced line total. */
  overheadPercent: number;
  profitPercent: number;
  contingencyPercent: number;
  vatPercent: number;
  notes?: string;
  assumptions?: string;
  preparedById: Id;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  submittedAt?: IsoTimestamp;
  /** Set when a later version supersedes this one. */
  supersededByEstimateId?: Id;
  /** Why this revision was raised (client revision, management rejection, ...). */
  revisionNote?: string;
}

export interface EstimateApproval {
  id: Id;
  estimateId: Id;
  enquiryId: Id;
  approverId: Id;
  /** Why this person is on the approval list for this estimate. */
  requirement: "MD" | "RESPONSIBLE_MANAGER";
  decision: ApprovalDecision;
  /** Mandatory when `decision === "REJECTED"`. */
  reason?: string;
  decidedAt?: IsoTimestamp;
}

/* -------------------------------------------------------- bid package ---- */

export interface BidDocumentVersion {
  id: Id;
  documentId: Id;
  versionNo: number;
  createdById: Id;
  createdAt: IsoTimestamp;
  /** Demo metadata only. A locally selected file is never persisted anywhere. */
  fileName: string;
  fileSizeLabel: string;
  changeSummary?: string;
  /** Approval is bound to this version and to no other. */
  reviewStatus: VersionReviewStatus;
  submittedAt?: IsoTimestamp;
  reviewedById?: Id;
  reviewedAt?: IsoTimestamp;
  /** Both mandatory when rejecting. */
  rejectionReason?: string;
  correctiveInstructions?: string;
}

export interface BidPackageDocument {
  id: Id;
  packageId: Id;
  enquiryId: Id;
  name: string;
  category: BidDocCategory;
  isRequired: boolean;
  /** Owning department; a revised document returns here unless reconfigured. */
  department: Department;
  assignedReviewerId: Id;
  currentVersionNo: number;
  versions: BidDocumentVersion[];
  /** True once a required document has been added after the package was approved. */
  addedAfterPackageApproval?: boolean;
  sortOrder: number;
}

export interface BidPackage {
  id: Id;
  enquiryId: Id;
  status: BidPackageStatus;
  /** CRM completeness verification, bound to a document-state fingerprint. */
  documentsApprovedById?: Id;
  documentsApprovedAt?: IsoTimestamp;
  /** Fingerprint of approved current versions at the moment CRM verified. */
  verifiedFingerprint?: string;
  returnedReason?: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ManagementApproval {
  id: Id;
  enquiryId: Id;
  packageId: Id;
  /** Which verification round this vote belongs to; votes reset on re-verification. */
  round: number;
  approverId: Id;
  decision: ApprovalDecision;
  reason?: string;
  decidedAt?: IsoTimestamp;
}

/* ------------------------------------------------- client-facing stages --- */

export interface ClientSubmission {
  id: Id;
  enquiryId: Id;
  status: SubmissionStatus;
  submittedAt?: IsoTimestamp;
  submittedById?: Id;
  method: BidSubmissionType;
  clientContactId: Id;
  /** Reference the client gave back, e.g. a portal acknowledgement number. */
  acknowledgementRef?: string;
  notes?: string;
  nextFollowUpDate?: IsoDate;
  /** Which bid revision was sent. */
  estimateVersionSubmitted?: number;
  resubmissionOfSubmissionId?: Id;
}

export interface FollowUpTask {
  id: Id;
  enquiryId: Id;
  title: string;
  dueDate: IsoDate;
  ownerId: Id;
  status: TaskStatus;
  notes?: string;
  createdAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  completionNote?: string;
}

export interface ClientResponse {
  id: Id;
  enquiryId: Id;
  response: ClientResponseType;
  receivedAt: IsoTimestamp;
  recordedById: Id;
  /** Client-stated reason / request detail. */
  detail: string;
  reference?: string;
}

export interface RevisionRequest {
  id: Id;
  enquiryId: Id;
  clientResponseId: Id;
  /** Drives whether management approval is required before resubmission. */
  revisionClass: RevisionClass;
  requestDetail: string;
  assignedEstimatorId: Id;
  assignedById: Id;
  assignedAt: IsoTimestamp;
  status: RevisionStatus;
  /** Estimate version raised to satisfy this request. */
  resultingEstimateId?: Id;
  requiresManagementApproval: boolean;
  closedAt?: IsoTimestamp;
}

/* ------------------------------------------------------ award & closeout -- */

export interface Award {
  id: Id;
  enquiryId: Id;
  awardedAt: IsoTimestamp;
  recordedById: Id;
  awardedValue: number;
  currency: string;
  awardedScope: string;
  /** Optional — an award letter is not mandatory to draft the work order. */
  awardLetterFileName?: string;
  clientReference?: string;
  notes?: string;
  /** Estimate version the award is based on. */
  approvedEstimateId: Id;
}

export interface WorkOrder {
  id: Id;
  enquiryId: Id;
  awardId: Id;
  /** Generated from the configurable pattern in `src/domain/config.ts`. */
  number: string;
  version: number;
  status: WorkOrderStatus;
  issuedDate: IsoDate;
  plannedStartDate?: IsoDate;
  plannedEndDate?: IsoDate;
  durationDays?: number;
  awardedScope: string;
  commercialSummary: string;
  keyTerms: string;
  paymentTerms: string;
  retentionPercent?: number;
  notes?: string;
  contractValue: number;
  currency: string;
  approvedEstimateId: Id;
  createdAt: IsoTimestamp;
  finalizedById?: Id;
  finalizedAt?: IsoTimestamp;
}

export interface KickoffMeeting {
  id: Id;
  enquiryId: Id;
  meetingDate: IsoDate;
  location: string;
  /** Internal attendee user ids. */
  attendeeIds: Id[];
  /** Free-text client-side attendees. */
  externalAttendees?: string;
  minutes: string;
  decisions: string;
  recordedById: Id;
  recordedAt: IsoTimestamp;
}

export interface ActionItem {
  id: Id;
  enquiryId: Id;
  kickoffMeetingId?: Id;
  title: string;
  ownerId: Id;
  dueDate: IsoDate;
  status: ActionItemStatus;
  notes?: string;
  createdAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
}

/**
 * PCP appointment. The business has not confirmed an expansion of the acronym,
 * so the demo uses "PCP" verbatim and does not guess at its meaning.
 */
export interface PcpAppointment {
  id: Id;
  enquiryId: Id;
  appointeeId: Id;
  appointmentDate: IsoDate;
  appointedById: Id;
  appointedAt: IsoTimestamp;
  notes?: string;
}

export interface PurchaseOrder {
  id: Id;
  enquiryId: Id;
  workOrderId: Id;
  poNumber: string;
  poDate: IsoDate;
  expiryDate?: IsoDate;
  status: PoStatus;
  value?: number;
  currency: string;
  /** Demo metadata only. */
  documentFileName?: string;
  recordedById: Id;
  recordedAt: IsoTimestamp;
  notes?: string;
}

export interface Handover {
  id: Id;
  enquiryId: Id;
  workOrderId: Id;
  /** Manual acknowledgement of items the checklist cannot derive automatically. */
  acknowledgedItemKeys: string[];
  completedById?: Id;
  completedAt?: IsoTimestamp;
  operationsOwnerId?: Id;
  notes?: string;
}

/* --------------------------------------------------------------- audit ---- */

export interface ActivityRecord {
  id: Id;
  enquiryId: Id;
  actorId: Id;
  actorRole: DemoRole;
  action: string;
  detail?: string;
  /** Reason or corrective instruction captured with the action, when relevant. */
  reason?: string;
  at: IsoTimestamp;
  /** Entity the action targeted, for drill-down links. */
  entityType?: string;
  entityId?: Id;
}

export interface DemoNotification {
  id: Id;
  /** Which demo role should see this in the bell menu. */
  audienceRole: DemoRole;
  enquiryId?: Id;
  title: string;
  body: string;
  at: IsoTimestamp;
  read: boolean;
  href?: string;
}

/* ------------------------------------------------------------ database --- */

/**
 * The entire demo dataset. The mock repository operates on this shape; a real
 * backend would expose the same collections through the resource endpoints
 * proposed in `docs/API_CONTRACT.md`.
 */
export interface DemoDatabase {
  /** Bumped when the seed shape changes so persisted state is discarded. */
  schemaVersion: number;
  users: User[];
  clients: Client[];
  contacts: Contact[];
  enquiries: Enquiry[];
  pursuitDecisions: PursuitDecision[];
  assignments: Assignment[];
  tenderDocuments: TenderDocument[];
  surveys: Survey[];
  surveyChecklistItems: SurveyChecklistItem[];
  estimates: Estimate[];
  boqLineItems: BoqLineItem[];
  estimateApprovals: EstimateApproval[];
  bidPackages: BidPackage[];
  bidPackageDocuments: BidPackageDocument[];
  managementApprovals: ManagementApproval[];
  clientSubmissions: ClientSubmission[];
  followUpTasks: FollowUpTask[];
  clientResponses: ClientResponse[];
  revisionRequests: RevisionRequest[];
  awards: Award[];
  workOrders: WorkOrder[];
  kickoffMeetings: KickoffMeeting[];
  actionItems: ActionItem[];
  pcpAppointments: PcpAppointment[];
  purchaseOrders: PurchaseOrder[];
  handovers: Handover[];
  activities: ActivityRecord[];
  notifications: DemoNotification[];
  /** Monotonic counters backing readable reference generation. */
  sequences: Record<string, number>;
}

/* ----------------------------------------------- derived / view models --- */

/** Computed money + variance figures for one BOQ line. */
export interface BoqLineComputed {
  line: BoqLineItem;
  aiAmount: number | null;
  estimatorAmount: number;
  quantityVariance: number | null;
  quantityVariancePercent: number | null;
  rateVariance: number | null;
  rateVariancePercent: number | null;
  amountVariance: number | null;
  amountVariancePercent: number | null;
}

export interface EstimateTotals {
  lineTotal: number;
  aiLineTotal: number | null;
  overhead: number;
  profit: number;
  contingency: number;
  subTotal: number;
  vat: number;
  grandTotal: number;
  lineCount: number;
}

/** One row of the pre-handover readiness checklist. */
export interface HandoverChecklistRow {
  key: string;
  label: string;
  description: string;
  satisfied: boolean;
  /** Required rows block handover completion; advisory rows do not. */
  required: boolean;
  /** Set when the row is satisfied by explicit CRM acknowledgement. */
  acknowledgeable?: boolean;
  detail?: string;
}

/** Result of a guarded workflow action. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };
