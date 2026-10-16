"use client";

/**
 * Radwa Gulf and Co — status indicators.
 *
 * One place maps every domain status to a label and a colour tone, so the same
 * status never looks different on two screens.
 */

import * as React from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";

import {
  APPROVAL_DECISION_LABELS,
  BID_PACKAGE_STATUS_LABELS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CLIENT_RESPONSE_LABELS,
  ESTIMATE_STATUS_LABELS,
  EXCEPTION_RULING_LABELS,
  PO_STATUS_LABELS,
  PRIORITY_LABELS,
  REVISION_CLASS_LABELS,
  REVISION_STATUS_LABELS,
  STAGE_LABELS,
  SUBMISSION_STATUS_LABELS,
  SURVEY_STATUS_LABELS,
  TASK_STATUS_LABELS,
  VERSION_REVIEW_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type ApprovalDecision,
  type BidPackageStatus,
  type ChecklistItemStatus,
  type ClientResponseType,
  type EnquiryStage,
  type EstimateStatus,
  type ExceptionRuling,
  type PoStatus,
  type Priority,
  type RevisionClass,
  type RevisionStatus,
  type SubmissionStatus,
  type SurveyStatus,
  type TaskStatus,
  type VersionReviewStatus,
  type WorkOrderStatus,
} from "@/domain/enums";
import { describeDeadline, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/primitives";

const STAGE_TONES: Record<EnquiryStage, BadgeTone> = {
  PURSUIT_DECISION: "accent",
  AWAITING_ASSIGNMENT: "accent",
  DOCUMENT_REVIEW: "info",
  SITE_SURVEY: "info",
  ESTIMATION: "info",
  ESTIMATE_APPROVAL: "warn",
  BID_PACKAGE_PREPARATION: "info",
  DEPARTMENTAL_REVIEW: "warn",
  DOCUMENTS_APPROVED: "ok",
  FINAL_BID_APPROVAL: "warn",
  CLIENT_SUBMISSION: "brand",
  AWAITING_CLIENT_RESPONSE: "brand",
  REVISION_REQUESTED: "warn",
  AWARDED: "ok",
  WORK_ORDER_FINALIZED: "ok",
  KICKOFF_COMPLETE: "ok",
  PCP_APPOINTED: "ok",
  READY_FOR_HANDOVER: "ok",
  HANDED_OVER: "neutral",
  LOST: "bad",
  VOID: "neutral",
};

export function StageBadge({ stage, className }: { stage: EnquiryStage; className?: string }) {
  return (
    <Badge tone={STAGE_TONES[stage]} className={className} dot>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warn",
  CRITICAL: "bad",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "NORMAL" || priority === "LOW") {
    return <span className="text-2xs text-ink-500">{PRIORITY_LABELS[priority]}</span>;
  }
  return <Badge tone={PRIORITY_TONES[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

const REVIEW_TONES: Record<VersionReviewStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
};

export function ReviewStatusBadge({ status }: { status: VersionReviewStatus }) {
  return <Badge tone={REVIEW_TONES[status]}>{VERSION_REVIEW_STATUS_LABELS[status]}</Badge>;
}

const ESTIMATE_TONES: Record<EstimateStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
  SUPERSEDED: "neutral",
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return <Badge tone={ESTIMATE_TONES[status]}>{ESTIMATE_STATUS_LABELS[status]}</Badge>;
}

const APPROVAL_TONES: Record<ApprovalDecision, BadgeTone> = {
  PENDING: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
};

export function ApprovalBadge({ decision }: { decision: ApprovalDecision }) {
  return <Badge tone={APPROVAL_TONES[decision]}>{APPROVAL_DECISION_LABELS[decision]}</Badge>;
}

const SURVEY_TONES: Record<SurveyStatus, BadgeTone> = {
  NOT_REQUIRED: "neutral",
  REQUIRED_UNASSIGNED: "accent",
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  SUBMITTED: "warn",
  RETURNED_FOR_CLARIFICATION: "bad",
  ACCEPTED: "ok",
};

export function SurveyStatusBadge({ status }: { status: SurveyStatus }) {
  return <Badge tone={SURVEY_TONES[status]}>{SURVEY_STATUS_LABELS[status]}</Badge>;
}

const CHECKLIST_TONES: Record<ChecklistItemStatus, BadgeTone> = {
  PENDING: "neutral",
  COMPLETE: "ok",
  INCOMPLETE: "bad",
};

export function ChecklistStatusBadge({ status }: { status: ChecklistItemStatus }) {
  return <Badge tone={CHECKLIST_TONES[status]}>{CHECKLIST_ITEM_STATUS_LABELS[status]}</Badge>;
}

const EXCEPTION_TONES: Record<ExceptionRuling, BadgeTone> = {
  PENDING: "warn",
  ACCEPTED: "ok",
  RETURNED: "bad",
};

export function ExceptionRulingBadge({ ruling }: { ruling: ExceptionRuling }) {
  return <Badge tone={EXCEPTION_TONES[ruling]}>{EXCEPTION_RULING_LABELS[ruling]}</Badge>;
}

const PACKAGE_TONES: Record<BidPackageStatus, BadgeTone> = {
  PREPARING: "neutral",
  IN_DEPARTMENTAL_REVIEW: "warn",
  DOCUMENTS_APPROVED: "ok",
  PENDING_FINAL_APPROVAL: "warn",
  APPROVED_FOR_SUBMISSION: "ok",
  RETURNED_FOR_CORRECTION: "bad",
};

export function PackageStatusBadge({ status }: { status: BidPackageStatus }) {
  return <Badge tone={PACKAGE_TONES[status]}>{BID_PACKAGE_STATUS_LABELS[status]}</Badge>;
}

const SUBMISSION_TONES: Record<SubmissionStatus, BadgeTone> = {
  NOT_SUBMITTED: "neutral",
  SUBMITTED_ON_TIME: "ok",
  SUBMITTED_LATE: "warn",
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge tone={SUBMISSION_TONES[status]}>{SUBMISSION_STATUS_LABELS[status]}</Badge>;
}

const RESPONSE_TONES: Record<ClientResponseType, BadgeTone> = {
  REVISION_REQUESTED: "warn",
  REJECTED: "bad",
  AWARDED: "ok",
};

export function ClientResponseBadge({ response }: { response: ClientResponseType }) {
  return <Badge tone={RESPONSE_TONES[response]}>{CLIENT_RESPONSE_LABELS[response]}</Badge>;
}

const REVISION_CLASS_TONES: Record<RevisionClass, BadgeTone> = {
  MAJOR_COMMERCIAL: "bad",
  MAJOR_SCOPE: "bad",
  MAJOR_MATERIAL: "bad",
  MINOR_ADMIN: "neutral",
};

export function RevisionClassBadge({ revisionClass }: { revisionClass: RevisionClass }) {
  return <Badge tone={REVISION_CLASS_TONES[revisionClass]}>{REVISION_CLASS_LABELS[revisionClass]}</Badge>;
}

const REVISION_STATUS_TONES: Record<RevisionStatus, BadgeTone> = {
  OPEN: "accent",
  IN_PROGRESS: "info",
  PENDING_MANAGEMENT_APPROVAL: "warn",
  READY_TO_RESUBMIT: "ok",
  RESUBMITTED: "neutral",
};

export function RevisionStatusBadge({ status }: { status: RevisionStatus }) {
  return <Badge tone={REVISION_STATUS_TONES[status]}>{REVISION_STATUS_LABELS[status]}</Badge>;
}

const WO_TONES: Record<WorkOrderStatus, BadgeTone> = {
  DRAFT: "warn",
  FINALIZED: "ok",
  HANDED_OVER: "neutral",
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={WO_TONES[status]}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>;
}

const PO_TONES: Record<PoStatus, BadgeTone> = {
  PENDING: "warn",
  RECEIVED: "ok",
  PARTIAL: "info",
  EXPIRED: "bad",
  CANCELLED: "bad",
};

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return <Badge tone={PO_TONES[status]}>{PO_STATUS_LABELS[status]}</Badge>;
}

const TASK_TONES: Record<TaskStatus, BadgeTone> = {
  OPEN: "warn",
  DONE: "ok",
  CANCELLED: "neutral",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={TASK_TONES[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

/** Deadline with urgency colouring; neutral once the enquiry is closed. */
export function DeadlineCell({ date, closed }: { date: string; closed?: boolean }) {
  const days = daysUntil(date);
  const overdue = !closed && days !== null && days < 0;
  const urgent = !closed && days !== null && days >= 0 && days <= 7;

  return (
    <span className="inline-flex flex-col">
      <span className="numeric text-xs text-ink-700">{date}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-2xs",
          overdue ? "font-medium text-bad-600" : urgent ? "font-medium text-warn-600" : "text-ink-500",
        )}
      >
        {overdue ? <AlertTriangle className="size-3" aria-hidden /> : urgent ? <CalendarClock className="size-3" aria-hidden /> : null}
        {closed ? "Closed" : describeDeadline(date)}
      </span>
    </span>
  );
}
