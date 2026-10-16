/**
 * Radwa Gulf and Co — configurable policy.
 *
 * Everything in this file is a business decision that the company may want to
 * change without touching workflow code. Rules that were *explicitly confirmed*
 * are implemented as hard requirements in `src/domain/rules.ts`; rules that were
 * left open are expressed here as defaults, each marked with its status:
 *
 *   CONFIRMED  — stated in the business requirements, safe to rely on.
 *   DEFAULT    — a reasonable demo choice; the business has not confirmed it.
 *
 * When the Laravel backend lands, this file is the natural seam to replace with
 * a `GET /api/v1/configuration` payload.
 */

import type { Department, RevisionClass } from "./enums";

/* ------------------------------------------------- management & approvals -- */

export const managementConfig = {
  /**
   * CONFIRMED: the Management Team is exactly three members, one of whom is the
   * MD. The MD is *not* a fourth member. Enforced by `assertManagementTeam`.
   */
  managementTeamSize: 3,
} as const;

export const estimateApprovalPolicy = {
  /**
   * CONFIRMED: the MD must approve the estimate.
   * CONFIRMED: the Management Team member responsible for the enquiry approves.
   *
   * Nothing beyond these two approvers is assumed. If the MD happens to be the
   * responsible manager, the approval list collapses to a single entry rather
   * than duplicating the requirement.
   */
  requireMd: true,
  requireResponsibleManager: true,
  /** DEFAULT: every listed approver must approve (unanimous), no quorum. */
  mode: "ALL_LISTED_APPROVERS" as "ALL_LISTED_APPROVERS" | "QUORUM",
} as const;

export const finalBidApprovalPolicy = {
  /**
   * CONFIRMED: final bid approval happens *after* CRM verifies that every
   * required document has current-version departmental approval.
   *
   * CONFIRMED: the main MD is the sole approver of every final bid, whichever
   * Management Team member the enquiry is assigned to. The other two members
   * do not vote at this stage — they take part in the pursuit decision and, as
   * the responsible manager, in estimate approval.
   *
   * To put the responsible manager back on the final-bid approval list, switch
   * `approvers` to "MAIN_MD_AND_RESPONSIBLE_MANAGER"; to require all three,
   * "MANAGEMENT_TEAM". `rules.finalBidApprovers` is the only reader.
   */
  approvers: "MAIN_MD" as
    | "MAIN_MD"
    | "MAIN_MD_AND_RESPONSIBLE_MANAGER"
    | "MANAGEMENT_TEAM",
  mode: "UNANIMOUS" as "UNANIMOUS" | "MAJORITY",
  /** Human-readable note rendered next to the approval panel. */
  note:
    "The main MD is the sole approver of every final bid. Change `finalBidApprovalPolicy.approvers` in src/domain/config.ts to involve the responsible manager or the full Management Team.",
} as const;

export const revisionPolicy = {
  /**
   * CONFIRMED: major commercial / scope / material revisions require management
   * approval before resubmission. Minor administrative-only changes do not.
   *
   * No numeric threshold is invented. The MCP classifies the revision when
   * recording the client request; the classification drives the requirement.
   */
  classesRequiringManagementApproval: [
    "MAJOR_COMMERCIAL",
    "MAJOR_SCOPE",
    "MAJOR_MATERIAL",
  ] as RevisionClass[],
  note:
    "The revision class is chosen by the MCP when recording the client request. No price or percentage threshold is applied — add one here if the business defines it later.",
} as const;

/* ------------------------------------------------------- work order no. --- */

export const workOrderNumberingConfig = {
  /**
   * ILLUSTRATIVE sample convention for the demo. A future administration module
   * should make the pattern configurable; `formatWorkOrderNumber` below is the
   * only place that reads it.
   *
   * Tokens: {PREFIX} {YYYY} {SEQ}
   */
  pattern: "{PREFIX}-{YYYY}-{SEQ}",
  prefix: "WO",
  sequencePadding: 4,
  /** Sequence restarts each calendar year. */
  resetAnnually: true,
  note:
    "Illustrative demo convention (WO-2026-0007). Work-order numbering must be administrator-configurable in the production system.",
} as const;

export function formatWorkOrderNumber(sequence: number, year: number): string {
  const { pattern, prefix, sequencePadding } = workOrderNumberingConfig;
  return pattern
    .replace("{PREFIX}", prefix)
    .replace("{YYYY}", String(year))
    .replace("{SEQ}", String(sequence).padStart(sequencePadding, "0"));
}

export const enquiryNumberingConfig = {
  pattern: "{PREFIX}-{YYYY}-{SEQ}",
  prefix: "ENQ",
  sequencePadding: 4,
} as const;

export function formatEnquiryReference(sequence: number, year: number): string {
  const { pattern, prefix, sequencePadding } = enquiryNumberingConfig;
  return pattern
    .replace("{PREFIX}", prefix)
    .replace("{YYYY}", String(year))
    .replace("{SEQ}", String(sequence).padStart(sequencePadding, "0"));
}

/* ------------------------------------------------ bid document catalogue -- */

/**
 * The master list of bid-package document types, with the department that owns
 * the review. Per the requirements, *not every document is mandatory for every
 * project* — each seeded enquiry selects a meaningful subset, and `isRequired`
 * is stored per project on `BidPackageDocument`, not here.
 *
 * `defaultRequired` is only the suggestion used when adding a document in the UI.
 */
export interface BidDocumentCatalogEntry {
  key: string;
  name: string;
  category:
    | "TECHNICAL"
    | "COMMERCIAL"
    | "PLANNING"
    | "PROCUREMENT"
    | "HSE"
    | "QUALITY"
    | "CORPORATE"
    | "CLOSEOUT";
  department: Department;
  defaultRequired: boolean;
}

export const BID_DOCUMENT_CATALOG: BidDocumentCatalogEntry[] = [
  { key: "TECHNICAL_PROPOSAL", name: "Technical Proposal", category: "TECHNICAL", department: "TECHNICAL", defaultRequired: true },
  { key: "COMMERCIAL_PROPOSAL", name: "Commercial Proposal", category: "COMMERCIAL", department: "COMMERCIAL", defaultRequired: true },
  { key: "BOQ", name: "Priced Bill of Quantities", category: "COMMERCIAL", department: "COMMERCIAL", defaultRequired: true },
  { key: "ITP", name: "Inspection & Test Plan (ITP)", category: "QUALITY", department: "QUALITY", defaultRequired: false },
  { key: "TESTING_PLAN", name: "Testing Plan", category: "QUALITY", department: "QUALITY", defaultRequired: false },
  { key: "TECHNICAL_QUERIES", name: "Technical Queries Register", category: "TECHNICAL", department: "TECHNICAL", defaultRequired: false },
  { key: "L3_SCHEDULE", name: "Level 3 Schedule", category: "PLANNING", department: "PLANNING", defaultRequired: true },
  { key: "MANPOWER_HISTOGRAM", name: "Manpower Histogram", category: "PLANNING", department: "PLANNING", defaultRequired: false },
  { key: "ORG_CHART", name: "Project Organization Chart", category: "CORPORATE", department: "HR_ADMIN", defaultRequired: true },
  { key: "PROCUREMENT_PLAN", name: "Procurement Plan", category: "PROCUREMENT", department: "PROCUREMENT", defaultRequired: false },
  { key: "MOBILIZATION_PLAN", name: "Mobilization Plan", category: "PLANNING", department: "PLANNING", defaultRequired: false },
  { key: "EQUIPMENT_LIST", name: "Equipment List", category: "PROCUREMENT", department: "PROCUREMENT", defaultRequired: false },
  { key: "SUBCONTRACTOR_LIST", name: "Subcontractor List", category: "PROCUREMENT", department: "PROCUREMENT", defaultRequired: false },
  { key: "MATERIAL_LIST", name: "Material List & Submittals", category: "PROCUREMENT", department: "PROCUREMENT", defaultRequired: false },
  { key: "HSE_PLAN", name: "HSE Plan", category: "HSE", department: "HSE", defaultRequired: true },
  { key: "RISK_ASSESSMENT", name: "Risk Assessment", category: "HSE", department: "HSE", defaultRequired: true },
  { key: "EMERGENCY_PLAN", name: "Emergency Response Plan", category: "HSE", department: "HSE", defaultRequired: false },
  { key: "QUALITY_PLAN", name: "Project Quality Plan", category: "QUALITY", department: "QUALITY", defaultRequired: true },
  { key: "QAQC_ORG", name: "QA/QC Organization", category: "QUALITY", department: "QUALITY", defaultRequired: false },
  { key: "WELDING_PROCEDURE", name: "Welding Procedures (WPS/PQR)", category: "TECHNICAL", department: "TECHNICAL", defaultRequired: false },
  { key: "NDT_PROCEDURE", name: "NDT Procedures", category: "QUALITY", department: "QUALITY", defaultRequired: false },
  { key: "COMMISSIONING_PLAN", name: "Testing & Commissioning Plan", category: "TECHNICAL", department: "TECHNICAL", defaultRequired: false },
  { key: "COMPANY_CREDENTIALS", name: "Company Credentials & Experience", category: "CORPORATE", department: "HR_ADMIN", defaultRequired: true },
  { key: "REFERENCES", name: "References & Certificates", category: "CORPORATE", department: "HR_ADMIN", defaultRequired: false },
  { key: "STATUTORY_ISO", name: "Statutory & ISO Documents", category: "CORPORATE", department: "HR_ADMIN", defaultRequired: true },
  { key: "DEMOBILIZATION_PLAN", name: "Demobilization Plan", category: "CLOSEOUT", department: "PLANNING", defaultRequired: false },
  { key: "PUNCHLIST_PLAN", name: "Punch-list & Handover Dossier Plan", category: "CLOSEOUT", department: "QUALITY", defaultRequired: false },
  { key: "CLIENT_SPECIFIC", name: "Other Client-Required Document", category: "CORPORATE", department: "TECHNICAL", defaultRequired: false },
];

export const bidDocumentCatalogByKey = new Map(BID_DOCUMENT_CATALOG.map((d) => [d.key, d]));

/* ----------------------------------------------- survey checklist template */

/**
 * DEMO checklist template, not a universal mandatory list. Per the requirements
 * the checklist is project-specific: `buildChecklistForProject` filters the
 * template by project type, and items can be added per survey.
 */
export interface SurveyChecklistTemplateItem {
  key: string;
  group: string;
  title: string;
  guidance?: string;
  /** Project types this item applies to; empty means all. */
  projectTypes?: string[];
}

export const SURVEY_CHECKLIST_TEMPLATE: SurveyChecklistTemplateItem[] = [
  { key: "ACCESS_ROUTE", group: "Site Access", title: "Vehicle access route and gate restrictions", guidance: "Record width, height and weight limits, and any escort requirement." },
  { key: "ACCESS_PERMITS", group: "Site Access", title: "Access permits and induction requirements" },
  { key: "LAYDOWN", group: "Site Access", title: "Laydown and storage area availability" },
  { key: "EXISTING_STRUCT", group: "Existing Infrastructure", title: "Condition of existing structures to be retained" },
  { key: "EXISTING_SERVICES", group: "Existing Infrastructure", title: "Buried and overhead services identified" },
  { key: "DEMOLITION", group: "Existing Infrastructure", title: "Demolition or removal scope confirmed" },
  { key: "DIM_CHECK", group: "Measurements", title: "Key dimensions verified against drawings", guidance: "Note any discrepancy against the tender drawings." },
  { key: "LEVELS", group: "Measurements", title: "Site levels and benchmark reference" },
  { key: "AREA_TAKEOFF", group: "Measurements", title: "Area / length take-off spot checks" },
  { key: "CRANE_ACCESS", group: "Equipment & Material Access", title: "Crane and heavy equipment positioning feasible" },
  { key: "MATERIAL_DELIVERY", group: "Equipment & Material Access", title: "Material delivery and offloading arrangement" },
  { key: "POWER_SUPPLY", group: "Utilities", title: "Temporary power source and capacity" },
  { key: "WATER_SUPPLY", group: "Utilities", title: "Temporary water supply" },
  { key: "DRAINAGE", group: "Utilities", title: "Drainage and dewatering requirement" },
  { key: "SAFETY_HAZARDS", group: "Safety Constraints", title: "Site-specific hazards and exclusion zones" },
  { key: "HOT_WORK", group: "Safety Constraints", title: "Hot-work and confined-space constraints", projectTypes: ["MECHANICAL", "PIPELINE", "FABRICATION", "MAINTENANCE"] },
  { key: "LIVE_PLANT", group: "Safety Constraints", title: "Live plant / shutdown window constraints", projectTypes: ["MECHANICAL", "PIPELINE", "MAINTENANCE", "ELECTRICAL"] },
  { key: "WORKING_HOURS", group: "Site Conditions", title: "Permitted working hours and noise restrictions" },
  { key: "GROUND_CONDITIONS", group: "Site Conditions", title: "Ground conditions and soil observations", projectTypes: ["CIVIL_CONSTRUCTION", "INFRASTRUCTURE", "PIPELINE"] },
  { key: "WEATHER_EXPOSURE", group: "Site Conditions", title: "Weather exposure and seasonal constraints" },
  { key: "PHOTOS_GENERAL", group: "Photographic Evidence", title: "General site photographs captured" },
  { key: "PHOTOS_DETAIL", group: "Photographic Evidence", title: "Detail photographs of critical interfaces" },
  { key: "CLIENT_REP", group: "Client & Site Representative", title: "Site representative briefing recorded" },
  { key: "CLIENT_EXPECTATIONS", group: "Client & Site Representative", title: "Client expectations and verbal clarifications noted" },
];

/**
 * Checklist for a project, given every discipline it covers.
 *
 * Discipline-specific items are unioned: a civil + mechanical package needs the
 * ground-conditions item *and* the hot-work item. Items keep their template
 * order so the checklist still reads in a sensible site sequence.
 */
export function buildChecklistTemplateForProject(
  projectTypes: readonly string[],
): SurveyChecklistTemplateItem[] {
  return SURVEY_CHECKLIST_TEMPLATE.filter(
    (item) => !item.projectTypes || item.projectTypes.some((type) => projectTypes.includes(type)),
  );
}

/* ------------------------------------------------------------- handover --- */

export const handoverPolicy = {
  /**
   * CONFIRMED items that block Operations handover. Rows the system cannot
   * derive (client contacts confirmed, revision history reviewed) are rendered
   * as explicit CRM acknowledgements rather than invented prerequisites.
   */
  requiredKeys: [
    "WORK_ORDER_FINALIZED",
    "AWARDED_SCOPE",
    "APPROVED_QUOTATION",
    "BID_DOCUMENTS_APPROVED",
    "PO_RECORDED",
    "CLIENT_CONTACTS",
    "PCP_APPOINTED",
    "KICKOFF_MINUTES",
  ] as const,
  /** Advisory rows: shown with status but do not block completion. */
  advisoryKeys: ["OUTSTANDING_ACTIONS", "REVISION_HISTORY"] as const,
  note:
    "Outstanding kickoff action items are shown but do not block handover — the business did not state that every action must close first.",
} as const;

/* -------------------------------------------------------------- display --- */

export const displayConfig = {
  defaultCurrency: "AED",
  /** Variance above this magnitude is highlighted in the BOQ workspace. */
  varianceAttentionPercent: 10,
  demoBannerText: "DEMO MODE — Sample Data",
} as const;
