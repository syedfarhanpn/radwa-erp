"use client";

/**
 * Employee movement register.
 *
 * Moving someone between work orders: requested → accepted by whoever holds
 * them → released → arrived on site. Each step records its own date, because
 * on the sheet they are four different days and the gap between them is the
 * thing worth seeing.
 */

import * as React from "react";
import { AlertTriangle, ArrowLeftRight, Plus } from "lucide-react";

import {
  MOVEMENT_STATUS_LABELS,
  MOVEMENT_STATUS_TONES,
  RELEASE_REASONS,
  RELEASE_REASON_LABELS,
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  daysBetween,
  describePosting,
  isAssignmentOverdue,
  type EmployeeMovement,
  type MovementStatus,
  type Posting,
} from "@/domain/hrLeave";
import { formatDate, todayIso } from "@/lib/dates";
import {
  cancelMovement,
  decideMovement,
  recordMovementArrival,
  recordMovementRelease,
  requestMovement,
} from "@/services/hrLeaveOperations";
import { useActiveRole, useDb, useDemoStore } from "@/store/useDemoStore";
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

type DialogKind = "new" | "decide" | "release" | "arrive" | null;

export default function MovementRegisterPage() {
  const db = useDb();
  const role = useActiveRole();
  const dispatch = useDemoStore((s) => s.dispatch);
  const toast = useToast();

  const [filter, setFilter] = React.useState<MovementStatus | "ALL" | "OPEN">("OPEN");
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const canEdit = role === "HR";
  const today = todayIso();
  const active = activeId ? db.employeeMovements.find((m) => m.id === activeId) : undefined;

  const rows = db.employeeMovements
    .filter((movement) => {
      if (filter === "ALL") return true;
      if (filter === "OPEN") {
        return ["REQUESTED", "ACCEPTED", "RELEASED"].includes(movement.status);
      }
      return movement.status === filter;
    })
    .sort((a, b) => b.requestedDate.localeCompare(a.requestedDate));

  const pending = db.employeeMovements.filter((m) => m.status === "REQUESTED");
  const inTransit = db.employeeMovements.filter((m) => m.status === "RELEASED");
  const overdue = db.employeeMovements.filter((m) => isAssignmentOverdue(m, today));

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
          <h1 className="text-base font-semibold text-ink-900">Employee movement</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {canEdit
              ? "Release requests, approvals and site transfers."
              : "Read-only view. HR maintains these records."}
          </p>
        </div>
        {canEdit && db.employees.length > 0 ? (
          <Button onClick={() => { setFieldErrors({}); setDialog("new"); }}>
            <Plus className="size-3.5" aria-hidden />
            Request movement
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Awaiting decision" value={String(pending.length)} tone={pending.length ? "warn" : "neutral"} icon={<ArrowLeftRight aria-hidden />} />
        <StatTile label="In transit" value={String(inTransit.length)} hint="Released, not yet arrived" />
        <StatTile label="Assignments overdue" value={String(overdue.length)} tone={overdue.length ? "bad" : "neutral"} hint="Past planned release" icon={<AlertTriangle aria-hidden />} />
        <StatTile label="Total records" value={String(db.employeeMovements.length)} tone="neutral" />
      </div>

      {overdue.length > 0 ? (
        <Callout tone="warn" title="Assignments past their planned release" icon={<AlertTriangle />}>
          <ul className="space-y-0.5">
            {overdue.map((movement) => {
              const late = daysBetween(movement.plannedReleaseDate, today) ?? 0;
              return (
                <li key={movement.id} className="min-w-0 break-words">
                  <span className="font-medium">{employeeName(movement.employeeId)}</span> (
                  {movement.reference}) — {late} day{late === 1 ? "" : "s"} past{" "}
                  {formatDate(movement.plannedReleaseDate)} at {describePosting(movement.to)}.
                </li>
              );
            })}
          </ul>
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Movement records"
          description={`${rows.length} of ${db.employeeMovements.length} shown`}
          actions={
            <Select
              aria-label="Filter movements by status"
              value={filter}
              onChange={(event) => setFilter(event.target.value as MovementStatus | "ALL" | "OPEN")}
              className="w-full sm:w-44"
            >
              <option value="OPEN">Open</option>
              <option value="REQUESTED">Requested</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="RELEASED">Released</option>
              <option value="ARRIVED">Arrived</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All</option>
            </Select>
          }
        />
        <PanelBody className="p-0">
          {db.employees.length === 0 ? (
            <EmptyState
              icon={<ArrowLeftRight aria-hidden />}
              title="No employees yet"
              description="Register an employee before recording a movement."
            />
          ) : db.employeeMovements.length === 0 ? (
            <EmptyState
              icon={<ArrowLeftRight aria-hidden />}
              title="No movements recorded"
              description={canEdit ? "Raise the first release request." : "HR has not recorded any movements yet."}
              action={canEdit ? <Button onClick={() => setDialog("new")}>Request movement</Button> : undefined}
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Reference</TH>
                    <TH>Employee</TH>
                    <TH>From</TH>
                    <TH>To</TH>
                    <TH>Reason</TH>
                    <TH>Status</TH>
                    <TH>Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmptyRow colSpan={7}>No movement matches that filter.</TableEmptyRow>
                  ) : (
                    rows.map((movement) => (
                      <MovementRow
                        key={movement.id}
                        movement={movement}
                        employeeName={employeeName(movement.employeeId)}
                        canEdit={canEdit}
                        today={today}
                        onAction={(kind) => {
                          setFieldErrors({});
                          setActiveId(movement.id);
                          setDialog(kind);
                        }}
                        onCancel={() =>
                          toast.fromResult(dispatch(cancelMovement, { movementId: movement.id }))
                        }
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
        <NewMovementDialog
          db={db}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(requestMovement, input))}
        />
      ) : null}

      {dialog === "decide" && active ? (
        <DecideMovementDialog
          movement={active}
          employeeName={employeeName(active.employeeId)}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(decideMovement, { ...input, movementId: active.id }))}
        />
      ) : null}

      {dialog === "release" && active ? (
        <ReleaseDialog
          movement={active}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordMovementRelease, { ...input, movementId: active.id }))}
        />
      ) : null}

      {dialog === "arrive" && active ? (
        <ArrivalDialog
          movement={active}
          fieldErrors={fieldErrors}
          onClose={close}
          onSubmit={(input) => run(dispatch(recordMovementArrival, { ...input, movementId: active.id }))}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- row --- */

function MovementRow({
  movement,
  employeeName,
  canEdit,
  today,
  onAction,
  onCancel,
}: {
  movement: EmployeeMovement;
  employeeName: string;
  canEdit: boolean;
  today: string;
  onAction: (kind: Exclude<DialogKind, "new" | null>) => void;
  onCancel: () => void;
}) {
  const late = isAssignmentOverdue(movement, today);

  return (
    <TR>
      <TD className="numeric">{movement.reference}</TD>
      <TD>
        <span className="font-medium text-ink-900">{employeeName}</span>
        <span className="block text-2xs text-ink-500">Asked by {movement.requestedBy}</span>
      </TD>
      <TD className="text-2xs">{describePosting(movement.from)}</TD>
      <TD className="text-2xs">{describePosting(movement.to)}</TD>
      <TD className="text-2xs">{RELEASE_REASON_LABELS[movement.reason]}</TD>
      <TD>
        <Badge tone={late ? "bad" : MOVEMENT_STATUS_TONES[movement.status]}>
          {late ? "Overdue" : MOVEMENT_STATUS_LABELS[movement.status]}
        </Badge>
      </TD>
      <TD>
        {!canEdit ? (
          <span className="text-2xs text-ink-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {movement.status === "REQUESTED" ? (
              <>
                <Button size="sm" onClick={() => onAction("decide")}>
                  Decide
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
              </>
            ) : null}
            {movement.status === "ACCEPTED" ? (
              <>
                <Button size="sm" onClick={() => onAction("release")}>
                  Record release
                </Button>
                <Button size="sm" variant="secondary" onClick={onCancel}>
                  Cancel
                </Button>
              </>
            ) : null}
            {movement.status === "RELEASED" ? (
              <Button size="sm" onClick={() => onAction("arrive")}>
                Record arrival
              </Button>
            ) : null}
            {["ARRIVED", "REJECTED", "CANCELLED"].includes(movement.status) ? (
              <span className="text-2xs text-ink-400">Closed</span>
            ) : null}
          </div>
        )}
      </TD>
    </TR>
  );
}

/* ------------------------------------------------------------- dialogs --- */

function NewMovementDialog({
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
    from: Posting;
    to: Posting;
    requestedBy: string;
    requestedDate: string;
    reason: (typeof RELEASE_REASONS)[number];
    reasonNote?: string;
    requiredByDate?: string;
    assignmentDays?: number;
    projectInChargeName?: string;
  }) => void;
}) {
  const activeEmployees = db.employees.filter((e) => e.status === "ACTIVE");
  const [employeeId, setEmployeeId] = React.useState(activeEmployees[0]?.id ?? "");

  // The current posting is taken from the employee's own record so it is not
  // retyped — and so the two sides of the move cannot silently disagree.
  const employee = db.employees.find((e) => e.id === employeeId);
  const currentWorkOrder = employee?.assignedWorkOrderId
    ? db.workOrders.find((w) => w.id === employee.assignedWorkOrderId)
    : undefined;

  const [fromClient, setFromClient] = React.useState("");
  const [fromProject, setFromProject] = React.useState("");
  const [fromSite, setFromSite] = React.useState("");

  const [toWorkOrderId, setToWorkOrder] = React.useState("");
  const [toClient, setToClient] = React.useState("");
  const [toProject, setToProject] = React.useState("");
  const [toSite, setToSite] = React.useState("");

  const [requestedBy, setRequestedBy] = React.useState("");
  const [requestedDate, setRequestedDate] = React.useState(todayIso());
  const [reason, setReason] = React.useState<(typeof RELEASE_REASONS)[number]>("PROJECT_ASSIGNMENT");
  const [reasonNote, setReasonNote] = React.useState("");
  const [requiredByDate, setRequiredBy] = React.useState("");
  const [assignmentDays, setDays] = React.useState("");
  const [projectInChargeName, setPic] = React.useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request employee movement"
      description="Who is wanted, from where, to where."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                employeeId,
                from: {
                  workOrderId: currentWorkOrder?.id,
                  workOrderNumber: currentWorkOrder?.number,
                  client: fromClient || undefined,
                  project: fromProject || undefined,
                  site: fromSite || undefined,
                },
                to: {
                  workOrderId: toWorkOrderId || undefined,
                  workOrderNumber: db.workOrders.find((w) => w.id === toWorkOrderId)?.number,
                  client: toClient || undefined,
                  project: toProject || undefined,
                  site: toSite || undefined,
                },
                requestedBy,
                requestedDate,
                reason,
                reasonNote,
                requiredByDate: requiredByDate || undefined,
                assignmentDays: assignmentDays ? Number(assignmentDays) : undefined,
                projectInChargeName,
              })
            }
          >
            Raise request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid>
          <Field label="Employee" htmlFor="employeeId" required>
            <Select id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {activeEmployees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.employeeNumber} — {item.name} ({item.trade})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Requested by" htmlFor="requestedBy" required error={fieldErrors.requestedBy}>
            <Input
              id="requestedBy"
              value={requestedBy}
              invalid={Boolean(fieldErrors.requestedBy)}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Name of the requester"
            />
          </Field>
        </FieldGrid>

        <div className="rounded-card border border-ink-200 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-900">
            Present posting
            {currentWorkOrder ? (
              <span className="ml-1.5 font-normal text-ink-500">({currentWorkOrder.number})</span>
            ) : (
              <span className="ml-1.5 font-normal text-ink-500">(no work order on file)</span>
            )}
          </p>
          <FieldGrid cols={3}>
            <Field label="Client" htmlFor="fromClient">
              <Input id="fromClient" value={fromClient} onChange={(e) => setFromClient(e.target.value)} />
            </Field>
            <Field label="Project" htmlFor="fromProject">
              <Input id="fromProject" value={fromProject} onChange={(e) => setFromProject(e.target.value)} />
            </Field>
            <Field label="Site" htmlFor="fromSite">
              <Input id="fromSite" value={fromSite} onChange={(e) => setFromSite(e.target.value)} />
            </Field>
          </FieldGrid>
        </div>

        <div className="rounded-card border border-brand-200 bg-brand-50/40 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-900">New posting</p>
          <FieldGrid cols={2}>
            <Field label="Work order" htmlFor="toWorkOrderId">
              <Select
                id="toWorkOrderId"
                value={toWorkOrderId}
                onChange={(e) => setToWorkOrder(e.target.value)}
              >
                <option value="">Not linked to a work order</option>
                {db.workOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Client" htmlFor="toClient">
              <Input id="toClient" value={toClient} onChange={(e) => setToClient(e.target.value)} />
            </Field>
            <Field label="Project" htmlFor="toProject" error={fieldErrors.toProject}>
              <Input
                id="toProject"
                value={toProject}
                invalid={Boolean(fieldErrors.toProject)}
                onChange={(e) => setToProject(e.target.value)}
              />
            </Field>
            <Field label="Site" htmlFor="toSite">
              <Input id="toSite" value={toSite} onChange={(e) => setToSite(e.target.value)} />
            </Field>
          </FieldGrid>
        </div>

        <FieldGrid cols={2}>
          <Field label="Reason" htmlFor="reason" required>
            <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {RELEASE_REASONS.map((value) => (
                <option key={value} value={value}>
                  {RELEASE_REASON_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Request date" htmlFor="requestedDate" required error={fieldErrors.requestedDate}>
            <Input
              id="requestedDate"
              type="date"
              value={requestedDate}
              invalid={Boolean(fieldErrors.requestedDate)}
              onChange={(e) => setRequestedDate(e.target.value)}
            />
          </Field>
          <Field label="Required by" htmlFor="requiredByDate">
            <Input
              id="requiredByDate"
              type="date"
              value={requiredByDate}
              onChange={(e) => setRequiredBy(e.target.value)}
            />
          </Field>
          <Field
            label="Assignment length (days)"
            htmlFor="assignmentDays"
            hint="Used to forecast when they should come back."
          >
            <NumberInput
              id="assignmentDays"
              min={1}
              value={assignmentDays}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
          <Field label="Project in charge" htmlFor="projectInChargeName">
            <Input
              id="projectInChargeName"
              value={projectInChargeName}
              onChange={(e) => setPic(e.target.value)}
              placeholder="Who currently holds this employee"
            />
          </Field>
        </FieldGrid>

        <Field label="Comments" htmlFor="reasonNote">
          <Textarea id="reasonNote" rows={2} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function DecideMovementDialog({
  movement,
  employeeName,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  movement: EmployeeMovement;
  employeeName: string;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: { accept: boolean; agreedReleaseDate?: string; note?: string }) => void;
}) {
  const [agreedReleaseDate, setDate] = React.useState(movement.requiredByDate ?? todayIso());
  const [note, setNote] = React.useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Decide ${movement.reference}`}
      description={`${employeeName} is wanted at ${describePosting(movement.to)}.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onSubmit({ accept: false, note })}>
            Refuse
          </Button>
          <Button onClick={() => onSubmit({ accept: true, agreedReleaseDate, note })}>Accept</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-2xs leading-relaxed text-ink-600">
          The decision belongs to whoever currently holds the employee
          {movement.projectInChargeName ? ` — ${movement.projectInChargeName}` : ""}.
        </p>
        <Field
          label="Agreed release date"
          htmlFor="agreedReleaseDate"
          required
          error={fieldErrors.agreedReleaseDate}
        >
          <Input
            id="agreedReleaseDate"
            type="date"
            value={agreedReleaseDate}
            invalid={Boolean(fieldErrors.agreedReleaseDate)}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="note" error={fieldErrors.note} hint="Required when refusing.">
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function ReleaseDialog({
  movement,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  movement: EmployeeMovement;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    actualReleaseDate: string;
    transportMode?: (typeof TRANSPORT_MODES)[number];
    handoverNote?: string;
    replacementRequired?: boolean;
  }) => void;
}) {
  const [actualReleaseDate, setDate] = React.useState(movement.agreedReleaseDate ?? todayIso());
  const [transportMode, setTransport] = React.useState<(typeof TRANSPORT_MODES)[number]>("COMPANY_CAR");
  const [handoverNote, setNote] = React.useState("");
  const [replacementRequired, setReplacement] = React.useState(false);

  const slip = daysBetween(movement.agreedReleaseDate, actualReleaseDate) ?? 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Release — ${movement.reference}`}
      description={
        movement.agreedReleaseDate ? `Agreed for ${formatDate(movement.agreedReleaseDate)}.` : undefined
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({ actualReleaseDate, transportMode, handoverNote, replacementRequired })
            }
          >
            Record release
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field
            label="Actual release date"
            htmlFor="actualReleaseDate"
            required
            error={fieldErrors.actualReleaseDate}
            hint={slip > 0 ? `${slip} day${slip === 1 ? "" : "s"} later than agreed` : undefined}
          >
            <Input
              id="actualReleaseDate"
              type="date"
              value={actualReleaseDate}
              invalid={Boolean(fieldErrors.actualReleaseDate)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Transport" htmlFor="transportMode">
            <Select
              id="transportMode"
              value={transportMode}
              onChange={(e) => setTransport(e.target.value as typeof transportMode)}
            >
              {TRANSPORT_MODES.map((value) => (
                <option key={value} value={value}>
                  {TRANSPORT_MODE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>

        <Field label="Handover note" htmlFor="handoverNote">
          <Textarea id="handoverNote" rows={2} value={handoverNote} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Checkbox
          id="replacementRequired"
          checked={replacementRequired}
          onChange={setReplacement}
          label="A replacement is required at the releasing site"
        />
      </div>
    </Dialog>
  );
}

function ArrivalDialog({
  movement,
  fieldErrors,
  onClose,
  onSubmit,
}: {
  movement: EmployeeMovement;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onSubmit: (input: {
    arrivedAtSiteDate: string;
    workStatus: (typeof WORK_STATUSES)[number];
    statusReason?: string;
    plannedReleaseDate?: string;
  }) => void;
}) {
  const [arrivedAtSiteDate, setDate] = React.useState(movement.actualReleaseDate ?? todayIso());
  const [workStatus, setStatus] = React.useState<(typeof WORK_STATUSES)[number]>("WORKING_AT_SITE");
  const [statusReason, setReason] = React.useState("");
  const [plannedReleaseDate, setPlanned] = React.useState("");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Arrival — ${movement.reference}`}
      description={`At ${describePosting(movement.to)}. This closes the movement and updates the employee's posting.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({ arrivedAtSiteDate, workStatus, statusReason, plannedReleaseDate: plannedReleaseDate || undefined })
            }
          >
            Record arrival
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field
            label="Arrived at site"
            htmlFor="arrivedAtSiteDate"
            required
            error={fieldErrors.arrivedAtSiteDate}
          >
            <Input
              id="arrivedAtSiteDate"
              type="date"
              value={arrivedAtSiteDate}
              invalid={Boolean(fieldErrors.arrivedAtSiteDate)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Work status" htmlFor="workStatus" required>
            <Select
              id="workStatus"
              value={workStatus}
              onChange={(e) => setStatus(e.target.value as typeof workStatus)}
            >
              {WORK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {WORK_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Planned release"
            htmlFor="plannedReleaseDate"
            hint={
              movement.assignmentDays
                ? `Left blank, computed from the ${movement.assignmentDays}-day assignment.`
                : "Forecast release from this posting."
            }
          >
            <Input
              id="plannedReleaseDate"
              type="date"
              value={plannedReleaseDate}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </Field>
          <Field label="Status reason" htmlFor="statusReason" hint="Why standby, or what is missing.">
            <Input id="statusReason" value={statusReason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </FieldGrid>
      </div>
    </Dialog>
  );
}
