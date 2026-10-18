/**
 * Radwa Gulf and Co — per-role record visibility.
 *
 * Estimators and MCPs see **only the enquiries assigned to them**. Everyone
 * else (CRM, Management Team, Surveyors, Departmental Reviewers) sees the whole
 * register; the Surveyor and Reviewer screens are already narrowed by their own
 * assignment and department.
 *
 * The scope is applied once, to the database the UI reads, rather than being
 * re-implemented as a filter on each screen. That way the register, the global
 * search, every queue, the dashboards, the activity feed and the notification
 * bell are all narrowed consistently — there is no screen left to forget.
 *
 * SECURITY NOTE: this is presentation scoping in a demo with no authentication.
 * It keeps an Estimator's screens relevant; it is **not** an access control.
 * The production backend must filter and authorize server-side, because a
 * client-side scope can always be bypassed.
 */

import type { DemoRole } from "@/domain/enums";
import type { DemoDatabase, Enquiry, Id } from "@/domain/types";

/** Roles whose view is narrowed to their own assignments. */
export const SCOPED_ROLES: DemoRole[] = ["ESTIMATOR", "MCP"];

export function isScopedRole(role: DemoRole): boolean {
  return SCOPED_ROLES.includes(role);
}

/** Can this viewer see this enquiry at all? */
export function canViewEnquiry(enquiry: Enquiry, role: DemoRole, userId: Id): boolean {
  if (role === "ESTIMATOR") return enquiry.assignedEstimatorId === userId;
  if (role === "MCP") return enquiry.assignedMcpId === userId;
  return true;
}

/** Human-readable explanation shown wherever the scope could look like a bug. */
export function describeScope(role: DemoRole): string | null {
  if (role === "ESTIMATOR") return "You are seeing only the enquiries assigned to you as Estimator.";
  if (role === "MCP") return "You are seeing only the enquiries assigned to you as MCP.";
  return null;
}

/* ------------------------------------------------------------- scoping --- */

function buildScope(db: DemoDatabase, role: DemoRole, userId: Id): DemoDatabase {
  const visible = new Set(
    db.enquiries.filter((e) => canViewEnquiry(e, role, userId)).map((e) => e.id),
  );

  const byEnquiry = <T extends { enquiryId: Id }>(rows: T[]): T[] =>
    rows.filter((row) => visible.has(row.enquiryId));

  const surveys = byEnquiry(db.surveys);
  const surveyIds = new Set(surveys.map((s) => s.id));
  const estimates = byEnquiry(db.estimates);
  const estimateIds = new Set(estimates.map((e) => e.id));

  return {
    schemaVersion: db.schemaVersion,
    // Reference data is never scoped: assigning work and reading the directory
    // require the full people and client lists.
    users: db.users,
    clients: db.clients,
    contacts: db.contacts,
    sequences: db.sequences,
    // The HR register is scoped by role, not by enquiry assignment: the roles
    // narrowed here (Estimator, MCP) cannot open it at all, so there is
    // nothing to filter.
    employees: db.employees,
    leaveRequests: db.leaveRequests,
    employeeMovements: db.employeeMovements,

    enquiries: db.enquiries.filter((e) => visible.has(e.id)),
    pursuitDecisions: byEnquiry(db.pursuitDecisions),
    assignments: byEnquiry(db.assignments),
    tenderDocuments: byEnquiry(db.tenderDocuments),

    surveys,
    surveyChecklistItems: db.surveyChecklistItems.filter((i) => surveyIds.has(i.surveyId)),

    estimates,
    boqLineItems: db.boqLineItems.filter((l) => estimateIds.has(l.estimateId)),
    estimateApprovals: byEnquiry(db.estimateApprovals),

    bidPackages: byEnquiry(db.bidPackages),
    bidPackageDocuments: byEnquiry(db.bidPackageDocuments),
    managementApprovals: byEnquiry(db.managementApprovals),

    clientSubmissions: byEnquiry(db.clientSubmissions),
    followUpTasks: byEnquiry(db.followUpTasks),
    clientResponses: byEnquiry(db.clientResponses),
    revisionRequests: byEnquiry(db.revisionRequests),

    awards: byEnquiry(db.awards),
    workOrders: byEnquiry(db.workOrders),
    kickoffMeetings: byEnquiry(db.kickoffMeetings),
    actionItems: byEnquiry(db.actionItems),
    pcpAppointments: byEnquiry(db.pcpAppointments),
    purchaseOrders: byEnquiry(db.purchaseOrders),
    handovers: byEnquiry(db.handovers),

    activities: byEnquiry(db.activities),
    // A notification not tied to an enquiry (a general announcement) stays.
    notifications: db.notifications.filter((n) => !n.enquiryId || visible.has(n.enquiryId)),
  };
}

/**
 * Memoised on the database reference.
 *
 * The store replaces `db` wholesale on every successful write, so reference
 * equality is a sound cache key and the scope is rebuilt exactly once per
 * change rather than once per component that reads it.
 */
let cache: { db: DemoDatabase; role: DemoRole; userId: Id; scoped: DemoDatabase } | null = null;

export function scopeDatabaseForViewer(db: DemoDatabase, role: DemoRole, userId: Id): DemoDatabase {
  if (!isScopedRole(role)) return db;
  if (cache && cache.db === db && cache.role === role && cache.userId === userId) {
    return cache.scoped;
  }
  const scoped = buildScope(db, role, userId);
  cache = { db, role, userId, scoped };
  return scoped;
}
