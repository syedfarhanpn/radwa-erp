/**
 * Demo directory: users, clients and contacts.
 *
 * Every person and company here is fictional. Reviewers and departments are
 * predefined for the demo — the department-configuration administration module
 * is intentionally out of scope for this phase.
 */

import type { Client, Contact, User } from "@/domain/types";

/* ------------------------------------------------------------- user ids --- */

export const USER_IDS = {
  // Management Team — exactly three members, one of whom is the MD.
  // Babukuttan is the main MD and the sole approver of every final bid.
  md: "usr_md_babukuttan",
  md1: "usr_md_1",
  md2: "usr_md_2",
  // CRM
  crm: "usr_crm_layla",
  // Estimators
  estimator1: "usr_est_1",
  estimator2: "usr_est_2",
  // MCP / Project Managers
  mcpAkshai: "usr_mcp_akshai",
  mcpSandeep: "usr_mcp_sandeep",
  mcpPk: "usr_mcp_pk",
  // Surveyors
  surveyorMajid: "usr_sur_majid",
  surveyorImran: "usr_sur_imran",
  // Department reviewers
  revTechnical: "usr_rev_ahmed",
  revCommercial: "usr_rev_fatima",
  revPlanning: "usr_rev_vikram",
  revProcurement: "usr_rev_salim",
  revHse: "usr_rev_grace",
  revQuality: "usr_rev_peter",
  revHrAdmin: "usr_rev_mariam",
  // Operations (handover recipient only — Operations module is out of scope)
  operationsHead: "usr_ops_khalid",
} as const;

export const DEMO_USERS: User[] = [
  {
    id: USER_IDS.md,
    name: "Babukuttan",
    initials: "BK",
    jobTitle: "Managing Director",
    email: "babukuttan@radwa.example",
    roles: ["MD"],
    isManagementTeam: true,
    isMD: true,
  },
  {
    id: USER_IDS.md1,
    name: "MD1",
    initials: "M1",
    jobTitle: "Management Team Member",
    email: "md1@radwa.example",
    roles: ["MD"],
    isManagementTeam: true,
  },
  {
    id: USER_IDS.md2,
    name: "MD2",
    initials: "M2",
    jobTitle: "Management Team Member",
    email: "md2@radwa.example",
    roles: ["MD"],
    isManagementTeam: true,
  },
  {
    id: USER_IDS.crm,
    name: "Layla Haddad",
    initials: "LH",
    jobTitle: "CRM Manager",
    email: "layla.haddad@radwa.example",
    roles: ["CRM_MANAGER"],
  },
  {
    id: USER_IDS.estimator1,
    name: "Estimator 1",
    initials: "E1",
    jobTitle: "Estimator",
    email: "estimator1@radwa.example",
    roles: ["ESTIMATOR"],
  },
  {
    id: USER_IDS.estimator2,
    name: "Estimator 2",
    initials: "E2",
    jobTitle: "Estimator",
    email: "estimator2@radwa.example",
    roles: ["ESTIMATOR"],
  },
  {
    id: USER_IDS.mcpAkshai,
    name: "Akshai",
    initials: "AK",
    jobTitle: "MCP / Project Manager",
    email: "akshai@radwa.example",
    roles: ["MCP"],
  },
  {
    id: USER_IDS.mcpSandeep,
    name: "Sandeep",
    initials: "SD",
    jobTitle: "MCP / Project Manager",
    email: "sandeep@radwa.example",
    roles: ["MCP"],
  },
  {
    id: USER_IDS.mcpPk,
    name: "PK",
    initials: "PK",
    jobTitle: "MCP / Project Manager",
    email: "pk@radwa.example",
    roles: ["MCP"],
  },
  {
    id: USER_IDS.surveyorMajid,
    name: "Majid Al Balushi",
    initials: "MB",
    jobTitle: "Site Surveyor",
    email: "majid.albalushi@radwa.example",
    roles: ["SURVEYOR"],
  },
  {
    id: USER_IDS.surveyorImran,
    name: "Imran Shaikh",
    initials: "IS",
    jobTitle: "Site Surveyor",
    email: "imran.shaikh@radwa.example",
    roles: ["SURVEYOR"],
  },
  {
    id: USER_IDS.revTechnical,
    name: "Ahmed Siddiqui",
    initials: "AS",
    jobTitle: "Technical Manager",
    email: "ahmed.siddiqui@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "TECHNICAL",
  },
  {
    id: USER_IDS.revCommercial,
    name: "Fatima Zahra",
    initials: "FZ",
    jobTitle: "Commercial Manager",
    email: "fatima.zahra@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "COMMERCIAL",
  },
  {
    id: USER_IDS.revPlanning,
    name: "Vikram Rao",
    initials: "VR",
    jobTitle: "Planning Manager",
    email: "vikram.rao@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "PLANNING",
  },
  {
    id: USER_IDS.revProcurement,
    name: "Salim Al Amri",
    initials: "SA",
    jobTitle: "Procurement Manager",
    email: "salim.alamri@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "PROCUREMENT",
  },
  {
    id: USER_IDS.revHse,
    name: "Grace Mwangi",
    initials: "GM",
    jobTitle: "HSE Manager",
    email: "grace.mwangi@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "HSE",
  },
  {
    id: USER_IDS.revQuality,
    name: "Peter Okonkwo",
    initials: "PO",
    jobTitle: "QA/QC Manager",
    email: "peter.okonkwo@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "QUALITY",
  },
  {
    id: USER_IDS.revHrAdmin,
    name: "Mariam Youssef",
    initials: "MY",
    jobTitle: "HR & Administration Manager",
    email: "mariam.youssef@radwa.example",
    roles: ["DEPARTMENT_REVIEWER"],
    department: "HR_ADMIN",
  },
  {
    id: USER_IDS.operationsHead,
    name: "Khalid Al Rayes",
    initials: "KR",
    jobTitle: "Head of Operations",
    email: "khalid.alrayes@radwa.example",
    roles: [],
  },
];

/** Default reviewer per department, used when a document is created in the UI. */
export const DEPARTMENT_REVIEWER: Record<string, string> = {
  TECHNICAL: USER_IDS.revTechnical,
  COMMERCIAL: USER_IDS.revCommercial,
  PLANNING: USER_IDS.revPlanning,
  PROCUREMENT: USER_IDS.revProcurement,
  HSE: USER_IDS.revHse,
  QUALITY: USER_IDS.revQuality,
  HR_ADMIN: USER_IDS.revHrAdmin,
};

/* ----------------------------------------------------------- clients ------ */

export const CLIENT_IDS = {
  mirqab: "cli_mirqab",
  gulfPetrochem: "cli_gulfpetro",
  nakhla: "cli_nakhla",
  harbour: "cli_harbour",
  ewpu: "cli_ewpu",
  cedar: "cli_cedar",
} as const;

export const DEMO_CLIENTS: Client[] = [
  {
    id: CLIENT_IDS.mirqab,
    name: "Al Mirqab Industrial Holdings",
    shortName: "Al Mirqab",
    sector: "Industrial & Manufacturing",
    address: "Plot 44, Industrial Area 7",
    city: "Sharjah",
    country: "UAE",
    trn: "100412887600003",
    notes: "Repeat client. Prefers sealed hard-copy submissions.",
  },
  {
    id: CLIENT_IDS.gulfPetrochem,
    name: "Gulf Petrochem Terminals FZE",
    shortName: "Gulf Petrochem",
    sector: "Oil, Gas & Petrochemical",
    address: "Terminal Road, Hamriyah Free Zone",
    city: "Sharjah",
    country: "UAE",
    trn: "100298441200003",
    notes: "Strict HSE pre-qualification. Shutdown windows are fixed.",
  },
  {
    id: CLIENT_IDS.nakhla,
    name: "Nakhla Real Estate Development",
    shortName: "Nakhla RED",
    sector: "Real Estate Development",
    address: "Nakhla Tower, Business Bay",
    city: "Dubai",
    country: "UAE",
    trn: "100556120900003",
  },
  {
    id: CLIENT_IDS.harbour,
    name: "Harbour Logistics City",
    shortName: "Harbour LC",
    sector: "Logistics & Warehousing",
    address: "Gate 3, Jebel Ali Logistics Corridor",
    city: "Dubai",
    country: "UAE",
  },
  {
    id: CLIENT_IDS.ewpu,
    name: "Emirates Water & Power Utility",
    shortName: "EWPU",
    sector: "Utilities",
    address: "Utility House, Al Qusais",
    city: "Dubai",
    country: "UAE",
    notes: "Tenders issued through an online portal with hard deadlines.",
  },
  {
    id: CLIENT_IDS.cedar,
    name: "Cedar Hospitality Group",
    shortName: "Cedar Hospitality",
    sector: "Hospitality",
    address: "Cedar Plaza, Corniche Road",
    city: "Abu Dhabi",
    country: "UAE",
  },
];

/* ---------------------------------------------------------- contacts ------ */

export const CONTACT_IDS = {
  mirqabPrimary: "con_mirqab_1",
  mirqabSecondary: "con_mirqab_2",
  gulfPrimary: "con_gulf_1",
  nakhlaPrimary: "con_nakhla_1",
  harbourPrimary: "con_harbour_1",
  ewpuPrimary: "con_ewpu_1",
  cedarPrimary: "con_cedar_1",
} as const;

export const DEMO_CONTACTS: Contact[] = [
  {
    id: CONTACT_IDS.mirqabPrimary,
    clientId: CLIENT_IDS.mirqab,
    name: "Hassan Al Mirqab",
    jobTitle: "Projects Director",
    email: "hassan@almirqab.example",
    phone: "+971 6 555 0112",
    isPrimary: true,
  },
  {
    id: CONTACT_IDS.mirqabSecondary,
    clientId: CLIENT_IDS.mirqab,
    name: "Reem Saleh",
    jobTitle: "Contracts Officer",
    email: "reem.saleh@almirqab.example",
    phone: "+971 6 555 0118",
    isPrimary: false,
  },
  {
    id: CONTACT_IDS.gulfPrimary,
    clientId: CLIENT_IDS.gulfPetrochem,
    name: "Daniel Mensah",
    jobTitle: "Maintenance Manager",
    email: "d.mensah@gulfpetrochem.example",
    phone: "+971 6 526 7740",
    isPrimary: true,
  },
  {
    id: CONTACT_IDS.nakhlaPrimary,
    clientId: CLIENT_IDS.nakhla,
    name: "Sana Bhatti",
    jobTitle: "Development Manager",
    email: "sana.bhatti@nakhla.example",
    phone: "+971 4 388 2210",
    isPrimary: true,
  },
  {
    id: CONTACT_IDS.harbourPrimary,
    clientId: CLIENT_IDS.harbour,
    name: "Marco Ferreira",
    jobTitle: "Facilities Lead",
    email: "marco.ferreira@harbourlc.example",
    phone: "+971 4 811 4455",
    isPrimary: true,
  },
  {
    id: CONTACT_IDS.ewpuPrimary,
    clientId: CLIENT_IDS.ewpu,
    name: "Aisha Kamel",
    jobTitle: "Tender Committee Secretary",
    email: "a.kamel@ewpu.example",
    phone: "+971 4 207 9000",
    isPrimary: true,
  },
  {
    id: CONTACT_IDS.cedarPrimary,
    clientId: CLIENT_IDS.cedar,
    name: "Jonas Lindqvist",
    jobTitle: "Group Technical Services Manager",
    email: "j.lindqvist@cedarhg.example",
    phone: "+971 2 644 1900",
    isPrimary: true,
  },
];
