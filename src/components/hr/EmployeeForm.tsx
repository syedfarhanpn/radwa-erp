"use client";

/**
 * The employee joining form.
 *
 * Transcribed from the business's HR workbook (`Employee joining form`,
 * columns B–AM). The sheet is one very wide row; this is the same fields
 * grouped the way someone actually fills them in — who the person is, then
 * their documents, then how they are paid.
 *
 * Shared by registration and editing: the two differ only in what happens on
 * submit, so keeping one component means a field added to the form cannot go
 * missing from the edit screen.
 */

import * as React from "react";

import {
  ALLOWANCE_FIELDS,
  BLOOD_GROUPS,
  EMPLOYEE_CATEGORIES,
  EMPLOYEE_CATEGORY_LABELS,
  EMPLOYEE_SPONSORS,
  EMPLOYEE_SPONSOR_LABELS,
  EMPLOYEE_TRADES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  LEAVE_CONTRACT_PERIODS,
  LEAVE_CONTRACT_PERIOD_LABELS,
  RECRUITMENT_TYPES,
  RECRUITMENT_TYPE_LABELS,
  emptyCompensation,
  grossMonthly,
  totalAllowances,
  yearlyLeaveSalary,
  type Employee,
  type EmployeeAttachment,
  type EmployeeCompensation,
} from "@/domain/hr";
import type { DemoDatabase } from "@/domain/types";
import type { EmployeeInput } from "@/services/hrOperations";
import { formatMoney } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import {
  Field,
  FieldGrid,
  FilePicker,
  FormSection,
  Input,
  NumberInput,
  Select,
  Textarea,
} from "@/components/ui/form";
import { Button, Callout, KeyValue, Panel, PanelBody, PanelFooter } from "@/components/ui/primitives";

/** The free-text escape hatch in the trade list. */
const OTHER_TRADE = "__other__";

export interface EmployeeFormProps {
  db: DemoDatabase;
  /** Present when editing; absent when registering. */
  employee?: Employee;
  submitLabel: string;
  busy?: boolean;
  fieldErrors?: Record<string, string>;
  onSubmit: (input: EmployeeInput) => void;
  onCancel: () => void;
}

export function EmployeeForm({
  db,
  employee,
  submitLabel,
  busy,
  fieldErrors = {},
  onSubmit,
  onCancel,
}: EmployeeFormProps) {
  /* identity */
  const [sponsor, setSponsor] = React.useState(employee?.sponsor ?? "RADWA");
  const [name, setName] = React.useState(employee?.name ?? "");
  const [category, setCategory] = React.useState(employee?.category ?? "PROJECT_OPERATION_TEAM");
  const [expenseCategory, setExpenseCategory] = React.useState(
    employee?.expenseCategory ?? "OFFICE_SUPPORT_OVERHEAD",
  );
  const [recruitmentType, setRecruitmentType] = React.useState(
    employee?.recruitmentType ?? "NEW_RECRUIT",
  );

  // A trade already on file that is not in the list must stay editable, so the
  // picker starts on "Other" with the stored value in the text box.
  const storedTradeIsListed =
    !employee || (EMPLOYEE_TRADES as readonly string[]).includes(employee.trade);
  const [tradeChoice, setTradeChoice] = React.useState(
    employee ? (storedTradeIsListed ? employee.trade : OTHER_TRADE) : "",
  );
  const [tradeOther, setTradeOther] = React.useState(
    employee && !storedTradeIsListed ? employee.trade : "",
  );
  const trade = tradeChoice === OTHER_TRADE ? tradeOther : tradeChoice;

  /* personal */
  const [nationality, setNationality] = React.useState(employee?.nationality ?? "");
  const [religion, setReligion] = React.useState(employee?.religion ?? "");
  const [dateOfBirth, setDateOfBirth] = React.useState(employee?.dateOfBirth ?? "");
  const [bloodGroup, setBloodGroup] = React.useState(employee?.bloodGroup ?? "");
  const [passportNumber, setPassportNumber] = React.useState(employee?.passportNumber ?? "");
  const [iqamaNumber, setIqamaNumber] = React.useState(employee?.iqamaNumber ?? "");
  const [iqamaExpiry, setIqamaExpiry] = React.useState(employee?.iqamaExpiry ?? "");

  /* arrival */
  const [dateOfArrival, setDateOfArrival] = React.useState(employee?.dateOfArrival ?? "");
  const [departurePort, setDeparturePort] = React.useState(employee?.departurePort ?? "");
  const [dateOfJoin, setDateOfJoin] = React.useState(employee?.dateOfJoin ?? todayIso());

  /* contact */
  const [localMobile, setLocalMobile] = React.useState(employee?.localMobile ?? "");
  const [emergencyContactAddress, setEmergencyAddress] = React.useState(
    employee?.emergencyContactAddress ?? "",
  );
  const [emergencyContactPhone, setEmergencyPhone] = React.useState(
    employee?.emergencyContactPhone ?? "",
  );

  /* recruitment trail */
  const [agentName, setAgentName] = React.useState(employee?.agentName ?? "");
  const [referredBy, setReferredBy] = React.useState(employee?.referredBy ?? "");
  const [education, setEducation] = React.useState(employee?.education ?? "");
  const [experience, setExperience] = React.useState(employee?.experience ?? "");

  /* assignment */
  const [assignedWorkOrderId, setWorkOrder] = React.useState(employee?.assignedWorkOrderId ?? "");

  /* pay */
  const [compensation, setCompensation] = React.useState<EmployeeCompensation>(
    employee ? { ...employee.compensation } : emptyCompensation(),
  );
  const [leaveContractPeriod, setLeavePeriod] = React.useState(
    employee?.leaveContractPeriod ?? "ONE_YEAR",
  );

  /* issue */
  const [coverallSize, setCoverallSize] = React.useState(employee?.coverallSize ?? "");
  const [shoeSize, setShoeSize] = React.useState(employee?.shoeSize ?? "");

  /* attachments */
  const [cv, setCv] = React.useState<EmployeeAttachment | undefined>(employee?.cv);
  const [photo, setPhoto] = React.useState<EmployeeAttachment | undefined>(employee?.photo);

  const setPay = (field: keyof EmployeeCompensation, value: number) =>
    setCompensation((current) => ({ ...current, [field]: value }));

  const gross = grossMonthly(compensation);
  const allowances = totalAllowances(compensation);
  const leaveSalary = yearlyLeaveSalary(compensation, leaveContractPeriod);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSubmit({
      sponsor,
      name,
      category,
      trade,
      expenseCategory,
      recruitmentType,
      nationality,
      religion,
      dateOfBirth,
      bloodGroup,
      passportNumber,
      iqamaNumber,
      iqamaExpiry,
      dateOfArrival,
      departurePort,
      dateOfJoin,
      localMobile,
      emergencyContactAddress,
      emergencyContactPhone,
      agentName,
      referredBy,
      education,
      experience,
      assignedWorkOrderId: assignedWorkOrderId || undefined,
      compensation,
      leaveContractPeriod,
      coverallSize,
      shoeSize,
      cv,
      photo,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Panel>
        <PanelBody className="space-y-5">
          {/* ------------------------------------------------------ identity */}
          <FormSection
            title="Employment"
            description="Who this employee works for and what they do."
          >
            <FieldGrid>
              <Field label="Sponsor" htmlFor="sponsor" required>
                <Select
                  id="sponsor"
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value as typeof sponsor)}
                >
                  {EMPLOYEE_SPONSORS.map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYEE_SPONSOR_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Employee name" htmlFor="name" required error={fieldErrors.name}>
                <Input
                  id="name"
                  value={name}
                  invalid={Boolean(fieldErrors.name)}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name as on the passport"
                />
              </Field>

              <Field label="Main category" htmlFor="category" required>
                <Select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                >
                  {EMPLOYEE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {EMPLOYEE_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Trade / designation"
                htmlFor="trade"
                required
                error={fieldErrors.trade}
                hint={tradeChoice === OTHER_TRADE ? "Type the job title." : undefined}
              >
                <Select
                  id="trade"
                  value={tradeChoice}
                  invalid={Boolean(fieldErrors.trade)}
                  onChange={(e) => setTradeChoice(e.target.value)}
                >
                  <option value="">Select…</option>
                  {EMPLOYEE_TRADES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                  <option value={OTHER_TRADE}>Other…</option>
                </Select>
              </Field>

              {tradeChoice === OTHER_TRADE ? (
                <Field label="Job title" htmlFor="tradeOther" required>
                  <Input
                    id="tradeOther"
                    value={tradeOther}
                    onChange={(e) => setTradeOther(e.target.value)}
                    placeholder="e.g. Scaffolder"
                  />
                </Field>
              ) : null}

              <Field label="Expense category" htmlFor="expenseCategory" required>
                <Select
                  id="expenseCategory"
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as typeof expenseCategory)}
                >
                  {EXPENSE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {EXPENSE_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Recruitment type" htmlFor="recruitmentType" required>
                <Select
                  id="recruitmentType"
                  value={recruitmentType}
                  onChange={(e) => setRecruitmentType(e.target.value as typeof recruitmentType)}
                >
                  {RECRUITMENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {RECRUITMENT_TYPE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Assigned work order"
                htmlFor="assignedWorkOrderId"
                error={fieldErrors.assignedWorkOrderId}
                hint={
                  db.workOrders.length === 0
                    ? "No work orders exist yet — this can be set later."
                    : "Optional. Links this employee to awarded work."
                }
              >
                <Select
                  id="assignedWorkOrderId"
                  value={assignedWorkOrderId}
                  disabled={db.workOrders.length === 0}
                  invalid={Boolean(fieldErrors.assignedWorkOrderId)}
                  onChange={(e) => setWorkOrder(e.target.value)}
                >
                  <option value="">Not assigned</option>
                  {db.workOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.number}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
          </FormSection>

          {/* ------------------------------------------------------ personal */}
          <FormSection
            title="Personal details"
            description="As recorded on the passport and iqama."
          >
            <FieldGrid>
              <Field label="Nationality" htmlFor="nationality" required error={fieldErrors.nationality}>
                <Input
                  id="nationality"
                  value={nationality}
                  invalid={Boolean(fieldErrors.nationality)}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="e.g. Indian"
                />
              </Field>

              <Field label="Religion" htmlFor="religion">
                <Input id="religion" value={religion} onChange={(e) => setReligion(e.target.value)} />
              </Field>

              <Field label="Date of birth" htmlFor="dateOfBirth" error={fieldErrors.dateOfBirth}>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  invalid={Boolean(fieldErrors.dateOfBirth)}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </Field>

              <Field label="Blood group" htmlFor="bloodGroup">
                <Select id="bloodGroup" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                  <option value="">Not recorded</option>
                  {BLOOD_GROUPS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
          </FormSection>

          {/* ----------------------------------------------------- documents */}
          <FormSection
            title="Documents and arrival"
            description="Passport, iqama and how the employee reached site."
          >
            <FieldGrid>
              <Field
                label="Passport number"
                htmlFor="passportNumber"
                required
                error={fieldErrors.passportNumber}
              >
                <Input
                  id="passportNumber"
                  value={passportNumber}
                  invalid={Boolean(fieldErrors.passportNumber)}
                  onChange={(e) => setPassportNumber(e.target.value)}
                />
              </Field>

              <Field label="Iqama number" htmlFor="iqamaNumber" error={fieldErrors.iqamaNumber}>
                <Input
                  id="iqamaNumber"
                  value={iqamaNumber}
                  invalid={Boolean(fieldErrors.iqamaNumber)}
                  onChange={(e) => setIqamaNumber(e.target.value)}
                />
              </Field>

              <Field
                label="Iqama expiry"
                htmlFor="iqamaExpiry"
                error={fieldErrors.iqamaExpiry}
                hint="The register flags these 60 days out."
              >
                <Input
                  id="iqamaExpiry"
                  type="date"
                  value={iqamaExpiry}
                  invalid={Boolean(fieldErrors.iqamaExpiry)}
                  onChange={(e) => setIqamaExpiry(e.target.value)}
                />
              </Field>

              <Field label="Date of arrival" htmlFor="dateOfArrival" error={fieldErrors.dateOfArrival}>
                <Input
                  id="dateOfArrival"
                  type="date"
                  value={dateOfArrival}
                  invalid={Boolean(fieldErrors.dateOfArrival)}
                  onChange={(e) => setDateOfArrival(e.target.value)}
                />
              </Field>

              <Field label="Departure port" htmlFor="departurePort">
                <Input
                  id="departurePort"
                  value={departurePort}
                  onChange={(e) => setDeparturePort(e.target.value)}
                  placeholder="e.g. Kochi"
                />
              </Field>

              <Field label="Date of joining" htmlFor="dateOfJoin" required error={fieldErrors.dateOfJoin}>
                <Input
                  id="dateOfJoin"
                  type="date"
                  value={dateOfJoin}
                  invalid={Boolean(fieldErrors.dateOfJoin)}
                  onChange={(e) => setDateOfJoin(e.target.value)}
                />
              </Field>
            </FieldGrid>
          </FormSection>

          {/* ------------------------------------------------------- contact */}
          <FormSection
            title="Contact and background"
            description="How to reach the employee, and who brought them in."
          >
            <FieldGrid>
              <Field label="Local mobile" htmlFor="localMobile">
                <Input
                  id="localMobile"
                  value={localMobile}
                  onChange={(e) => setLocalMobile(e.target.value)}
                  placeholder="+966…"
                />
              </Field>

              <Field label="Emergency contact phone" htmlFor="emergencyContactPhone">
                <Input
                  id="emergencyContactPhone"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                />
              </Field>

              <Field label="Agent name" htmlFor="agentName">
                <Input id="agentName" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
              </Field>

              <Field label="Referred by" htmlFor="referredBy">
                <Input id="referredBy" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} />
              </Field>

              <Field label="Education" htmlFor="education">
                <Input id="education" value={education} onChange={(e) => setEducation(e.target.value)} />
              </Field>

              <Field label="Experience" htmlFor="experience">
                <Input
                  id="experience"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder="e.g. 6 years pipeline fabrication"
                />
              </Field>
            </FieldGrid>

            <Field label="Emergency contact address" htmlFor="emergencyContactAddress">
              <Textarea
                id="emergencyContactAddress"
                rows={2}
                value={emergencyContactAddress}
                onChange={(e) => setEmergencyAddress(e.target.value)}
                placeholder="Home address and next of kin"
              />
            </Field>
          </FormSection>

          {/* ----------------------------------------------------------- pay */}
          <FormSection
            title="Salary and allowances"
            description="Monthly figures in SAR."
          >
            <FieldGrid cols={3}>
              <Field label="Basic salary" htmlFor="basicSalary" required error={fieldErrors.basicSalary}>
                <NumberInput
                  id="basicSalary"
                  min={0}
                  value={compensation.basicSalary || ""}
                  invalid={Boolean(fieldErrors.basicSalary)}
                  onChange={(e) => setPay("basicSalary", Number(e.target.value) || 0)}
                />
              </Field>

              <Field label="Duty hours / day" htmlFor="dutyHours" required error={fieldErrors.dutyHours}>
                <NumberInput
                  id="dutyHours"
                  min={1}
                  max={24}
                  value={compensation.dutyHours || ""}
                  invalid={Boolean(fieldErrors.dutyHours)}
                  onChange={(e) => setPay("dutyHours", Number(e.target.value) || 0)}
                />
              </Field>

              <Field
                label="Overtime rate"
                htmlFor="overtimeRate"
                error={fieldErrors.overtimeRate}
                hint="1.5, or 0 where overtime does not apply."
              >
                <NumberInput
                  id="overtimeRate"
                  min={0}
                  step="0.1"
                  value={compensation.overtimeRate}
                  invalid={Boolean(fieldErrors.overtimeRate)}
                  onChange={(e) => setPay("overtimeRate", Number(e.target.value) || 0)}
                />
              </Field>

              {ALLOWANCE_FIELDS.map((field) => (
                <Field key={field} label={ALLOWANCE_LABELS[field]} htmlFor={field} error={fieldErrors[field]}>
                  <NumberInput
                    id={field}
                    min={0}
                    value={compensation[field] || ""}
                    invalid={Boolean(fieldErrors[field])}
                    onChange={(e) => setPay(field, Number(e.target.value) || 0)}
                  />
                </Field>
              ))}
            </FieldGrid>

            <div className="rounded-card border border-ink-200 bg-ink-50 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <KeyValue label="Allowances">{formatMoney(allowances, "SAR")}</KeyValue>
                <KeyValue label="Gross monthly">
                  <span className="font-semibold text-ink-900">{formatMoney(gross, "SAR")}</span>
                </KeyValue>
                <KeyValue label="Leave salary (21 days/yr)">{formatMoney(leaveSalary, "SAR")}</KeyValue>
              </div>
            </div>

            <FieldGrid cols={3}>
              <Field label="Leave contract period" htmlFor="leaveContractPeriod" required>
                <Select
                  id="leaveContractPeriod"
                  value={leaveContractPeriod}
                  onChange={(e) => setLeavePeriod(e.target.value as typeof leaveContractPeriod)}
                >
                  {LEAVE_CONTRACT_PERIODS.map((value) => (
                    <option key={value} value={value}>
                      {LEAVE_CONTRACT_PERIOD_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Coverall size" htmlFor="coverallSize">
                <Input
                  id="coverallSize"
                  value={coverallSize}
                  onChange={(e) => setCoverallSize(e.target.value)}
                  placeholder="e.g. XXL"
                />
              </Field>

              <Field label="Shoe size" htmlFor="shoeSize">
                <Input
                  id="shoeSize"
                  value={shoeSize}
                  onChange={(e) => setShoeSize(e.target.value)}
                  placeholder="e.g. 42"
                />
              </Field>
            </FieldGrid>
          </FormSection>

          {/* --------------------------------------------------- attachments */}
          <FormSection
            title="Attachments"
            description="CV and photograph."
          >
            <FieldGrid>
              <Field label="CV" htmlFor="cv">
                <FilePicker
                  id="cv"
                  label={cv ? `${cv.fileName} · ${cv.sizeLabel}` : "Select a file (optional)"}
                  onPick={(file) =>
                    setCv({
                      fileName: file.fileName,
                      sizeLabel: file.fileSizeLabel,
                      attachedAt: new Date().toISOString(),
                    })
                  }
                />
              </Field>

              <Field label="Photograph" htmlFor="photo">
                <FilePicker
                  id="photo"
                  label={photo ? `${photo.fileName} · ${photo.sizeLabel}` : "Select a file (optional)"}
                  accept="image/*"
                  onPick={(file) =>
                    setPhoto({
                      fileName: file.fileName,
                      sizeLabel: file.fileSizeLabel,
                      attachedAt: new Date().toISOString(),
                    })
                  }
                />
              </Field>
            </FieldGrid>

            <Callout tone="neutral">
              Files are not uploaded. The name and size are recorded so the record is complete; document
              storage is a backend concern, the same as everywhere else in this system.
            </Callout>
          </FormSection>
        </PanelBody>

        <PanelFooter>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} loadingLabel="Saving…">
            {submitLabel}
          </Button>
        </PanelFooter>
      </Panel>
    </form>
  );
}

const ALLOWANCE_LABELS: Record<(typeof ALLOWANCE_FIELDS)[number], string> = {
  foodAllowance: "Food allowance",
  overtimeAllowance: "Overtime allowance",
  telephoneAllowance: "Telephone allowance",
  houseAllowance: "House allowance",
  vehicleAllowance: "Vehicle allowance",
  otherAllowance: "Other allowance",
};
