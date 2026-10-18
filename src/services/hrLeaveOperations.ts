/**
 * Radwa Gulf and Co — leave and movement operations.
 *
 * Same contract as every other operation in this app: a pure function of
 * `(db, ctx, input)` that mutates the draft it is handed and returns an
 * `ActionResult`. The store clones before calling and commits only on success,
 * and the sync engine can replay them against another device's version.
 *
 * The guards here are the business rules, not decoration. Two leaves that
 * overlap, or a movement for someone who is abroad, are the kinds of mistake
 * that only surface when a man is standing at an airport.
 */

import type { DemoRole } from "@/domain/enums";
import type { ActionResult, DemoDatabase, Id } from "@/domain/types";
import type { OpContext } from "./operations";
import {
  addDays,
  daysBetween,
  dueBackDate,
  isAssignmentOverdue,
  isLeaveOverdue,
  overstayDays,
  type ArrivalStatus,
  type EmployeeMovement,
  type LeaveRequest,
  type LeaveTravelLeg,
  type LeaveType,
  type MovementStatus,
  type Posting,
  type ReleaseReason,
  type TicketPayee,
  type TransportMode,
  type WorkStatus,
} from "@/domain/hrLeave";
import { makeId } from "@/lib/utils";
import { todayIso } from "@/lib/dates";


/* ========================================================= who decides === */

/**
 * The PCP running the project an employee is currently posted to.
 *
 * Followed through the tender side: employee → work order → enquiry → the PCP
 * appointed at handover. Undefined when the employee is on standby — no
 * posting, no work order, or no PCP appointed yet — and standby is the case
 * that needs no release approval at all.
 */
export function holdingPcpFor(db: DemoDatabase, employeeId: Id): Id | undefined {
  const employee = db.employees.find((e) => e.id === employeeId);
  if (!employee?.assignedWorkOrderId) return undefined;

  const workOrder = db.workOrders.find((w) => w.id === employee.assignedWorkOrderId);
  if (!workOrder) return undefined;

  return db.pcpAppointments.find((p) => p.enquiryId === workOrder.enquiryId)?.appointeeId;
}

/** True when nobody is running a project this employee is posted to. */
export function isOnStandby(db: DemoDatabase, employeeId: Id): boolean {
  return holdingPcpFor(db, employeeId) === undefined;
}

/**
 * May this person decide this leave?
 *
 * The holding PCP decides. HR decides only when there is no holding PCP,
 * because otherwise nobody could. HR cannot overrule a PCP who does have the
 * employee — that would make the routing decorative.
 */
export function canDecideLeave(leave: LeaveRequest, actorId: Id, role: DemoRole): boolean {
  if (leave.approverPcpId) return actorId === leave.approverPcpId;
  return role === "HR";
}

export function canDecideMovement(movement: EmployeeMovement, actorId: Id, role: DemoRole): boolean {
  if (movement.approverPcpId) return actorId === movement.approverPcpId;
  return role === "HR";
}

/** Leave and movements this PCP has to decide on. */
export function awaitingPcp(db: DemoDatabase, pcpId: Id): {
  leave: LeaveRequest[];
  movements: EmployeeMovement[];
} {
  return {
    leave: db.leaveRequests.filter((l) => l.status === "REQUESTED" && l.approverPcpId === pcpId),
    movements: db.employeeMovements.filter(
      (m) => m.status === "REQUESTED" && m.approverPcpId === pcpId,
    ),
  };
}

/* ================================================================ leave === */

export interface LeaveRequestInput {
  employeeId: Id;
  leaveType: LeaveType;
  requestedStartDate: string;
  requestedReturnDate: string;
  reason?: string;
  replacementRequired: boolean;
  replacementEmployeeId?: Id;
  /** Who asked, and on what date — distinct from when HR keyed it in. */
  requestedByName?: string;
  requestedOnDate?: string;
}

/** Leaves that still tie the employee up — anything not finished or refused. */
const OPEN_LEAVE_STATUSES = ["REQUESTED", "APPROVED", "DEPARTED"] as const;

function isOpen(leave: LeaveRequest): boolean {
  return (OPEN_LEAVE_STATUSES as readonly string[]).includes(leave.status);
}

export function requestLeave(
  db: DemoDatabase,
  ctx: OpContext,
  input: LeaveRequestInput,
): ActionResult & { leaveId?: Id } {
  const fieldErrors: Record<string, string> = {};

  const employee = db.employees.find((e) => e.id === input.employeeId);
  if (!employee) return { ok: false, message: "That employee record no longer exists." };

  if (employee.status !== "ACTIVE") {
    return { ok: false, message: `${employee.name} is inactive and cannot be put on leave.` };
  }

  if (!input.requestedStartDate) fieldErrors.requestedStartDate = "A start date is required.";
  if (!input.requestedReturnDate) fieldErrors.requestedReturnDate = "A return date is required.";

  const days = daysBetween(input.requestedStartDate, input.requestedReturnDate);
  if (days !== null && days <= 0) {
    fieldErrors.requestedReturnDate = "The return date must be after the start date.";
  }

  if (input.requestedStartDate && input.requestedStartDate < employee.dateOfJoin) {
    fieldErrors.requestedStartDate = "Leave cannot start before the employee joined.";
  }

  // An employee cannot be in two places at once. Checked against the approved
  // dates where they exist and the requested ones otherwise, because an
  // approved leave is the one that will actually happen.
  const clash = db.leaveRequests.find((leave) => {
    if (leave.employeeId !== input.employeeId || !isOpen(leave)) return false;
    const start = leave.approvedStartDate ?? leave.requestedStartDate;
    const end = dueBackDate(leave) ?? leave.requestedReturnDate;
    return input.requestedStartDate <= end && input.requestedReturnDate >= start;
  });
  if (clash) {
    fieldErrors.requestedStartDate = `Overlaps ${clash.reference}, which runs to ${
      dueBackDate(clash) ?? clash.requestedReturnDate
    }.`;
  }

  if (input.replacementRequired && input.replacementEmployeeId === input.employeeId) {
    fieldErrors.replacementEmployeeId = "An employee cannot replace themselves.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const sequence = (db.sequences.leave ?? 0) + 1;
  db.sequences.leave = sequence;
  const now = new Date().toISOString();

  const leave: LeaveRequest = {
    id: makeId("lv"),
    employeeId: input.employeeId,
    reference: `LV-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, "0")}`,
    leaveType: input.leaveType,
    status: "REQUESTED",
    requestedStartDate: input.requestedStartDate,
    requestedReturnDate: input.requestedReturnDate,
    requestedDays: days ?? 0,
    reason: input.reason?.trim() || undefined,
    requestedAt: now,
    requestedByName: input.requestedByName?.trim() || employee.name,
    requestedOnDate: input.requestedOnDate || undefined,
    // Routed at the moment of raising, so a later change of posting cannot
    // move the decision out from under whoever is already considering it.
    approverPcpId: holdingPcpFor(db, input.employeeId),
    replacementRequired: input.replacementRequired,
    replacementEmployeeId: input.replacementRequired ? input.replacementEmployeeId : undefined,
    updatedAt: now,
    updatedBy: ctx.actorId,
  };

  db.leaveRequests.push(leave);
  return { ok: true, message: `${leave.reference} raised for ${employee.name}.`, leaveId: leave.id };
}

export interface LeaveDecisionInput {
  leaveId: Id;
  approve: boolean;
  /** Granted dates, which need not match what was requested. */
  approvedStartDate?: string;
  approvedReturnDate?: string;
  note?: string;
}

export function decideLeave(db: DemoDatabase, ctx: OpContext, input: LeaveDecisionInput): ActionResult {
  const leave = db.leaveRequests.find((l) => l.id === input.leaveId);
  if (!leave) return { ok: false, message: "That leave request no longer exists." };
  if (leave.status !== "REQUESTED") {
    return { ok: false, message: `${leave.reference} has already been decided.` };
  }
  if (!canDecideLeave(leave, ctx.actorId, ctx.actorRole)) {
    const holder = db.users.find((u) => u.id === leave.approverPcpId);
    return {
      ok: false,
      message: holder
        ? `Only ${holder.name}, the PCP for this employee's project, can decide ${leave.reference}.`
        : `${leave.reference} is not yours to decide.`,
    };
  }

  const now = new Date().toISOString();

  if (!input.approve) {
    if (!input.note?.trim()) {
      return {
        ok: false,
        message: "A reason is required.",
        fieldErrors: { note: "Say why the leave is refused." },
      };
    }
    leave.status = "REJECTED";
    leave.approverId = ctx.actorId;
    leave.decidedAt = now;
    leave.decisionNote = input.note.trim();
    leave.updatedAt = now;
    leave.updatedBy = ctx.actorId;
    return { ok: true, message: `${leave.reference} refused.` };
  }

  const start = input.approvedStartDate || leave.requestedStartDate;
  const end = input.approvedReturnDate || leave.requestedReturnDate;
  const days = daysBetween(start, end);

  if (days === null || days <= 0) {
    return {
      ok: false,
      message: "Check the approved dates.",
      fieldErrors: { approvedReturnDate: "The return date must be after the start date." },
    };
  }

  leave.status = "APPROVED";
  leave.approvedStartDate = start;
  leave.approvedReturnDate = end;
  leave.approvedDays = days;
  leave.approverId = ctx.actorId;
  leave.decidedAt = now;
  leave.decisionNote = input.note?.trim() || undefined;
  leave.updatedAt = now;
  leave.updatedBy = ctx.actorId;

  const changed = days !== leave.requestedDays;
  return {
    ok: true,
    message: changed
      ? `${leave.reference} approved for ${days} days — ${leave.requestedDays} were requested.`
      : `${leave.reference} approved for ${days} days.`,
  };
}

export interface LeaveDepartureInput {
  leaveId: Id;
  departureDate: string;
  ticketPayee?: TicketPayee;
  issuedItemsReturned: boolean;
  outboundTravel?: LeaveTravelLeg;
}

export function recordLeaveDeparture(
  db: DemoDatabase,
  ctx: OpContext,
  input: LeaveDepartureInput,
): ActionResult {
  const leave = db.leaveRequests.find((l) => l.id === input.leaveId);
  if (!leave) return { ok: false, message: "That leave request no longer exists." };
  if (leave.status !== "APPROVED") {
    return { ok: false, message: `${leave.reference} must be approved before departure is recorded.` };
  }
  if (!input.departureDate) {
    return {
      ok: false,
      message: "A departure date is required.",
      fieldErrors: { departureDate: "When did they leave?" },
    };
  }

  leave.status = "DEPARTED";
  leave.departureDate = input.departureDate;
  leave.ticketPayee = input.ticketPayee;
  leave.issuedItemsReturned = input.issuedItemsReturned;
  leave.outboundTravel = input.outboundTravel;
  leave.updatedAt = new Date().toISOString();
  leave.updatedBy = ctx.actorId;

  return { ok: true, message: `${leave.reference} — departure recorded.` };
}

export interface LeaveReturnInput {
  leaveId: Id;
  actualReturnDate: string;
  arrivalStatus?: ArrivalStatus;
  returnTravel?: LeaveTravelLeg;
}

export function recordLeaveReturn(db: DemoDatabase, ctx: OpContext, input: LeaveReturnInput): ActionResult {
  const leave = db.leaveRequests.find((l) => l.id === input.leaveId);
  if (!leave) return { ok: false, message: "That leave request no longer exists." };
  if (leave.status !== "DEPARTED") {
    return { ok: false, message: `${leave.reference} has not been recorded as departed.` };
  }
  if (!input.actualReturnDate) {
    return {
      ok: false,
      message: "A return date is required.",
      fieldErrors: { actualReturnDate: "When did they get back?" },
    };
  }
  if (leave.departureDate && input.actualReturnDate < leave.departureDate) {
    return {
      ok: false,
      message: "Check the return date.",
      fieldErrors: { actualReturnDate: "They cannot return before they departed." },
    };
  }

  leave.status = "RETURNED";
  leave.actualReturnDate = input.actualReturnDate;
  leave.arrivalStatus = input.arrivalStatus;
  leave.returnTravel = input.returnTravel;
  leave.updatedAt = new Date().toISOString();
  leave.updatedBy = ctx.actorId;

  const over = overstayDays(leave);
  return {
    ok: true,
    message: over > 0
      ? `${leave.reference} closed — ${over} day${over === 1 ? "" : "s"} overstayed.`
      : `${leave.reference} closed. Returned on time.`,
  };
}

export interface LeaveExtensionInput {
  leaveId: Id;
  extensionDays: number;
  reason: string;
  approve: boolean;
}

/**
 * Ask for, and settle, more days.
 *
 * Recorded as an extension rather than by editing the approved return date, so
 * the original grant stays visible and the overstay calculation keeps meaning
 * something.
 */
export function decideLeaveExtension(
  db: DemoDatabase,
  ctx: OpContext,
  input: LeaveExtensionInput,
): ActionResult {
  const leave = db.leaveRequests.find((l) => l.id === input.leaveId);
  if (!leave) return { ok: false, message: "That leave request no longer exists." };
  if (leave.status !== "DEPARTED" && leave.status !== "APPROVED") {
    return { ok: false, message: `${leave.reference} is not open for extension.` };
  }
  if (!(input.extensionDays > 0)) {
    return {
      ok: false,
      message: "Check the extension.",
      fieldErrors: { extensionDays: "Must be at least one day." },
    };
  }
  if (!input.reason?.trim()) {
    return {
      ok: false,
      message: "A reason is required.",
      fieldErrors: { extensionReason: "Say why the extension is needed." },
    };
  }

  leave.extensionRequested = true;
  leave.extensionDays = input.extensionDays;
  leave.extensionReason = input.reason.trim();
  leave.extensionApproved = input.approve;
  leave.updatedAt = new Date().toISOString();
  leave.updatedBy = ctx.actorId;

  if (!input.approve) {
    return { ok: true, message: `Extension on ${leave.reference} refused.` };
  }

  const due = dueBackDate(leave);
  return {
    ok: true,
    message: `${leave.reference} extended by ${input.extensionDays} days${due ? ` — due back ${due}` : ""}.`,
  };
}

export function cancelLeave(db: DemoDatabase, ctx: OpContext, input: { leaveId: Id }): ActionResult {
  const leave = db.leaveRequests.find((l) => l.id === input.leaveId);
  if (!leave) return { ok: false, message: "That leave request no longer exists." };
  if (leave.status === "DEPARTED" || leave.status === "RETURNED") {
    return { ok: false, message: "A leave that has already started cannot be cancelled." };
  }
  leave.status = "CANCELLED";
  leave.updatedAt = new Date().toISOString();
  leave.updatedBy = ctx.actorId;
  return { ok: true, message: `${leave.reference} cancelled.` };
}

/* ============================================================ movement === */

export interface MovementRequestInput {
  employeeId: Id;
  from: Posting;
  to: Posting;
  requestedBy: string;
  requestedDate: string;
  reason: ReleaseReason;
  reasonNote?: string;
  requiredByDate?: string;
  assignmentDays?: number;
  projectInChargeName?: string;
}

const OPEN_MOVEMENT_STATUSES = ["REQUESTED", "ACCEPTED", "RELEASED"] as const;

export function requestMovement(
  db: DemoDatabase,
  ctx: OpContext,
  input: MovementRequestInput,
): ActionResult & { movementId?: Id } {
  const employee = db.employees.find((e) => e.id === input.employeeId);
  if (!employee) return { ok: false, message: "That employee record no longer exists." };
  if (employee.status !== "ACTIVE") {
    return { ok: false, message: `${employee.name} is inactive and cannot be moved.` };
  }

  const fieldErrors: Record<string, string> = {};
  if (!input.requestedBy?.trim()) fieldErrors.requestedBy = "Who is asking for this employee?";
  if (!input.requestedDate) fieldErrors.requestedDate = "A request date is required.";
  if (!input.to.workOrderId && !input.to.project?.trim() && !input.to.site?.trim()) {
    fieldErrors.toProject = "Say where the employee is going.";
  }

  // One open movement at a time. Two projects both believing they have been
  // promised the same welder is the exact confusion this register exists to
  // prevent.
  const open = db.employeeMovements.find(
    (m) =>
      m.employeeId === input.employeeId &&
      (OPEN_MOVEMENT_STATUSES as readonly string[]).includes(m.status),
  );
  if (open) {
    return {
      ok: false,
      message: `${employee.name} already has an open movement (${open.reference}). Close it first.`,
    };
  }

  // Someone abroad cannot be released to a site.
  const away = db.leaveRequests.find((l) => l.employeeId === input.employeeId && l.status === "DEPARTED");
  if (away) {
    return {
      ok: false,
      message: `${employee.name} is on leave until ${dueBackDate(away) ?? "an unrecorded date"} (${away.reference}).`,
    };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const sequence = (db.sequences.movement ?? 0) + 1;
  db.sequences.movement = sequence;
  const now = new Date().toISOString();

  // A standby employee belongs to no project, so there is nobody to ask for
  // their release: the requesting PCP simply takes them. One with a posting
  // has to be released by the PCP running it.
  const approverPcpId = holdingPcpFor(db, input.employeeId);

  const movement: EmployeeMovement = {
    id: makeId("mv"),
    employeeId: input.employeeId,
    reference: `MV-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, "0")}`,
    status: approverPcpId ? "REQUESTED" : "ACCEPTED",
    approverPcpId,
    autoAccepted: !approverPcpId,
    agreedReleaseDate: approverPcpId ? undefined : input.requiredByDate || input.requestedDate,
    from: { ...input.from },
    to: { ...input.to },
    requestedBy: input.requestedBy.trim(),
    requestedDate: input.requestedDate,
    reason: input.reason,
    reasonNote: input.reasonNote?.trim() || undefined,
    requiredByDate: input.requiredByDate || undefined,
    assignmentDays: input.assignmentDays || undefined,
    projectInChargeName: input.projectInChargeName?.trim() || undefined,
    createdAt: now,
    createdBy: ctx.actorId,
    updatedAt: now,
    updatedBy: ctx.actorId,
  };

  db.employeeMovements.push(movement);

  const approver = db.users.find((u) => u.id === approverPcpId);
  return {
    ok: true,
    message: approver
      ? `${movement.reference} raised — waiting on ${approver.name} to release ${employee.name}.`
      : `${movement.reference} raised. ${employee.name} is on standby, so no release approval is needed.`,
    movementId: movement.id,
  };
}

export interface MovementDecisionInput {
  movementId: Id;
  accept: boolean;
  agreedReleaseDate?: string;
  note?: string;
}

/** The decision belongs to whoever currently holds the employee. */
export function decideMovement(
  db: DemoDatabase,
  ctx: OpContext,
  input: MovementDecisionInput,
): ActionResult {
  const movement = db.employeeMovements.find((m) => m.id === input.movementId);
  if (!movement) return { ok: false, message: "That movement no longer exists." };
  if (movement.status !== "REQUESTED") {
    return { ok: false, message: `${movement.reference} has already been decided.` };
  }
  if (!canDecideMovement(movement, ctx.actorId, ctx.actorRole)) {
    const holder = db.users.find((u) => u.id === movement.approverPcpId);
    return {
      ok: false,
      message: holder
        ? `Only ${holder.name}, the PCP holding this employee, can release them.`
        : `${movement.reference} is not yours to decide.`,
    };
  }

  const now = new Date().toISOString();

  if (!input.accept) {
    if (!input.note?.trim()) {
      return {
        ok: false,
        message: "A reason is required.",
        fieldErrors: { note: "Say why the release is refused." },
      };
    }
    movement.status = "REJECTED";
    movement.decidedAt = now;
    movement.decisionNote = input.note.trim();
    movement.updatedAt = now;
    movement.updatedBy = ctx.actorId;
    return { ok: true, message: `${movement.reference} refused.` };
  }

  if (!input.agreedReleaseDate) {
    return {
      ok: false,
      message: "An agreed release date is required.",
      fieldErrors: { agreedReleaseDate: "When will the employee be released?" },
    };
  }

  movement.status = "ACCEPTED";
  movement.agreedReleaseDate = input.agreedReleaseDate;
  movement.decidedAt = now;
  movement.decisionNote = input.note?.trim() || undefined;
  movement.updatedAt = now;
  movement.updatedBy = ctx.actorId;

  return { ok: true, message: `${movement.reference} accepted — release on ${input.agreedReleaseDate}.` };
}

export interface MovementReleaseInput {
  movementId: Id;
  actualReleaseDate: string;
  transportMode?: TransportMode;
  handoverNote?: string;
  replacementRequired?: boolean;
}

export function recordMovementRelease(
  db: DemoDatabase,
  ctx: OpContext,
  input: MovementReleaseInput,
): ActionResult {
  const movement = db.employeeMovements.find((m) => m.id === input.movementId);
  if (!movement) return { ok: false, message: "That movement no longer exists." };
  if (movement.status !== "ACCEPTED") {
    return { ok: false, message: `${movement.reference} must be accepted before release.` };
  }
  if (!input.actualReleaseDate) {
    return {
      ok: false,
      message: "A release date is required.",
      fieldErrors: { actualReleaseDate: "When were they actually released?" },
    };
  }

  movement.status = "RELEASED";
  movement.actualReleaseDate = input.actualReleaseDate;
  movement.transportMode = input.transportMode;
  movement.handoverNote = input.handoverNote?.trim() || undefined;
  movement.replacementRequired = input.replacementRequired;
  movement.updatedAt = new Date().toISOString();
  movement.updatedBy = ctx.actorId;

  const slip = daysBetween(movement.agreedReleaseDate, input.actualReleaseDate) ?? 0;
  return {
    ok: true,
    message: slip > 0
      ? `${movement.reference} released, ${slip} day${slip === 1 ? "" : "s"} later than agreed.`
      : `${movement.reference} released.`,
  };
}

export interface MovementArrivalInput {
  movementId: Id;
  arrivedAtSiteDate: string;
  workStatus: WorkStatus;
  statusReason?: string;
  plannedReleaseDate?: string;
}

/**
 * Arrival closes the movement and updates where the employee is posted.
 *
 * The employee's own `assignedWorkOrderId` is moved here rather than at
 * request time: until they are actually standing on the new site, the old
 * posting is still the true one.
 */
export function recordMovementArrival(
  db: DemoDatabase,
  ctx: OpContext,
  input: MovementArrivalInput,
): ActionResult {
  const movement = db.employeeMovements.find((m) => m.id === input.movementId);
  if (!movement) return { ok: false, message: "That movement no longer exists." };
  if (movement.status !== "RELEASED") {
    return { ok: false, message: `${movement.reference} has not been released yet.` };
  }
  if (!input.arrivedAtSiteDate) {
    return {
      ok: false,
      message: "An arrival date is required.",
      fieldErrors: { arrivedAtSiteDate: "When did they reach the site?" },
    };
  }
  if (movement.actualReleaseDate && input.arrivedAtSiteDate < movement.actualReleaseDate) {
    return {
      ok: false,
      message: "Check the arrival date.",
      fieldErrors: { arrivedAtSiteDate: "They cannot arrive before they were released." },
    };
  }

  movement.status = "ARRIVED";
  movement.arrivedAtSiteDate = input.arrivedAtSiteDate;
  movement.workStatus = input.workStatus;
  movement.statusReason = input.statusReason?.trim() || undefined;
  movement.plannedReleaseDate =
    input.plannedReleaseDate ||
    (movement.assignmentDays ? addDays(input.arrivedAtSiteDate, movement.assignmentDays) : undefined);
  movement.updatedAt = new Date().toISOString();
  movement.updatedBy = ctx.actorId;

  const employee = db.employees.find((e) => e.id === movement.employeeId);
  if (employee) {
    employee.assignedWorkOrderId = movement.to.workOrderId;
    employee.updatedAt = movement.updatedAt;
    employee.updatedBy = ctx.actorId;
  }

  return { ok: true, message: `${movement.reference} closed — arrived at site.` };
}

export function cancelMovement(db: DemoDatabase, ctx: OpContext, input: { movementId: Id }): ActionResult {
  const movement = db.employeeMovements.find((m) => m.id === input.movementId);
  if (!movement) return { ok: false, message: "That movement no longer exists." };
  if (movement.status === "ARRIVED") {
    return { ok: false, message: "A completed movement cannot be cancelled." };
  }
  movement.status = "CANCELLED";
  movement.updatedAt = new Date().toISOString();
  movement.updatedBy = ctx.actorId;
  return { ok: true, message: `${movement.reference} cancelled.` };
}

/* ============================================================ selectors === */

export function leaveFor(db: DemoDatabase, employeeId: Id): LeaveRequest[] {
  return db.leaveRequests
    .filter((l) => l.employeeId === employeeId)
    .sort((a, b) => b.requestedStartDate.localeCompare(a.requestedStartDate));
}

export function movementsFor(db: DemoDatabase, employeeId: Id): EmployeeMovement[] {
  return db.employeeMovements
    .filter((m) => m.employeeId === employeeId)
    .sort((a, b) => b.requestedDate.localeCompare(a.requestedDate));
}

/** Leave requests waiting on HR. */
export function pendingLeave(db: DemoDatabase): LeaveRequest[] {
  return db.leaveRequests.filter((l) => l.status === "REQUESTED");
}

/** Employees abroad right now. */
export function employeesOnLeave(db: DemoDatabase): LeaveRequest[] {
  return db.leaveRequests.filter((l) => l.status === "DEPARTED");
}

/** Away and past their due-back date — the number worth chasing. */
export function overdueReturns(db: DemoDatabase, today: IsoToday = todayIso()): LeaveRequest[] {
  return db.leaveRequests.filter((l) => isLeaveOverdue(l, today));
}

export function pendingMovements(db: DemoDatabase): EmployeeMovement[] {
  return db.employeeMovements.filter((m) => m.status === "REQUESTED");
}

export function overdueAssignments(db: DemoDatabase, today: IsoToday = todayIso()): EmployeeMovement[] {
  return db.employeeMovements.filter((m) => isAssignmentOverdue(m, today));
}

type IsoToday = string;

/**
 * Cumulative working and leave days, as the sheet's columns K and L.
 *
 * Working days count from the date of joining and exclude days actually spent
 * away, so the two figures together account for the whole employment.
 */
export function serviceSummary(
  db: DemoDatabase,
  employeeId: Id,
  today: IsoToday = todayIso(),
): { workingDays: number; leaveDays: number; lastReturn?: string } {
  const employee = db.employees.find((e) => e.id === employeeId);
  if (!employee) return { workingDays: 0, leaveDays: 0 };

  const taken = db.leaveRequests.filter(
    (l) => l.employeeId === employeeId && (l.status === "RETURNED" || l.status === "DEPARTED"),
  );

  // Only days that have actually elapsed count. A leave approved for next
  // month has not been taken yet, and counting it would report someone as
  // having served fewer days than they have — which is the figure indemnity
  // and leave salary are calculated from.
  const leaveDays = taken.reduce((total, leave) => {
    const start = leave.departureDate ?? leave.approvedStartDate;
    if (!start || start > today) return total;

    const end = leave.actualReturnDate ?? today;
    const countedEnd = end > today ? today : end;
    const span = daysBetween(start, countedEnd);
    return total + (span && span > 0 ? span : 0);
  }, 0);

  const employed = daysBetween(employee.dateOfJoin, today) ?? 0;
  const lastReturn = taken
    .map((l) => l.actualReturnDate)
    .filter(Boolean)
    .sort()
    .pop();

  return {
    workingDays: Math.max(0, employed - leaveDays),
    leaveDays,
    lastReturn: lastReturn ?? undefined,
  };
}

export type { MovementStatus };
