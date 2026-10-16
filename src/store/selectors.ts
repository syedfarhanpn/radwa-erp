/**
 * Radwa Gulf and Co — read models.
 *
 * Pure selectors over `DemoDatabase`. Screens use these instead of filtering
 * raw collections inline, so every list, detail page and dashboard tile derives
 * its numbers the same way. Each selector calls into `src/domain/rules.ts` for
 * anything that is a business decision.
 */

import type { DemoRole, Department, EnquiryStage } from "@/domain/enums";
import {
  buildHandoverChecklist,
  canCompleteHandover,
  canMarkDocumentsApproved,
  computeEstimateTotals,
  currentVersion,
  evaluateFinalBidApproval,
  evaluatePackageCompleteness,
  evaluatePursuit,
  evaluateSurveyProgress,
  evaluateEstimateApproval,
  isTerminal,
  isVerificationStale,
  stageOrder,
} from "@/domain/rules";
import type {
  ActionItem,
  ActivityRecord,
  Award,
  BidPackage,
  BidPackageDocument,
  BoqLineItem,
  Client,
  ClientResponse,
  ClientSubmission,
  Contact,
  DemoDatabase,
  Enquiry,
  Estimate,
  EstimateApproval,
  EstimateTotals,
  FollowUpTask,
  Handover,
  HandoverChecklistRow,
  Id,
  KickoffMeeting,
  ManagementApproval,
  PcpAppointment,
  PurchaseOrder,
  PursuitDecision,
  RevisionRequest,
  Survey,
  SurveyChecklistItem,
  TenderDocument,
  User,
  WorkOrder,
} from "@/domain/types";
import { daysUntil } from "@/lib/dates";

/* ------------------------------------------------------------ directory --- */

export function userById(db: DemoDatabase, id?: Id): User | undefined {
  return id ? db.users.find((u) => u.id === id) : undefined;
}

export function userName(db: DemoDatabase, id?: Id, fallback = "Unassigned"): string {
  return userById(db, id)?.name ?? fallback;
}

export function clientById(db: DemoDatabase, id?: Id): Client | undefined {
  return id ? db.clients.find((c) => c.id === id) : undefined;
}

export function contactById(db: DemoDatabase, id?: Id): Contact | undefined {
  return id ? db.contacts.find((c) => c.id === id) : undefined;
}

export function contactsForClient(db: DemoDatabase, clientId?: Id): Contact[] {
  return clientId ? db.contacts.filter((c) => c.clientId === clientId) : [];
}

export function usersWithRole(db: DemoDatabase, role: DemoRole): User[] {
  return db.users.filter((u) => u.roles.includes(role));
}

export function managementTeam(db: DemoDatabase): User[] {
  return db.users.filter((u) => u.isManagementTeam);
}

/* -------------------------------------------------------- enquiry views --- */

export interface EnquiryRow {
  enquiry: Enquiry;
  client?: Client;
  contact?: Contact;
  mcp?: User;
  estimator?: User;
  responsibleManager?: User;
  daysToDeadline: number | null;
  isOverdue: boolean;
  isClosed: boolean;
  latestEstimate?: Estimate;
  estimateTotal?: number;
}

export function enquiryRow(db: DemoDatabase, enquiry: Enquiry): EnquiryRow {
  const days = daysUntil(enquiry.submissionDeadline);
  const closed = isTerminal(enquiry);
  const estimate = latestEstimateFor(db, enquiry.id);
  return {
    enquiry,
    client: clientById(db, enquiry.clientId),
    contact: contactById(db, enquiry.contactId),
    mcp: userById(db, enquiry.assignedMcpId),
    estimator: userById(db, enquiry.assignedEstimatorId),
    responsibleManager: userById(db, enquiry.responsibleManagerId),
    daysToDeadline: days,
    isOverdue: !closed && days !== null && days < 0,
    isClosed: closed,
    latestEstimate: estimate,
    estimateTotal: estimate ? totalsFor(db, estimate).grandTotal : undefined,
  };
}

export function allEnquiryRows(db: DemoDatabase): EnquiryRow[] {
  return db.enquiries.map((e) => enquiryRow(db, e)).sort((a, b) => {
    // Live enquiries first, then by nearest deadline.
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    const ad = a.daysToDeadline ?? 9999;
    const bd = b.daysToDeadline ?? 9999;
    if (ad !== bd) return ad - bd;
    return stageOrder(a.enquiry.stage) - stageOrder(b.enquiry.stage);
  });
}

/** Everything attached to one enquiry, resolved once for the detail screens. */
export interface EnquiryDetail {
  enquiry: Enquiry;
  client?: Client;
  contact?: Contact;
  contacts: Contact[];
  mcp?: User;
  estimator?: User;
  responsibleManager?: User;
  registeredBy?: User;

  pursuit: ReturnType<typeof evaluatePursuit>;
  pursuitDecisions: PursuitDecision[];
  assignments: DemoDatabase["assignments"];

  tenderDocuments: TenderDocument[];

  survey?: Survey;
  checklistItems: SurveyChecklistItem[];
  surveyProgress?: ReturnType<typeof evaluateSurveyProgress>;
  surveyor?: User;

  estimates: Estimate[];
  latestEstimate?: Estimate;
  approvedEstimate?: Estimate;
  estimateApprovals: EstimateApproval[];
  boqLines: BoqLineItem[];
  totals?: EstimateTotals;

  bidPackage?: BidPackage;
  documents: BidPackageDocument[];
  completeness?: ReturnType<typeof evaluatePackageCompleteness>;
  verificationStale: boolean;
  finalApproval?: ReturnType<typeof evaluateFinalBidApproval>;
  managementApprovals: ManagementApproval[];

  submissions: ClientSubmission[];
  latestSubmission?: ClientSubmission;
  followUpTasks: FollowUpTask[];
  clientResponses: ClientResponse[];
  revisionRequests: RevisionRequest[];
  openRevision?: RevisionRequest;

  award?: Award;
  workOrder?: WorkOrder;
  kickoff?: KickoffMeeting;
  actionItems: ActionItem[];
  pcp?: PcpAppointment;
  purchaseOrder?: PurchaseOrder;
  handover?: Handover;
  handoverChecklist: HandoverChecklistRow[];
  handoverReady: boolean;

  activities: ActivityRecord[];
}

export function latestEstimateFor(db: DemoDatabase, enquiryId: Id): Estimate | undefined {
  return db.estimates
    .filter((e) => e.enquiryId === enquiryId)
    .sort((a, b) => b.version - a.version)[0];
}

export function approvedEstimateFor(db: DemoDatabase, enquiryId: Id): Estimate | undefined {
  return db.estimates
    .filter((e) => e.enquiryId === enquiryId && e.status === "APPROVED")
    .sort((a, b) => b.version - a.version)[0];
}

export function boqLinesFor(db: DemoDatabase, estimateId?: Id): BoqLineItem[] {
  if (!estimateId) return [];
  return db.boqLineItems
    .filter((l) => l.estimateId === estimateId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function totalsFor(db: DemoDatabase, estimate: Estimate): EstimateTotals {
  return computeEstimateTotals(estimate, boqLinesFor(db, estimate.id));
}

export function documentsFor(db: DemoDatabase, packageId?: Id): BidPackageDocument[] {
  if (!packageId) return [];
  return db.bidPackageDocuments
    .filter((d) => d.packageId === packageId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function enquiryDetail(db: DemoDatabase, enquiryId: Id): EnquiryDetail | undefined {
  const enquiry = db.enquiries.find((e) => e.id === enquiryId);
  if (!enquiry) return undefined;

  const survey = db.surveys.find((s) => s.enquiryId === enquiryId);
  const checklistItems = survey
    ? db.surveyChecklistItems.filter((i) => i.surveyId === survey.id)
    : [];
  const estimates = db.estimates
    .filter((e) => e.enquiryId === enquiryId)
    .sort((a, b) => b.version - a.version);
  const latest = estimates[0];
  const bidPackage = db.bidPackages.find((p) => p.enquiryId === enquiryId);
  const documents = documentsFor(db, bidPackage?.id);
  const submissions = db.clientSubmissions
    .filter((s) => s.enquiryId === enquiryId)
    .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1));
  const award = db.awards.find((a) => a.enquiryId === enquiryId);
  const workOrder = db.workOrders.find((w) => w.enquiryId === enquiryId);
  const kickoff = db.kickoffMeetings.find((k) => k.enquiryId === enquiryId);
  const actionItems = db.actionItems.filter((a) => a.enquiryId === enquiryId);
  const pcp = db.pcpAppointments.find((p) => p.enquiryId === enquiryId);
  const purchaseOrder = db.purchaseOrders.find((p) => p.enquiryId === enquiryId);
  const handover = db.handovers.find((h) => h.enquiryId === enquiryId);

  const handoverChecklist = workOrder
    ? buildHandoverChecklist({
        enquiry,
        workOrder,
        award,
        estimate: approvedEstimateFor(db, enquiryId),
        documents,
        purchaseOrder,
        pcp,
        kickoff,
        actionItems,
        handover,
        estimateVersionCount: estimates.length,
      })
    : [];

  return {
    enquiry,
    client: clientById(db, enquiry.clientId),
    contact: contactById(db, enquiry.contactId),
    contacts: contactsForClient(db, enquiry.clientId),
    mcp: userById(db, enquiry.assignedMcpId),
    estimator: userById(db, enquiry.assignedEstimatorId),
    responsibleManager: userById(db, enquiry.responsibleManagerId),
    registeredBy: userById(db, enquiry.registeredById),

    pursuit: evaluatePursuit(enquiryId, db.pursuitDecisions, db.users),
    pursuitDecisions: db.pursuitDecisions.filter((d) => d.enquiryId === enquiryId),
    assignments: db.assignments
      .filter((a) => a.enquiryId === enquiryId)
      .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1)),

    tenderDocuments: db.tenderDocuments.filter((d) => d.enquiryId === enquiryId),

    survey,
    checklistItems,
    surveyProgress: survey ? evaluateSurveyProgress(checklistItems) : undefined,
    surveyor: userById(db, survey?.surveyorId),

    estimates,
    latestEstimate: latest,
    approvedEstimate: approvedEstimateFor(db, enquiryId),
    estimateApprovals: db.estimateApprovals.filter((a) => a.enquiryId === enquiryId),
    boqLines: boqLinesFor(db, latest?.id),
    totals: latest ? totalsFor(db, latest) : undefined,

    bidPackage,
    documents,
    completeness: bidPackage ? evaluatePackageCompleteness(documents) : undefined,
    verificationStale: bidPackage ? isVerificationStale(bidPackage, documents) : false,
    finalApproval: bidPackage
      ? evaluateFinalBidApproval(bidPackage, documents, db.managementApprovals, db.users, enquiry)
      : undefined,
    managementApprovals: db.managementApprovals.filter((a) => a.enquiryId === enquiryId),

    submissions,
    latestSubmission: submissions[0],
    followUpTasks: db.followUpTasks
      .filter((t) => t.enquiryId === enquiryId)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    clientResponses: db.clientResponses
      .filter((r) => r.enquiryId === enquiryId)
      .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1)),
    revisionRequests: db.revisionRequests.filter((r) => r.enquiryId === enquiryId),
    openRevision: db.revisionRequests.find((r) => r.enquiryId === enquiryId && r.status !== "RESUBMITTED"),

    award,
    workOrder,
    kickoff,
    actionItems,
    pcp,
    purchaseOrder,
    handover,
    handoverChecklist,
    handoverReady: handoverChecklist.length > 0 && canCompleteHandover(handoverChecklist).allowed,

    activities: db.activities
      .filter((a) => a.enquiryId === enquiryId)
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
  };
}

/* ----------------------------------------------------------- work queues -- */

export function enquiriesAtStage(db: DemoDatabase, stages: EnquiryStage[]): Enquiry[] {
  return db.enquiries.filter((e) => stages.includes(e.stage));
}

export function pursuitQueue(db: DemoDatabase): Enquiry[] {
  return db.enquiries.filter((e) => e.stage === "PURSUIT_DECISION");
}

export function assignmentQueue(db: DemoDatabase): Enquiry[] {
  return db.enquiries.filter((e) => e.stage === "AWAITING_ASSIGNMENT");
}

/** Surveys needing attention, split by who owes the next action. */
export interface SurveyQueueItem {
  enquiry: Enquiry;
  survey: Survey;
  progress: ReturnType<typeof evaluateSurveyProgress>;
  surveyor?: User;
  mcp?: User;
}

export function surveyQueue(db: DemoDatabase): SurveyQueueItem[] {
  return db.surveys
    .filter((s) => s.status !== "NOT_REQUIRED")
    .map((survey) => {
      const enquiry = db.enquiries.find((e) => e.id === survey.enquiryId)!;
      const items = db.surveyChecklistItems.filter((i) => i.surveyId === survey.id);
      return {
        enquiry,
        survey,
        progress: evaluateSurveyProgress(items),
        surveyor: userById(db, survey.surveyorId),
        mcp: userById(db, enquiry?.assignedMcpId),
      };
    })
    .filter((item) => Boolean(item.enquiry))
    .sort((a, b) => (a.survey.scheduledDate ?? "9999") < (b.survey.scheduledDate ?? "9999") ? -1 : 1);
}

/** Estimates awaiting a decision from a given approver (or anyone). */
export interface EstimateApprovalQueueItem {
  enquiry: Enquiry;
  estimate: Estimate;
  totals: EstimateTotals;
  state: ReturnType<typeof evaluateEstimateApproval>;
}

export function estimateApprovalQueue(db: DemoDatabase, approverId?: Id): EstimateApprovalQueueItem[] {
  return db.estimates
    .filter((e) => e.status === "PENDING_APPROVAL")
    .map((estimate) => {
      const enquiry = db.enquiries.find((e) => e.id === estimate.enquiryId)!;
      return {
        enquiry,
        estimate,
        totals: totalsFor(db, estimate),
        state: evaluateEstimateApproval(enquiry, estimate, db.estimateApprovals, db.users),
      };
    })
    .filter((item) => {
      if (!item.enquiry) return false;
      if (!approverId) return true;
      const row = item.state.rows.find((r) => r.approverId === approverId);
      const isListed = item.state.approvers.some((a) => a.user.id === approverId);
      return isListed && (!row || row.decision === "PENDING");
    });
}

/** Document versions pending review, optionally for one department. */
export interface DocumentReviewQueueItem {
  enquiry: Enquiry;
  document: BidPackageDocument;
  version: NonNullable<ReturnType<typeof currentVersion>>;
  reviewer?: User;
}

export function documentReviewQueue(db: DemoDatabase, department?: Department): DocumentReviewQueueItem[] {
  return db.bidPackageDocuments
    .filter((doc) => (department ? doc.department === department : true))
    .map((doc) => ({ doc, version: currentVersion(doc) }))
    .filter((x) => x.version?.reviewStatus === "PENDING_REVIEW")
    .map(({ doc, version }) => ({
      enquiry: db.enquiries.find((e) => e.id === doc.enquiryId)!,
      document: doc,
      version: version!,
      reviewer: userById(db, doc.assignedReviewerId),
    }))
    .filter((item) => Boolean(item.enquiry))
    .sort((a, b) =>
      (a.enquiry.submissionDeadline < b.enquiry.submissionDeadline ? -1 : 1),
    );
}

/** Documents rejected on their current version — the Estimator's correction list. */
export function rejectedDocuments(db: DemoDatabase, estimatorId?: Id): DocumentReviewQueueItem[] {
  return db.bidPackageDocuments
    .map((doc) => ({ doc, version: currentVersion(doc) }))
    .filter((x) => x.version?.reviewStatus === "REJECTED")
    .map(({ doc, version }) => ({
      enquiry: db.enquiries.find((e) => e.id === doc.enquiryId)!,
      document: doc,
      version: version!,
      reviewer: userById(db, doc.assignedReviewerId),
    }))
    .filter((item) => Boolean(item.enquiry))
    .filter((item) => (estimatorId ? item.enquiry.assignedEstimatorId === estimatorId : true));
}

export interface PackageQueueItem {
  enquiry: Enquiry;
  bidPackage: BidPackage;
  documents: BidPackageDocument[];
  completeness: ReturnType<typeof evaluatePackageCompleteness>;
  stale: boolean;
  canVerify: boolean;
  finalApproval: ReturnType<typeof evaluateFinalBidApproval>;
}

export function packageQueue(db: DemoDatabase): PackageQueueItem[] {
  return db.bidPackages
    .map((bidPackage) => {
      const enquiry = db.enquiries.find((e) => e.id === bidPackage.enquiryId)!;
      const documents = documentsFor(db, bidPackage.id);
      return {
        enquiry,
        bidPackage,
        documents,
        completeness: evaluatePackageCompleteness(documents),
        stale: isVerificationStale(bidPackage, documents),
        canVerify: canMarkDocumentsApproved(bidPackage, documents).allowed,
        finalApproval: evaluateFinalBidApproval(bidPackage, documents, db.managementApprovals, db.users, enquiry),
      };
    })
    .filter((item) => Boolean(item.enquiry))
    .sort((a, b) => (a.enquiry.submissionDeadline < b.enquiry.submissionDeadline ? -1 : 1));
}

export function finalApprovalQueue(db: DemoDatabase, approverId?: Id): PackageQueueItem[] {
  return packageQueue(db).filter((item) => {
    if (!item.finalApproval.gateOpen) return false;
    if (item.finalApproval.decision !== "PENDING") return false;
    if (!approverId) return true;
    const row = item.finalApproval.rows.find((r) => r.approverId === approverId);
    return !row || row.decision === "PENDING";
  });
}

export interface WorkOrderQueueItem {
  enquiry: Enquiry;
  workOrder?: WorkOrder;
  award?: Award;
  purchaseOrder?: PurchaseOrder;
  handoverReady: boolean;
  outstanding: HandoverChecklistRow[];
}

export function awardQueue(db: DemoDatabase): WorkOrderQueueItem[] {
  return db.awards
    .map((award) => {
      const enquiry = db.enquiries.find((e) => e.id === award.enquiryId)!;
      const detail = enquiryDetail(db, award.enquiryId);
      return {
        enquiry,
        award,
        workOrder: detail?.workOrder,
        purchaseOrder: detail?.purchaseOrder,
        handoverReady: detail?.handoverReady ?? false,
        outstanding: (detail?.handoverChecklist ?? []).filter((r) => r.required && !r.satisfied),
      };
    })
    .filter((item) => Boolean(item.enquiry))
    .sort((a, b) => (a.enquiry.reference < b.enquiry.reference ? 1 : -1));
}

export function openFollowUpTasks(db: DemoDatabase, ownerId?: Id): FollowUpTask[] {
  return db.followUpTasks
    .filter((t) => t.status === "OPEN")
    .filter((t) => (ownerId ? t.ownerId === ownerId : true))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export function openActionItems(db: DemoDatabase, ownerId?: Id): ActionItem[] {
  return db.actionItems
    .filter((a) => a.status !== "DONE")
    .filter((a) => (ownerId ? a.ownerId === ownerId : true))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

/* ------------------------------------------------------------- activity --- */

export function recentActivity(db: DemoDatabase, limit = 12): ActivityRecord[] {
  return db.activities.slice(0, limit);
}

export function notificationsForRole(db: DemoDatabase, role: DemoRole) {
  return db.notifications.filter((n) => n.audienceRole === role);
}

export function unreadNotificationCount(db: DemoDatabase, role: DemoRole): number {
  return db.notifications.filter((n) => n.audienceRole === role && !n.read).length;
}

/* ----------------------------------------------------------- pipeline ----- */

export function pipelineByPhase(db: DemoDatabase) {
  const live = db.enquiries.filter((e) => !isTerminal(e));
  const counts = new Map<string, number>();
  for (const e of live) {
    const key = e.stage;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { live, counts };
}

export function pipelineValue(db: DemoDatabase): number {
  return db.enquiries
    .filter((e) => !isTerminal(e))
    .reduce((sum, e) => {
      const est = latestEstimateFor(db, e.id);
      if (est) return sum + totalsFor(db, est).grandTotal;
      return sum + (e.estimatedValue ?? 0);
    }, 0);
}

export function awardedValue(db: DemoDatabase): number {
  return db.awards.reduce((sum, a) => sum + a.awardedValue, 0);
}
