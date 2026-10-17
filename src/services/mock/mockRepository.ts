"use client";

/**
 * Radwa Gulf and Co — mock repository.
 *
 * Implements `RadwaRepository` by running the pure operations in
 * `../operations.ts` against the in-memory demo database held by the zustand
 * store. Nothing here touches the network.
 *
 * Screens never import operations or the store's `dispatch` directly: they call
 * `useRepository()`. That is what makes the backend swap a one-file change —
 * see `../api/apiClient.ts`.
 */

import type { DemoRole } from "@/domain/enums";
import type { ActionResult, DemoDatabase } from "@/domain/types";
import { useDemoStore } from "@/store/useDemoStore";
import * as ops from "../operations";
import type { RadwaRepository } from "../repository";
import type { OpContext } from "../operations";

/** Wrap one operation as an async repository method. */
function bind<I, R extends ActionResult>(
  op: (db: DemoDatabase, ctx: OpContext, input: I) => R,
): (input: I) => Promise<R> {
  return async (input: I) => useDemoStore.getState().dispatch(op, input);
}

export const mockRepository: RadwaRepository = {
  snapshot: async () => useDemoStore.getState().db,

  createEnquiry: bind(ops.createEnquiry),
  recordPursuitDecision: bind(ops.recordPursuitDecision),
  assignTeam: bind(ops.assignTeam),
  markTenderDocumentReviewed: bind(ops.markTenderDocumentReviewed),

  setSurveyRequirement: bind(ops.setSurveyRequirement),
  assignSurveyor: bind(ops.assignSurveyor),
  updateChecklistItem: bind(ops.updateChecklistItem),
  submitSurveyReport: bind(ops.submitSurveyReport),
  completeAndSubmitSurvey: bind(ops.completeAndSubmitSurvey),
  ruleOnChecklistException: bind(ops.ruleOnChecklistException),
  acceptSurveyReport: bind(ops.acceptSurveyReport),

  createEstimate: bind(ops.createEstimate),
  updateBoqLine: bind(ops.updateBoqLine),
  addBoqLine: bind(ops.addBoqLine),
  removeBoqLine: bind(ops.removeBoqLine),
  updateEstimateMeta: bind(ops.updateEstimateMeta),
  submitEstimateForApproval: bind(ops.submitEstimateForApproval),
  decideEstimateApproval: bind(ops.decideEstimateApproval),
  createEstimateRevision: bind(ops.createEstimateRevision),

  createBidPackage: bind(ops.createBidPackage),
  addBidDocument: bind(ops.addBidDocument),
  setDocumentRequirement: bind(ops.setDocumentRequirement),
  removeBidDocument: bind(ops.removeBidDocument),
  submitDocumentForReview: bind(ops.submitDocumentForReview),
  submitAllDraftDocuments: bind(ops.submitAllDraftDocuments),
  createDocumentVersion: bind(ops.createDocumentVersion),
  reviewDocument: bind(ops.reviewDocument),
  markDocumentsApproved: bind(ops.markDocumentsApproved),
  decideFinalBidApproval: bind(ops.decideFinalBidApproval),

  recordSubmission: bind(ops.recordSubmission),
  createFollowUpTask: bind(ops.createFollowUpTask),
  completeFollowUpTask: bind(ops.completeFollowUpTask),
  reopenFollowUpTask: bind(ops.reopenFollowUpTask),
  recordClientResponse: bind(ops.recordClientResponse),

  generateWorkOrder: bind(ops.generateWorkOrder),
  updateWorkOrder: bind(ops.updateWorkOrder),
  finalizeWorkOrder: bind(ops.finalizeWorkOrder),
  recordKickoff: bind(ops.recordKickoff),
  addActionItem: bind(ops.addActionItem),
  setActionItemStatus: bind(ops.setActionItemStatus),
  appointPcp: bind(ops.appointPcp),
  recordPurchaseOrder: bind(ops.recordPurchaseOrder),
  toggleHandoverAcknowledgement: bind(ops.toggleHandoverAcknowledgement),
  completeHandover: bind(ops.completeHandover),

  markNotificationsRead: async (role: DemoRole) =>
    useDemoStore.getState().dispatch(ops.markNotificationsRead, { role }),
};

/**
 * The repository the app runs on.
 *
 * To move onto the Laravel API, return `createApiRepository()` here instead —
 * every screen already awaits these methods, so no component changes.
 */
export function useRepository(): RadwaRepository {
  return mockRepository;
}
