/**
 * Radwa Gulf and Co — navigation map.
 *
 * One declaration drives the sidebar, the breadcrumb titles and the per-role
 * emphasis. `badge` returns the count of items waiting on the *current* role,
 * computed from the live demo data — never a static number.
 */

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileStack,
  Gauge,
  Handshake,
  ListChecks,
  Scale,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import type { DemoRole } from "@/domain/enums";
import type { DemoDatabase, Id } from "@/domain/types";
import {
  assignmentQueue,
  documentReviewQueue,
  estimateApprovalQueue,
  finalApprovalQueue,
  openFollowUpTasks,
  packageQueue,
  pursuitQueue,
  rejectedDocuments,
  surveyQueue,
  userById,
  awardQueue,
} from "@/store/selectors";
import { currentVersion } from "@/domain/rules";
import { expiringIqamas } from "@/services/hrOperations";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles for which this item is a primary daily destination. */
  primaryFor?: DemoRole[];
  /**
   * Who may see and open this page. An explicit allow-list, so the access
   * matrix can be read off this one file rather than inferred from a set of
   * exclusions. Omitted means every role.
   */
  roles?: DemoRole[];
  badge?: (db: DemoDatabase, role: DemoRole, actingUserId: Id) => number;
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: Gauge,
        description: "Role-specific queues and workflow summary",
      },
      {
        href: "/enquiries",
        roles: ["CRM_MANAGER", "MD"],
        label: "Enquiry Register",
        icon: ClipboardList,
        description: "Every enquiry with search and filters",
      },
      // Registering an enquiry is reached from the "Register enquiry" button on
      // the Enquiry Register itself, not from the sidebar — one entry point.
    ],
  },
  {
    label: "Qualify",
    items: [
      {
        href: "/pursuit",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Pursuit Decisions",
        icon: Scale,
        primaryFor: ["MD"],
        badge: (db) => pursuitQueue(db).length,
        description: "Management Team pursue / reject decisions",
      },
      {
        href: "/assignments",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Assignments",
        icon: Building2,
        primaryFor: ["CRM_MANAGER"],
        badge: (db) => assignmentQueue(db).length,
        description: "Assign the MCP and Estimator",
      },
      {
        href: "/surveys",
        roles: ["CRM_MANAGER", "MD", "MCP", "SURVEYOR", "ESTIMATOR"],
        label: "Site Surveys",
        icon: ClipboardCheck,
        primaryFor: ["SURVEYOR", "MCP"],
        badge: (db, role, userId) =>
          surveyQueue(db).filter((item) => {
            if (role === "SURVEYOR") {
              return (
                item.survey.surveyorId === userId &&
                (item.survey.status === "SCHEDULED" ||
                  item.survey.status === "IN_PROGRESS" ||
                  item.survey.status === "RETURNED_FOR_CLARIFICATION")
              );
            }
            if (role === "MCP") {
              return (
                item.survey.status === "REQUIRED_UNASSIGNED" ||
                (item.survey.status === "SUBMITTED" && item.enquiry.assignedMcpId === userId)
              );
            }
            return item.survey.status === "SUBMITTED" || item.survey.status === "REQUIRED_UNASSIGNED";
          }).length,
        description: "Checklists, exceptions and survey reports",
      },
    ],
  },
  {
    label: "Estimate & Bid",
    items: [
      {
        href: "/estimates",
        roles: ["CRM_MANAGER", "MD", "MCP", "ESTIMATOR"],
        label: "BOQ & Estimates",
        icon: FileStack,
        primaryFor: ["ESTIMATOR"],
        badge: (db, role, userId) =>
          db.estimates.filter(
            (e) =>
              (e.status === "DRAFT" || e.status === "REJECTED") &&
              (role !== "ESTIMATOR" || db.enquiries.find((x) => x.id === e.enquiryId)?.assignedEstimatorId === userId),
          ).length,
        description: "Bill of quantities and quotation workspace",
      },
      {
        href: "/estimates/approvals",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Estimate Approvals",
        icon: ShieldCheck,
        primaryFor: ["MD"],
        badge: (db, role, userId) => estimateApprovalQueue(db, role === "MD" ? userId : undefined).length,
        description: "MD and responsible-manager approval",
      },
      {
        href: "/bid-packages",
        roles: ["CRM_MANAGER", "MD", "MCP", "ESTIMATOR"],
        label: "Bid Packages",
        icon: FileCheck2,
        primaryFor: ["ESTIMATOR", "CRM_MANAGER"],
        badge: (db, role, userId) => {
          if (role === "ESTIMATOR") return rejectedDocuments(db, userId).length;
          if (role === "CRM_MANAGER") return packageQueue(db).filter((p) => p.canVerify).length;
          return packageQueue(db).filter((p) => !p.completeness.complete).length;
        },
        description: "Assemble documents and verify completeness",
      },
      {
        href: "/document-reviews",
        roles: ["CRM_MANAGER", "MD", "MCP", "DEPARTMENT_REVIEWER"],
        label: "Document Reviews",
        icon: ListChecks,
        primaryFor: ["DEPARTMENT_REVIEWER"],
        badge: (db, role, userId) => {
          const department = role === "DEPARTMENT_REVIEWER" ? userById(db, userId)?.department : undefined;
          return documentReviewQueue(db, department).length;
        },
        description: "Departmental approve / reject queue",
      },
      {
        href: "/final-approvals",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Final Bid Approval",
        icon: Scale,
        primaryFor: ["MD"],
        badge: (db, role, userId) => finalApprovalQueue(db, role === "MD" ? userId : undefined).length,
        description: "Management decision on the complete package",
      },
    ],
  },
  {
    label: "Client & Award",
    items: [
      {
        href: "/submissions",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Submission & Follow-up",
        icon: Send,
        primaryFor: ["MCP"],
        badge: (db, role, userId) => openFollowUpTasks(db, role === "MCP" ? userId : undefined).length,
        description: "Submit proposals, follow up, record responses",
      },
      {
        href: "/work-orders",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Work Orders",
        icon: CalendarCheck2,
        primaryFor: ["CRM_MANAGER"],
        badge: (db) => awardQueue(db).filter((a) => !a.workOrder || a.workOrder.status === "DRAFT").length,
        description: "Draft, review and finalize work orders",
      },
      {
        href: "/handover",
        roles: ["CRM_MANAGER", "MD", "MCP"],
        label: "Kickoff & Handover",
        icon: Handshake,
        primaryFor: ["CRM_MANAGER", "MCP"],
        badge: (db) =>
          awardQueue(db).filter((a) => a.workOrder?.status === "FINALIZED" || a.handoverReady).length,
        description: "Kickoff minutes, PCP, PO and Operations handover",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/hr/employees",
        // HR owns this; the MD sees it read-only. Nobody else has a reason to
        // read salaries and passport numbers, so nobody else can open it.
        roles: ["HR", "MD"],
        label: "Employee Register",
        icon: Users,
        primaryFor: ["HR"],
        // Counts the deadline HR actually chases: an iqama about to lapse
        // stops someone working.
        badge: (db) => expiringIqamas(db).length,
        description: "Joining records, pay and contract details",
      },
      {
        href: "/hr/employees/new",
        roles: ["HR"],
        label: "Employee Joining",
        icon: UserPlus,
        description: "Register a newly joined employee",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** May this role see and open this page? */
export function canRoleAccess(item: NavItem, role: DemoRole): boolean {
  return !item.roles || item.roles.includes(role);
}

/**
 * Guard for direct URL access.
 *
 * Matches the pathname against a nav item **exactly**, never a prefix: an
 * Estimator has no Enquiry Register page but must still be able to open an
 * individual enquiry at `/enquiries/<id>` from their own queues. Only the
 * landing pages are gated.
 */
export function canAccessPath(pathname: string, role: DemoRole): boolean {
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.href === pathname);
  return item ? canRoleAccess(item, role) : true;
}

/** Longest matching nav href, so `/enquiries/new` beats `/enquiries`. */
export function navItemForPath(pathname: string): NavItem | undefined {
  return [...ALL_NAV_ITEMS]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const match = navItemForPath(pathname);
  return match?.href === item.href;
}

/** Count of documents in the reviewer's own department, for the topbar hint. */
export function pendingForDepartmentReviewer(db: DemoDatabase, userId: Id): number {
  const department = userById(db, userId)?.department;
  if (!department) return 0;
  return db.bidPackageDocuments.filter(
    (doc) => doc.department === department && currentVersion(doc)?.reviewStatus === "PENDING_REVIEW",
  ).length;
}
