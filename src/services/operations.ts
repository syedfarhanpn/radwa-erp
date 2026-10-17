/**
 * Radwa Gulf and Co — workflow operations.
 *
 * Every consequential state change in the demo goes through one of these
 * functions. They are the domain-level operations the UI consumes: screens do
 * not edit seeded arrays directly, and no screen re-implements a business rule.
 *
 * Each operation:
 *   1. validates its input and the guard conditions in `src/domain/rules.ts`,
 *   2. mutates the supplied database draft (the store clones before calling),
 *   3. appends an activity record with actor, action, timestamp and reason,
 *   4. recomputes the enquiry stage from the records so lists, detail pages and
 *      dashboards can never disagree,
 *   5. returns an `ActionResult` the UI turns into a toast or field errors.
 *
 * When the Laravel backend arrives, each operation maps to one endpoint in
 * `docs/API_CONTRACT.md`; the signatures here are the proposed request bodies.
 */

import {
  bidDocumentCatalogByKey,
  buildChecklistTemplateForProject,
  displayConfig,
  formatEnquiryReference,
  formatWorkOrderNumber,
} from "@/domain/config";
import type {
  ApprovalDecision,
  BidSubmissionType,
  ChecklistItemStatus,
  ClientResponseType,
  DemoRole,
  EnquirySource,
  EnquiryStage,
  ExceptionRuling,
  PoStatus,
  Priority,
  ProjectType,
  PursuitVote,
  RevisionClass,
  TenderDocCategory,
} from "@/domain/enums";
import {
  buildHandoverChecklist,
  canAcceptSurveyReport,
  canCompleteHandover,
  canFinalizeWorkOrder,
  canGenerateWorkOrder,
  canMarkDocumentsApproved,
  canSubmitSurvey,
  currentApprovalRound,
  currentVersion,
  evaluateFinalBidApproval,
  evaluatePackageCompleteness,
  evaluatePursuit,
  evaluateSurveyProgress,
  finalBidApprovers,
  isVerificationStale,
  packageFingerprint,
  requiredEstimateApprovers,
  revisionRequiresManagementApproval,
  rollupApprovals,
  validateAssignment,
  validateChecklistItem,
  validateDocumentRejection,
  validatePursuitVote,
} from "@/domain/rules";
import type {
  ActionResult,
  ActivityRecord,
  BidDocumentVersion,
  BidPackageDocument,
  DemoDatabase,
  Estimate,
  Id,
} from "@/domain/types";
import { boqTemplateFor } from "@/data/boqTemplates";
import { DEPARTMENT_REVIEWER, USER_IDS } from "@/data/people";
import { nowIso, todayIso } from "@/lib/dates";
import { makeId } from "@/lib/utils";

export interface OpContext {
  actorId: Id;
  actorRole: DemoRole;
}

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string, fieldErrors?: Record<string, string>): ActionResult => ({
  ok: false,
  message,
  fieldErrors,
});

/* ------------------------------------------------------------- helpers --- */

function logActivity(
  db: DemoDatabase,
  ctx: OpContext,
  entry: {
    enquiryId: Id;
    action: string;
    detail?: string;
    reason?: string;
    entityType?: string;
    entityId?: Id;
  },
) {
  const record: ActivityRecord = {
    id: makeId("act"),
    enquiryId: entry.enquiryId,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    action: entry.action,
    detail: entry.detail,
    reason: entry.reason,
    at: nowIso(),
    entityType: entry.entityType,
    entityId: entry.entityId,
  };
  db.activities.unshift(record);
}

function notify(
  db: DemoDatabase,
  audienceRole: DemoRole,
  title: string,
  body: string,
  enquiryId?: Id,
  href?: string,
) {
  db.notifications.unshift({
    id: makeId("ntf"),
    audienceRole,
    enquiryId,
    title,
    body,
    at: nowIso(),
    read: false,
    href,
  });
}

function enquiryOf(db: DemoDatabase, enquiryId: Id) {
  return db.enquiries.find((e) => e.id === enquiryId);
}

/** Latest (highest version) estimate for an enquiry. */
export function latestEstimate(db: DemoDatabase, enquiryId: Id): Estimate | undefined {
  return db.estimates
    .filter((e) => e.enquiryId === enquiryId)
    .sort((a, b) => b.version - a.version)[0];
}

export function approvedEstimate(db: DemoDatabase, enquiryId: Id): Estimate | undefined {
  return db.estimates
    .filter((e) => e.enquiryId === enquiryId && e.status === "APPROVED")
    .sort((a, b) => b.version - a.version)[0];
}

function packageOf(db: DemoDatabase, enquiryId: Id) {
  return db.bidPackages.find((p) => p.enquiryId === enquiryId);
}

function documentsOf(db: DemoDatabase, packageId: Id) {
  return db.bidPackageDocuments.filter((d) => d.packageId === packageId);
}

function surveyOf(db: DemoDatabase, enquiryId: Id) {
  return db.surveys.find((s) => s.enquiryId === enquiryId);
}

function touch(db: DemoDatabase, enquiryId: Id) {
  const e = enquiryOf(db, enquiryId);
  if (e) e.updatedAt = nowIso();
}

/* ========================================================================== *
 * Stage derivation.
 *
 * The stage is never set by hand: it is recomputed from the records after every
 * operation. That is what keeps dashboard counts, the register and detail pages
 * consistent with each other no matter which screen performed the action.
 * ========================================================================== */

export function deriveStage(db: DemoDatabase, enquiryId: Id): EnquiryStage {
  const enquiry = enquiryOf(db, enquiryId);
  if (!enquiry) return "PURSUIT_DECISION";

  // --- terminal states -----------------------------------------------------
  const handover = db.handovers.find((h) => h.enquiryId === enquiryId);
  if (handover?.completedAt) return "HANDED_OVER";

  const responses = db.clientResponses.filter((r) => r.enquiryId === enquiryId);
  if (responses.some((r) => r.response === "REJECTED")) return "LOST";

  const pursuit = evaluatePursuit(enquiryId, db.pursuitDecisions, db.users);
  if (pursuit.outcome === "REJECTED") return "VOID";

  // --- award and closeout --------------------------------------------------
  const award = db.awards.find((a) => a.enquiryId === enquiryId);
  if (award) {
    const workOrder = db.workOrders.find((w) => w.enquiryId === enquiryId);
    const pcp = db.pcpAppointments.find((p) => p.enquiryId === enquiryId);
    const kickoff = db.kickoffMeetings.find((k) => k.enquiryId === enquiryId);

    if (pcp) {
      const pkg = packageOf(db, enquiryId);
      const rows = buildHandoverChecklist({
        enquiry,
        workOrder,
        award,
        estimate: approvedEstimate(db, enquiryId),
        documents: pkg ? documentsOf(db, pkg.id) : [],
        purchaseOrder: db.purchaseOrders.find((p) => p.enquiryId === enquiryId),
        pcp,
        kickoff,
        actionItems: db.actionItems.filter((a) => a.enquiryId === enquiryId),
        handover,
        estimateVersionCount: db.estimates.filter((e) => e.enquiryId === enquiryId).length,
      });
      return canCompleteHandover(rows).allowed ? "READY_FOR_HANDOVER" : "PCP_APPOINTED";
    }
    if (kickoff) return "KICKOFF_COMPLETE";
    if (workOrder?.status === "FINALIZED") return "WORK_ORDER_FINALIZED";
    return "AWARDED";
  }

  // --- client-facing stages ------------------------------------------------
  const openRevision = db.revisionRequests.find(
    (r) => r.enquiryId === enquiryId && r.status !== "RESUBMITTED",
  );
  if (openRevision) return "REVISION_REQUESTED";

  const submissions = db.clientSubmissions.filter((s) => s.enquiryId === enquiryId);
  if (submissions.some((s) => s.status !== "NOT_SUBMITTED")) return "AWAITING_CLIENT_RESPONSE";

  // --- bid package ---------------------------------------------------------
  const pkg = packageOf(db, enquiryId);
  if (pkg) {
    const docs = documentsOf(db, pkg.id);
    const completeness = evaluatePackageCompleteness(docs);
    const finalApproval = evaluateFinalBidApproval(pkg, docs, db.managementApprovals, db.users, enquiry);

    if (finalApproval.gateOpen && finalApproval.decision === "APPROVED") return "CLIENT_SUBMISSION";
    if (pkg.documentsApprovedAt && !isVerificationStale(pkg, docs)) return "FINAL_BID_APPROVAL";
    if (completeness.complete) return "DOCUMENTS_APPROVED";
    if (docs.some((d) => currentVersion(d)?.reviewStatus !== "DRAFT")) return "DEPARTMENTAL_REVIEW";
    return "BID_PACKAGE_PREPARATION";
  }

  // --- estimation ----------------------------------------------------------
  const estimate = latestEstimate(db, enquiryId);
  if (estimate) {
    if (estimate.status === "APPROVED") return "BID_PACKAGE_PREPARATION";
    if (estimate.status === "PENDING_APPROVAL") return "ESTIMATE_APPROVAL";
    return "ESTIMATION";
  }

  // --- qualification -------------------------------------------------------
  const survey = surveyOf(db, enquiryId);
  if (survey && survey.status !== "NOT_REQUIRED" && survey.status !== "ACCEPTED") return "SITE_SURVEY";
  if (enquiry.assignedMcpId && enquiry.assignedEstimatorId) return "DOCUMENT_REVIEW";
  if (pursuit.outcome === "PURSUE") return "AWAITING_ASSIGNMENT";
  return "PURSUIT_DECISION";
}

export function recomputeStage(db: DemoDatabase, enquiryId: Id) {
  const enquiry = enquiryOf(db, enquiryId);
  if (!enquiry) return;
  enquiry.stage = deriveStage(db, enquiryId);
}

export function recomputeAllStages(db: DemoDatabase) {
  for (const e of db.enquiries) e.stage = deriveStage(db, e.id);
}

/* ========================================================================== *
 * A. Enquiry registration
 * ========================================================================== */

export interface CreateEnquiryInput {
  clientId: Id;
  contactId: Id;
  /** Supplied instead of `clientId` when registering a new client inline. */
  newClientName?: string;
  newContactName?: string;
  newContactEmail?: string;
  newContactPhone?: string;
  newContactJobTitle?: string;
  projectTitle: string;
  projectTypes: ProjectType[];
  projectLocation: string;
  scopeOfWork: string;
  source: EnquirySource;
  sourceReference?: string;
  bidSubmissionType: BidSubmissionType;
  submissionDeadline: string;
  estimatedValue?: number;
  priority: Priority;
  notes?: string;
  documents: Array<{ name: string; category: TenderDocCategory; fileName: string; fileSizeLabel: string }>;
}

export function createEnquiry(
  db: DemoDatabase,
  ctx: OpContext,
  input: CreateEnquiryInput,
): ActionResult & { enquiryId?: Id } {
  const fieldErrors: Record<string, string> = {};

  let clientId = input.clientId;
  let contactId = input.contactId;

  if (clientId === "__new__") {
    if (!input.newClientName?.trim()) fieldErrors.newClientName = "Client name is required.";
    if (!input.newContactName?.trim()) fieldErrors.newContactName = "Contact name is required.";
  } else if (!clientId) {
    fieldErrors.clientId = "Select a client.";
  } else if (!contactId) {
    fieldErrors.contactId = "Select a contact.";
  }

  if (!input.projectTitle.trim()) fieldErrors.projectTitle = "Project title is required.";
  if (input.projectTypes.length === 0) {
    fieldErrors.projectTypes = "Select at least one project type.";
  }
  if (!input.projectLocation.trim()) fieldErrors.projectLocation = "Project location is required.";
  if (!input.scopeOfWork.trim()) fieldErrors.scopeOfWork = "Describe the scope of work.";
  if (!input.submissionDeadline) fieldErrors.submissionDeadline = "Submission deadline is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return fail("Please correct the highlighted fields.", fieldErrors);
  }

  if (clientId === "__new__") {
    clientId = makeId("cli");
    db.clients.push({
      id: clientId,
      name: input.newClientName!.trim(),
      shortName: input.newClientName!.trim().split(/\s+/).slice(0, 2).join(" "),
      sector: "Not recorded",
      address: "",
      city: "",
      country: "UAE",
    });
    contactId = makeId("con");
    db.contacts.push({
      id: contactId,
      clientId,
      name: input.newContactName!.trim(),
      jobTitle: input.newContactJobTitle?.trim() || "Not recorded",
      email: input.newContactEmail?.trim() || "",
      phone: input.newContactPhone?.trim() || "",
      isPrimary: true,
    });
  }

  const sequence = (db.sequences.enquiry ?? 0) + 1;
  db.sequences.enquiry = sequence;
  const reference = formatEnquiryReference(sequence, new Date().getUTCFullYear());
  const enquiryId = makeId("enq");

  db.enquiries.push({
    id: enquiryId,
    reference,
    clientId,
    contactId,
    projectTitle: input.projectTitle.trim(),
    projectTypes: input.projectTypes,
    projectLocation: input.projectLocation.trim(),
    scopeOfWork: input.scopeOfWork.trim(),
    source: input.source,
    sourceReference: input.sourceReference?.trim() || undefined,
    bidSubmissionType: input.bidSubmissionType,
    submissionDeadline: input.submissionDeadline,
    estimatedValue: input.estimatedValue,
    currency: displayConfig.defaultCurrency,
    priority: input.priority,
    stage: "PURSUIT_DECISION",
    registeredById: ctx.actorId,
    registeredAt: nowIso(),
    updatedAt: nowIso(),
    notes: input.notes?.trim() || undefined,
    isSampleData: false,
  });

  for (const doc of input.documents) {
    db.tenderDocuments.push({
      id: makeId("tdoc"),
      enquiryId,
      name: doc.name,
      category: doc.category,
      fileName: doc.fileName,
      fileSizeLabel: doc.fileSizeLabel,
      receivedAt: nowIso(),
      addedById: ctx.actorId,
    });
  }

  logActivity(db, ctx, {
    enquiryId,
    action: "Enquiry registered",
    detail: `${reference} — ${input.projectTitle.trim()} (${input.documents.length} tender document(s) listed)`,
  });
  notify(
    db,
    "MD",
    "New enquiry awaiting pursuit decision",
    `${reference} — ${input.projectTitle.trim()}`,
    enquiryId,
    "/pursuit",
  );
  recomputeStage(db, enquiryId);

  return { ok: true, message: `Enquiry ${reference} registered.`, enquiryId };
}

/* ========================================================================== *
 * B. Pursuit decision (rule 2)
 * ========================================================================== */

export function recordPursuitDecision(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; managerId: Id; vote: PursuitVote; reason: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");

  const manager = db.users.find((u) => u.id === input.managerId && u.isManagementTeam);
  if (!manager) return fail("Only Management Team members can record a pursuit decision.");

  const validation = validatePursuitVote(input.vote, input.reason);
  if (validation) return fail(validation, { reason: validation });

  const existing = db.pursuitDecisions.find(
    (d) => d.enquiryId === input.enquiryId && d.managerId === input.managerId,
  );
  if (existing) {
    existing.vote = input.vote;
    existing.reason = input.reason.trim() || undefined;
    existing.decidedAt = nowIso();
  } else {
    db.pursuitDecisions.push({
      id: makeId("pur"),
      enquiryId: input.enquiryId,
      managerId: input.managerId,
      vote: input.vote,
      reason: input.reason.trim() || undefined,
      decidedAt: nowIso(),
    });
  }

  logActivity(db, { actorId: input.managerId, actorRole: "MD" }, {
    enquiryId: input.enquiryId,
    action: input.vote === "PURSUE" ? "Pursuit decision: pursue" : "Pursuit decision: reject",
    detail: `${manager.name} recorded a decision`,
    reason: input.reason.trim() || undefined,
  });

  const state = evaluatePursuit(input.enquiryId, db.pursuitDecisions, db.users);
  if (state.outcome === "REJECTED") {
    enquiry.closureReason = "Not pursued — all three Management Team members rejected the opportunity.";
  } else {
    enquiry.closureReason = undefined;
  }

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);

  if (state.outcome === "PURSUE") {
    notify(
      db,
      "CRM_MANAGER",
      "Enquiry ready for assignment",
      `${enquiry.reference} — pursuit decision complete. Assign an MCP and Estimator.`,
      enquiry.id,
      "/assignments",
    );
    return ok(
      `Decision recorded. All ${state.teamSize} members have decided — ${enquiry.reference} is ready for CRM assignment.`,
    );
  }
  if (state.outcome === "REJECTED") {
    return ok(`Decision recorded. All ${state.teamSize} members rejected — ${enquiry.reference} is now void.`);
  }
  return ok(
    `Decision recorded. ${state.pendingManagers.length} of ${state.teamSize} Management Team member(s) still to decide — the enquiry stays open.`,
  );
}

/* ========================================================================== *
 * C. Assignment (rules 3 & 4)
 * ========================================================================== */

export function assignTeam(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    mcpId: Id;
    estimatorId: Id;
    responsibleManagerId: Id;
    overrideReason?: string;
  },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");

  const errors = validateAssignment(input);
  if (Object.keys(errors).length > 0) return fail("Please complete the assignment.", errors);

  const actor = db.users.find((u) => u.id === ctx.actorId);
  const previous = db.assignments.find((a) => a.enquiryId === input.enquiryId && a.isCurrent);
  const isOverride = Boolean(previous);

  if (isOverride && !actor?.isMD && ctx.actorRole !== "CRM_MANAGER") {
    return fail("Only the CRM Manager or the MD can reassign an enquiry.");
  }
  if (isOverride && actor?.isMD && !input.overrideReason?.trim()) {
    return fail("Record why the assignment is being overridden.", {
      overrideReason: "An override reason is required.",
    });
  }

  if (previous) previous.isCurrent = false;

  const assignmentId = makeId("asg");
  db.assignments.push({
    id: assignmentId,
    enquiryId: input.enquiryId,
    mcpId: input.mcpId,
    estimatorId: input.estimatorId,
    responsibleManagerId: input.responsibleManagerId,
    assignedById: ctx.actorId,
    assignedAt: nowIso(),
    overriddenFromAssignmentId: previous?.id,
    overrideReason: input.overrideReason?.trim() || undefined,
    isCurrent: true,
  });

  enquiry.assignedMcpId = input.mcpId;
  enquiry.assignedEstimatorId = input.estimatorId;
  enquiry.responsibleManagerId = input.responsibleManagerId;

  const mcp = db.users.find((u) => u.id === input.mcpId);
  const est = db.users.find((u) => u.id === input.estimatorId);

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: isOverride ? "Assignment overridden" : "Team assigned",
    detail: `MCP: ${mcp?.name}. Estimator: ${est?.name}. Tender documents released to both in parallel.`,
    reason: input.overrideReason?.trim() || undefined,
    entityType: "assignment",
    entityId: assignmentId,
  });

  notify(db, "MCP", "Enquiry assigned to you", `${enquiry.reference} — ${enquiry.projectTitle}`, enquiry.id, "/enquiries");
  notify(
    db,
    "ESTIMATOR",
    "Enquiry assigned to you",
    `${enquiry.reference} — tender documents are available for review.`,
    enquiry.id,
    "/enquiries",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(isOverride ? "Assignment overridden." : "MCP and Estimator assigned. Documents released to both in parallel.");
}

/** Independent read receipts — proof that documents go to both roles at once. */
export function markTenderDocumentReviewed(
  db: DemoDatabase,
  ctx: OpContext,
  input: { documentId: Id; as: "MCP" | "ESTIMATOR" },
): ActionResult {
  const doc = db.tenderDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  if (input.as === "MCP") doc.reviewedByMcpAt = nowIso();
  else doc.reviewedByEstimatorAt = nowIso();
  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: "Tender document reviewed",
    detail: `${doc.name} marked as reviewed by the ${input.as === "MCP" ? "MCP" : "Estimator"}.`,
    entityType: "tenderDocument",
    entityId: doc.id,
  });
  touch(db, doc.enquiryId);
  return ok("Marked as reviewed.");
}

/* ========================================================================== *
 * D. Site survey (rules 5 & 6)
 * ========================================================================== */

export function setSurveyRequirement(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; required: boolean; reason: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (!input.reason.trim()) {
    return fail("Record why a survey is or is not required.", { reason: "A justification is required." });
  }

  let survey = surveyOf(db, input.enquiryId);
  if (!survey) {
    survey = {
      id: makeId("srv"),
      enquiryId: input.enquiryId,
      status: input.required ? "REQUIRED_UNASSIGNED" : "NOT_REQUIRED",
      requiredDecisionById: ctx.actorId,
      requiredDecisionAt: nowIso(),
      requirementReason: input.reason.trim(),
    };
    db.surveys.push(survey);
  } else {
    if (survey.status !== "NOT_REQUIRED" && survey.status !== "REQUIRED_UNASSIGNED") {
      return fail("The survey is already under way and cannot be reclassified.");
    }
    survey.status = input.required ? "REQUIRED_UNASSIGNED" : "NOT_REQUIRED";
    survey.requiredDecisionById = ctx.actorId;
    survey.requiredDecisionAt = nowIso();
    survey.requirementReason = input.reason.trim();
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: input.required ? "Site survey marked required" : "Site survey marked not required",
    detail: input.reason.trim(),
    entityType: "survey",
    entityId: survey.id,
  });

  if (input.required) {
    notify(
      db,
      "MCP",
      "Site survey required",
      `${enquiry.reference} — assign a surveyor and a visit date.`,
      enquiry.id,
      "/surveys",
    );
  }

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(
    input.required
      ? "Survey marked as required. The MCP can now assign a surveyor."
      : "Survey marked as not required. Estimation can proceed without blocking.",
  );
}

export function assignSurveyor(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; surveyorId: Id; scheduledDate: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  const survey = surveyOf(db, input.enquiryId);
  if (!enquiry || !survey) return fail("No survey record exists for this enquiry.");
  if (survey.status === "NOT_REQUIRED") return fail("This enquiry does not require a site survey.");

  const errors: Record<string, string> = {};
  if (!input.surveyorId) errors.surveyorId = "Select a surveyor.";
  if (!input.scheduledDate) errors.scheduledDate = "Set the survey date.";
  if (Object.keys(errors).length > 0) return fail("Please complete the survey assignment.", errors);

  survey.surveyorId = input.surveyorId;
  survey.scheduledDate = input.scheduledDate;
  survey.assignedById = ctx.actorId;
  survey.status = "SCHEDULED";
  survey.returnNote = undefined;

  // Build the project-specific checklist on first assignment.
  const existingItems = db.surveyChecklistItems.filter((i) => i.surveyId === survey.id);
  if (existingItems.length === 0) {
    for (const item of buildChecklistTemplateForProject(enquiry.projectTypes)) {
      db.surveyChecklistItems.push({
        id: makeId("sci"),
        surveyId: survey.id,
        group: item.group,
        title: item.title,
        guidance: item.guidance,
        status: "PENDING",
        exceptionRuling: "PENDING",
      });
    }
  }

  const surveyor = db.users.find((u) => u.id === input.surveyorId);
  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Surveyor assigned",
    detail: `${surveyor?.name} scheduled for ${input.scheduledDate}.`,
    entityType: "survey",
    entityId: survey.id,
  });
  notify(
    db,
    "SURVEYOR",
    "Survey assigned to you",
    `${enquiry.reference} — site visit scheduled for ${input.scheduledDate}.`,
    enquiry.id,
    "/surveys",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(`${surveyor?.name ?? "Surveyor"} assigned for ${input.scheduledDate}.`);
}

export function updateChecklistItem(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    itemId: Id;
    status: ChecklistItemStatus;
    findings: string;
    incompleteReason: string;
  },
): ActionResult {
  const item = db.surveyChecklistItems.find((i) => i.id === input.itemId);
  if (!item) return fail("Checklist item not found.");
  const survey = db.surveys.find((s) => s.id === item.surveyId);
  if (!survey) return fail("Survey not found.");

  const errors = validateChecklistItem(input);
  if (Object.keys(errors).length > 0) return fail("A reason is required for incomplete items.", errors);

  item.status = input.status;
  item.findings = input.findings.trim() || undefined;
  item.incompleteReason = input.status === "INCOMPLETE" ? input.incompleteReason.trim() : undefined;
  item.updatedAt = nowIso();
  if (input.status !== "INCOMPLETE") {
    item.exceptionRuling = "PENDING";
    item.exceptionNote = undefined;
    item.ruledById = undefined;
    item.ruledAt = undefined;
  } else if (item.exceptionRuling === "RETURNED") {
    // A surveyor update in response to a return puts it back to the MCP.
    item.exceptionRuling = "PENDING";
  }

  if (survey.status === "SCHEDULED") survey.status = "IN_PROGRESS";

  touch(db, survey.enquiryId);
  return ok("Checklist item saved.");
}

export function submitSurveyReport(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    summary: string;
    /** Metadata for the completed checklist brought back from site. */
    completedChecklistFileName?: string;
    completedChecklistSizeLabel?: string;
  },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  const survey = surveyOf(db, input.enquiryId);
  if (!enquiry || !survey) return fail("Survey not found.");
  if (!input.summary.trim()) {
    return fail("Add a short survey summary before submitting.", { summary: "A summary is required." });
  }

  const items = db.surveyChecklistItems.filter((i) => i.surveyId === survey.id);
  const progress = evaluateSurveyProgress(items);
  if (!canSubmitSurvey(survey, progress)) {
    return fail(
      progress.pending > 0
        ? `${progress.pending} checklist item(s) are still pending. Mark every item complete or incomplete first.`
        : "This survey cannot be submitted in its current state.",
    );
  }

  survey.status = "SUBMITTED";
  survey.submittedAt = nowIso();
  survey.summary = input.summary.trim();
  survey.completedChecklistFileName = input.completedChecklistFileName?.trim() || undefined;
  survey.completedChecklistSizeLabel = input.completedChecklistSizeLabel?.trim() || undefined;
  survey.returnNote = undefined;

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Survey report submitted to MCP",
    detail: survey.completedChecklistFileName
      ? `${input.summary.trim()} (completed checklist attached: ${survey.completedChecklistFileName})`
      : input.summary.trim(),
    entityType: "survey",
    entityId: survey.id,
  });
  notify(
    db,
    "MCP",
    "Survey report submitted",
    `${enquiry.reference} — ${progress.incomplete} incomplete item(s) need your review.`,
    enquiry.id,
    "/surveys",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(
    progress.incomplete > 0
      ? `Report submitted. ${progress.incomplete} incomplete item(s) are flagged for MCP review.`
      : "Report submitted to the MCP.",
  );
}

/**
 * Demo shortcut: mark every outstanding checklist item complete and submit the
 * report in one step.
 *
 * This exists so the survey stage can be walked through quickly in a
 * demonstration. It is clearly labelled as a shortcut in the UI and writes an
 * activity record saying so, and it must not be carried into production — a
 * real surveyor records each item from what they saw on site.
 */
export function completeAndSubmitSurvey(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; summary?: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  const survey = surveyOf(db, input.enquiryId);
  if (!enquiry || !survey) return fail("Survey not found.");
  if (survey.status === "NOT_REQUIRED") return fail("This enquiry does not require a site survey.");
  if (survey.status === "SUBMITTED" || survey.status === "ACCEPTED") {
    return fail("This survey report has already been submitted.");
  }

  const items = db.surveyChecklistItems.filter((i) => i.surveyId === survey.id);
  if (items.length === 0) return fail("No checklist exists yet. Assign a surveyor first.");

  let filled = 0;
  for (const item of items) {
    if (item.status !== "PENDING") continue;
    item.status = "COMPLETE";
    item.findings = "Verified on site, no deviation from the tender information. (Demo shortcut.)";
    item.incompleteReason = undefined;
    item.exceptionRuling = "PENDING";
    item.updatedAt = nowIso();
    filled += 1;
  }

  const summary =
    input.summary?.trim() ||
    "Site survey completed. All checklist items verified with no deviation from the tender information. (Recorded using the demo shortcut.)";

  survey.status = "SUBMITTED";
  survey.submittedAt = nowIso();
  survey.summary = summary;
  survey.returnNote = undefined;

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Survey report submitted to MCP",
    detail: `${filled} outstanding checklist item(s) completed and the report submitted using the demo shortcut.`,
    entityType: "survey",
    entityId: survey.id,
  });

  const progress = evaluateSurveyProgress(db.surveyChecklistItems.filter((i) => i.surveyId === survey.id));
  notify(
    db,
    "MCP",
    "Survey report submitted",
    `${enquiry.reference} — ${progress.incomplete} incomplete item(s) need your review.`,
    enquiry.id,
    "/surveys",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(
    `${filled} item(s) completed and the report submitted to the MCP. This is a demo shortcut — it does not replace recording what was seen on site.`,
  );
}

export function ruleOnChecklistException(
  db: DemoDatabase,
  ctx: OpContext,
  input: { itemId: Id; ruling: Exclude<ExceptionRuling, "PENDING">; note: string },
): ActionResult {
  const item = db.surveyChecklistItems.find((i) => i.id === input.itemId);
  if (!item) return fail("Checklist item not found.");
  const survey = db.surveys.find((s) => s.id === item.surveyId);
  if (!survey) return fail("Survey not found.");
  if (item.status !== "INCOMPLETE") return fail("Only incomplete items need an exception decision.");
  if (!input.note.trim()) {
    return fail("Record your decision note.", { note: "A note is required." });
  }

  item.exceptionRuling = input.ruling;
  item.exceptionNote = input.note.trim();
  item.ruledById = ctx.actorId;
  item.ruledAt = nowIso();

  logActivity(db, ctx, {
    enquiryId: survey.enquiryId,
    action: input.ruling === "ACCEPTED" ? "Survey exception approved" : "Survey item returned for clarification",
    detail: item.title,
    reason: input.note.trim(),
    entityType: "survey",
    entityId: survey.id,
  });

  if (input.ruling === "RETURNED") {
    survey.status = "RETURNED_FOR_CLARIFICATION";
    notify(
      db,
      "SURVEYOR",
      "Survey item returned for clarification",
      `${item.title} — ${input.note.trim()}`,
      survey.enquiryId,
      "/surveys",
    );
  }

  touch(db, survey.enquiryId);
  recomputeStage(db, survey.enquiryId);
  return ok(input.ruling === "ACCEPTED" ? "Exception approved." : "Item returned to the surveyor.");
}

export function acceptSurveyReport(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  const survey = surveyOf(db, input.enquiryId);
  if (!enquiry || !survey) return fail("Survey not found.");

  const items = db.surveyChecklistItems.filter((i) => i.surveyId === survey.id);
  const progress = evaluateSurveyProgress(items);
  const gate = canAcceptSurveyReport(survey, progress);
  if (!gate.allowed) return fail(gate.blockers.join(" "));

  survey.status = "ACCEPTED";
  survey.acceptedById = ctx.actorId;
  survey.acceptedAt = nowIso();

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Survey report accepted",
    detail: "All checklist exceptions reviewed and cleared by the MCP.",
    entityType: "survey",
    entityId: survey.id,
  });
  notify(
    db,
    "ESTIMATOR",
    "Survey report available",
    `${enquiry.reference} — the accepted survey report is available for estimation.`,
    enquiry.id,
    "/estimates",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok("Survey report accepted. The Estimator has been notified.");
}

/* ========================================================================== *
 * E. BOQ and estimate
 * ========================================================================== */

export function createEstimate(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; seedFromTemplate?: boolean },
): ActionResult & { estimateId?: Id } {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (latestEstimate(db, input.enquiryId)) {
    return fail("An estimate already exists. Create a revision instead.");
  }

  const estimateId = makeId("est");
  db.estimates.push({
    id: estimateId,
    enquiryId: input.enquiryId,
    version: 1,
    status: "DRAFT",
    currency: enquiry.currency,
    overheadPercent: 8,
    profitPercent: 12,
    contingencyPercent: 3,
    vatPercent: 5,
    preparedById: ctx.actorId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  if (input.seedFromTemplate !== false) {
    // Starter lines are the project-type template with the simulated AI column.
    boqTemplateFor(enquiry.projectTypes).forEach((line, index) => {
      db.boqLineItems.push({
        id: makeId("boq"),
        estimateId,
        itemCode: line.itemCode,
        description: line.description,
        unit: line.unit,
        aiQuantity: line.aiQuantity,
        aiUnitRate: line.aiUnitRate,
        estimatorQuantity: line.estimatorQuantity,
        estimatorUnitRate: line.estimatorUnitRate,
        note: line.note,
        sortOrder: index,
      });
    });
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "BOQ and estimate created",
    detail: "Draft estimate revision 1 opened.",
    entityType: "estimate",
    entityId: estimateId,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return { ok: true, message: "Draft estimate created.", estimateId };
}

export function updateBoqLine(
  db: DemoDatabase,
  _ctx: OpContext,
  input: {
    lineId: Id;
    patch: Partial<{
      itemCode: string;
      description: string;
      unit: string;
      estimatorQuantity: number;
      estimatorUnitRate: number;
      note: string;
    }>;
  },
): ActionResult {
  const line = db.boqLineItems.find((l) => l.id === input.lineId);
  if (!line) return fail("BOQ line not found.");
  const estimate = db.estimates.find((e) => e.id === line.estimateId);
  if (!estimate) return fail("Estimate not found.");
  if (estimate.status !== "DRAFT" && estimate.status !== "REJECTED") {
    return fail("Only a draft or rejected estimate can be edited. Create a revision instead.");
  }

  Object.assign(line, input.patch);
  estimate.updatedAt = nowIso();
  touch(db, estimate.enquiryId);
  return ok("Line updated.");
}

export function addBoqLine(
  db: DemoDatabase,
  ctx: OpContext,
  input: { estimateId: Id },
): ActionResult {
  const estimate = db.estimates.find((e) => e.id === input.estimateId);
  if (!estimate) return fail("Estimate not found.");
  if (estimate.status !== "DRAFT" && estimate.status !== "REJECTED") {
    return fail("Only a draft or rejected estimate can be edited.");
  }
  const lines = db.boqLineItems.filter((l) => l.estimateId === input.estimateId);
  db.boqLineItems.push({
    id: makeId("boq"),
    estimateId: input.estimateId,
    itemCode: `NEW-${String(lines.length + 1).padStart(2, "0")}`,
    description: "",
    unit: "no",
    aiQuantity: null,
    aiUnitRate: null,
    estimatorQuantity: 0,
    estimatorUnitRate: 0,
    sortOrder: lines.length,
  });
  estimate.updatedAt = nowIso();
  touch(db, estimate.enquiryId);
  return ok("Line added. No AI suggestion exists for a manually added item.");
}

export function removeBoqLine(db: DemoDatabase, _ctx: OpContext, input: { lineId: Id }): ActionResult {
  const line = db.boqLineItems.find((l) => l.id === input.lineId);
  if (!line) return fail("BOQ line not found.");
  const estimate = db.estimates.find((e) => e.id === line.estimateId);
  if (!estimate) return fail("Estimate not found.");
  if (estimate.status !== "DRAFT" && estimate.status !== "REJECTED") {
    return fail("Only a draft or rejected estimate can be edited.");
  }
  db.boqLineItems = db.boqLineItems.filter((l) => l.id !== input.lineId);
  estimate.updatedAt = nowIso();
  touch(db, estimate.enquiryId);
  return ok("Line removed.");
}

export function updateEstimateMeta(
  db: DemoDatabase,
  _ctx: OpContext,
  input: {
    estimateId: Id;
    patch: Partial<
      Pick<Estimate, "overheadPercent" | "profitPercent" | "contingencyPercent" | "vatPercent" | "notes" | "assumptions">
    >;
  },
): ActionResult {
  const estimate = db.estimates.find((e) => e.id === input.estimateId);
  if (!estimate) return fail("Estimate not found.");
  if (estimate.status !== "DRAFT" && estimate.status !== "REJECTED") {
    return fail("Only a draft or rejected estimate can be edited.");
  }
  Object.assign(estimate, input.patch);
  estimate.updatedAt = nowIso();
  touch(db, estimate.enquiryId);
  return ok("Estimate saved.");
}

export function submitEstimateForApproval(
  db: DemoDatabase,
  ctx: OpContext,
  input: { estimateId: Id },
): ActionResult {
  const estimate = db.estimates.find((e) => e.id === input.estimateId);
  if (!estimate) return fail("Estimate not found.");
  const enquiry = enquiryOf(db, estimate.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (estimate.status !== "DRAFT" && estimate.status !== "REJECTED") {
    return fail("This estimate has already been submitted.");
  }

  const lines = db.boqLineItems.filter((l) => l.estimateId === estimate.id);
  if (lines.length === 0) return fail("Add at least one BOQ line before submitting.");
  const unpriced = lines.filter((l) => l.estimatorQuantity <= 0 || l.estimatorUnitRate <= 0);
  if (unpriced.length > 0) {
    return fail(
      `${unpriced.length} line(s) have no estimator quantity or rate. Price or remove them before submitting.`,
    );
  }

  const approvers = requiredEstimateApprovers(enquiry, db.users);
  if (approvers.length === 0) {
    return fail("No approvers could be determined. Assign a responsible Management Team member first.");
  }

  // Previous decisions for this estimate are cleared: a resubmission after
  // rejection starts a fresh approval cycle (rule: changed estimate needs
  // another approval round).
  db.estimateApprovals = db.estimateApprovals.filter((a) => a.estimateId !== estimate.id);
  for (const approver of approvers) {
    db.estimateApprovals.push({
      id: makeId("eap"),
      estimateId: estimate.id,
      enquiryId: estimate.enquiryId,
      approverId: approver.user.id,
      requirement: approver.requirement,
      decision: "PENDING",
    });
  }

  estimate.status = "PENDING_APPROVAL";
  estimate.submittedAt = nowIso();
  estimate.updatedAt = nowIso();

  logActivity(db, ctx, {
    enquiryId: estimate.enquiryId,
    action: "Estimate submitted for approval",
    detail: `Estimate revision ${estimate.version} sent to ${approvers.map((a) => a.user.name).join(" and ")}.`,
    entityType: "estimate",
    entityId: estimate.id,
  });
  notify(
    db,
    "MD",
    "Estimate awaiting your approval",
    `${enquiry.reference} — estimate revision ${estimate.version}.`,
    enquiry.id,
    "/estimates/approvals",
  );

  touch(db, estimate.enquiryId);
  recomputeStage(db, estimate.enquiryId);
  return ok(`Estimate revision ${estimate.version} submitted to ${approvers.length} approver(s).`);
}

export function decideEstimateApproval(
  db: DemoDatabase,
  ctx: OpContext,
  input: { estimateId: Id; approverId: Id; decision: Exclude<ApprovalDecision, "PENDING">; reason: string },
): ActionResult {
  const estimate = db.estimates.find((e) => e.id === input.estimateId);
  if (!estimate) return fail("Estimate not found.");
  const enquiry = enquiryOf(db, estimate.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (estimate.status !== "PENDING_APPROVAL") {
    return fail("This estimate is not awaiting approval.");
  }
  if (input.decision === "REJECTED" && !input.reason.trim()) {
    return fail("A rejection reason is required.", { reason: "A rejection reason is required." });
  }

  const row = db.estimateApprovals.find(
    (a) => a.estimateId === estimate.id && a.approverId === input.approverId,
  );
  if (!row) return fail("You are not on the approval list for this estimate.");

  row.decision = input.decision;
  row.reason = input.reason.trim() || undefined;
  row.decidedAt = nowIso();

  const approver = db.users.find((u) => u.id === input.approverId);
  logActivity(db, { actorId: input.approverId, actorRole: "MD" }, {
    enquiryId: estimate.enquiryId,
    action: input.decision === "APPROVED" ? "Estimate approved" : "Estimate rejected",
    detail: `${approver?.name} (${row.requirement === "MD" ? "MD" : "Responsible Manager"}) — estimate revision ${estimate.version}`,
    reason: input.reason.trim() || undefined,
    entityType: "estimate",
    entityId: estimate.id,
  });

  const rows = db.estimateApprovals.filter((a) => a.estimateId === estimate.id);
  const rollup = rollupApprovals(rows, "ALL_LISTED_APPROVERS");

  if (rollup.decision === "REJECTED") {
    estimate.status = "REJECTED";
    notify(
      db,
      "ESTIMATOR",
      "Estimate rejected",
      `${enquiry.reference} — ${input.reason.trim()}`,
      enquiry.id,
      "/estimates",
    );
  } else if (rollup.decision === "APPROVED") {
    estimate.status = "APPROVED";
    // Mark any earlier revisions superseded.
    for (const other of db.estimates.filter(
      (e) => e.enquiryId === estimate.enquiryId && e.version < estimate.version && e.status !== "SUPERSEDED",
    )) {
      other.status = "SUPERSEDED";
      other.supersededByEstimateId = estimate.id;
    }
    // A revision waiting on management approval is now clear to resubmit.
    const revision = db.revisionRequests.find(
      (r) => r.enquiryId === estimate.enquiryId && r.resultingEstimateId === estimate.id,
    );
    if (revision && revision.status !== "RESUBMITTED") revision.status = "READY_TO_RESUBMIT";

    notify(
      db,
      "ESTIMATOR",
      "Estimate approved",
      `${enquiry.reference} — revision ${estimate.version} approved. Bid package preparation can start.`,
      enquiry.id,
      "/bid-packages",
    );
  }

  estimate.updatedAt = nowIso();
  touch(db, estimate.enquiryId);
  recomputeStage(db, estimate.enquiryId);

  if (rollup.decision === "PENDING") {
    return ok(`Decision recorded. ${rollup.pending} approver(s) still to decide.`);
  }
  return ok(
    rollup.decision === "APPROVED"
      ? "Estimate approved by all required approvers."
      : "Estimate rejected and returned to the Estimator.",
  );
}

export function createEstimateRevision(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; revisionNote: string; revisionRequestId?: Id },
): ActionResult & { estimateId?: Id } {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  const base = latestEstimate(db, input.enquiryId);
  if (!base) return fail("There is no estimate to revise.");
  if (base.status === "DRAFT") {
    return fail("The latest estimate is still a draft — edit it instead of creating a revision.");
  }
  if (!input.revisionNote.trim()) {
    return fail("Describe what changed in this revision.", { revisionNote: "A revision note is required." });
  }

  const estimateId = makeId("est");
  db.estimates.push({
    ...base,
    id: estimateId,
    version: base.version + 1,
    status: "DRAFT",
    preparedById: ctx.actorId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    submittedAt: undefined,
    supersededByEstimateId: undefined,
    revisionNote: input.revisionNote.trim(),
  });

  // Copy the BOQ so the previous version stays intact in the history.
  for (const line of db.boqLineItems.filter((l) => l.estimateId === base.id)) {
    db.boqLineItems.push({ ...line, id: makeId("boq"), estimateId });
  }

  if (input.revisionRequestId) {
    const revision = db.revisionRequests.find((r) => r.id === input.revisionRequestId);
    if (revision) {
      revision.resultingEstimateId = estimateId;
      revision.status = revision.requiresManagementApproval ? "PENDING_MANAGEMENT_APPROVAL" : "READY_TO_RESUBMIT";
    }
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: `Estimate revision ${base.version + 1} created`,
    detail: input.revisionNote.trim(),
    entityType: "estimate",
    entityId: estimateId,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return { ok: true, message: `Estimate revision ${base.version + 1} created from revision ${base.version}.`, estimateId };
}

/* ========================================================================== *
 * F. Bid package and departmental review (rules 9-12)
 * ========================================================================== */

export function createBidPackage(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; catalogKeys?: string[] },
): ActionResult & { packageId?: Id } {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (packageOf(db, input.enquiryId)) return fail("A bid package already exists for this enquiry.");
  if (!approvedEstimate(db, input.enquiryId)) {
    return fail("The estimate must be approved before the bid package is assembled.");
  }

  const packageId = makeId("pkg");
  db.bidPackages.push({
    id: packageId,
    enquiryId: input.enquiryId,
    status: "PREPARING",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  const keys =
    input.catalogKeys ??
    Array.from(bidDocumentCatalogByKey.values())
      .filter((c) => c.defaultRequired)
      .map((c) => c.key);

  keys.forEach((key, index) => {
    const catalog = bidDocumentCatalogByKey.get(key);
    if (!catalog) return;
    addDocumentRecord(db, ctx, packageId, input.enquiryId, catalog.key, catalog.defaultRequired, index);
  });

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Bid package created",
    detail: `${keys.length} document placeholder(s) created and routed to the responsible departments.`,
    entityType: "bidPackage",
    entityId: packageId,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return { ok: true, message: "Bid package created.", packageId };
}

function addDocumentRecord(
  db: DemoDatabase,
  ctx: OpContext,
  packageId: Id,
  enquiryId: Id,
  catalogKey: string,
  isRequired: boolean,
  sortOrder: number,
  customName?: string,
): BidPackageDocument {
  const catalog = bidDocumentCatalogByKey.get(catalogKey)!;
  const documentId = makeId("bdoc");
  const version: BidDocumentVersion = {
    id: makeId("bdv"),
    documentId,
    versionNo: 1,
    createdById: ctx.actorId,
    createdAt: nowIso(),
    fileName: "",
    fileSizeLabel: "—",
    changeSummary: "Initial draft.",
    reviewStatus: "DRAFT",
  };
  const doc: BidPackageDocument = {
    id: documentId,
    packageId,
    enquiryId,
    name: customName?.trim() || catalog.name,
    category: catalog.category,
    isRequired,
    department: catalog.department,
    assignedReviewerId: DEPARTMENT_REVIEWER[catalog.department],
    currentVersionNo: 1,
    versions: [version],
    sortOrder,
  };
  db.bidPackageDocuments.push(doc);
  return doc;
}

export function addBidDocument(
  db: DemoDatabase,
  ctx: OpContext,
  input: { packageId: Id; catalogKey: string; isRequired: boolean; customName?: string },
): ActionResult {
  const pkg = db.bidPackages.find((p) => p.id === input.packageId);
  if (!pkg) return fail("Bid package not found.");
  const catalog = bidDocumentCatalogByKey.get(input.catalogKey);
  if (!catalog) return fail("Unknown document type.");

  const docs = documentsOf(db, pkg.id);
  if (
    docs.some((d) => d.name === (input.customName?.trim() || catalog.name))
  ) {
    return fail("A document with that name is already in the package.");
  }

  const doc = addDocumentRecord(
    db,
    ctx,
    pkg.id,
    pkg.enquiryId,
    input.catalogKey,
    input.isRequired,
    docs.length,
    input.customName,
  );

  // A newly added required document must complete its own review, even if the
  // package was already verified.
  if (pkg.documentsApprovedAt && input.isRequired) {
    doc.addedAfterPackageApproval = true;
  }

  logActivity(db, ctx, {
    enquiryId: pkg.enquiryId,
    action: "Document added to bid package",
    detail: `${doc.name} (${input.isRequired ? "required" : "optional"}) — routed to ${catalog.department}.`,
    entityType: "bidDocument",
    entityId: doc.id,
  });
  pkg.updatedAt = nowIso();
  touch(db, pkg.enquiryId);
  recomputeStage(db, pkg.enquiryId);
  return ok(
    pkg.documentsApprovedAt && input.isRequired
      ? `${doc.name} added. It must complete its own departmental review, and CRM must re-verify the package.`
      : `${doc.name} added and routed to ${catalog.department}.`,
  );
}

export function setDocumentRequirement(
  db: DemoDatabase,
  ctx: OpContext,
  input: { documentId: Id; isRequired: boolean },
): ActionResult {
  const doc = db.bidPackageDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  doc.isRequired = input.isRequired;
  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: input.isRequired ? "Document marked required" : "Document marked optional",
    detail: doc.name,
    entityType: "bidDocument",
    entityId: doc.id,
  });
  touch(db, doc.enquiryId);
  recomputeStage(db, doc.enquiryId);
  return ok(`${doc.name} is now ${input.isRequired ? "required" : "optional"}.`);
}

export function removeBidDocument(db: DemoDatabase, ctx: OpContext, input: { documentId: Id }): ActionResult {
  const doc = db.bidPackageDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  if (doc.versions.some((v) => v.reviewStatus === "APPROVED")) {
    return fail("A document with an approved version cannot be removed from the package.");
  }
  db.bidPackageDocuments = db.bidPackageDocuments.filter((d) => d.id !== input.documentId);
  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: "Document removed from bid package",
    detail: doc.name,
  });
  touch(db, doc.enquiryId);
  recomputeStage(db, doc.enquiryId);
  return ok(`${doc.name} removed.`);
}

/** Attach file metadata to the current draft version and send it for review. */
export function submitDocumentForReview(
  db: DemoDatabase,
  ctx: OpContext,
  input: { documentId: Id; fileName: string; fileSizeLabel?: string; changeSummary: string },
): ActionResult {
  const doc = db.bidPackageDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  const version = currentVersion(doc);
  if (!version) return fail("Document has no current version.");
  if (version.reviewStatus !== "DRAFT") {
    return fail("This version has already been submitted. Create a new version to change it.");
  }
  if (!input.fileName.trim()) {
    return fail("Record the document file name.", { fileName: "A file name is required." });
  }

  version.fileName = input.fileName.trim();
  version.fileSizeLabel = input.fileSizeLabel?.trim() || "—";
  version.changeSummary = input.changeSummary.trim() || version.changeSummary;
  version.reviewStatus = "PENDING_REVIEW";
  version.submittedAt = nowIso();

  const reviewer = db.users.find((u) => u.id === doc.assignedReviewerId);
  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: "Document submitted for departmental review",
    detail: `${doc.name} v${version.versionNo} — ${doc.department} (${reviewer?.name ?? "reviewer"})`,
    entityType: "bidDocument",
    entityId: doc.id,
  });
  notify(
    db,
    "DEPARTMENT_REVIEWER",
    "Document awaiting your review",
    `${doc.name} v${version.versionNo} — ${doc.department}`,
    doc.enquiryId,
    "/document-reviews",
  );

  const pkg = db.bidPackages.find((p) => p.id === doc.packageId);
  if (pkg) pkg.updatedAt = nowIso();
  touch(db, doc.enquiryId);
  recomputeStage(db, doc.enquiryId);
  return ok(`${doc.name} v${version.versionNo} submitted to ${doc.department}.`);
}

/**
 * Create the next version of a document. This is the mechanism behind rules 10
 * and 11: the new version starts unapproved, which invalidates approval for
 * *this* document only — every other document keeps its approval.
 */
export function createDocumentVersion(
  db: DemoDatabase,
  ctx: OpContext,
  input: { documentId: Id; fileName: string; fileSizeLabel?: string; changeSummary: string; submitNow?: boolean },
): ActionResult {
  const doc = db.bidPackageDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  const current = currentVersion(doc);
  if (current?.reviewStatus === "DRAFT") {
    return fail("The current version is still a draft — edit and submit it instead of creating a new version.");
  }
  if (!input.changeSummary.trim()) {
    return fail("Describe what changed in this version.", {
      changeSummary: "A change summary is required so the reviewer knows what to look at.",
    });
  }
  if (input.submitNow !== false && !input.fileName.trim()) {
    return fail("Record the document file name.", { fileName: "A file name is required." });
  }

  const versionNo = doc.currentVersionNo + 1;
  const submitting = input.submitNow !== false;
  doc.versions.push({
    id: makeId("bdv"),
    documentId: doc.id,
    versionNo,
    createdById: ctx.actorId,
    createdAt: nowIso(),
    fileName: input.fileName.trim(),
    fileSizeLabel: input.fileSizeLabel?.trim() || "—",
    changeSummary: input.changeSummary.trim(),
    reviewStatus: submitting ? "PENDING_REVIEW" : "DRAFT",
    submittedAt: submitting ? nowIso() : undefined,
  });
  doc.currentVersionNo = versionNo;

  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: `Document version ${versionNo} created`,
    detail: `${doc.name} — ${input.changeSummary.trim()}${submitting ? ` Resubmitted to ${doc.department}.` : ""}`,
    entityType: "bidDocument",
    entityId: doc.id,
  });

  if (submitting) {
    notify(
      db,
      "DEPARTMENT_REVIEWER",
      "Revised document awaiting review",
      `${doc.name} v${versionNo} — ${doc.department}`,
      doc.enquiryId,
      "/document-reviews",
    );
  }

  const pkg = db.bidPackages.find((p) => p.id === doc.packageId);
  if (pkg) {
    pkg.updatedAt = nowIso();
    // A changed document makes an earlier CRM verification stale. The approval
    // of every unchanged document is left untouched.
    if (pkg.documentsApprovedAt && isVerificationStale(pkg, documentsOf(db, pkg.id))) {
      pkg.status = "IN_DEPARTMENTAL_REVIEW";
    }
  }
  touch(db, doc.enquiryId);
  recomputeStage(db, doc.enquiryId);

  return ok(
    `${doc.name} v${versionNo} created. The previous approval applies only to v${versionNo - 1} — this version needs its own ${doc.department} review.`,
  );
}

/**
 * Demo shortcut: submit every draft document in the package for review at once.
 *
 * Assembling a bid package means filling in a file name for each of ten or more
 * documents before any of them reach a reviewer, which is tedious to sit
 * through in a demonstration. This fills in placeholder file metadata and
 * submits them all.
 *
 * Labelled as a shortcut in the UI and in the activity trail. It must not be
 * carried into production — a real Estimator attaches the actual document.
 */
export function submitAllDraftDocuments(
  db: DemoDatabase,
  ctx: OpContext,
  input: { packageId: Id },
): ActionResult {
  const pkg = db.bidPackages.find((p) => p.id === input.packageId);
  if (!pkg) return fail("Bid package not found.");
  const enquiry = enquiryOf(db, pkg.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");

  const drafts = documentsOf(db, pkg.id).filter((doc) => currentVersion(doc)?.reviewStatus === "DRAFT");
  if (drafts.length === 0) {
    return fail("No documents are waiting to be submitted.");
  }

  const departments = new Set<string>();
  for (const doc of drafts) {
    const version = currentVersion(doc)!;
    version.fileName =
      version.fileName ||
      `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${enquiry.reference}_rev${version.versionNo}.pdf`;
    version.fileSizeLabel = version.fileSizeLabel === "—" ? "1.2 MB" : version.fileSizeLabel;
    version.changeSummary = version.changeSummary || "Issued for departmental review. (Demo shortcut.)";
    version.reviewStatus = "PENDING_REVIEW";
    version.submittedAt = nowIso();
    departments.add(doc.department);
  }

  logActivity(db, ctx, {
    enquiryId: pkg.enquiryId,
    action: "Bid package documents submitted for review",
    detail: `${drafts.length} document(s) submitted to ${departments.size} department(s) using the demo shortcut.`,
    entityType: "bidPackage",
    entityId: pkg.id,
  });
  notify(
    db,
    "DEPARTMENT_REVIEWER",
    "Documents awaiting your review",
    `${enquiry.reference} — ${drafts.length} document(s) submitted.`,
    enquiry.id,
    "/document-reviews",
  );

  pkg.updatedAt = nowIso();
  touch(db, pkg.enquiryId);
  recomputeStage(db, pkg.enquiryId);
  return ok(
    `${drafts.length} document(s) submitted to ${departments.size} department(s). This is a demo shortcut — it does not replace attaching the real documents.`,
  );
}

export function reviewDocument(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    documentId: Id;
    decision: Exclude<ApprovalDecision, "PENDING">;
    reason?: string;
    correctiveInstructions?: string;
  },
): ActionResult {
  const doc = db.bidPackageDocuments.find((d) => d.id === input.documentId);
  if (!doc) return fail("Document not found.");
  const version = currentVersion(doc);
  if (!version) return fail("Document has no current version.");
  if (version.reviewStatus !== "PENDING_REVIEW") {
    return fail("Only a version pending review can be approved or rejected.");
  }

  if (input.decision === "REJECTED") {
    const errors = validateDocumentRejection({
      reason: input.reason ?? "",
      correctiveInstructions: input.correctiveInstructions ?? "",
    });
    if (Object.keys(errors).length > 0) {
      return fail("A rejection needs both a reason and corrective instructions.", errors);
    }
  }

  version.reviewStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  version.reviewedById = ctx.actorId;
  version.reviewedAt = nowIso();
  version.rejectionReason = input.decision === "REJECTED" ? input.reason!.trim() : undefined;
  version.correctiveInstructions =
    input.decision === "REJECTED" ? input.correctiveInstructions!.trim() : undefined;

  logActivity(db, ctx, {
    enquiryId: doc.enquiryId,
    action: input.decision === "APPROVED" ? "Document approved" : "Document rejected",
    detail:
      input.decision === "APPROVED"
        ? `${doc.name} v${version.versionNo}`
        : `${doc.name} v${version.versionNo} — ${input.correctiveInstructions!.trim()}`,
    reason: input.decision === "REJECTED" ? input.reason!.trim() : undefined,
    entityType: "bidDocument",
    entityId: doc.id,
  });

  if (input.decision === "REJECTED") {
    notify(
      db,
      "ESTIMATOR",
      "Document rejected — correction required",
      `${doc.name} v${version.versionNo}: ${input.reason!.trim()}`,
      doc.enquiryId,
      "/bid-packages",
    );
  }

  const pkg = db.bidPackages.find((p) => p.id === doc.packageId);
  if (pkg) {
    pkg.updatedAt = nowIso();
    const docs = documentsOf(db, pkg.id);
    const completeness = evaluatePackageCompleteness(docs);
    if (pkg.status !== "APPROVED_FOR_SUBMISSION") {
      pkg.status = completeness.complete ? "DOCUMENTS_APPROVED" : "IN_DEPARTMENTAL_REVIEW";
    }
    if (completeness.complete && !pkg.documentsApprovedAt) {
      notify(
        db,
        "CRM_MANAGER",
        "All required documents approved",
        `${enquiryOf(db, pkg.enquiryId)?.reference} — verify package completeness to release it for final approval.`,
        pkg.enquiryId,
        "/bid-packages",
      );
    }
  }

  touch(db, doc.enquiryId);
  recomputeStage(db, doc.enquiryId);
  return ok(
    input.decision === "APPROVED"
      ? `${doc.name} v${version.versionNo} approved. The approval applies to this version only.`
      : `${doc.name} v${version.versionNo} rejected and returned to the Estimator.`,
  );
}

/** Rule 12: CRM verification of current-version completeness. */
export function markDocumentsApproved(
  db: DemoDatabase,
  ctx: OpContext,
  input: { packageId: Id },
): ActionResult {
  const pkg = db.bidPackages.find((p) => p.id === input.packageId);
  if (!pkg) return fail("Bid package not found.");
  const docs = documentsOf(db, pkg.id);
  const gate = canMarkDocumentsApproved(pkg, docs);
  if (!gate.allowed) {
    return fail(`Cannot verify yet: ${gate.blockers.join(" ")}`);
  }

  const wasVerifiedBefore = Boolean(pkg.documentsApprovedAt);
  pkg.documentsApprovedById = ctx.actorId;
  pkg.documentsApprovedAt = nowIso();
  pkg.verifiedFingerprint = packageFingerprint(docs);
  pkg.status = "PENDING_FINAL_APPROVAL";
  pkg.returnedReason = undefined;
  pkg.updatedAt = nowIso();

  // Re-verification after a document change starts a fresh approval round so
  // stale management votes are not reused.
  const round = currentApprovalRound(pkg, db.managementApprovals);
  const nextRound = round + 1;
  const approvers = finalBidApprovers(db.users, enquiryOf(db, pkg.enquiryId));
  for (const member of approvers) {
    db.managementApprovals.push({
      id: makeId("map"),
      enquiryId: pkg.enquiryId,
      packageId: pkg.id,
      round: nextRound,
      approverId: member.id,
      decision: "PENDING",
    });
  }

  const approverNames = approvers.map((a) => a.name).join(" and ") || "the Management Team";

  logActivity(db, ctx, {
    enquiryId: pkg.enquiryId,
    action: wasVerifiedBefore ? "Package re-verified — Documents Approved" : "Package verified — Documents Approved",
    detail: `${gate.completeness.approvedCount} of ${gate.completeness.requiredCount} required documents hold current-version approval. Final approval round ${nextRound} opened for ${approverNames}.`,
    entityType: "bidPackage",
    entityId: pkg.id,
  });
  notify(
    db,
    "MD",
    "Final bid approval required",
    `${enquiryOf(db, pkg.enquiryId)?.reference} — package verified by CRM.`,
    pkg.enquiryId,
    "/final-approvals",
  );

  touch(db, pkg.enquiryId);
  recomputeStage(db, pkg.enquiryId);
  return ok(`Documents Approved recorded. Final approval round ${nextRound} opened for ${approverNames}.`);
}

export function decideFinalBidApproval(
  db: DemoDatabase,
  ctx: OpContext,
  input: { packageId: Id; approverId: Id; decision: Exclude<ApprovalDecision, "PENDING">; reason: string },
): ActionResult {
  const pkg = db.bidPackages.find((p) => p.id === input.packageId);
  if (!pkg) return fail("Bid package not found.");
  const docs = documentsOf(db, pkg.id);
  const state = evaluateFinalBidApproval(pkg, docs, db.managementApprovals, db.users, enquiryOf(db, pkg.enquiryId));
  if (!state.gateOpen) return fail(state.gateMessage ?? "Final approval is not open yet.");
  if (input.decision === "REJECTED" && !input.reason.trim()) {
    return fail("A rejection reason is required.", { reason: "A rejection reason is required." });
  }

  const row = db.managementApprovals.find(
    (a) => a.packageId === pkg.id && a.round === state.round && a.approverId === input.approverId,
  );
  if (!row) return fail("You are not on the approval list for this round.");

  row.decision = input.decision;
  row.reason = input.reason.trim() || undefined;
  row.decidedAt = nowIso();

  const approver = db.users.find((u) => u.id === input.approverId);
  logActivity(db, { actorId: input.approverId, actorRole: "MD" }, {
    enquiryId: pkg.enquiryId,
    action: input.decision === "APPROVED" ? "Final bid approved" : "Final bid rejected",
    detail: `${approver?.name} — approval round ${state.round}`,
    reason: input.reason.trim() || undefined,
    entityType: "bidPackage",
    entityId: pkg.id,
  });

  const after = evaluateFinalBidApproval(pkg, docs, db.managementApprovals, db.users, enquiryOf(db, pkg.enquiryId));
  if (after.decision === "REJECTED") {
    pkg.status = "RETURNED_FOR_CORRECTION";
    pkg.returnedReason = input.reason.trim();
    notify(
      db,
      "ESTIMATOR",
      "Bid returned for correction",
      `${enquiryOf(db, pkg.enquiryId)?.reference} — ${input.reason.trim()}`,
      pkg.enquiryId,
      "/bid-packages",
    );
  } else if (after.decision === "APPROVED") {
    pkg.status = "APPROVED_FOR_SUBMISSION";
    notify(
      db,
      "MCP",
      "Bid approved for submission",
      `${enquiryOf(db, pkg.enquiryId)?.reference} — transfer the package to the client.`,
      pkg.enquiryId,
      "/submissions",
    );
  }

  pkg.updatedAt = nowIso();
  touch(db, pkg.enquiryId);
  recomputeStage(db, pkg.enquiryId);

  if (after.decision === "PENDING") {
    return ok(`Decision recorded. ${after.pending} approver(s) still to decide.`);
  }
  return ok(
    after.decision === "APPROVED"
      ? "Final bid approved. The package has been transferred to the MCP for submission."
      : "Bid rejected and returned for correction.",
  );
}

/* ========================================================================== *
 * G. Client submission, follow-up and response
 * ========================================================================== */

export function recordSubmission(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    submittedOn: string;
    clientContactId: Id;
    acknowledgementRef?: string;
    notes?: string;
    nextFollowUpDate?: string;
  },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  const pkg = packageOf(db, input.enquiryId);
  if (!pkg || pkg.status !== "APPROVED_FOR_SUBMISSION") {
    return fail("The bid package must receive final management approval before submission.");
  }
  if (!input.submittedOn) {
    return fail("Record the submission date.", { submittedOn: "A submission date is required." });
  }

  const estimate = approvedEstimate(db, input.enquiryId);
  const onTime = input.submittedOn <= enquiry.submissionDeadline;
  const previous = db.clientSubmissions.filter((s) => s.enquiryId === input.enquiryId);

  db.clientSubmissions.push({
    id: makeId("sub"),
    enquiryId: input.enquiryId,
    status: onTime ? "SUBMITTED_ON_TIME" : "SUBMITTED_LATE",
    submittedAt: new Date(`${input.submittedOn}T12:00:00Z`).toISOString(),
    submittedById: ctx.actorId,
    method: enquiry.bidSubmissionType,
    clientContactId: input.clientContactId || enquiry.contactId,
    acknowledgementRef: input.acknowledgementRef?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    nextFollowUpDate: input.nextFollowUpDate || undefined,
    estimateVersionSubmitted: estimate?.version,
    resubmissionOfSubmissionId: previous.length > 0 ? previous[previous.length - 1].id : undefined,
  });

  // Resubmission closes the open revision request.
  const revision = db.revisionRequests.find(
    (r) => r.enquiryId === input.enquiryId && r.status !== "RESUBMITTED",
  );
  if (revision) {
    revision.status = "RESUBMITTED";
    revision.closedAt = nowIso();
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: previous.length > 0 ? "Revised proposal resubmitted to client" : "Proposal submitted to client",
    detail: `${onTime ? "Submitted within the deadline" : "Submitted after the deadline"} by ${enquiry.bidSubmissionType.replace(/_/g, " ").toLowerCase()}. Simulated only — no email is sent by this demo.`,
  });

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(
    onTime
      ? "Submission recorded as on time. (Simulated — this demo does not send email.)"
      : "Submission recorded as delayed. (Simulated — this demo does not send email.)",
  );
}

export function createFollowUpTask(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; title: string; dueDate: string; ownerId: Id; notes?: string },
): ActionResult {
  if (!input.title.trim()) return fail("Describe the follow-up task.", { title: "A task title is required." });
  if (!input.dueDate) return fail("Set a due date.", { dueDate: "A due date is required." });

  db.followUpTasks.push({
    id: makeId("fut"),
    enquiryId: input.enquiryId,
    title: input.title.trim(),
    dueDate: input.dueDate,
    ownerId: input.ownerId || ctx.actorId,
    status: "OPEN",
    notes: input.notes?.trim() || undefined,
    createdAt: nowIso(),
  });

  const submission = db.clientSubmissions
    .filter((s) => s.enquiryId === input.enquiryId)
    .sort((a, b) => (a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1)[0];
  if (submission) {
    const open = db.followUpTasks.filter((t) => t.enquiryId === input.enquiryId && t.status === "OPEN");
    submission.nextFollowUpDate = open.map((t) => t.dueDate).sort()[0];
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Follow-up task created",
    detail: `${input.title.trim()} — due ${input.dueDate}`,
  });
  touch(db, input.enquiryId);
  return ok("Follow-up task created.");
}

export function completeFollowUpTask(
  db: DemoDatabase,
  ctx: OpContext,
  input: { taskId: Id; completionNote?: string },
): ActionResult {
  const task = db.followUpTasks.find((t) => t.id === input.taskId);
  if (!task) return fail("Task not found.");
  task.status = "DONE";
  task.completedAt = nowIso();
  task.completionNote = input.completionNote?.trim() || undefined;

  const submission = db.clientSubmissions
    .filter((s) => s.enquiryId === task.enquiryId)
    .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1))[0];
  if (submission) {
    const open = db.followUpTasks.filter((t) => t.enquiryId === task.enquiryId && t.status === "OPEN");
    submission.nextFollowUpDate = open.map((t) => t.dueDate).sort()[0];
  }

  logActivity(db, ctx, {
    enquiryId: task.enquiryId,
    action: "Follow-up task completed",
    detail: task.title,
    reason: input.completionNote?.trim() || undefined,
  });
  touch(db, task.enquiryId);
  return ok("Task completed.");
}

export function reopenFollowUpTask(db: DemoDatabase, ctx: OpContext, input: { taskId: Id }): ActionResult {
  const task = db.followUpTasks.find((t) => t.id === input.taskId);
  if (!task) return fail("Task not found.");
  task.status = "OPEN";
  task.completedAt = undefined;
  task.completionNote = undefined;
  logActivity(db, ctx, { enquiryId: task.enquiryId, action: "Follow-up task reopened", detail: task.title });
  touch(db, task.enquiryId);
  return ok("Task reopened.");
}

export function recordClientResponse(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    response: ClientResponseType;
    detail: string;
    reference?: string;
    /** Required for REVISION_REQUESTED. */
    revisionClass?: RevisionClass;
    /** Required for AWARDED. */
    awardedValue?: number;
    awardedScope?: string;
    awardLetterFileName?: string;
  },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (!db.clientSubmissions.some((s) => s.enquiryId === input.enquiryId)) {
    return fail("Record the proposal submission before capturing a client response.");
  }
  if (!input.detail.trim()) {
    return fail("Record what the client said.", { detail: "Client response detail is required." });
  }

  const fieldErrors: Record<string, string> = {};
  if (input.response === "REVISION_REQUESTED" && !input.revisionClass) {
    fieldErrors.revisionClass = "Classify the revision so the approval requirement can be applied.";
  }
  if (input.response === "AWARDED") {
    if (!input.awardedValue || input.awardedValue <= 0) fieldErrors.awardedValue = "Record the awarded value.";
    if (!input.awardedScope?.trim()) fieldErrors.awardedScope = "Record the awarded scope.";
  }
  if (Object.keys(fieldErrors).length > 0) return fail("Please complete the response details.", fieldErrors);

  const responseId = makeId("cres");
  db.clientResponses.push({
    id: responseId,
    enquiryId: input.enquiryId,
    response: input.response,
    receivedAt: nowIso(),
    recordedById: ctx.actorId,
    detail: input.detail.trim(),
    reference: input.reference?.trim() || undefined,
  });

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: `Client response recorded: ${input.response.replace(/_/g, " ").toLowerCase()}`,
    detail: input.detail.trim(),
    entityType: "clientResponse",
    entityId: responseId,
  });

  if (input.response === "REJECTED") {
    enquiry.closureReason = input.detail.trim();
    touch(db, input.enquiryId);
    recomputeStage(db, input.enquiryId);
    return ok("Client rejection recorded. The enquiry is now closed as lost.");
  }

  if (input.response === "REVISION_REQUESTED") {
    const requiresApproval = revisionRequiresManagementApproval(input.revisionClass!);
    db.revisionRequests.push({
      id: makeId("rev"),
      enquiryId: input.enquiryId,
      clientResponseId: responseId,
      revisionClass: input.revisionClass!,
      requestDetail: input.detail.trim(),
      assignedEstimatorId: enquiry.assignedEstimatorId ?? USER_IDS.estimator1,
      assignedById: ctx.actorId,
      assignedAt: nowIso(),
      status: "OPEN",
      requiresManagementApproval: requiresApproval,
    });
    notify(
      db,
      "ESTIMATOR",
      "Revision assigned to you",
      `${enquiry.reference} — ${input.detail.trim()}`,
      enquiry.id,
      "/estimates",
    );
    touch(db, input.enquiryId);
    recomputeStage(db, input.enquiryId);
    return ok(
      requiresApproval
        ? "Revision recorded and assigned to the Estimator. Management approval is required before resubmission."
        : "Revision recorded and assigned to the Estimator. No MD approval is required for an administrative-only change.",
    );
  }

  // AWARDED
  const estimate = approvedEstimate(db, input.enquiryId);
  if (!estimate) return fail("An approved estimate is required before recording an award.");
  const awardId = makeId("awd");
  db.awards.push({
    id: awardId,
    enquiryId: input.enquiryId,
    awardedAt: nowIso(),
    recordedById: ctx.actorId,
    awardedValue: input.awardedValue!,
    currency: enquiry.currency,
    awardedScope: input.awardedScope!.trim(),
    awardLetterFileName: input.awardLetterFileName?.trim() || undefined,
    clientReference: input.reference?.trim() || undefined,
    approvedEstimateId: estimate.id,
  });

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Award recorded",
    detail: input.awardedScope!.trim(),
    entityType: "award",
    entityId: awardId,
  });
  notify(
    db,
    "CRM_MANAGER",
    "Enquiry awarded — work order required",
    `${enquiry.reference} — generate and finalize the work-order draft.`,
    enquiry.id,
    "/work-orders",
  );

  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok("Award recorded. A work-order draft can now be generated — a purchase order is not required first.");
}

/* ========================================================================== *
 * H. Work order, kickoff, PCP, PO and handover (rules 17-20)
 * ========================================================================== */

export function generateWorkOrder(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id },
): ActionResult & { workOrderId?: Id } {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  const award = db.awards.find((a) => a.enquiryId === input.enquiryId);
  const existing = db.workOrders.find((w) => w.enquiryId === input.enquiryId);
  const gate = canGenerateWorkOrder(award, existing);
  if (!gate.allowed) return fail(gate.reason!);

  const estimate = db.estimates.find((e) => e.id === award!.approvedEstimateId);
  const sequence = (db.sequences.workOrder ?? 0) + 1;
  db.sequences.workOrder = sequence;
  const number = formatWorkOrderNumber(sequence, new Date().getUTCFullYear());
  const workOrderId = makeId("wo");

  db.workOrders.push({
    id: workOrderId,
    enquiryId: input.enquiryId,
    awardId: award!.id,
    number,
    version: 1,
    status: "DRAFT",
    issuedDate: todayIso(),
    awardedScope: award!.awardedScope,
    commercialSummary: `Awarded value ${enquiry.currency} ${award!.awardedValue.toLocaleString("en-US", { minimumFractionDigits: 2 })} per approved estimate revision ${estimate?.version ?? "—"}.`,
    keyTerms: "",
    paymentTerms: "",
    notes: "Generated from the award and approved quotation. Purchase order not required at this stage.",
    contractValue: award!.awardedValue,
    currency: enquiry.currency,
    approvedEstimateId: award!.approvedEstimateId,
    createdAt: nowIso(),
  });

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Work order draft generated",
    detail: `${number} created from the award and approved quotation.`,
    entityType: "workOrder",
    entityId: workOrderId,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return { ok: true, message: `${number} drafted. Review the terms, then finalize.`, workOrderId };
}

export function updateWorkOrder(
  db: DemoDatabase,
  _ctx: OpContext,
  input: {
    workOrderId: Id;
    patch: Partial<{
      awardedScope: string;
      commercialSummary: string;
      keyTerms: string;
      paymentTerms: string;
      notes: string;
      plannedStartDate: string;
      plannedEndDate: string;
      durationDays: number;
      retentionPercent: number;
      contractValue: number;
    }>;
  },
): ActionResult {
  const wo = db.workOrders.find((w) => w.id === input.workOrderId);
  if (!wo) return fail("Work order not found.");
  if (wo.status !== "DRAFT") return fail("A finalized work order cannot be edited.");
  Object.assign(wo, input.patch);
  touch(db, wo.enquiryId);
  return ok("Work order saved.");
}

export function finalizeWorkOrder(
  db: DemoDatabase,
  ctx: OpContext,
  input: { workOrderId: Id },
): ActionResult {
  const wo = db.workOrders.find((w) => w.id === input.workOrderId);
  if (!wo) return fail("Work order not found.");
  const gate = canFinalizeWorkOrder(wo);
  if (!gate.allowed) return fail(gate.reason!);

  wo.status = "FINALIZED";
  wo.finalizedById = ctx.actorId;
  wo.finalizedAt = nowIso();

  logActivity(db, ctx, {
    enquiryId: wo.enquiryId,
    action: "Work order finalized",
    detail: wo.number,
    entityType: "workOrder",
    entityId: wo.id,
  });
  notify(
    db,
    "MCP",
    "Work order finalized — kickoff required",
    `${enquiryOf(db, wo.enquiryId)?.reference} — ${wo.number} finalized. Arrange the kickoff meeting.`,
    wo.enquiryId,
    "/work-orders",
  );
  touch(db, wo.enquiryId);
  recomputeStage(db, wo.enquiryId);
  return ok(`${wo.number} finalized. Operations handover remains a separate stage.`);
}

export function recordKickoff(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    meetingDate: string;
    location: string;
    attendeeIds: Id[];
    externalAttendees?: string;
    minutes: string;
    decisions: string;
  },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (!db.awards.some((a) => a.enquiryId === input.enquiryId)) {
    return fail("A kickoff meeting can only be recorded after the award.");
  }

  const fieldErrors: Record<string, string> = {};
  if (!input.meetingDate) fieldErrors.meetingDate = "Record the meeting date.";
  if (!input.minutes.trim()) fieldErrors.minutes = "Minutes are required.";
  if (input.attendeeIds.length === 0) fieldErrors.attendeeIds = "Record at least one attendee.";
  if (Object.keys(fieldErrors).length > 0) return fail("Please complete the kickoff record.", fieldErrors);

  const existing = db.kickoffMeetings.find((k) => k.enquiryId === input.enquiryId);
  if (existing) {
    Object.assign(existing, {
      meetingDate: input.meetingDate,
      location: input.location.trim(),
      attendeeIds: input.attendeeIds,
      externalAttendees: input.externalAttendees?.trim() || undefined,
      minutes: input.minutes.trim(),
      decisions: input.decisions.trim(),
      recordedById: ctx.actorId,
      recordedAt: nowIso(),
    });
  } else {
    db.kickoffMeetings.push({
      id: makeId("kom"),
      enquiryId: input.enquiryId,
      meetingDate: input.meetingDate,
      location: input.location.trim(),
      attendeeIds: input.attendeeIds,
      externalAttendees: input.externalAttendees?.trim() || undefined,
      minutes: input.minutes.trim(),
      decisions: input.decisions.trim(),
      recordedById: ctx.actorId,
      recordedAt: nowIso(),
    });
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: existing ? "Kickoff minutes updated" : "Kickoff meeting recorded",
    detail: `Minutes and decisions captured for the meeting on ${input.meetingDate}.`,
  });
  if (!existing) {
    notify(
      db,
      "MD",
      "PCP appointment required",
      `${enquiry.reference} — kickoff complete. The Management Team must appoint the PCP.`,
      enquiry.id,
      "/handover",
    );
  }
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(existing ? "Kickoff minutes updated." : "Kickoff meeting recorded.");
}

export function addActionItem(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; title: string; ownerId: Id; dueDate: string; notes?: string },
): ActionResult {
  const fieldErrors: Record<string, string> = {};
  if (!input.title.trim()) fieldErrors.title = "Describe the action.";
  if (!input.ownerId) fieldErrors.ownerId = "Select an owner.";
  if (!input.dueDate) fieldErrors.dueDate = "Set a due date.";
  if (Object.keys(fieldErrors).length > 0) return fail("Please complete the action item.", fieldErrors);

  db.actionItems.push({
    id: makeId("ait"),
    enquiryId: input.enquiryId,
    kickoffMeetingId: db.kickoffMeetings.find((k) => k.enquiryId === input.enquiryId)?.id,
    title: input.title.trim(),
    ownerId: input.ownerId,
    dueDate: input.dueDate,
    status: "OPEN",
    notes: input.notes?.trim() || undefined,
    createdAt: nowIso(),
  });
  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Action item added",
    detail: `${input.title.trim()} — due ${input.dueDate}`,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok("Action item added.");
}

export function setActionItemStatus(
  db: DemoDatabase,
  ctx: OpContext,
  input: { actionItemId: Id; status: "OPEN" | "IN_PROGRESS" | "DONE" },
): ActionResult {
  const item = db.actionItems.find((a) => a.id === input.actionItemId);
  if (!item) return fail("Action item not found.");
  item.status = input.status;
  item.completedAt = input.status === "DONE" ? nowIso() : undefined;
  logActivity(db, ctx, {
    enquiryId: item.enquiryId,
    action: `Action item ${input.status === "DONE" ? "closed" : "updated"}`,
    detail: item.title,
  });
  touch(db, item.enquiryId);
  recomputeStage(db, item.enquiryId);
  return ok("Action item updated.");
}

export function appointPcp(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; appointeeId: Id; appointmentDate: string; notes?: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  if (!db.kickoffMeetings.some((k) => k.enquiryId === input.enquiryId)) {
    return fail("The PCP is appointed after the kickoff meeting.");
  }
  const fieldErrors: Record<string, string> = {};
  if (!input.appointeeId) fieldErrors.appointeeId = "Select the PCP.";
  if (!input.appointmentDate) fieldErrors.appointmentDate = "Record the appointment date.";
  if (Object.keys(fieldErrors).length > 0) return fail("Please complete the appointment.", fieldErrors);

  const existing = db.pcpAppointments.find((p) => p.enquiryId === input.enquiryId);
  if (existing) {
    existing.appointeeId = input.appointeeId;
    existing.appointmentDate = input.appointmentDate;
    existing.appointedById = ctx.actorId;
    existing.appointedAt = nowIso();
    existing.notes = input.notes?.trim() || undefined;
  } else {
    db.pcpAppointments.push({
      id: makeId("pcp"),
      enquiryId: input.enquiryId,
      appointeeId: input.appointeeId,
      appointmentDate: input.appointmentDate,
      appointedById: ctx.actorId,
      appointedAt: nowIso(),
      notes: input.notes?.trim() || undefined,
    });
  }

  const appointee = db.users.find((u) => u.id === input.appointeeId);
  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: existing ? "PCP appointment updated" : "PCP appointed",
    detail: `${appointee?.name} appointed as PCP.`,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(`${appointee?.name ?? "PCP"} appointed.`);
}

export function recordPurchaseOrder(
  db: DemoDatabase,
  ctx: OpContext,
  input: {
    enquiryId: Id;
    poNumber: string;
    poDate: string;
    expiryDate?: string;
    status: PoStatus;
    value?: number;
    documentFileName?: string;
    notes?: string;
  },
): ActionResult {
  const wo = db.workOrders.find((w) => w.enquiryId === input.enquiryId);
  if (!wo) return fail("A work order must exist before the purchase order is recorded.");

  const fieldErrors: Record<string, string> = {};
  if (!input.poNumber.trim()) fieldErrors.poNumber = "PO number is required.";
  if (!input.poDate) fieldErrors.poDate = "PO date is required.";
  if (Object.keys(fieldErrors).length > 0) return fail("Please complete the purchase-order details.", fieldErrors);

  const existing = db.purchaseOrders.find((p) => p.enquiryId === input.enquiryId);
  if (existing) {
    Object.assign(existing, {
      poNumber: input.poNumber.trim(),
      poDate: input.poDate,
      expiryDate: input.expiryDate || undefined,
      status: input.status,
      value: input.value,
      documentFileName: input.documentFileName?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      recordedById: ctx.actorId,
      recordedAt: nowIso(),
    });
  } else {
    db.purchaseOrders.push({
      id: makeId("po"),
      enquiryId: input.enquiryId,
      workOrderId: wo.id,
      poNumber: input.poNumber.trim(),
      poDate: input.poDate,
      expiryDate: input.expiryDate || undefined,
      status: input.status,
      value: input.value,
      currency: wo.currency,
      documentFileName: input.documentFileName?.trim() || undefined,
      recordedById: ctx.actorId,
      recordedAt: nowIso(),
      notes: input.notes?.trim() || undefined,
    });
  }

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: existing ? "Purchase order updated" : "Purchase order recorded",
    detail: `${input.poNumber.trim()} — ${input.status}`,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(`Purchase order ${input.poNumber.trim()} recorded.`);
}

export function toggleHandoverAcknowledgement(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; key: string; acknowledged: boolean },
): ActionResult {
  const wo = db.workOrders.find((w) => w.enquiryId === input.enquiryId);
  if (!wo) return fail("A work order must exist before the handover checklist is used.");

  let handover = db.handovers.find((h) => h.enquiryId === input.enquiryId);
  if (!handover) {
    handover = {
      id: makeId("hov"),
      enquiryId: input.enquiryId,
      workOrderId: wo.id,
      acknowledgedItemKeys: [],
    };
    db.handovers.push(handover);
  }
  if (handover.completedAt) return fail("The handover is already complete.");

  const set = new Set(handover.acknowledgedItemKeys);
  if (input.acknowledged) set.add(input.key);
  else set.delete(input.key);
  handover.acknowledgedItemKeys = Array.from(set);

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: input.acknowledged ? "Handover checklist item confirmed" : "Handover checklist confirmation withdrawn",
    detail: input.key.replace(/_/g, " ").toLowerCase(),
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok("Checklist updated.");
}

export function completeHandover(
  db: DemoDatabase,
  ctx: OpContext,
  input: { enquiryId: Id; operationsOwnerId: Id; notes?: string },
): ActionResult {
  const enquiry = enquiryOf(db, input.enquiryId);
  if (!enquiry) return fail("Enquiry not found.");
  const wo = db.workOrders.find((w) => w.enquiryId === input.enquiryId);
  if (!wo) return fail("No work order exists for this enquiry.");
  if (!input.operationsOwnerId) {
    return fail("Select the Operations owner receiving the project.", {
      operationsOwnerId: "An Operations owner is required.",
    });
  }

  const pkg = packageOf(db, input.enquiryId);
  let handover = db.handovers.find((h) => h.enquiryId === input.enquiryId);
  if (!handover) {
    handover = {
      id: makeId("hov"),
      enquiryId: input.enquiryId,
      workOrderId: wo.id,
      acknowledgedItemKeys: [],
    };
    db.handovers.push(handover);
  }

  const rows = buildHandoverChecklist({
    enquiry,
    workOrder: wo,
    award: db.awards.find((a) => a.enquiryId === input.enquiryId),
    estimate: approvedEstimate(db, input.enquiryId),
    documents: pkg ? documentsOf(db, pkg.id) : [],
    purchaseOrder: db.purchaseOrders.find((p) => p.enquiryId === input.enquiryId),
    pcp: db.pcpAppointments.find((p) => p.enquiryId === input.enquiryId),
    kickoff: db.kickoffMeetings.find((k) => k.enquiryId === input.enquiryId),
    actionItems: db.actionItems.filter((a) => a.enquiryId === input.enquiryId),
    handover,
    estimateVersionCount: db.estimates.filter((e) => e.enquiryId === input.enquiryId).length,
  });

  const gate = canCompleteHandover(rows);
  if (!gate.allowed) {
    return fail(
      `Handover is blocked. Outstanding: ${gate.blockers.map((r) => r.label).join("; ")}.`,
    );
  }

  handover.completedById = ctx.actorId;
  handover.completedAt = nowIso();
  handover.operationsOwnerId = input.operationsOwnerId;
  handover.notes = input.notes?.trim() || undefined;
  wo.status = "HANDED_OVER";

  logActivity(db, ctx, {
    enquiryId: input.enquiryId,
    action: "Handed over to Operations",
    detail: "Handover checklist satisfied and the project transferred to Operations.",
    entityType: "handover",
    entityId: handover.id,
  });
  touch(db, input.enquiryId);
  recomputeStage(db, input.enquiryId);
  return ok(`${enquiry.reference} handed over to Operations. This enquiry is now closed in the system.`);
}

/* ========================================================================== *
 * I. Notifications
 * ========================================================================== */

export function markNotificationsRead(db: DemoDatabase, _ctx: OpContext, input: { role: DemoRole }): ActionResult {
  for (const n of db.notifications.filter((x) => x.audienceRole === input.role)) n.read = true;
  return ok("Notifications marked as read.");
}
