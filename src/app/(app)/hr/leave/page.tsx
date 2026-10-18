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
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Plane, Plus } from "lucide-react";

import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  LEAVE_TYPE_LABELS,
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
import { canDecideLeave } from "@/services/hrLeaveOperations";
import {
  DecideLeaveDialog,
  DepartureDialog,
  ExtensionDialog,
  NewLeaveDialog,
  ReturnDialog,
} from "@/components/hr/leaveDialogs";
import { Select } from "@/components/ui/form";
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
  const router = useRouter();
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
                        onOpen={() => router.push(`/hr/leave/${leave.id}`)}
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
  onOpen,
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
  onOpen: () => void;
  onAction: (kind: Exclude<DialogKind, "new" | null>) => void;
  onCancel: () => void;
}) {
  const start = leave.approvedStartDate ?? leave.requestedStartDate;
  const end = dueBackDate(leave) ?? leave.requestedReturnDate;
  const days = leave.approvedDays ?? leave.requestedDays;
  const over = overstayDays(leave);
  const late = isLeaveOverdue(leave, today);

  return (
    <TR onClick={onOpen}>
      <TD className="numeric">
        <span className="font-medium text-brand-700 underline-offset-2 hover:underline">
          {leave.reference}
        </span>
      </TD>
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
      {/* Clicks on a button are the button's, not the row's. Without this a
          "Decide" press would also navigate, and the dialog would open on a
          page that is already unmounting. */}
      <TD>
        <div onClick={(event) => event.stopPropagation()}>
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
        </div>
      </TD>
    </TR>
  );
}

