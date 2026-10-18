"use client";

/**
 * Leave register.
 *
 * One screen for the whole life of a leave: raise it, decide it, record the
 * departure, record the return. The actions available on a row are exactly the
 * ones its status allows, so the sequence cannot be skipped by clicking in the
 * wrong order.
 */

import * as React from "react";
import { AlertTriangle, CalendarClock, Plane, Plus } from "lucide-react";

import {
  ARRIVAL_STATUSES,
  ARRIVAL_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  TICKET_PAYEES,
  TICKET_PAYEE_LABELS,
  daysBetween,
  dueBackDate,
  isLeaveOverdue,
  overstayDays,
  type LeaveRequest,
  type LeaveStatus,
} from "@/domain/hrLeave";
import { formatDate, todayIso } from "@/lib/dates";
import {
  cancelLeave,
  decideLeave,
  decideLeaveExtension,
  recordLeaveDeparture,
  recordLeaveReturn,
  requestLeave,
} from "@/services/hrLeaveOperations";
import { useActingUser, useActiveRole, useDb, useDemoStore } from "@/store/useDemoStore";
import { canDecideLeave, holdingPcpFor } from "@/services/hrLeaveOperations";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FieldGrid, Input, NumberInput, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  StatTile,
} from "@/components/ui/primitives";
import { Table, TableEmptyRow, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type DialogKind = "new" | "decide" | "depart" | "return" | "extend" | null;

export default function LeaveRegisterPage() {
  const db = useDb();
  const role = useActiveRole();
  const dispatch = useDemoStore((s) => s.dispatch);
  const toast = useToast();

  const [filter, setFilter] = React.useState<LeaveStatus | "ALL" | "OPEN">("OPEN");
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // HR owns the register; a PCP comes here only to decide on their own
  // project's people. Both see the screen, with different powers.
  const actingUser = useActingUser();
  const canRaise = role === "HR";
  const canEdit = role === "HR";
  const today = todayIso();
  const active = activeId ? db.leaveRequests.find((l) => l.id === activeId) : undefined;

  const rows = db.leaveRequests
    // A PCP sees the people they are responsible for, not the whole company.
    .filter((leave) => role !== "MCP" || leave.approverPcpId === actingUser.id)
    .filter((leave) => {
      if (filter === "ALL") return true;
      if (filter === "OPEN") {
        return leave.status === "REQUESTED" || leave.status === "APPROVED" || leave.status === "DEPARTED";
      }
      return leave.status === filter;
    })
    .sort((a, b) => b.requestedStartDate.localeCompare(a.requestedStartDate));

  const pending = db.leaveRequests.filter((l) => l.status === "REQUESTED");
  const away = db.leaveRequests.filter((l) => l.status === "DEPARTED");
  const overdue = away.filter((l) => isLeaveOverdue(l, today));

  const employeeName = (id: string) => db.employees.find((e) => e.id === id)?.name ?? "Unknown employee";

  function close() {
    setDialog(null);
    setActiveId(null);
    setFieldErrors({});
  }

  function run(result: { ok: boolean; message: string; fieldErrors?: Record<string, string> }) {
    toast.fromResult(result);
    if (result.ok) close();
    else setFieldErrors(result.fieldErrors ?? {});
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink-900">Employee leave</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {role === "HR"
              ? "Requests, approvals, travel and returns. Approval sits with the PCP running the employee's project."
              : role === "MCP"
                ? "Leave awaiting your approval, for employees on your project."
                : "Read-only view. HR maintains these records."}
          </p>
        </div>
        {canRaise && db.employees.length > 0 ? (
          <Button onClick={() => { setFieldErrors({}); setDialog("new"); }}>
            <Plus className="size-3.5" aria-hidden />
            Request leave
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Awaiting decision" value={String(pending.length)} tone={pending.length ? "warn" : "neutral"} icon={<CalendarClock aria-hidden />} />
        <StatTile label="On leave now" value={String(away.length)} hint="Departed, not yet returned" icon={<Plane aria-hidden />} />
        <StatTile label="Overdue returns" value={String(overdue.length)} tone={overdue.length ? "bad" : "neutral"} hint="Past the due-back date" icon={<AlertTriangle aria-hidden />} />
        <StatTile label="Total records" value={String(db.leaveRequests.length)} tone="neutral" />
      </div>

      {overdue.length > 0 ? (
        <Callout tone="bad" title="Overdue returns" icon={<AlertTriangle />}>
          <ul className="space-y-0.5">
            {overdue.map((leave) => {
              const due = dueBackDate(leave);
              const late = daysBetween(due, today) ?? 0;
              return (
                <li key={leave.id} className="min-w-0 break-words">
                  <span className="font-medium">{employeeName(leave.employeeId)}</span> ({leave.reference}) —
                  due back {formatDate(due)}, {late} day{late === 1 ? "" : "s"} late.
                </li>
              );
            })}
          </ul>
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Leave records"
          description={`${rows.length} of ${db.leaveRequests.length} shown`}
          actions={
            <Select
              aria-label="Filter leave by status"
              value={filter}
              onChange={(event) => setFilter(event.target.value as LeaveStatus | "ALL" | "OPEN")}
              className="w-full sm:w-44"
            >
              <option value="OPEN">Open</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="DEPARTED">On leave</option>
              <option value="RETURNED">Returned</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All</option>
            </Select>
          }
        />
        <PanelBody className="p-0">
          {db.employees.length === 0 ? (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="No employees yet"
              description="Register an employee before recording leave."
            />
          ) : db.leaveRequests.length === 0 ? (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="No leave recorded"
              description={canEdit ? "Raise the first leave request." : "HR has not recorded any leave yet."}
              action={canEdit ? <Button onClick={() => setDialog("new")}>Request leave</Button> : undefined}
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Reference</TH>
                    <TH>Employee</TH>
                    <TH>Type</TH>
                    <TH>Dates</TH>
                    <TH align="right">Days</TH>
                    <TH>Status</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmptyRow colSpan={7}>No leave matches that filter.</TableEmptyRow>
                  ) : (
                    rows.map((leave) => (
                      <LeaveRow
                        key={leave.id}
                        leave={leave}
                        employeeName={employeeName(leave.employeeId)}
                        canEdit={canEdit}
                        canDecide={canDecideLeave(leave, actingUser.id, role)}
                        approverName={
                          leave.approverPcpId
                            ? db.users.find((u) => u.id === leave.approverPcpId)?.name
                            : undefined
                        }
                        today={today}
                        onAction={(kind) => {
                          setFieldErrors({});
                          setActiveId(leave.id);
                          setDialog(kind);
                        }}
                        onCancel={() => toast.fromResult(dispatch(cancelLeave, { leaveId: leave.id }))}
                      />
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>

      {dialog === "new" ? (
        <NewLeaveDialog
          db={db}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(requestLeave, input))}
        />
      ) : null}

      {dialog === "decide" && active ? (
        <DecideLeaveDialog
          leave={active}
          employeeName={employeeName(active.employeeId)}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(decideLeave, { ...input, leaveId: active.id }))}
        />
      ) : null}

      {dialog === "depart" && active ? (
        <DepartureDialog
          leave={active}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordLeaveDeparture, { ...input, leaveId: active.id }))}
        />
      ) : null}

      {dialog === "return" && active ? (
        <ReturnDialog
          leave={active}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordLeaveReturn, { ...input, leaveId: active.id }))}
        />
      ) : null}

      {dialog === "extend" && active ? (
        <ExtensionDialog
          leave={active}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(decideLeaveExtension, { ...input, leaveId: active.id }))}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- row --- */

function LeaveRow({
  leave,
  employeeName,
  canEdit,
  canDecide,
  approverName,
  today,
  onAction,
  onCancel,
}: {
  leave: LeaveRequest;
  employeeName: string;
  canEdit: boolean;
  /** Whether the viewer is the one whose approval this needs. */
  canDecide: boolean;
  approverName?: string;
  today: string;
  onAction: (kind: Exclude<DialogKind, "new" | null>) => void;
  onCancel: () => void;
}) {
  const start = leave.approvedStartDate ?? leave.requestedStartDate;
  const end = dueBackDate(leave) ?? leave.requestedReturnDate;
  const days = leave.approvedDays ?? leave.requestedDays;
  const over = overstayDays(leave);
  const late = isLeaveOverdue(leave, today);

  return (
    <TR>
      <TD className="numeric">{leave.reference}</TD>
      <TD>
        <span className="font-medium text-ink-900">{employeeName}</span>
        {leave.replacementRequired ? (
          <span className="block text-2xs text-ink-500">Replacement required</span>
        ) : null}
      </TD>
      <TD className="text-2xs">{LEAVE_TYPE_LABELS[leave.leaveType]}</TD>
      <TD className="text-2xs">
        {formatDate(start)} → {formatDate(end)}
        {leave.extensionApproved && leave.extensionDays ? (
          <span className="block text-2xs text-warn-700">+{leave.extensionDays} day extension</span>
        ) : null}
      </TD>
      <TD align="right" className="numeric">
        {days}
        {over > 0 ? <span className="block text-2xs text-bad-600">+{over} over</span> : null}
      </TD>
      <TD>
        <Badge tone={late ? "bad" : LEAVE_STATUS_TONES[leave.status]}>
          {late ? "Overdue" : LEAVE_STATUS_LABELS[leave.status]}
        </Badge>
      </TD>
      <TD>
        {!canEdit && !canDecide ? (
          <span className="text-2xs text-ink-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {leave.status === "REQUESTED" ? (
              <>
                {canDecide ? (
                  <Button size="sm" onClick={() => onAction("decide")}>
                    Decide
                  </Button>
                ) : (
                  <span className="text-2xs text-ink-500">
                    With {approverName ?? "the PCP"}
                  </span>
                )}
                {canEdit ? (
                  <Button size="sm" variant="secondary" onClick={onCancel}>
                    Cancel
                  </Button>
                ) : null}
              </>
            ) : null}
            {leave.status === "APPROVED" && canEdit ? (
              <>
                <Button size="sm" onClick={() => onAction("depart")}>
                  Record departure
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
              </>
            ) : null}
            {leave.status === "DEPARTED" && canEdit ? (
              <>
                <Button size="sm" onClick={() => onAction("return")}>
                  Record return
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onAction("extend")}>
                  Extension
                </Button>
              </>
            ) : null}
            {leave.status === "RETURNED" || leave.status === "REJECTED" || leave.status === "CANCELLED" ? (
              <span className="text-2xs text-ink-400">Closed</span>
            ) : null}
          </div>
        )}
      </TD>
    </TR>
  );
}

/**
 * Who this request will go to, said before it is raised.
 *
 * Routing that is only visible after the fact is routing nobody trusts.
 */
function describeRouting(db: ReturnType<typeof useDb>, employeeId: string): string {
  if (!employeeId) return "";
  const pcpId = holdingPcpFor(db, employeeId);
  const pcp = pcpId ? db.users.find((u) => u.id === pcpId) : undefined;
  return pcp
    ? "Approval goes to " + pcp.name + ", the PCP on their project."
    : "On standby — no project PCP, so HR decides.";
}

/* ------------------------------------------------------------- dialogs --- */

function NewLeaveDialog({
  db,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  db: ReturnType<typeof useDb>;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    employeeId: string;
    leaveType: (typeof LEAVE_TYPES)[number];
    requestedStartDate: string;
    requestedReturnDate: string;
    reason?: string;
    requestedByName?: string;
    requestedOnDate?: string;
    replacementRequired: boolean;
    replacementEmployeeId?: string;
  }) => void;
}) {
  const activeEmployees = db.employees.filter((e) => e.status === "ACTIVE");
  const [employeeId, setEmployeeId] = React.useState(activeEmployees[0]?.id ?? "");
  const [leaveType, setLeaveType] = React.useState<(typeof LEAVE_TYPES)[number]>("ANNUAL");
  const [start, setStart] = React.useState(todayIso());
  const [end, setEnd] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [requestedByName, setRequestedByName] = React.useState("");
  const [requestedOnDate, setRequestedOnDate] = React.useState(todayIso());
  const [replacementRequired, setReplacementRequired] = React.useState(false);
  const [replacementEmployeeId, setReplacement] = React.useState("");

  const days = daysBetween(start, end);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request leave"
      description="Dates asked for. What is granted is recorded separately."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                employeeId,
                leaveType,
                requestedStartDate: start,
                requestedReturnDate: end,
                reason,
                requestedByName,
                requestedOnDate,
                replacementRequired,
                replacementEmployeeId: replacementRequired ? replacementEmployeeId : undefined,
              })
            }
          >
            Raise request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field
            label="Employee"
            htmlFor="employeeId"
            required
            hint={describeRouting(db, employeeId)}
          >
            <Select id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employeeNumber} — {employee.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Leave type" htmlFor="leaveType" required>
            <Select
              id="leaveType"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as typeof leaveType)}
            >
              {LEAVE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {LEAVE_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Start date"
            htmlFor="requestedStartDate"
            required
            error={fieldErrors.requestedStartDate}
          >
            <Input
              id="requestedStartDate"
              type="date"
              value={start}
              invalid={Boolean(fieldErrors.requestedStartDate)}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>

          <Field
            label="Return date"
            htmlFor="requestedReturnDate"
            required
            error={fieldErrors.requestedReturnDate}
            hint={days && days > 0 ? `${days} days` : undefined}
          >
            <Input
              id="requestedReturnDate"
              type="date"
              value={end}
              invalid={Boolean(fieldErrors.requestedReturnDate)}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <Field
            label="Requested by"
            htmlFor="requestedByName"
            hint="Defaults to the employee. Change it if someone asked on their behalf."
          >
            <Input
              id="requestedByName"
              value={requestedByName}
              onChange={(e) => setRequestedByName(e.target.value)}
              placeholder="The employee"
            />
          </Field>
          <Field
            label="Date requested"
            htmlFor="requestedOnDate"
            hint="When they asked, not when this was keyed in."
          >
            <Input
              id="requestedOnDate"
              type="date"
              value={requestedOnDate}
              onChange={(e) => setRequestedOnDate(e.target.value)}
            />
          </Field>
        </FieldGrid>

        <Field label="Reason" htmlFor="reason">
          <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <Checkbox
          id="replacementRequired"
          checked={replacementRequired}
          onChange={setReplacementRequired}
          label="A replacement is required while they are away"
        />

        {replacementRequired ? (
          <Field
            label="Replacement employee"
            htmlFor="replacementEmployeeId"
            error={fieldErrors.replacementEmployeeId}
          >
            <Select
              id="replacementEmployeeId"
              value={replacementEmployeeId}
              onChange={(e) => setReplacement(e.target.value)}
            >
              <option value="">Not yet identified</option>
              {activeEmployees
                .filter((e) => e.id !== employeeId)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeNumber} — {employee.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

function DecideLeaveDialog({
  leave,
  employeeName,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  leave: LeaveRequest;
  employeeName: string;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    approve: boolean;
    approvedStartDate?: string;
    approvedReturnDate?: string;
    note?: string;
  }) => void;
}) {
  const [start, setStart] = React.useState(leave.requestedStartDate);
  const [end, setEnd] = React.useState(leave.requestedReturnDate);
  const [note, setNote] = React.useState("");
  const granted = daysBetween(start, end);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Decide ${leave.reference}`}
      description={`${employeeName} asked for ${leave.requestedDays} days of ${LEAVE_TYPE_LABELS[
        leave.leaveType
      ].toLowerCase()}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onSubmit({ approve: false, note })}>
            Refuse
          </Button>
          <Button onClick={() => onSubmit({ approve: true, approvedStartDate: start, approvedReturnDate: end, note })}>
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-2xs leading-relaxed text-ink-600">
          Granted dates need not match what was asked for. The difference is what the overstay
          calculation measures against.
        </p>

        <FieldGrid>
          <Field label="Approved start" htmlFor="approvedStartDate">
            <Input id="approvedStartDate" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field
            label="Approved return"
            htmlFor="approvedReturnDate"
            error={fieldErrors.approvedReturnDate}
            hint={granted && granted > 0 ? `${granted} days granted` : undefined}
          >
            <Input
              id="approvedReturnDate"
              type="date"
              value={end}
              invalid={Boolean(fieldErrors.approvedReturnDate)}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </FieldGrid>

        <Field label="Note" htmlFor="note" error={fieldErrors.note} hint="Required when refusing.">
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function DepartureDialog({
  leave,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  leave: LeaveRequest;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    departureDate: string;
    ticketPayee?: (typeof TICKET_PAYEES)[number];
    issuedItemsReturned: boolean;
    outboundTravel?: Record<string, unknown>;
  }) => void;
}) {
  const [departureDate, setDate] = React.useState(leave.approvedStartDate ?? todayIso());
  const [ticketPayee, setPayee] = React.useState<(typeof TICKET_PAYEES)[number]>("COMPANY");
  const [itemsReturned, setItemsReturned] = React.useState(false);
  const [airline, setAirline] = React.useState("");
  const [flightNumber, setFlight] = React.useState("");
  const [fromPort, setFrom] = React.useState("");
  const [toPort, setTo] = React.useState("");
  const [pnr, setPnr] = React.useState("");
  const [ticketFare, setFare] = React.useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Departure — ${leave.reference}`}
      description="Travel details are optional; the departure date is not."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                departureDate,
                ticketPayee,
                issuedItemsReturned: itemsReturned,
                outboundTravel: {
                  airline: airline || undefined,
                  flightNumber: flightNumber || undefined,
                  fromPort: fromPort || undefined,
                  toPort: toPort || undefined,
                  pnr: pnr || undefined,
                  ticketFare: ticketFare ? Number(ticketFare) : undefined,
                },
              })
            }
          >
            Record departure
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field label="Departure date" htmlFor="departureDate" required error={fieldErrors.departureDate}>
            <Input
              id="departureDate"
              type="date"
              value={departureDate}
              invalid={Boolean(fieldErrors.departureDate)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Air ticket paid by" htmlFor="ticketPayee">
            <Select id="ticketPayee" value={ticketPayee} onChange={(e) => setPayee(e.target.value as typeof ticketPayee)}>
              {TICKET_PAYEES.map((value) => (
                <option key={value} value={value}>
                  {TICKET_PAYEE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Airline" htmlFor="airline">
            <Input id="airline" value={airline} onChange={(e) => setAirline(e.target.value)} />
          </Field>
          <Field label="Flight number" htmlFor="flightNumber">
            <Input id="flightNumber" value={flightNumber} onChange={(e) => setFlight(e.target.value)} />
          </Field>
          <Field label="Departure port" htmlFor="fromPort">
            <Input id="fromPort" value={fromPort} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Destination" htmlFor="toPort">
            <Input id="toPort" value={toPort} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Ticket PNR" htmlFor="pnr">
            <Input id="pnr" value={pnr} onChange={(e) => setPnr(e.target.value)} />
          </Field>
          <Field label="Ticket fare (SAR)" htmlFor="ticketFare">
            <NumberInput id="ticketFare" min={0} value={ticketFare} onChange={(e) => setFare(e.target.value)} />
          </Field>
        </FieldGrid>

        <Checkbox
          id="itemsReturned"
          checked={itemsReturned}
          onChange={setItemsReturned}
          label="Issued tools and equipment have been returned"
        />
      </div>
    </Dialog>
  );
}

function ReturnDialog({
  leave,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  leave: LeaveRequest;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    actualReturnDate: string;
    arrivalStatus?: (typeof ARRIVAL_STATUSES)[number];
    returnTravel?: Record<string, unknown>;
  }) => void;
}) {
  const due = dueBackDate(leave);
  const [actualReturnDate, setDate] = React.useState(due ?? todayIso());
  const [arrivalStatus, setStatus] = React.useState<(typeof ARRIVAL_STATUSES)[number]>("ON_TIME");
  const [airline, setAirline] = React.useState("");
  const [finalPort, setPort] = React.useState("");

  const over = due ? (daysBetween(due, actualReturnDate) ?? 0) : 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Return — ${leave.reference}`}
      description={due ? `Due back ${formatDate(due)}.` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                actualReturnDate,
                arrivalStatus,
                returnTravel: { airline: airline || undefined, toPort: finalPort || undefined },
              })
            }
          >
            Record return
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field
            label="Actual return date"
            htmlFor="actualReturnDate"
            required
            error={fieldErrors.actualReturnDate}
            hint={over > 0 ? `${over} day${over === 1 ? "" : "s"} overstayed` : undefined}
          >
            <Input
              id="actualReturnDate"
              type="date"
              value={actualReturnDate}
              invalid={Boolean(fieldErrors.actualReturnDate)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Arrival status" htmlFor="arrivalStatus">
            <Select id="arrivalStatus" value={arrivalStatus} onChange={(e) => setStatus(e.target.value as typeof arrivalStatus)}>
              {ARRIVAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {ARRIVAL_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Return airline" htmlFor="returnAirline">
            <Input id="returnAirline" value={airline} onChange={(e) => setAirline(e.target.value)} />
          </Field>
          <Field label="Final port" htmlFor="finalPort">
            <Input id="finalPort" value={finalPort} onChange={(e) => setPort(e.target.value)} />
          </Field>
        </FieldGrid>

        {over > 0 ? (
          <Callout tone="warn">
            This return is {over} day{over === 1 ? "" : "s"} past the approved date. It will be recorded as
            an overstay against {leave.reference}.
          </Callout>
        ) : null}
      </div>
    </Dialog>
  );
}

function ExtensionDialog({
  leave,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  leave: LeaveRequest;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: { extensionDays: number; reason: string; approve: boolean }) => void;
}) {
  const [days, setDays] = React.useState("");
  const [reason, setReason] = React.useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Extension — ${leave.reference}`}
      description="Recorded as an extension, so the original grant stays visible."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => onSubmit({ extensionDays: Number(days) || 0, reason, approve: false })}
          >
            Refuse
          </Button>
          <Button onClick={() => onSubmit({ extensionDays: Number(days) || 0, reason, approve: true })}>
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Extra days" htmlFor="extensionDays" required error={fieldErrors.extensionDays}>
          <NumberInput
            id="extensionDays"
            min={1}
            value={days}
            invalid={Boolean(fieldErrors.extensionDays)}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <Field label="Reason" htmlFor="extensionReason" required error={fieldErrors.extensionReason}>
          <Textarea
            id="extensionReason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
