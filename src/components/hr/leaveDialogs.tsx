"use client";

/**
 * The dialogs that move a leave through its states.
 *
 * Lifted out of the register page so the detail page can offer the same
 * actions. One definition each: a field added to a form cannot then go
 * missing from the other screen, which is exactly how two copies drift.
 */

import * as React from "react";

import {
  ARRIVAL_STATUSES,
  ARRIVAL_STATUS_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  TICKET_PAYEES,
  TICKET_PAYEE_LABELS,
  daysBetween,
  dueBackDate,
  type LeaveRequest,
} from "@/domain/hrLeave";
import type { DemoDatabase } from "@/domain/types";
import { formatDate, todayIso } from "@/lib/dates";
import { holdingPcpFor } from "@/services/hrLeaveOperations";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FieldGrid, Input, NumberInput, Select, Textarea } from "@/components/ui/form";
import { Button, Callout } from "@/components/ui/primitives";

/**
 * Who this request will go to, said before it is raised.
 *
 * Routing that is only visible after the fact is routing nobody trusts.
 */
function describeRouting(db: DemoDatabase, employeeId: string): string {
  if (!employeeId) return "";
  const pcpId = holdingPcpFor(db, employeeId);
  const pcp = pcpId ? db.users.find((u) => u.id === pcpId) : undefined;
  return pcp
    ? "Approval goes to " + pcp.name + ", the PCP on their project."
    : "On standby — no project PCP, so HR decides.";
}

export function NewLeaveDialog({
  db,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  db: DemoDatabase;
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

export function DecideLeaveDialog({
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

export function DepartureDialog({
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

export function ReturnDialog({
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

export function ExtensionDialog({
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
