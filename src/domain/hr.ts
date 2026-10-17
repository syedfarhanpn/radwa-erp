/**
 * Radwa Gulf and Co — HR domain.
 *
 * Scope is the **employee joining form** from the business's HR workbook
 * (`Employee joining form`, columns B–AM). Deliberately separate from the
 * tender domain in `./types.ts`: an employee is not part of the enquiry
 * lifecycle, and keeping the two apart means neither can break the other.
 *
 * WHAT IS NOT HERE, AND WHY
 *   The same workbook carries three more sheets — employee movement, leave,
 *   supplier manpower — plus two further zones on the joining sheet itself:
 *   benefit/indemnity calculation (columns AP–BE) and salary revision
 *   (BG–BM). They are out of scope for this phase, but they hang off the same
 *   employee record, so the shape below leaves room for them rather than
 *   modelling the form as a flat blob.
 *
 * The option lists are transcribed from the values typed down each column of
 * the sheet. Spelling is corrected; the meaning is not.
 */

import type { Id, IsoDate, IsoTimestamp } from "./types";

/* ---------------------------------------------------------- sponsorship -- */

export const EMPLOYEE_SPONSORS = ["RADWA", "ALFAKAMA", "SULAIMAN"] as const;
export type EmployeeSponsor = (typeof EMPLOYEE_SPONSORS)[number];

export const EMPLOYEE_SPONSOR_LABELS: Record<EmployeeSponsor, string> = {
  RADWA: "Radwa",
  ALFAKAMA: "Alfakama",
  SULAIMAN: "Sulaiman",
};

/* ------------------------------------------------------------ categories -- */

export const EMPLOYEE_CATEGORIES = [
  "DIRECTORS",
  "SENIOR_MANAGEMENT",
  "OPERATION_MANAGEMENT_TEAM",
  "OFFICE_MANAGEMENT_TEAM",
  "OFFICE_SUPPORT_STAFF",
  "PROJECT_MANAGEMENT_TEAM",
  "PROJECT_OPERATION_TEAM",
] as const;
export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number];

export const EMPLOYEE_CATEGORY_LABELS: Record<EmployeeCategory, string> = {
  DIRECTORS: "Directors",
  SENIOR_MANAGEMENT: "Senior management",
  OPERATION_MANAGEMENT_TEAM: "Operation Management team",
  OFFICE_MANAGEMENT_TEAM: "Office Management team",
  OFFICE_SUPPORT_STAFF: "Office supporting staff",
  PROJECT_MANAGEMENT_TEAM: "Project Management team (PMT)",
  PROJECT_OPERATION_TEAM: "Project Operation team (POT)",
};

/* ---------------------------------------------------------- designations -- */

/**
 * Trades and designations from column E.
 *
 * A free-text "other" is allowed alongside these — a construction business
 * hires trades faster than a dropdown can be maintained, and a form that
 * cannot record a real job title gets worked around rather than used.
 */
export const EMPLOYEE_TRADES = [
  "Managing Director",
  "Business Director",
  "General Operation Manager",
  "Electrical Manager",
  "Accounts Manager",
  "HR Manager",
  "Design Engineer",
  "Project Manager",
  "Site Engineer",
  "Site Supervisor",
  "Safety Officer",
  "Permit Receiver",
  "Document Controller",
  "Clerk",
  "Welder",
  "Fitter",
  "Supervisor",
] as const;

/* ------------------------------------------------------- recruitment ----- */

export const RECRUITMENT_TYPES = ["NEW_RECRUIT", "TRANSFER"] as const;
export type RecruitmentType = (typeof RECRUITMENT_TYPES)[number];

export const RECRUITMENT_TYPE_LABELS: Record<RecruitmentType, string> = {
  NEW_RECRUIT: "Newly recruited",
  TRANSFER: "Employee transfer",
};

/* ------------------------------------------------------ expense category -- */

export const EXPENSE_CATEGORIES = [
  "OFFICE_SUPPORT_OVERHEAD",
  "PROJECT_DIRECT",
  "PROJECT_INDIRECT",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  OFFICE_SUPPORT_OVERHEAD: "Office support overhead",
  PROJECT_DIRECT: "Project direct",
  PROJECT_INDIRECT: "Project indirect",
};

/* -------------------------------------------------------- leave contract -- */

export const LEAVE_CONTRACT_PERIODS = ["SIX_MONTHS", "ONE_YEAR", "TWO_YEARS"] as const;
export type LeaveContractPeriod = (typeof LEAVE_CONTRACT_PERIODS)[number];

export const LEAVE_CONTRACT_PERIOD_LABELS: Record<LeaveContractPeriod, string> = {
  SIX_MONTHS: "6 months",
  ONE_YEAR: "1 year",
  TWO_YEARS: "2 years",
};

/** Months per contract period, for the leave-entitlement figure. */
export const LEAVE_CONTRACT_MONTHS: Record<LeaveContractPeriod, number> = {
  SIX_MONTHS: 6,
  ONE_YEAR: 12,
  TWO_YEARS: 24,
};

/* -------------------------------------------------------------- status --- */

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/* -------------------------------------------------------- the attachment -- */

/**
 * A file's metadata only.
 *
 * Consistent with every other file picker in this app: nothing is uploaded or
 * stored, the name and size are recorded so the record looks and behaves
 * right. Real document storage is a backend concern.
 */
export interface EmployeeAttachment {
  fileName: string;
  sizeLabel: string;
  attachedAt: IsoTimestamp;
}

/* ------------------------------------------------------------- the pay --- */

/** Monthly figures in SAR. The workbook's columns AA–AI. */
export interface EmployeeCompensation {
  basicSalary: number;
  /** Contracted hours per day (column AB). */
  dutyHours: number;
  /** Overtime multiplier — 1.5, or 0 where overtime does not apply. */
  overtimeRate: number;
  foodAllowance: number;
  overtimeAllowance: number;
  telephoneAllowance: number;
  houseAllowance: number;
  vehicleAllowance: number;
  otherAllowance: number;
}

export const ALLOWANCE_FIELDS = [
  "foodAllowance",
  "overtimeAllowance",
  "telephoneAllowance",
  "houseAllowance",
  "vehicleAllowance",
  "otherAllowance",
] as const satisfies ReadonlyArray<keyof EmployeeCompensation>;

/** Basic plus every allowance — what the employee costs per month. */
export function grossMonthly(pay: EmployeeCompensation): number {
  return ALLOWANCE_FIELDS.reduce((total, field) => total + (pay[field] || 0), pay.basicSalary || 0);
}

export function totalAllowances(pay: EmployeeCompensation): number {
  return ALLOWANCE_FIELDS.reduce((total, field) => total + (pay[field] || 0), 0);
}

/**
 * Annual leave salary at the workbook's rate of 21 days per year.
 *
 * The sheet states "21 days / year" against basic salary, so a day is basic ÷
 * 30. Scaled by the contract period, since a six-month contract does not earn
 * a year of leave.
 */
export function yearlyLeaveSalary(
  pay: EmployeeCompensation,
  period: LeaveContractPeriod,
): number {
  const perDay = (pay.basicSalary || 0) / 30;
  const years = LEAVE_CONTRACT_MONTHS[period] / 12;
  return Math.round(perDay * 21 * years);
}

/* ------------------------------------------------------------ the record -- */

export interface Employee {
  id: Id;
  /** Readable number from the EMP sequence — 1001, 1002, … */
  employeeNumber: string;

  /* identity */
  sponsor: EmployeeSponsor;
  name: string;
  category: EmployeeCategory;
  /** From EMPLOYEE_TRADES, or typed in when the list does not cover it. */
  trade: string;
  expenseCategory: ExpenseCategory;
  recruitmentType: RecruitmentType;

  /* personal */
  nationality: string;
  religion?: string;
  dateOfBirth?: IsoDate;
  bloodGroup?: string;
  passportNumber: string;
  iqamaNumber?: string;
  iqamaExpiry?: IsoDate;

  /* arrival and joining */
  dateOfArrival?: IsoDate;
  departurePort?: string;
  dateOfJoin: IsoDate;

  /* contact */
  localMobile?: string;
  emergencyContactAddress?: string;
  emergencyContactPhone?: string;

  /* recruitment trail */
  agentName?: string;
  referredBy?: string;
  education?: string;
  experience?: string;

  /* assignment — links HR to the tender side's work orders */
  assignedWorkOrderId?: Id;

  /* pay and contract */
  compensation: EmployeeCompensation;
  leaveContractPeriod: LeaveContractPeriod;

  /* issue */
  coverallSize?: string;
  shoeSize?: string;

  /* attachments — metadata only */
  cv?: EmployeeAttachment;
  photo?: EmployeeAttachment;

  /* lifecycle */
  status: EmployeeStatus;
  /** Set when made inactive — "once employee left make it as inactive". */
  inactiveSince?: IsoDate;
  inactiveReason?: string;

  createdAt: IsoTimestamp;
  createdBy: Id;
  updatedAt: IsoTimestamp;
  updatedBy: Id;
}

/** A fresh, empty compensation block for the joining form. */
export function emptyCompensation(): EmployeeCompensation {
  return {
    basicSalary: 0,
    dutyHours: 8,
    overtimeRate: 1.5,
    foodAllowance: 0,
    overtimeAllowance: 0,
    telephoneAllowance: 0,
    houseAllowance: 0,
    vehicleAllowance: 0,
    otherAllowance: 0,
  };
}
