/**
 * Radwa Gulf and Co — repository contract.
 *
 * This is the seam between the UI and whatever is storing the data. Today the
 * only implementation is `createMockRepository`, which applies the pure
 * operations in `./operations.ts` to the in-memory demo database held by the
 * zustand store. Tomorrow `createApiRepository` (see `./api/apiClient.ts`) will
 * implement the same interface against the Laravel REST API, and no screen has
 * to change.
 *
 * Deliberately async: every method returns a promise even though the mock
 * resolves synchronously, so components are already written for latency.
 */

import type { DemoRole } from "@/domain/enums";
import type { ActionResult, DemoDatabase, Id } from "@/domain/types";
import type * as Ops from "./operations";

/** Input type of an operation, minus the `(db, ctx)` prefix. */
type InputOf<F> = F extends (db: DemoDatabase, ctx: Ops.OpContext, input: infer I) => unknown ? I : never;

export interface RadwaRepository {
  /** Current snapshot. The API implementation will fetch per-resource instead. */
  snapshot(): Promise<DemoDatabase>;

  // Enquiry registration and qualification
  createEnquiry(input: InputOf<typeof Ops.createEnquiry>): Promise<ActionResult & { enquiryId?: Id }>;
  recordPursuitDecision(input: InputOf<typeof Ops.recordPursuitDecision>): Promise<ActionResult>;
  assignTeam(input: InputOf<typeof Ops.assignTeam>): Promise<ActionResult>;
  markTenderDocumentReviewed(input: InputOf<typeof Ops.markTenderDocumentReviewed>): Promise<ActionResult>;

  // Site survey
  setSurveyRequirement(input: InputOf<typeof Ops.setSurveyRequirement>): Promise<ActionResult>;
  assignSurveyor(input: InputOf<typeof Ops.assignSurveyor>): Promise<ActionResult>;
  updateChecklistItem(input: InputOf<typeof Ops.updateChecklistItem>): Promise<ActionResult>;
  submitSurveyReport(input: InputOf<typeof Ops.submitSurveyReport>): Promise<ActionResult>;
  completeAndSubmitSurvey(input: InputOf<typeof Ops.completeAndSubmitSurvey>): Promise<ActionResult>;
  ruleOnChecklistException(input: InputOf<typeof Ops.ruleOnChecklistException>): Promise<ActionResult>;
  acceptSurveyReport(input: InputOf<typeof Ops.acceptSurveyReport>): Promise<ActionResult>;

  // BOQ and estimate
  createEstimate(input: InputOf<typeof Ops.createEstimate>): Promise<ActionResult & { estimateId?: Id }>;
  updateBoqLine(input: InputOf<typeof Ops.updateBoqLine>): Promise<ActionResult>;
  addBoqLine(input: InputOf<typeof Ops.addBoqLine>): Promise<ActionResult>;
  removeBoqLine(input: InputOf<typeof Ops.removeBoqLine>): Promise<ActionResult>;
  updateEstimateMeta(input: InputOf<typeof Ops.updateEstimateMeta>): Promise<ActionResult>;
  submitEstimateForApproval(input: InputOf<typeof Ops.submitEstimateForApproval>): Promise<ActionResult>;
  decideEstimateApproval(input: InputOf<typeof Ops.decideEstimateApproval>): Promise<ActionResult>;
  createEstimateRevision(
    input: InputOf<typeof Ops.createEstimateRevision>,
  ): Promise<ActionResult & { estimateId?: Id }>;

  // Bid package and departmental review
  createBidPackage(input: InputOf<typeof Ops.createBidPackage>): Promise<ActionResult & { packageId?: Id }>;
  addBidDocument(input: InputOf<typeof Ops.addBidDocument>): Promise<ActionResult>;
  setDocumentRequirement(input: InputOf<typeof Ops.setDocumentRequirement>): Promise<ActionResult>;
  removeBidDocument(input: InputOf<typeof Ops.removeBidDocument>): Promise<ActionResult>;
  submitDocumentForReview(input: InputOf<typeof Ops.submitDocumentForReview>): Promise<ActionResult>;
  createDocumentVersion(input: InputOf<typeof Ops.createDocumentVersion>): Promise<ActionResult>;
  reviewDocument(input: InputOf<typeof Ops.reviewDocument>): Promise<ActionResult>;
  markDocumentsApproved(input: InputOf<typeof Ops.markDocumentsApproved>): Promise<ActionResult>;
  decideFinalBidApproval(input: InputOf<typeof Ops.decideFinalBidApproval>): Promise<ActionResult>;

  // Client submission and response
  recordSubmission(input: InputOf<typeof Ops.recordSubmission>): Promise<ActionResult>;
  createFollowUpTask(input: InputOf<typeof Ops.createFollowUpTask>): Promise<ActionResult>;
  completeFollowUpTask(input: InputOf<typeof Ops.completeFollowUpTask>): Promise<ActionResult>;
  reopenFollowUpTask(input: InputOf<typeof Ops.reopenFollowUpTask>): Promise<ActionResult>;
  recordClientResponse(input: InputOf<typeof Ops.recordClientResponse>): Promise<ActionResult>;

  // Award, work order and handover
  generateWorkOrder(input: InputOf<typeof Ops.generateWorkOrder>): Promise<ActionResult & { workOrderId?: Id }>;
  updateWorkOrder(input: InputOf<typeof Ops.updateWorkOrder>): Promise<ActionResult>;
  finalizeWorkOrder(input: InputOf<typeof Ops.finalizeWorkOrder>): Promise<ActionResult>;
  recordKickoff(input: InputOf<typeof Ops.recordKickoff>): Promise<ActionResult>;
  addActionItem(input: InputOf<typeof Ops.addActionItem>): Promise<ActionResult>;
  setActionItemStatus(input: InputOf<typeof Ops.setActionItemStatus>): Promise<ActionResult>;
  appointPcp(input: InputOf<typeof Ops.appointPcp>): Promise<ActionResult>;
  recordPurchaseOrder(input: InputOf<typeof Ops.recordPurchaseOrder>): Promise<ActionResult>;
  toggleHandoverAcknowledgement(
    input: InputOf<typeof Ops.toggleHandoverAcknowledgement>,
  ): Promise<ActionResult>;
  completeHandover(input: InputOf<typeof Ops.completeHandover>): Promise<ActionResult>;

  markNotificationsRead(role: DemoRole): Promise<ActionResult>;
}
