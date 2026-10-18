/**
 * Radwa Gulf and Co — employee leave and movement.
 *
 * The workbook's `EMPLOYEE Leave` and `employee movement` sheets. Separate
 * from `./hr.ts`, which holds the employee record itself: a person is one
 * thing, and what happens to them over time is another.
 *
 * NOT BUILT, and deliberately
 *   The leave sheet's third zone (rows 15–19) is tool and equipment issuance —
 *   welding machines, hammers, what came back damaged. Different subject,
 *   different lifecycle, and it belongs with asset tracking rather than with
 *   leave. The one part of it that bears on a leave, "issued materials
 *   returned", is kept here as a yes/no on the leave record, which is how the
 *   sheet uses it too.
 */

import type { Id, IsoDate, IsoTimestamp } from "./types";

/* ======================================================= employee leave === */

export const LEAVE_TYPES = ["ANNUAL", "EXIT", "EMERGENCY", "INTERIM", "SICK"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  EXIT: "Exit / final leave",
  EMERGENCY: "Emergency",
  INTERIM: "Interim",
  SICK: "Sick",
};

/**
 * Where a leave has got to.
 *
 * The sheet records requested dates and approved dates in separate columns
 * precisely because they differ. A status that cannot tell "asked for" from
 * "granted" from "actually gone" throws that away, so these are distinct.
 */
export const LEAVE_STATUSES = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "DEPARTED",
  "RETURNED",
  "CANCELLED",
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DEPARTED: "On leave",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

export type HrTone = "neutral" | "info" | "warn" | "ok" | "bad";

export const LEAVE_STATUS_TONES: Record<LeaveStatus, HrTone> = {
  REQUESTED: "warn",
  APPROVED: "info",
  REJECTED: "bad",
  DEPARTED: "info",
  RETURNED: "ok",
  CANCELLED: "neutral",
};

/** Who pays for the flight (sheet column Z). */
export const TICKET_PAYEES = ["COMPANY", "EMPLOYEE"] as const;
export type TicketPayee = (typeof TICKET_PAYEES)[number];

export const TICKET_PAYEE_LABELS: Record<TicketPayee, string> = {
  COMPANY: "Company",
  EMPLOYEE: "Employee",
};

/** Sheet rows 11–13: how the return flight actually went. */
export const ARRIVAL_STATUSES = ["ON_TIME", "POSTPONED", "TICKET_CANCELLED"] as const;
export type ArrivalStatus = (typeof ARRIVAL_STATUSES)[number];

export const ARRIVAL_STATUS_LABELS: Record<ArrivalStatus, string> = {
  ON_TIME: "Arrived as planned",
  POSTPONED: "Postponed",
  TICKET_CANCELLED: "Ticket cancelled",
};

/** The TRAVEL block, for one direction of the trip. */
export interface LeaveTravelLeg {
  ticketDate?: IsoDate;
  airline?: string;
  flightNumber?: string;
  fromPort?: string;
  toPort?: string;
  transitAirport?: string;
  pnr?: string;
  agencyName?: string;
  /** SAR. */
  ticketFare?: number;
}

export interface LeaveRequest {
  id: Id;
  employeeId: Id;
  /** Readable reference — LV-<year>-0001. */
  reference: string;

  leaveType: LeaveType;
  status: LeaveStatus;

  /* what was asked for */
  requestedStartDate: IsoDate;
  requestedReturnDate: IsoDate;
  requestedDays: number;
  reason?: string;
  /** When HR keyed the record in. */
  requestedAt: IsoTimestamp;
  /** Who asked for the leave, and when they asked — not when HR typed it. */
  requestedByName?: string;
  requestedOnDate?: IsoDate;

  /**
   * The PCP whose approval this needs: the one running the project the
   * employee is posted to. Undefined when the employee is on standby, in
   * which case there is no project to ask and HR decides.
   */
  approverPcpId?: Id;

  /* whether a stand-in is needed while they are away */
  replacementRequired: boolean;
  replacementEmployeeId?: Id;

  /* what was granted — separate from what was asked, as on the sheet */
  approvedStartDate?: IsoDate;
  approvedReturnDate?: IsoDate;
  approvedDays?: number;
  approverId?: Id;
  decidedAt?: IsoTimestamp;
  decisionNote?: string;

  /* going */
  departureDate?: IsoDate;
  ticketPayee?: TicketPayee;
  issuedItemsReturned?: boolean;
  outboundTravel?: LeaveTravelLeg;

  /* coming back */
  actualReturnDate?: IsoDate;
  arrivalStatus?: ArrivalStatus;
  returnTravel?: LeaveTravelLeg;

  /* extension */
  extensionRequested?: boolean;
  extensionDays?: number;
  extensionReason?: string;
  extensionApproved?: boolean;

  updatedAt: IsoTimestamp;
  updatedBy: Id;
}

/* ------------------------------------------------------------ date maths -- */

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from?: IsoDate, to?: IsoDate): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The date the employee is actually due back, extension included. */
export function dueBackDate(leave: LeaveRequest): IsoDate | undefined {
  if (!leave.approvedReturnDate) return undefined;
  return leave.extensionApproved && leave.extensionDays
    ? addDays(leave.approvedReturnDate, leave.extensionDays)
    : leave.approvedReturnDate;
}

/**
 * Days late back, or 0 — the sheet's "Overstayed days".
 *
 * Measured against the *approved* return date plus any granted extension,
 * never against what was requested. Those are separate columns on the sheet
 * for exactly this reason: an employee who asked for 30 days, was granted 21,
 * and came back on day 25 has overstayed by 4, not been early by 5.
 */
export function overstayDays(leave: LeaveRequest): number {
  const due = dueBackDate(leave);
  if (!leave.actualReturnDate || !due) return 0;
  const over = daysBetween(due, leave.actualReturnDate) ?? 0;
  return over > 0 ? over : 0;
}

/** Away, and past the date they were due back. */
export function isLeaveOverdue(leave: LeaveRequest, today: IsoDate): boolean {
  if (leave.status !== "DEPARTED") return false;
  const due = dueBackDate(leave);
  return Boolean(due && today > due);
}

/* ==================================================== employee movement === */

/**
 * Moving someone between work orders.
 *
 * The sheet's shape says what matters: the present posting and the new one sit
 * side by side (columns H–K and L–O), and the dates run requested → agreed →
 * actually released → arrived on site. Each is its own column because in
 * practice they are different days, and the gap between them is the thing a
 * project manager spends their week chasing.
 */

export const MOVEMENT_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "REJECTED",
  "RELEASED",
  "ARRIVED",
  "CANCELLED",
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export const MOVEMENT_STATUS_LABELS: Record<MovementStatus, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  RELEASED: "Released",
  ARRIVED: "Arrived at site",
  CANCELLED: "Cancelled",
};

export const MOVEMENT_STATUS_TONES: Record<MovementStatus, HrTone> = {
  REQUESTED: "warn",
  ACCEPTED: "info",
  REJECTED: "bad",
  RELEASED: "info",
  ARRIVED: "ok",
  CANCELLED: "neutral",
};

/** Sheet column R — why the employee is being asked for. */
export const RELEASE_REASONS = [
  "PROJECT_ASSIGNMENT",
  "LEAVE",
  "VACATION",
  "WORK_COMPLETE",
  "OTHER",
] as const;
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

export const RELEASE_REASON_LABELS: Record<ReleaseReason, string> = {
  PROJECT_ASSIGNMENT: "Project assignment",
  LEAVE: "Leave",
  VACATION: "Vacation",
  WORK_COMPLETE: "Work completed",
  OTHER: "Other",
};

/** Sheet column Y. */
export const WORK_STATUSES = ["WORKING_AT_SITE", "STANDBY", "NO_DOCUMENTS", "WORK_COMPLETE"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  WORKING_AT_SITE: "Working at site",
  STANDBY: "Standby",
  NO_DOCUMENTS: "No documents",
  WORK_COMPLETE: "Work complete",
};

/** Sheet column AG. */
export const TRANSPORT_MODES = ["COMPANY_CAR", "BUS", "FLIGHT", "OTHER"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  COMPANY_CAR: "Company car",
  BUS: "Bus",
  FLIGHT: "Flight",
  OTHER: "Other",
};

/**
 * Where an employee is posted.
 *
 * `workOrderId` links to the tender side's awarded work when there is one;
 * the text fields carry the rest, because the sheet records client, project
 * and site as names and a posting can exist before a work order does.
 */
export interface Posting {
  workOrderId?: Id;
  workOrderNumber?: string;
  client?: string;
  project?: string;
  site?: string;
}

export function describePosting(posting: Posting): string {
  const parts = [posting.workOrderNumber, posting.client, posting.project, posting.site].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Not recorded";
}

export interface EmployeeMovement {
  id: Id;
  employeeId: Id;
  /** Readable reference — MV-<year>-0001. */
  reference: string;

  status: MovementStatus;

  /** Where they are now, captured when the request is made. */
  from: Posting;
  /** Where they are wanted. */
  to: Posting;

  /* the ask */
  requestedBy: string;
  requestedDate: IsoDate;
  reason: ReleaseReason;
  reasonNote?: string;
  /** When the receiving project needs them. */
  requiredByDate?: IsoDate;
  /** Days the receiving project expects to keep them. */
  assignmentDays?: number;

  /**
   * The PCP who must release the employee — the one running the project they
   * are currently posted to. Undefined when the employee is on standby:
   * nobody holds them, so there is nobody to ask.
   */
  approverPcpId?: Id;
  /** True when there was no holding PCP and the request needed no release. */
  autoAccepted?: boolean;

  /* the decision, by whoever currently holds them */
  projectInChargeName?: string;
  agreedReleaseDate?: IsoDate;
  decidedAt?: IsoTimestamp;
  decisionNote?: string;

  /* what actually happened */
  actualReleaseDate?: IsoDate;
  arrivedAtSiteDate?: IsoDate;
  transportMode?: TransportMode;
  workStatus?: WorkStatus;
  statusReason?: string;
  handoverNote?: string;
  replacementRequired?: boolean;

  /** Forecast release from the new posting — the sheet's planned release. */
  plannedReleaseDate?: IsoDate;

  createdAt: IsoTimestamp;
  createdBy: Id;
  updatedAt: IsoTimestamp;
  updatedBy: Id;
}

/**
 * On site past the date they were forecast to be released.
 *
 * The sheet calls this "Assignment Overdue" and flags it with a notification.
 * It is the number a project manager actually chases: someone lent out and not
 * given back.
 */
export function isAssignmentOverdue(movement: EmployeeMovement, today: IsoDate): boolean {
  if (movement.status !== "ARRIVED" || !movement.plannedReleaseDate) return false;
  return today > movement.plannedReleaseDate;
}
