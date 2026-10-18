"use client";

/**
 * One leave, in full.
 *
 * The register answers "where is this up to"; this answers "what happened".
 * Everything the workflow captured is shown, including the parts that only
 * exist on a finished record — the flights, the ticket payee, the extension
 * and its reason, how far past the approved date they actually got back.
 *
 * Requested and approved are shown side by side rather than merged. They are
 * separate columns on the business's own sheet because they differ, and the
 * difference is what the overstay figure is measured against.
 */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Plane, PlaneLanding } from "lucide-react";

import {
  ARRIVAL_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  LEAVE_TYPE_LABELS,
  TICKET_PAYEE_LABELS,
  daysBetween,
  dueBackDate,
  isLeaveOverdue,
  overstayDays,
  type LeaveTravelLeg,
} from "@/domain/hrLeave";
import { formatDate, formatDateTime, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  canDecideLeave,
  decideLeave,
  decideLeaveExtension,
  recordLeaveDeparture,
  recordLeaveReturn,
  serviceSummary,
} from "@/services/hrLeaveOperations";
import { useActingUser, useActiveRole, useDb, useDemoStore } from "@/store/useDemoStore";
import {
  DecideLeaveDialog,
  DepartureDialog,
  ExtensionDialog,
  ReturnDialog,
} from "@/components/hr/leaveDialogs";
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

type DialogKind = "decide" | "depart" | "return" | "extend" | null;

export default function LeaveDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const dispatch = useDemoStore((s) => s.dispatch);
  const router = useRouter();
  const toast = useToast();

  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const leave = db.leaveRequests.find((l) => l.id === params.id);

  if (!leave) {
    return (
      <Callout tone="warn" title="Leave not found">
        That record does not exist, or it has been removed.{" "}
        <LinkButton href="/hr/leave">Back to the leave register</LinkButton>
      </Callout>
    );
  }

  const employee = db.employees.find((e) => e.id === leave.employeeId);
  const approverPcp = leave.approverPcpId
    ? db.users.find((u) => u.id === leave.approverPcpId)
    : undefined;
  const decidedBy = leave.approverId ? db.users.find((u) => u.id === leave.approverId) : undefined;
  const replacement = leave.replacementEmployeeId
    ? db.employees.find((e) => e.id === leave.replacementEmployeeId)
    : undefined;

  const today = todayIso();
  const due = dueBackDate(leave);
  const over = overstayDays(leave);
  const late = isLeaveOverdue(leave, today);
  const canEdit = role === "HR";
  const canDecide = canDecideLeave(leave, actingUser.id, role);
  const service = employee ? serviceSummary(db, employee.id) : undefined;

  function close() {
    setDialog(null);
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
          <button
            type="button"
            onClick={() => router.push("/hr/leave")}
            className="mb-1 inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-ink-700"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Leave register
          </button>
          <h1 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink-900">
            {leave.reference}
            <Badge tone={late ? "bad" : LEAVE_STATUS_TONES[leave.status]}>
              {late ? "Overdue" : LEAVE_STATUS_LABELS[leave.status]}
            </Badge>
          </h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {employee ? (
              <>
                <LinkButton href={`/hr/employees/${employee.id}`}>
                  {employee.employeeNumber} — {employee.name}
                </LinkButton>{" "}
                · {employee.trade} · {LEAVE_TYPE_LABELS[leave.leaveType]}
              </>
            ) : (
              <>Employee record missing · {LEAVE_TYPE_LABELS[leave.leaveType]}</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {leave.status === "REQUESTED" && canDecide ? (
            <Button onClick={() => setDialog("decide")}>Decide</Button>
          ) : null}
          {leave.status === "APPROVED" && canEdit ? (
            <Button onClick={() => setDialog("depart")}>Record departure</Button>
          ) : null}
          {leave.status === "DEPARTED" && canEdit ? (
            <>
              <Button onClick={() => setDialog("return")}>Record return</Button>
              <Button variant="secondary" onClick={() => setDialog("extend")}>
                Extension
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {leave.status === "REQUESTED" && !canDecide ? (
        <Callout tone="neutral">
          Waiting on {approverPcp ? approverPcp.name : "HR"} to decide.
          {approverPcp ? " They run the project this employee is posted to." : ""}
        </Callout>
      ) : null}

      {late ? (
        <Callout tone="bad" title="Overdue return" icon={<AlertTriangle />}>
          Due back {formatDate(due)} — {daysBetween(due, today)} days ago, and not yet recorded as
          returned.
        </Callout>
      ) : null}

      {over > 0 ? (
        <Callout tone="warn" title={`${over} day${over === 1 ? "" : "s"} overstayed`}>
          Returned {formatDate(leave.actualReturnDate)} against an approved return of{" "}
          {formatDate(due)}.
          {leave.extensionApproved && leave.extensionDays
            ? ` The ${leave.extensionDays}-day extension is already included.`
            : ""}
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------- asked vs granted */}
        <Panel>
          <PanelHeader
            title="Requested and approved"
            description="Shown separately because they differ, and the difference is what overstay measures."
          />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-3 rounded-card border border-ink-200 p-3">
                <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">Requested</p>
                <KeyValue label="Start">{formatDate(leave.requestedStartDate)}</KeyValue>
                <KeyValue label="Return">{formatDate(leave.requestedReturnDate)}</KeyValue>
                <KeyValue label="Days">{leave.requestedDays}</KeyValue>
              </div>

              <div
                className={
                  leave.approvedStartDate
                    ? "space-y-3 rounded-card border border-brand-200 bg-brand-50/40 p-3"
                    : "space-y-3 rounded-card border border-ink-200 bg-ink-50 p-3"
                }
              >
                <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">Approved</p>
                {leave.approvedStartDate ? (
                  <>
                    <KeyValue label="Start">{formatDate(leave.approvedStartDate)}</KeyValue>
                    <KeyValue label="Return">{formatDate(leave.approvedReturnDate)}</KeyValue>
                    <KeyValue label="Days">
                      {leave.approvedDays}
                      {leave.approvedDays !== leave.requestedDays ? (
                        <span className="ml-1 text-2xs text-warn-700">
                          ({leave.requestedDays} requested)
                        </span>
                      ) : null}
                    </KeyValue>
                  </>
                ) : (
                  <p className="text-xs text-ink-500">
                    {leave.status === "REJECTED" ? "Refused." : "Not yet decided."}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {/* Records raised before the requester field existed have none.
                  The employee is the right answer for those, and it is what a
                  new record defaults to anyway. */}
              <KeyValue label="Requested by">
                {leave.requestedByName ?? employee?.name ?? "—"}
              </KeyValue>
              <KeyValue label="Date requested">{formatDate(leave.requestedOnDate) || "—"}</KeyValue>
              <KeyValue label="Approval sits with">
                {approverPcp ? `${approverPcp.name} (PCP)` : "HR — employee is on standby"}
              </KeyValue>
              <KeyValue label="Decided by">
                {decidedBy ? `${decidedBy.name} · ${formatDateTime(leave.decidedAt)}` : "—"}
              </KeyValue>
              <KeyValue label="Due back">{formatDate(due) || "—"}</KeyValue>
              <KeyValue label="Actually returned">
                {formatDate(leave.actualReturnDate) || "—"}
              </KeyValue>
            </div>

            {leave.reason ? (
              <div className="mt-3">
                <KeyValue label="Reason given">
                  <span className="whitespace-pre-wrap">{leave.reason}</span>
                </KeyValue>
              </div>
            ) : null}

            {leave.decisionNote ? (
              <div className="mt-3">
                <KeyValue label="Decision note">
                  <span className="whitespace-pre-wrap">{leave.decisionNote}</span>
                </KeyValue>
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        {/* --------------------------------------------- cover and state */}
        <Panel>
          <PanelHeader title="Cover and status" />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Replacement required">
                {leave.replacementRequired ? "Yes" : "No"}
              </KeyValue>
              <KeyValue label="Replacement">
                {replacement ? (
                  <LinkButton href={`/hr/employees/${replacement.id}`}>{replacement.name}</LinkButton>
                ) : leave.replacementRequired ? (
                  "Not yet identified"
                ) : (
                  "—"
                )}
              </KeyValue>
              <KeyValue label="Issued items returned">
                {leave.issuedItemsReturned === undefined
                  ? "—"
                  : leave.issuedItemsReturned
                    ? "Yes"
                    : "No"}
              </KeyValue>
              <KeyValue label="Air ticket paid by">
                {leave.ticketPayee ? TICKET_PAYEE_LABELS[leave.ticketPayee] : "—"}
              </KeyValue>
              <KeyValue label="Arrival status">
                {leave.arrivalStatus ? ARRIVAL_STATUS_LABELS[leave.arrivalStatus] : "—"}
              </KeyValue>
              <KeyValue label="Overstay">
                {over > 0 ? (
                  <span className="font-semibold text-bad-600">{over} days</span>
                ) : leave.actualReturnDate ? (
                  "None"
                ) : (
                  "—"
                )}
              </KeyValue>
            </div>

            {service ? (
              <div className="mt-3 rounded-card border border-ink-200 bg-ink-50 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <KeyValue label="Leave days taken to date">{service.leaveDays}</KeyValue>
                  <KeyValue label="Working days served">{service.workingDays}</KeyValue>
                </div>
              </div>
            ) : null}

            {leave.extensionRequested ? (
              <div className="mt-3 rounded-card border border-warn-200 bg-warn-50/50 p-3">
                <p className="text-xs font-semibold text-ink-900">
                  Extension {leave.extensionApproved ? "approved" : "refused"}
                  {leave.extensionDays ? ` — ${leave.extensionDays} days` : ""}
                </p>
                {leave.extensionReason ? (
                  <p className="mt-1 text-2xs leading-relaxed text-ink-700">{leave.extensionReason}</p>
                ) : null}
                {leave.extensionApproved && leave.approvedReturnDate ? (
                  <p className="mt-1 text-2xs text-ink-500">
                    Approved return {formatDate(leave.approvedReturnDate)} → due back{" "}
                    {formatDate(due)}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        {/* ------------------------------------------------------ travel */}
        <TravelPanel
          title="Outbound travel"
          icon={<Plane aria-hidden />}
          date={leave.departureDate}
          dateLabel="Departure date"
          leg={leave.outboundTravel}
        />
        <TravelPanel
          title="Return travel"
          icon={<PlaneLanding aria-hidden />}
          date={leave.actualReturnDate}
          dateLabel="Return date"
          leg={leave.returnTravel}
        />
      </div>

      <p className="text-2xs text-ink-400">
        Raised {formatDateTime(leave.requestedAt)} · last changed {formatDateTime(leave.updatedAt)}.
      </p>

      {dialog === "decide" ? (
        <DecideLeaveDialog
          leave={leave}
          employeeName={employee?.name ?? "this employee"}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(decideLeave, { ...input, leaveId: leave.id }))}
        />
      ) : null}

      {dialog === "depart" ? (
        <DepartureDialog
          leave={leave}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordLeaveDeparture, { ...input, leaveId: leave.id }))}
        />
      ) : null}

      {dialog === "return" ? (
        <ReturnDialog
          leave={leave}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordLeaveReturn, { ...input, leaveId: leave.id }))}
        />
      ) : null}

      {dialog === "extend" ? (
        <ExtensionDialog
          leave={leave}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(decideLeaveExtension, { ...input, leaveId: leave.id }))}
        />
      ) : null}
    </div>
  );
}

/**
 * One leg of the trip.
 *
 * Renders the panel even when empty, so "no flight recorded" is visible
 * rather than the section silently not existing — the absence is itself
 * information when a ticket was supposed to have been booked.
 */
function TravelPanel({
  title,
  icon,
  date,
  dateLabel,
  leg,
}: {
  title: string;
  icon: React.ReactNode;
  date?: string;
  dateLabel: string;
  leg?: LeaveTravelLeg;
}) {
  const hasDetail =
    leg && Object.values(leg).some((value) => value !== undefined && value !== "");

  return (
    <Panel>
      <PanelHeader title={title} icon={icon} />
      <PanelBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <KeyValue label={dateLabel}>{formatDate(date) || "Not recorded"}</KeyValue>
          <KeyValue label="Airline">
            {[leg?.airline, leg?.flightNumber].filter(Boolean).join(" ") || "—"}
          </KeyValue>
          <KeyValue label="From">{leg?.fromPort ?? "—"}</KeyValue>
          <KeyValue label="To">{leg?.toPort ?? "—"}</KeyValue>
          <KeyValue label="Transit">{leg?.transitAirport ?? "—"}</KeyValue>
          <KeyValue label="PNR">{leg?.pnr ?? "—"}</KeyValue>
          <KeyValue label="Agency">{leg?.agencyName ?? "—"}</KeyValue>
          <KeyValue label="Ticket fare">
            {leg?.ticketFare !== undefined ? formatMoney(leg.ticketFare, "SAR", 0) : "—"}
          </KeyValue>
        </div>

        {!hasDetail && !date ? (
          <p className="mt-3 text-2xs text-ink-400">
            No travel recorded for this leg yet.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
