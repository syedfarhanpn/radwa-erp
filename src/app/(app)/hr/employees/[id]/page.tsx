"use client";

/**
 * One employee: the joining record, and what HR can do to it.
 *
 * HR can edit and change status. The MD reads the same screen without the
 * actions — read access to the workforce, not write access to payroll.
 */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil, UserCheck, UserX } from "lucide-react";

import {
  ALLOWANCE_FIELDS,
  EMPLOYEE_CATEGORY_LABELS,
  EMPLOYEE_SPONSOR_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
  LEAVE_CONTRACT_PERIOD_LABELS,
  RECRUITMENT_TYPE_LABELS,
  grossMonthly,
  totalAllowances,
  yearlyLeaveSalary,
} from "@/domain/hr";
import { formatMoney } from "@/lib/money";
import { formatDate, daysUntil } from "@/lib/dates";
import { setEmployeeStatus, updateEmployee, type EmployeeInput } from "@/services/hrOperations";
import { useActiveRole, useDb, useDemoStore } from "@/store/useDemoStore";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  Badge,
  Button,
  Callout,
  KeyValue,
  LinkButton,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui/primitives";

const ALLOWANCE_LABELS: Record<(typeof ALLOWANCE_FIELDS)[number], string> = {
  foodAllowance: "Food",
  overtimeAllowance: "Overtime",
  telephoneAllowance: "Telephone",
  houseAllowance: "House",
  vehicleAllowance: "Vehicle",
  otherAllowance: "Other",
};

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const role = useActiveRole();
  const dispatch = useDemoStore((s) => s.dispatch);
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [statusDialog, setStatusDialog] = React.useState(false);

  const employee = db.employees.find((e) => e.id === params.id);
  const canEdit = role === "HR";

  if (!employee) {
    return (
      <Callout tone="warn" title="Employee not found">
        That record does not exist, or it has been removed.{" "}
        <LinkButton href="/hr/employees">Back to the register</LinkButton>
      </Callout>
    );
  }

  const pay = employee.compensation;
  const gross = grossMonthly(pay);
  const workOrder = employee.assignedWorkOrderId
    ? db.workOrders.find((w) => w.id === employee.assignedWorkOrderId)
    : undefined;
  const iqamaDays = employee.iqamaExpiry ? daysUntil(employee.iqamaExpiry) : null;

  function saveEdit(input: EmployeeInput) {
    setBusy(true);
    setFieldErrors({});
    const result = dispatch(updateEmployee, { ...input, employeeId: employee!.id });
    setBusy(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-base font-semibold text-ink-900">
            Edit {employee.name} ({employee.employeeNumber})
          </h1>
        </header>
        <EmployeeForm
          db={db}
          employee={employee}
          submitLabel="Save changes"
          busy={busy}
          fieldErrors={fieldErrors}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/hr/employees")}
            className="mb-1 inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-ink-700"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Employee register
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink-900">
            {employee.name}
            <Badge tone={employee.status === "ACTIVE" ? "ok" : "neutral"}>
              {EMPLOYEE_STATUS_LABELS[employee.status]}
            </Badge>
          </h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Employee {employee.employeeNumber} · {employee.trade} ·{" "}
            {EMPLOYEE_SPONSOR_LABELS[employee.sponsor]}
          </p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
            <Button
              variant={employee.status === "ACTIVE" ? "danger" : "primary"}
              onClick={() => setStatusDialog(true)}
            >
              {employee.status === "ACTIVE" ? (
                <>
                  <UserX className="size-3.5" aria-hidden />
                  Mark inactive
                </>
              ) : (
                <>
                  <UserCheck className="size-3.5" aria-hidden />
                  Reactivate
                </>
              )}
            </Button>
          </div>
        ) : null}
      </header>

      {employee.status === "INACTIVE" ? (
        <Callout tone="neutral" title="This employee has left">
          Inactive since {formatDate(employee.inactiveSince)}
          {employee.inactiveReason ? ` — ${employee.inactiveReason}` : null}. The record is kept, because
          payroll and indemnity history outlives the employment.
        </Callout>
      ) : null}

      {iqamaDays !== null && iqamaDays <= 60 ? (
        <Callout
          tone={iqamaDays < 0 ? "bad" : "warn"}
          title={iqamaDays < 0 ? "Iqama has expired" : "Iqama expiring"}
          icon={<AlertTriangle />}
        >
          {iqamaDays < 0
            ? `Expired ${Math.abs(iqamaDays)} days ago on ${formatDate(employee.iqamaExpiry)}.`
            : `Expires in ${iqamaDays} days on ${formatDate(employee.iqamaExpiry)}.`}
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Employment" />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Sponsor">{EMPLOYEE_SPONSOR_LABELS[employee.sponsor]}</KeyValue>
              <KeyValue label="Main category">{EMPLOYEE_CATEGORY_LABELS[employee.category]}</KeyValue>
              <KeyValue label="Trade / designation">{employee.trade}</KeyValue>
              <KeyValue label="Expense category">
                {EXPENSE_CATEGORY_LABELS[employee.expenseCategory]}
              </KeyValue>
              <KeyValue label="Recruitment type">
                {RECRUITMENT_TYPE_LABELS[employee.recruitmentType]}
              </KeyValue>
              <KeyValue label="Date of joining">{formatDate(employee.dateOfJoin)}</KeyValue>
              <KeyValue label="Assigned work order">
                {workOrder ? (
                  <LinkButton href={`/work-orders/${workOrder.id}`}>{workOrder.number}</LinkButton>
                ) : (
                  "Not assigned"
                )}
              </KeyValue>
              <KeyValue label="Leave contract">
                {LEAVE_CONTRACT_PERIOD_LABELS[employee.leaveContractPeriod]}
              </KeyValue>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Personal and documents" />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Nationality">{employee.nationality}</KeyValue>
              <KeyValue label="Religion">{employee.religion ?? "—"}</KeyValue>
              <KeyValue label="Date of birth">{formatDate(employee.dateOfBirth) || "—"}</KeyValue>
              <KeyValue label="Blood group">{employee.bloodGroup ?? "—"}</KeyValue>
              <KeyValue label="Passport">{employee.passportNumber}</KeyValue>
              <KeyValue label="Iqama">{employee.iqamaNumber ?? "—"}</KeyValue>
              <KeyValue label="Iqama expiry">{formatDate(employee.iqamaExpiry) || "—"}</KeyValue>
              <KeyValue label="Date of arrival">{formatDate(employee.dateOfArrival) || "—"}</KeyValue>
              <KeyValue label="Departure port">{employee.departurePort ?? "—"}</KeyValue>
              <KeyValue label="Coverall / shoe size">
                {[employee.coverallSize, employee.shoeSize].filter(Boolean).join(" · ") || "—"}
              </KeyValue>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Salary and allowances" description="Monthly, in SAR" />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Basic salary">{formatMoney(pay.basicSalary, "SAR", 0)}</KeyValue>
              <KeyValue label="Duty hours / day">{pay.dutyHours}</KeyValue>
              <KeyValue label="Overtime rate">
                {pay.overtimeRate > 0 ? `${pay.overtimeRate}×` : "Not applicable"}
              </KeyValue>
              {ALLOWANCE_FIELDS.map((field) => (
                <KeyValue key={field} label={`${ALLOWANCE_LABELS[field]} allowance`}>
                  {formatMoney(pay[field], "SAR", 0)}
                </KeyValue>
              ))}
            </div>

            <div className="mt-3 rounded-card border border-ink-200 bg-ink-50 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <KeyValue label="Allowances">{formatMoney(totalAllowances(pay), "SAR", 0)}</KeyValue>
                <KeyValue label="Gross monthly">
                  <span className="font-semibold text-ink-900">{formatMoney(gross, "SAR", 0)}</span>
                </KeyValue>
                <KeyValue label="Leave salary / year">
                  {formatMoney(yearlyLeaveSalary(pay, employee.leaveContractPeriod), "SAR", 0)}
                </KeyValue>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Contact, background and files" />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Local mobile">{employee.localMobile ?? "—"}</KeyValue>
              <KeyValue label="Emergency contact">{employee.emergencyContactPhone ?? "—"}</KeyValue>
              <KeyValue label="Agent">{employee.agentName ?? "—"}</KeyValue>
              <KeyValue label="Referred by">{employee.referredBy ?? "—"}</KeyValue>
              <KeyValue label="Education">{employee.education ?? "—"}</KeyValue>
              <KeyValue label="Experience">{employee.experience ?? "—"}</KeyValue>
              <KeyValue label="CV">
                {employee.cv ? `${employee.cv.fileName} · ${employee.cv.sizeLabel}` : "Not attached"}
              </KeyValue>
              <KeyValue label="Photograph">
                {employee.photo ? `${employee.photo.fileName} · ${employee.photo.sizeLabel}` : "Not attached"}
              </KeyValue>
            </div>

            {employee.emergencyContactAddress ? (
              <div className="mt-3">
                <KeyValue label="Emergency contact address">
                  <span className="whitespace-pre-wrap">{employee.emergencyContactAddress}</span>
                </KeyValue>
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      <StatusDialog
        key={employee.status}
        open={statusDialog}
        employeeName={employee.name}
        currentStatus={employee.status}
        onClose={() => setStatusDialog(false)}
        onConfirm={(reason, effectiveDate) => {
          const result = dispatch(setEmployeeStatus, {
            employeeId: employee.id,
            status: employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
            reason,
            effectiveDate,
          });
          toast.fromResult(result);
          if (result.ok) setStatusDialog(false);
        }}
      />
    </div>
  );
}

/**
 * Keyed on the employee's status by the caller, so switching between
 * deactivate and reactivate starts from empty fields rather than whatever was
 * typed last time.
 */
function StatusDialog({
  open,
  employeeName,
  currentStatus,
  onClose,
  onConfirm,
}: {
  open: boolean;
  employeeName: string;
  currentStatus: "ACTIVE" | "INACTIVE";
  onClose: () => void;
  onConfirm: (reason: string, effectiveDate: string) => void;
}) {
  const deactivating = currentStatus === "ACTIVE";
  const [reason, setReason] = React.useState("");
  const [effectiveDate, setEffectiveDate] = React.useState(new Date().toISOString().slice(0, 10));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={deactivating ? `Mark ${employeeName} inactive?` : `Reactivate ${employeeName}?`}
      description={
        deactivating
          ? "The record is kept and stays searchable. Nothing is deleted."
          : "The employee returns to the active workforce and the monthly payroll figure."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={deactivating ? "danger" : "primary"}
            onClick={() => onConfirm(reason, effectiveDate)}
          >
            {deactivating ? "Mark inactive" : "Reactivate"}
          </Button>
        </>
      }
    >
      {deactivating ? (
        <div className="space-y-3">
          <Field label="Last working day" htmlFor="effectiveDate">
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor="reason" required>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Resignation, termination, contract completed…"
            />
          </Field>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-ink-700">
          This clears the leaving date and reason recorded previously.
        </p>
      )}
    </Dialog>
  );
}
