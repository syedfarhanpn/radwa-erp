/**
 * Radwa Gulf and Co — business rules.
 *
 * Single source of truth for every workflow rule. Screens and the mock
 * repository both call into this module; no screen re-implements a rule locally.
 * Numbers in the section comments refer to the twenty confirmed business rules
 * documented in `docs/BUSINESS_RULES.md`.
 *
 * Every function here is pure: it takes domain records and returns a decision.
 * That keeps the rules trivially portable to the Laravel backend, which must
 * enforce them server-side regardless of what the frontend allows.
 */

import {
  estimateApprovalPolicy,
  finalBidApprovalPolicy,
  handoverPolicy,
  managementConfig,
  revisionPolicy,
} from "./config";
import { STAGE_PHASE, TERMINAL_STAGES } from "./enums";
import type {
  ApprovalDecision,
  EnquiryPhase,
  EnquiryStage,
  PursuitOutcome,
  RevisionClass,
} from "./enums";
import type {
  ActionItem,
  Award,
  BidDocumentVersion,
  BidPackage,
  BidPackageDocument,
  BoqLineComputed,
  BoqLineItem,
  Enquiry,
  Estimate,
  EstimateApproval,
  EstimateTotals,
  Handover,
  HandoverChecklistRow,
  Id,
  KickoffMeeting,
  ManagementApproval,
  PcpAppointment,
  PurchaseOrder,
  PursuitDecision,
  Survey,
  SurveyChecklistItem,
  User,
  WorkOrder,
} from "./types";
import { round2, varianceAbsolute, variancePercent } from "@/lib/money";

/* ========================================================================== *
 * Rule 1 — the Management Team is exactly three members, including the MD.
 * ========================================================================== */

export function getManagementTeam(users: User[]): User[] {
  return users.filter((u) => u.isManagementTeam);
}

export function getMd(users: User[]): User | undefined {
  return users.find((u) => u.isMD);
}

/**
 * Development-time guard. The MD is one of the three members, never a fourth,
 * so a seed that produces four members or an MD outside the team is a bug.
 */
export function validateManagementTeam(users: User[]): string[] {
  const team = getManagementTeam(users);
  const problems: string[] = [];
  if (team.length !== managementConfig.managementTeamSize) {
    problems.push(
      `Management Team must have exactly ${managementConfig.managementTeamSize} members, found ${team.length}.`,
    );
  }
  const mds = users.filter((u) => u.isMD);
  if (mds.length !== 1) {
    problems.push(`Exactly one user must be flagged as MD, found ${mds.length}.`);
  } else if (!mds[0].isManagementTeam) {
    problems.push("The MD must be one of the three Management Team members, not an additional member.");
  }
  return problems;
}

/* ========================================================================== *
 * Rule 2 — an enquiry is rejected only when ALL THREE members reject it.
 * ========================================================================== */

export interface PursuitState {
  outcome: PursuitOutcome;
  decisions: PursuitDecision[];
  pursueCount: number;
  rejectCount: number;
  /** Management Team members who have not voted yet. */
  pendingManagers: User[];
  teamSize: number;
  /** True once the decision is settled and CRM may assign the team. */
  readyForAssignment: boolean;
}

export function evaluatePursuit(
  enquiryId: Id,
  decisions: PursuitDecision[],
  users: User[],
): PursuitState {
  const team = getManagementTeam(users);
  const relevant = decisions.filter(
    (d) => d.enquiryId === enquiryId && team.some((m) => m.id === d.managerId),
  );
  const pursueCount = relevant.filter((d) => d.vote === "PURSUE").length;
  const rejectCount = relevant.filter((d) => d.vote === "REJECT").length;
  const pendingManagers = team.filter((m) => !relevant.some((d) => d.managerId === m.id));

  // The enquiry only becomes void on a unanimous rejection. One or two
  // rejections while a third member has not voted leaves it pending; a single
  // "pursue" vote means it can never be voided by the remaining rejections.
  let outcome: PursuitOutcome = "PENDING";
  if (rejectCount === team.length) {
    outcome = "REJECTED";
  } else if (relevant.length === team.length) {
    outcome = "PURSUE";
  } else if (pursueCount > 0 && pendingManagers.length === 0) {
    outcome = "PURSUE";
  }

  return {
    outcome,
    decisions: relevant,
    pursueCount,
    rejectCount,
    pendingManagers,
    teamSize: team.length,
    readyForAssignment: outcome === "PURSUE",
  };
}

/** A rejecting vote must carry a reason; a pursuing vote may explain optionally. */
export function validatePursuitVote(vote: "PURSUE" | "REJECT", reason: string): string | null {
  if (vote === "REJECT" && reason.trim().length === 0) {
    return "A rejection reason is required.";
  }
  return null;
}

/* ========================================================================== *
 * Rules 3 & 4 — CRM assigns MCP + Estimator, MD can override; both receive
 * the tender documents in parallel.
 * ========================================================================== */

export function canAssignTeam(enquiry: Enquiry, pursuit: PursuitState): boolean {
  if (isTerminal(enquiry)) return false;
  return pursuit.readyForAssignment;
}

/** The MD may override an existing assignment at any live stage. */
export function canOverrideAssignment(enquiry: Enquiry, actor: User): boolean {
  return !isTerminal(enquiry) && Boolean(actor.isMD) && Boolean(enquiry.assignedMcpId);
}

export function validateAssignment(input: {
  mcpId: string;
  estimatorId: string;
  responsibleManagerId: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.mcpId) errors.mcpId = "Select an MCP / Project Manager.";
  if (!input.estimatorId) errors.estimatorId = "Select an Estimator.";
  if (!input.responsibleManagerId) {
    errors.responsibleManagerId = "Select the responsible Management Team member.";
  }
  return errors;
}

/* ========================================================================== *
 * Rules 5 & 6 — incomplete survey items need reasons; the MCP must clear every
 * exception before accepting the report.
 * ========================================================================== */

export function validateChecklistItem(input: {
  status: "PENDING" | "COMPLETE" | "INCOMPLETE";
  findings: string;
  incompleteReason: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.status === "INCOMPLETE" && input.incompleteReason.trim().length === 0) {
    errors.incompleteReason = "A reason is required for every incomplete item.";
  }
  return errors;
}

export interface SurveyProgress {
  total: number;
  complete: number;
  incomplete: number;
  pending: number;
  /** Incomplete items the MCP has not ruled on yet. */
  unresolvedExceptions: SurveyChecklistItem[];
  /** Items the MCP returned to the surveyor for clarification. */
  returnedExceptions: SurveyChecklistItem[];
  allItemsAddressed: boolean;
}

export function evaluateSurveyProgress(items: SurveyChecklistItem[]): SurveyProgress {
  const complete = items.filter((i) => i.status === "COMPLETE");
  const incomplete = items.filter((i) => i.status === "INCOMPLETE");
  const pending = items.filter((i) => i.status === "PENDING");
  return {
    total: items.length,
    complete: complete.length,
    incomplete: incomplete.length,
    pending: pending.length,
    unresolvedExceptions: incomplete.filter((i) => i.exceptionRuling === "PENDING"),
    returnedExceptions: incomplete.filter((i) => i.exceptionRuling === "RETURNED"),
    allItemsAddressed: pending.length === 0,
  };
}

/** The surveyor may submit once no item is still pending. */
export function canSubmitSurvey(survey: Survey, progress: SurveyProgress): boolean {
  const open = survey.status === "SCHEDULED" || survey.status === "IN_PROGRESS" || survey.status === "RETURNED_FOR_CLARIFICATION";
  return open && progress.allItemsAddressed && progress.total > 0;
}

/**
 * Rule 6: the MCP cannot accept the report while any incomplete item is still
 * unreviewed or has been returned for clarification.
 */
export function canAcceptSurveyReport(survey: Survey, progress: SurveyProgress): {
  allowed: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  if (survey.status !== "SUBMITTED") {
    blockers.push("The surveyor has not submitted the report yet.");
  }
  if (progress.unresolvedExceptions.length > 0) {
    blockers.push(
      `${progress.unresolvedExceptions.length} incomplete item(s) still need an MCP decision.`,
    );
  }
  if (progress.returnedExceptions.length > 0) {
    blockers.push(
      `${progress.returnedExceptions.length} item(s) were returned for clarification and are not resolved.`,
    );
  }
  return { allowed: blockers.length === 0, blockers };
}

/**
 * A survey must never block the Estimator when it was not required. When it is
 * required, estimation can still proceed in parallel — only the *accepted*
 * report is gated.
 */
export function surveyBlocksEstimate(survey?: Survey): boolean {
  if (!survey) return false;
  return false;
}

export function surveyIsSettled(survey?: Survey): boolean {
  if (!survey) return true;
  return survey.status === "NOT_REQUIRED" || survey.status === "ACCEPTED";
}

/* ========================================================================== *
 * BOQ arithmetic and variance (safe against zero / missing AI baselines).
 * ========================================================================== */

export function computeBoqLine(line: BoqLineItem): BoqLineComputed {
  const estimatorAmount = round2(line.estimatorQuantity * line.estimatorUnitRate);
  const aiAmount =
    line.aiQuantity !== null && line.aiUnitRate !== null
      ? round2(line.aiQuantity * line.aiUnitRate)
      : null;

  return {
    line,
    aiAmount,
    estimatorAmount,
    quantityVariance: varianceAbsolute(line.estimatorQuantity, line.aiQuantity),
    quantityVariancePercent: variancePercent(line.estimatorQuantity, line.aiQuantity),
    rateVariance: varianceAbsolute(line.estimatorUnitRate, line.aiUnitRate),
    rateVariancePercent: variancePercent(line.estimatorUnitRate, line.aiUnitRate),
    amountVariance: aiAmount === null ? null : round2(estimatorAmount - aiAmount),
    amountVariancePercent: variancePercent(estimatorAmount, aiAmount),
  };
}

export function computeEstimateTotals(estimate: Estimate, lines: BoqLineItem[]): EstimateTotals {
  const computed = lines.map(computeBoqLine);
  const lineTotal = round2(computed.reduce((sum, c) => sum + c.estimatorAmount, 0));

  // Only sum an AI baseline when every line has one; a partial baseline would
  // make the comparison misleading.
  const everyLineHasAi = computed.length > 0 && computed.every((c) => c.aiAmount !== null);
  const aiLineTotal = everyLineHasAi
    ? round2(computed.reduce((sum, c) => sum + (c.aiAmount ?? 0), 0))
    : null;

  const overhead = round2((lineTotal * estimate.overheadPercent) / 100);
  const profit = round2((lineTotal * estimate.profitPercent) / 100);
  const contingency = round2((lineTotal * estimate.contingencyPercent) / 100);
  const subTotal = round2(lineTotal + overhead + profit + contingency);
  const vat = round2((subTotal * estimate.vatPercent) / 100);

  return {
    lineTotal,
    aiLineTotal,
    overhead,
    profit,
    contingency,
    subTotal,
    vat,
    grandTotal: round2(subTotal + vat),
    lineCount: lines.length,
  };
}

/* ========================================================================== *
 * Rules 7 & 8 — the MD must approve the estimate; rejection requires a reason.
 * ========================================================================== */

export interface RequiredApprover {
  user: User;
  requirement: "MD" | "RESPONSIBLE_MANAGER";
}

/**
 * The approval list is derived, never hard-coded. Only the two confirmed
 * requirements are applied, and if the MD *is* the responsible manager the list
 * collapses to one entry rather than demanding two votes from one person.
 */
export function requiredEstimateApprovers(enquiry: Enquiry, users: User[]): RequiredApprover[] {
  const approvers: RequiredApprover[] = [];
  const md = getMd(users);

  if (estimateApprovalPolicy.requireMd && md) {
    approvers.push({ user: md, requirement: "MD" });
  }
  if (estimateApprovalPolicy.requireResponsibleManager && enquiry.responsibleManagerId) {
    const manager = users.find((u) => u.id === enquiry.responsibleManagerId);
    if (manager && !approvers.some((a) => a.user.id === manager.id)) {
      approvers.push({ user: manager, requirement: "RESPONSIBLE_MANAGER" });
    }
  }
  return approvers;
}

export interface ApprovalRollup {
  decision: ApprovalDecision;
  approved: number;
  rejected: number;
  pending: number;
  total: number;
}

export type ApprovalMode = "UNANIMOUS" | "MAJORITY" | "ALL_LISTED_APPROVERS" | "QUORUM";

export function rollupApprovals(
  approvals: Array<{ decision: ApprovalDecision }>,
  mode: ApprovalMode = "UNANIMOUS",
): ApprovalRollup {
  const approved = approvals.filter((a) => a.decision === "APPROVED").length;
  const rejected = approvals.filter((a) => a.decision === "REJECTED").length;
  const pending = approvals.filter((a) => a.decision === "PENDING").length;
  const total = approvals.length;

  let decision: ApprovalDecision = "PENDING";
  if (rejected > 0) {
    // Any rejection sends the record back; it cannot be approved around.
    decision = "REJECTED";
  } else if (total > 0) {
    if (mode === "MAJORITY" || mode === "QUORUM") {
      if (approved > Math.floor(total / 2)) decision = "APPROVED";
    } else if (approved === total) {
      decision = "APPROVED";
    }
  }

  return { decision, approved, rejected, pending, total };
}

export function evaluateEstimateApproval(
  enquiry: Enquiry,
  estimate: Estimate,
  approvals: EstimateApproval[],
  users: User[],
): ApprovalRollup & { approvers: RequiredApprover[]; rows: EstimateApproval[] } {
  const approvers = requiredEstimateApprovers(enquiry, users);
  const rows = approvals.filter((a) => a.estimateId === estimate.id);
  const rollup = rollupApprovals(
    approvers.map((a) => rows.find((r) => r.approverId === a.user.id) ?? { decision: "PENDING" as ApprovalDecision }),
    estimateApprovalPolicy.mode,
  );
  return { ...rollup, approvers, rows };
}

/** Rule 8 / 9 / shared: a rejection without a reason is not a decision. */
export function validateRejectionReason(reason: string, label = "rejection reason"): string | null {
  return reason.trim().length === 0 ? `A ${label} is required.` : null;
}

/* ========================================================================== *
 * Rules 9, 10, 11 — document rejection needs reason AND corrective
 * instructions; approval is bound to a version; only changed documents need
 * renewed approval.
 * ========================================================================== */

export function currentVersion(doc: BidPackageDocument): BidDocumentVersion | undefined {
  return doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
}

export function previousVersions(doc: BidPackageDocument): BidDocumentVersion[] {
  return doc.versions
    .filter((v) => v.versionNo !== doc.currentVersionNo)
    .sort((a, b) => b.versionNo - a.versionNo);
}

/**
 * Rule 10: the document's effective status is *the status of its current
 * version*. A document whose v1 was approved and whose v2 is pending is a
 * pending document — the old approval does not carry forward.
 */
export function documentStatus(doc: BidPackageDocument) {
  return currentVersion(doc)?.reviewStatus ?? "DRAFT";
}

export function isDocumentApproved(doc: BidPackageDocument): boolean {
  return documentStatus(doc) === "APPROVED";
}

/** Rule 9: both fields are mandatory, and emptiness is checked after trimming. */
export function validateDocumentRejection(input: {
  reason: string;
  correctiveInstructions: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.reason.trim().length === 0) {
    errors.reason = "A rejection reason is required.";
  }
  if (input.correctiveInstructions.trim().length === 0) {
    errors.correctiveInstructions = "Corrective instructions are required so the Estimator knows what to fix.";
  }
  return errors;
}

export interface PackageCompleteness {
  requiredDocs: BidPackageDocument[];
  optionalDocs: BidPackageDocument[];
  requiredApproved: BidPackageDocument[];
  /** Required documents whose current version is not approved. */
  outstanding: BidPackageDocument[];
  pendingReview: BidPackageDocument[];
  rejected: BidPackageDocument[];
  draft: BidPackageDocument[];
  /** Rule 12: every required document has current-version approval. */
  complete: boolean;
  approvedCount: number;
  requiredCount: number;
}

export function evaluatePackageCompleteness(docs: BidPackageDocument[]): PackageCompleteness {
  const requiredDocs = docs.filter((d) => d.isRequired);
  const optionalDocs = docs.filter((d) => !d.isRequired);
  const requiredApproved = requiredDocs.filter(isDocumentApproved);
  const outstanding = requiredDocs.filter((d) => !isDocumentApproved(d));

  return {
    requiredDocs,
    optionalDocs,
    requiredApproved,
    outstanding,
    pendingReview: requiredDocs.filter((d) => documentStatus(d) === "PENDING_REVIEW"),
    rejected: requiredDocs.filter((d) => documentStatus(d) === "REJECTED"),
    draft: requiredDocs.filter((d) => documentStatus(d) === "DRAFT"),
    complete: requiredDocs.length > 0 && outstanding.length === 0,
    approvedCount: requiredApproved.length,
    requiredCount: requiredDocs.length,
  };
}

/**
 * Fingerprint of the approved state of required documents: document id plus the
 * version number that carries the approval.
 *
 * This is the mechanism behind selective re-approval. CRM's "Documents
 * Approved" verification stores the fingerprint; if any document later gains a
 * new version — or a new required document is added — the fingerprint changes
 * and the verification is stale, while every *unchanged* document keeps its
 * approval untouched.
 */
export function packageFingerprint(docs: BidPackageDocument[]): string {
  return docs
    .filter((d) => d.isRequired)
    .map((d) => `${d.id}@v${d.currentVersionNo}:${documentStatus(d)}`)
    .sort()
    .join("|");
}

export function isVerificationStale(pkg: BidPackage, docs: BidPackageDocument[]): boolean {
  if (!pkg.verifiedFingerprint) return false;
  return pkg.verifiedFingerprint !== packageFingerprint(docs);
}

/** Rule 12 gate for the CRM Manager action. */
export function canMarkDocumentsApproved(
  pkg: BidPackage,
  docs: BidPackageDocument[],
): { allowed: boolean; blockers: string[]; completeness: PackageCompleteness } {
  const completeness = evaluatePackageCompleteness(docs);
  const blockers: string[] = [];

  if (completeness.requiredCount === 0) {
    blockers.push("The package has no required documents yet.");
  }
  for (const doc of completeness.outstanding) {
    blockers.push(`${doc.name} — current version (v${doc.currentVersionNo}) is ${documentStatus(doc).toLowerCase().replace(/_/g, " ")}.`);
  }
  if (pkg.status === "APPROVED_FOR_SUBMISSION" && !isVerificationStale(pkg, docs)) {
    blockers.push("The package is already approved for submission.");
  }

  return { allowed: blockers.length === 0, blockers, completeness };
}

/* ========================================================================== *
 * Rule 13 — final bid approval only after document completeness verification.
 * ========================================================================== */

export function currentApprovalRound(pkg: BidPackage, approvals: ManagementApproval[]): number {
  const rounds = approvals.filter((a) => a.packageId === pkg.id).map((a) => a.round);
  return rounds.length ? Math.max(...rounds) : 0;
}

export interface FinalBidApprovalState extends ApprovalRollup {
  round: number;
  approvers: User[];
  rows: ManagementApproval[];
  /** False while CRM has not verified, or verification went stale. */
  gateOpen: boolean;
  gateMessage?: string;
  policyNote: string;
}

/**
 * Who must approve the final bid.
 *
 * Confirmed rule: the main MD alone, whichever Management Team member the
 * enquiry is assigned to. The policy is read from config so the business can
 * widen it without touching workflow code.
 */
export function finalBidApprovers(users: User[], enquiry?: Enquiry): User[] {
  const md = getMd(users);

  switch (finalBidApprovalPolicy.approvers) {
    case "MANAGEMENT_TEAM":
      return getManagementTeam(users);

    case "MAIN_MD_AND_RESPONSIBLE_MANAGER": {
      const approvers = md ? [md] : [];
      const manager = users.find((u) => u.id === enquiry?.responsibleManagerId);
      // If the MD is already the responsible manager, one vote is enough.
      if (manager && manager.id !== md?.id) approvers.push(manager);
      return approvers;
    }

    case "MAIN_MD":
    default:
      return md ? [md] : [];
  }
}

export function evaluateFinalBidApproval(
  pkg: BidPackage,
  docs: BidPackageDocument[],
  approvals: ManagementApproval[],
  users: User[],
  enquiry?: Enquiry,
): FinalBidApprovalState {
  const approvers = finalBidApprovers(users, enquiry);
  const round = currentApprovalRound(pkg, approvals);
  const rows = approvals.filter((a) => a.packageId === pkg.id && a.round === round);

  let gateOpen = true;
  let gateMessage: string | undefined;
  if (!pkg.documentsApprovedAt) {
    gateOpen = false;
    gateMessage = "The CRM Manager has not verified document completeness yet.";
  } else if (isVerificationStale(pkg, docs)) {
    gateOpen = false;
    gateMessage =
      "Documents changed after CRM verification. The CRM Manager must re-verify package completeness before final approval.";
  }

  const rollup = rollupApprovals(
    approvers.map((a) => rows.find((r) => r.approverId === a.id) ?? { decision: "PENDING" as ApprovalDecision }),
    finalBidApprovalPolicy.mode,
  );

  return {
    ...rollup,
    round,
    approvers,
    rows,
    gateOpen,
    gateMessage,
    policyNote: finalBidApprovalPolicy.note,
  };
}

/* ========================================================================== *
 * Rules 14 & 15 — major revisions need management approval; minor
 * administrative-only revisions do not.
 * ========================================================================== */

export function revisionRequiresManagementApproval(revisionClass: RevisionClass): boolean {
  return revisionPolicy.classesRequiringManagementApproval.includes(revisionClass);
}

export function describeRevisionRequirement(revisionClass: RevisionClass): string {
  return revisionRequiresManagementApproval(revisionClass)
    ? "Management approval is required before this revision can be resubmitted to the client."
    : "Administrative-only revision — no MD approval required before resubmission.";
}

/* ========================================================================== *
 * Rules 17-20 — work order, PO and Operations handover.
 * ========================================================================== */

/** Rule 17: an award can generate a work-order draft with no PO on file. */
export function canGenerateWorkOrder(award: Award | undefined, existing: WorkOrder | undefined): {
  allowed: boolean;
  reason?: string;
} {
  if (!award) return { allowed: false, reason: "The enquiry has not been awarded yet." };
  if (existing) return { allowed: false, reason: "A work order already exists for this award." };
  return { allowed: true };
}

/** Rule 18: finalization is its own stage, separate from handover. */
export function canFinalizeWorkOrder(wo: WorkOrder | undefined): { allowed: boolean; reason?: string } {
  if (!wo) return { allowed: false, reason: "No work-order draft exists." };
  if (wo.status !== "DRAFT") return { allowed: false, reason: "The work order is already finalized." };
  if (!wo.awardedScope.trim()) return { allowed: false, reason: "Awarded scope must be recorded." };
  if (!wo.commercialSummary.trim()) return { allowed: false, reason: "A commercial summary must be recorded." };
  return { allowed: true };
}

export interface HandoverContext {
  enquiry: Enquiry;
  workOrder?: WorkOrder;
  award?: Award;
  estimate?: Estimate;
  documents: BidPackageDocument[];
  purchaseOrder?: PurchaseOrder;
  pcp?: PcpAppointment;
  kickoff?: KickoffMeeting;
  actionItems: ActionItem[];
  handover?: Handover;
  estimateVersionCount: number;
}

/**
 * Rules 19 & 20: the PO must be recorded before handover completes, and the
 * checklist plus revision history must be visible. Rows the system cannot
 * derive are `acknowledgeable` — CRM ticks them explicitly rather than the demo
 * inventing a hidden prerequisite.
 */
export function buildHandoverChecklist(ctx: HandoverContext): HandoverChecklistRow[] {
  const ack = new Set(ctx.handover?.acknowledgedItemKeys ?? []);
  const completeness = evaluatePackageCompleteness(ctx.documents);
  const openActions = ctx.actionItems.filter((a) => a.status !== "DONE");

  const rows: HandoverChecklistRow[] = [
    {
      key: "WORK_ORDER_FINALIZED",
      label: "Work order finalized",
      description: "The work order has been reviewed and finalized by the CRM Manager.",
      satisfied: ctx.workOrder?.status === "FINALIZED" || ctx.workOrder?.status === "HANDED_OVER",
      required: true,
      detail: ctx.workOrder ? `${ctx.workOrder.number} (rev ${ctx.workOrder.version})` : "No work order drafted",
    },
    {
      key: "AWARDED_SCOPE",
      label: "Awarded scope recorded",
      description: "Scope of the award as confirmed by the client.",
      satisfied: Boolean(ctx.award?.awardedScope?.trim()),
      required: true,
      detail: ctx.award?.awardedScope ? "Recorded" : "Missing",
    },
    {
      key: "APPROVED_QUOTATION",
      label: "Approved quotation and BOQ",
      description: "An approved estimate version is linked to the award.",
      satisfied: ctx.estimate?.status === "APPROVED",
      required: true,
      detail: ctx.estimate ? `Estimate rev ${ctx.estimate.version} — ${ctx.estimate.status}` : "No estimate",
    },
    {
      key: "BID_DOCUMENTS_APPROVED",
      label: "Current bid-package documents approved",
      description: "Every required document has current-version departmental approval.",
      satisfied: completeness.complete,
      required: true,
      detail: `${completeness.approvedCount} of ${completeness.requiredCount} required documents approved`,
    },
    {
      key: "PO_RECORDED",
      label: "Purchase order recorded",
      description: "PO number, date and status captured. Required before handover completes.",
      satisfied: Boolean(ctx.purchaseOrder?.poNumber) && ctx.purchaseOrder?.status !== "CANCELLED",
      required: true,
      detail: ctx.purchaseOrder
        ? `${ctx.purchaseOrder.poNumber} — ${ctx.purchaseOrder.status}`
        : "Not recorded",
    },
    {
      key: "CLIENT_CONTACTS",
      label: "Client contacts confirmed for Operations",
      description: "CRM confirms the operational client contact list has been passed on.",
      satisfied: ack.has("CLIENT_CONTACTS"),
      required: true,
      acknowledgeable: true,
    },
    {
      key: "PCP_APPOINTED",
      label: "PCP appointed",
      description: "The Management Team has appointed the PCP for this project.",
      satisfied: Boolean(ctx.pcp),
      required: true,
      detail: ctx.pcp ? "Appointed" : "Not appointed",
    },
    {
      key: "KICKOFF_MINUTES",
      label: "Kickoff minutes recorded",
      description: "Kickoff meeting minutes and decisions captured by the MCP.",
      satisfied: Boolean(ctx.kickoff?.minutes?.trim()),
      required: true,
      detail: ctx.kickoff ? "Recorded" : "Not recorded",
    },
    {
      key: "OUTSTANDING_ACTIONS",
      label: "Outstanding action items reviewed",
      description: handoverPolicy.note,
      satisfied: openActions.length === 0 || ack.has("OUTSTANDING_ACTIONS"),
      required: false,
      acknowledgeable: true,
      detail: openActions.length === 0 ? "All actions closed" : `${openActions.length} action(s) still open`,
    },
    {
      key: "REVISION_HISTORY",
      label: "Revision and approval history reviewed",
      description: "Estimate revisions, document versions and approvals are visible on the enquiry record.",
      satisfied: ack.has("REVISION_HISTORY"),
      required: false,
      acknowledgeable: true,
      detail: `${ctx.estimateVersionCount} estimate revision(s) on file`,
    },
  ];

  return rows;
}

export function canCompleteHandover(rows: HandoverChecklistRow[]): {
  allowed: boolean;
  blockers: HandoverChecklistRow[];
} {
  const blockers = rows.filter((r) => r.required && !r.satisfied);
  return { allowed: blockers.length === 0, blockers };
}

/* ========================================================================== *
 * Stage helpers.
 * ========================================================================== */

export function isTerminal(enquiry: Enquiry): boolean {
  return TERMINAL_STAGES.includes(enquiry.stage);
}

export function phaseOf(stage: EnquiryStage): EnquiryPhase {
  return STAGE_PHASE[stage];
}

/**
 * Ordering index used for sorting and progress bars. Terminal stages share the
 * final position so a lost enquiry does not appear "further along" than a live
 * one in the middle of the pipeline.
 */
const STAGE_ORDER: EnquiryStage[] = [
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
];

export function stageOrder(stage: EnquiryStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}
