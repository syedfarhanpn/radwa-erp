/**
 * Radwa Gulf and Co — starting dataset.
 *
 * The application starts with **no enquiries**. Only the reference data a user
 * needs in order to register one is present:
 *
 *   - the people directory (Management Team, CRM, MCPs, Estimators, Surveyors
 *     and the departmental reviewers) — see `./people.ts`;
 *   - the client and contact list, so an enquiry can be registered in a few
 *     clicks rather than retyping a client every time.
 *
 * Everything else — enquiries, BOQs, bid packages, surveys, work orders and the
 * activity trail — is created through the UI during a demo. There is no sample
 * workflow data to clear out or explain away.
 *
 * (An earlier build seeded eighteen fictional enquiries across every workflow
 * stage. That was removed at the business's request; it remains in the git
 * history if a pre-populated dataset is ever wanted again.)
 */

import type { DemoDatabase } from "@/domain/types";
import { DEMO_CLIENTS, DEMO_CONTACTS, DEMO_USERS } from "./people";

/**
 * Bump when the entity shape changes. Persisted demo state carrying a different
 * version is discarded on load rather than half-migrated.
 */
export const SCHEMA_VERSION = 5;

export function createSeedDatabase(): DemoDatabase {
  return {
    schemaVersion: SCHEMA_VERSION,
    // Copied so a reset cannot be affected by edits made in a previous session.
    users: DEMO_USERS.map((user) => ({ ...user })),
    clients: DEMO_CLIENTS.map((client) => ({ ...client })),
    contacts: DEMO_CONTACTS.map((contact) => ({ ...contact })),

    enquiries: [],
    pursuitDecisions: [],
    assignments: [],
    tenderDocuments: [],
    surveys: [],
    surveyChecklistItems: [],
    estimates: [],
    boqLineItems: [],
    estimateApprovals: [],
    bidPackages: [],
    bidPackageDocuments: [],
    managementApprovals: [],
    clientSubmissions: [],
    followUpTasks: [],
    clientResponses: [],
    revisionRequests: [],
    awards: [],
    workOrders: [],
    kickoffMeetings: [],
    actionItems: [],
    pcpAppointments: [],
    purchaseOrders: [],
    handovers: [],
    activities: [],
    notifications: [],
    employees: [],

    // Reference numbering starts from zero: the first enquiry registered is
    // ENQ-<year>-0001 and the first work order WO-<year>-0001.
    // Employee numbering starts at 1001, as in the business's HR workbook.
    sequences: { enquiry: 0, workOrder: 0, employee: 1000 },
  };
}
