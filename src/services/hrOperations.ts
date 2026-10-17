/**
 * Radwa Gulf and Co — HR operations.
 *
 * Same contract as the tender operations in `./operations.ts`: a pure function
 * of `(db, ctx, input)` that mutates the draft it is handed and returns an
 * `ActionResult`. The store clones before calling and commits only on success,
 * so a rejected operation cannot leave half a record behind — and because they
 * are pure, the sync engine can replay them against another device's version
 * of the database when two people write at once.
 */

import type { ActionResult, DemoDatabase, Id } from "@/domain/types";
import type { OpContext } from "./operations";
import {
  emptyCompensation,
  type Employee,
  type EmployeeAttachment,
  type EmployeeCategory,
  type EmployeeCompensation,
  type EmployeeSponsor,
  type ExpenseCategory,
  type LeaveContractPeriod,
  type RecruitmentType,
} from "@/domain/hr";
import { makeId } from "@/lib/utils";

/** Employee numbering starts at 1001, as in the business's workbook. */
const FIRST_EMPLOYEE_NUMBER = 1001;

export interface EmployeeInput {
  sponsor: EmployeeSponsor;
  name: string;
  category: EmployeeCategory;
  trade: string;
  expenseCategory: ExpenseCategory;
  recruitmentType: RecruitmentType;

  nationality: string;
  religion?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  passportNumber: string;
  iqamaNumber?: string;
  iqamaExpiry?: string;

  dateOfArrival?: string;
  departurePort?: string;
  dateOfJoin: string;

  localMobile?: string;
  emergencyContactAddress?: string;
  emergencyContactPhone?: string;

  agentName?: string;
  referredBy?: string;
  education?: string;
  experience?: string;

  assignedWorkOrderId?: Id;

  compensation: EmployeeCompensation;
  leaveContractPeriod: LeaveContractPeriod;

  coverallSize?: string;
  shoeSize?: string;

  cv?: EmployeeAttachment;
  photo?: EmployeeAttachment;
}

/* ---------------------------------------------------------- validation --- */

/**
 * Field-level validation shared by registration and editing.
 *
 * Returns a map keyed by field name so the form can mark the offending input
 * rather than showing one message at the top and leaving the user hunting.
 */
function validate(
  db: DemoDatabase,
  input: EmployeeInput,
  existingId?: Id,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.name?.trim()) errors.name = "Employee name is required.";
  if (!input.trade?.trim()) errors.trade = "Trade or designation is required.";
  if (!input.nationality?.trim()) errors.nationality = "Nationality is required.";
  if (!input.dateOfJoin) errors.dateOfJoin = "Date of joining is required.";

  const passport = input.passportNumber?.trim();
  if (!passport) {
    errors.passportNumber = "Passport number is required.";
  } else {
    // Two records for one passport means one real person counted twice in
    // headcount and payroll, so it is refused rather than merged.
    const clash = db.employees.find(
      (e) => e.id !== existingId && e.passportNumber.trim().toLowerCase() === passport.toLowerCase(),
    );
    if (clash) {
      errors.passportNumber = `Passport ${passport} already belongs to ${clash.name} (${clash.employeeNumber}).`;
    }
  }

  const iqama = input.iqamaNumber?.trim();
  if (iqama) {
    const clash = db.employees.find(
      (e) => e.id !== existingId && e.iqamaNumber?.trim() === iqama,
    );
    if (clash) {
      errors.iqamaNumber = `Iqama ${iqama} already belongs to ${clash.name} (${clash.employeeNumber}).`;
    }
  }

  if (input.dateOfBirth && input.dateOfJoin && input.dateOfBirth >= input.dateOfJoin) {
    errors.dateOfBirth = "Date of birth must be before the date of joining.";
  }

  if (input.dateOfArrival && input.dateOfJoin && input.dateOfArrival > input.dateOfJoin) {
    errors.dateOfArrival = "Arrival cannot be after the date of joining.";
  }

  if (input.iqamaExpiry && input.iqamaExpiry < input.dateOfJoin) {
    errors.iqamaExpiry = "The iqama expires before the employee joins.";
  }

  const pay = input.compensation ?? emptyCompensation();
  if (!(pay.basicSalary > 0)) errors.basicSalary = "Basic salary must be greater than zero.";
  if (!(pay.dutyHours > 0 && pay.dutyHours <= 24)) {
    errors.dutyHours = "Duty hours must be between 1 and 24.";
  }
  if (pay.overtimeRate < 0) errors.overtimeRate = "Overtime rate cannot be negative.";

  for (const [field, value] of Object.entries(pay)) {
    if (typeof value === "number" && value < 0 && !errors[field]) {
      errors[field] = "Cannot be negative.";
    }
  }

  if (input.assignedWorkOrderId && !db.workOrders.some((w) => w.id === input.assignedWorkOrderId)) {
    errors.assignedWorkOrderId = "That work order no longer exists.";
  }

  return errors;
}

/* ----------------------------------------------------------- operations -- */

/** Register a joining employee. Returns the new id so the UI can navigate. */
export function registerEmployee(
  db: DemoDatabase,
  ctx: OpContext,
  input: EmployeeInput,
): ActionResult & { employeeId?: Id } {
  const fieldErrors = validate(db, input);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const sequence = (db.sequences.employee ?? FIRST_EMPLOYEE_NUMBER - 1) + 1;
  db.sequences.employee = sequence;

  const now = new Date().toISOString();
  const employee: Employee = {
    id: makeId("emp"),
    employeeNumber: String(sequence),
    ...normalise(input),
    status: "ACTIVE",
    createdAt: now,
    createdBy: ctx.actorId,
    updatedAt: now,
    updatedBy: ctx.actorId,
  };

  db.employees.push(employee);

  return {
    ok: true,
    message: `${employee.name} registered as employee ${employee.employeeNumber}.`,
    employeeId: employee.id,
  };
}

export function updateEmployee(
  db: DemoDatabase,
  ctx: OpContext,
  input: EmployeeInput & { employeeId: Id },
): ActionResult {
  const employee = db.employees.find((e) => e.id === input.employeeId);
  if (!employee) return { ok: false, message: "That employee record no longer exists." };

  const fieldErrors = validate(db, input, employee.id);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  Object.assign(employee, normalise(input), {
    updatedAt: new Date().toISOString(),
    updatedBy: ctx.actorId,
  });

  return { ok: true, message: `${employee.name}'s record updated.` };
}

/**
 * Mark an employee inactive, or bring them back.
 *
 * The workbook's own note is "once employee left make it as inactive" —
 * records are never deleted, because payroll and indemnity history has to
 * survive the person leaving.
 */
export function setEmployeeStatus(
  db: DemoDatabase,
  ctx: OpContext,
  input: { employeeId: Id; status: "ACTIVE" | "INACTIVE"; reason?: string; effectiveDate?: string },
): ActionResult {
  const employee = db.employees.find((e) => e.id === input.employeeId);
  if (!employee) return { ok: false, message: "That employee record no longer exists." };

  if (employee.status === input.status) {
    return { ok: false, message: `${employee.name} is already ${input.status.toLowerCase()}.` };
  }

  if (input.status === "INACTIVE" && !input.reason?.trim()) {
    return {
      ok: false,
      message: "A reason is required.",
      fieldErrors: { reason: "Say why this employee is leaving." },
    };
  }

  employee.status = input.status;
  employee.updatedAt = new Date().toISOString();
  employee.updatedBy = ctx.actorId;

  if (input.status === "INACTIVE") {
    employee.inactiveSince = input.effectiveDate || new Date().toISOString().slice(0, 10);
    employee.inactiveReason = input.reason?.trim();
    return { ok: true, message: `${employee.name} marked inactive.` };
  }

  delete employee.inactiveSince;
  delete employee.inactiveReason;
  return { ok: true, message: `${employee.name} reactivated.` };
}

/* -------------------------------------------------------------- shared --- */

/**
 * Trim strings and drop the empty ones.
 *
 * An optional field left blank should be absent, not an empty string: `""`
 * renders as a populated-but-blank row, which reads as data loss.
 */
function normalise(input: EmployeeInput) {
  const text = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  return {
    sponsor: input.sponsor,
    name: input.name.trim(),
    category: input.category,
    trade: input.trade.trim(),
    expenseCategory: input.expenseCategory,
    recruitmentType: input.recruitmentType,

    nationality: input.nationality.trim(),
    religion: text(input.religion),
    dateOfBirth: text(input.dateOfBirth),
    bloodGroup: text(input.bloodGroup),
    passportNumber: input.passportNumber.trim(),
    iqamaNumber: text(input.iqamaNumber),
    iqamaExpiry: text(input.iqamaExpiry),

    dateOfArrival: text(input.dateOfArrival),
    departurePort: text(input.departurePort),
    dateOfJoin: input.dateOfJoin,

    localMobile: text(input.localMobile),
    emergencyContactAddress: text(input.emergencyContactAddress),
    emergencyContactPhone: text(input.emergencyContactPhone),

    agentName: text(input.agentName),
    referredBy: text(input.referredBy),
    education: text(input.education),
    experience: text(input.experience),

    assignedWorkOrderId: input.assignedWorkOrderId || undefined,

    compensation: { ...input.compensation },
    leaveContractPeriod: input.leaveContractPeriod,

    coverallSize: text(input.coverallSize),
    shoeSize: text(input.shoeSize),

    cv: input.cv,
    photo: input.photo,
  };
}

/* ----------------------------------------------------------- selectors --- */

export function employeeById(db: DemoDatabase, id: Id): Employee | undefined {
  return db.employees.find((e) => e.id === id);
}

export function activeEmployees(db: DemoDatabase): Employee[] {
  return db.employees.filter((e) => e.status === "ACTIVE");
}

/** Iqamas expiring within `days`, soonest first — the one HR deadline here. */
export function expiringIqamas(db: DemoDatabase, days = 60): Employee[] {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const cutoff = limit.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return db.employees
    .filter((e) => e.status === "ACTIVE" && e.iqamaExpiry && e.iqamaExpiry <= cutoff)
    .sort((a, b) => (a.iqamaExpiry ?? "").localeCompare(b.iqamaExpiry ?? ""))
    .map((e) => ({ ...e, iqamaExpired: (e.iqamaExpiry ?? "") < today }) as Employee);
}

/** Monthly payroll cost of the active workforce, in SAR. */
export function monthlyPayroll(db: DemoDatabase): number {
  return activeEmployees(db).reduce((total, e) => {
    const pay = e.compensation;
    return (
      total +
      pay.basicSalary +
      pay.foodAllowance +
      pay.overtimeAllowance +
      pay.telephoneAllowance +
      pay.houseAllowance +
      pay.vehicleAllowance +
      pay.otherAllowance
    );
  }, 0);
}
