"use client";

/**
 * Radwa Gulf and Co — award, work order, kickoff, PCP, purchase order and Operations
 * handover.
 *
 * Three rules are visible here:
 *   - an award can generate a work-order draft with no purchase order on file;
 *   - work-order finalization and Operations handover are separate stages;
 *   - the purchase order must be recorded before handover can complete.
 */

import * as React from "react";
import {
  Award as AwardIcon,
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  FileSignature,
  Handshake,
  Printer,
  ReceiptText,
  Save,
  UserPlus,
  Users,
} from "lucide-react";

import { handoverPolicy, workOrderNumberingConfig } from "@/domain/config";
import { PO_STATUSES, PO_STATUS_LABELS, type PoStatus } from "@/domain/enums";
import { canCompleteHandover, canFinalizeWorkOrder } from "@/domain/rules";
import { brand } from "@/lib/brand";
import { formatMoney, parseNumericInput } from "@/lib/money";
import { formatDate, formatDateTime, todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import { userById } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  KeyValue,
  LinkButton,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/ui/primitives";
import { Checkbox, Field, FilePicker, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { PoStatusBadge, WorkOrderStatusBadge } from "./StatusBadges";
import { DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

/* ============================================================= award ==== */

export function AwardPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const award = detail.award;
  if (!award) return null;
  const estimate = db.estimates.find((e) => e.id === award.approvedEstimateId);

  return (
    <Panel>
      <PanelHeader icon={<AwardIcon />} title="Award" actions={<Badge tone="ok">Awarded</Badge>} />
      <PanelBody className="space-y-3">
        <DefinitionList cols={4}>
          <KeyValue label="Awarded value">
            <span className="numeric font-semibold text-ink-900">
              {formatMoney(award.awardedValue, award.currency)}
            </span>
          </KeyValue>
          <KeyValue label="Awarded on">{formatDate(award.awardedAt)}</KeyValue>
          <KeyValue label="Client reference">{award.clientReference ?? "—"}</KeyValue>
          <KeyValue label="Approved quotation">
            {estimate ? `Estimate revision ${estimate.version}` : "—"}
          </KeyValue>
        </DefinitionList>

        <KeyValue label="Awarded scope">
          <span className="text-xs leading-relaxed text-ink-700">{award.awardedScope}</span>
        </KeyValue>

        <DefinitionList cols={2}>
          <KeyValue label="Award letter">
            {award.awardLetterFileName ? (
              <span className="font-mono text-2xs">{award.awardLetterFileName}</span>
            ) : (
              <span className="text-xs text-ink-500">Not attached — an award letter is not mandatory.</span>
            )}
          </KeyValue>
          <KeyValue label="Recorded by">{userById(db, award.recordedById)?.name ?? "—"}</KeyValue>
        </DefinitionList>
      </PanelBody>
    </Panel>
  );
}

/* ======================================================== work order === */

export function WorkOrderPanel({ detail, compact }: { detail: EnquiryDetail; compact?: boolean }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();
  const [confirmFinalize, setConfirmFinalize] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const wo = detail.workOrder;
  const award = detail.award;

  if (!award) {
    return (
      <Panel>
        <PanelHeader icon={<FileSignature />} title="Work order" />
        <EmptyState
          title="No award yet"
          description="A work-order draft is generated from the award details and the approved quotation."
        />
      </Panel>
    );
  }

  if (!wo) {
    return (
      <Panel>
        <PanelHeader icon={<FileSignature />} title="Work order" actions={<Badge tone="warn">Not drafted</Badge>} />
        <PanelBody className="space-y-3">
          <Callout tone="info">
            A purchase order is <span className="font-semibold">not</span> required to generate the initial
            work-order draft.
          </Callout>
          <RoleGate allow={["CRM_MANAGER"]} what="Work-order generation">
            <Button
              variant="primary"
              icon={<FileSignature />}
              disabled={busy}
              onClick={() => void run(() => repo.generateWorkOrder({ enquiryId: detail.enquiry.id }))}
            >
              Generate work-order draft
            </Button>
          </RoleGate>
          <PolicyNote>{workOrderNumberingConfig.note}</PolicyNote>
        </PanelBody>
      </Panel>
    );
  }

  const editable = wo.status === "DRAFT" && role === "CRM_MANAGER";
  const gate = canFinalizeWorkOrder(wo);
  const value = (key: keyof typeof wo) => draft[key as string] ?? ((wo[key] as string | number | undefined) ?? "");

  const saveField = (key: string) => {
    if (draft[key] === undefined) return;
    const numericKeys = ["durationDays", "retentionPercent", "contractValue"];
    void run(
      () =>
        repo.updateWorkOrder({
          workOrderId: wo.id,
          patch: { [key]: numericKeys.includes(key) ? parseNumericInput(draft[key]) : draft[key] },
        }),
      { silentSuccess: true },
    );
    setDraft((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<FileSignature />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="numeric">{wo.number}</span>
              <span className="text-2xs font-normal text-ink-500">revision {wo.version}</span>
              <WorkOrderStatusBadge status={wo.status} />
            </span>
          }
          description={`Issued ${formatDate(wo.issuedDate)} · ${detail.client?.name ?? ""}`}
          actions={
            <>
              <LinkButton href={`/work-orders/${wo.id}/print`} size="sm" variant="secondary" icon={<Printer />}>
                Print view
              </LinkButton>
              {editable ? (
                <Button
                  variant="primary"
                  icon={<CheckCircle2 />}
                  disabled={busy || !gate.allowed}
                  onClick={() => setConfirmFinalize(true)}
                >
                  Finalize work order
                </Button>
              ) : null}
            </>
          }
        />

        <PanelBody className="space-y-4">
          <DefinitionList cols={4}>
            <KeyValue label="Contract value">
              <span className="numeric font-semibold text-ink-900">
                {formatMoney(wo.contractValue, wo.currency)}
              </span>
            </KeyValue>
            <KeyValue label="Approved quotation">
              Estimate revision {db.estimates.find((e) => e.id === wo.approvedEstimateId)?.version ?? "—"}
            </KeyValue>
            <KeyValue label="BOQ reference">
              {detail.approvedEstimate ? `${detail.boqLines.length} BOQ line(s)` : "—"}
            </KeyValue>
            <KeyValue label="Finalized">
              {wo.finalizedAt ? (
                <>
                  {formatDate(wo.finalizedAt)}
                  <span className="mt-0.5 block text-2xs text-ink-500">
                    by {userById(db, wo.finalizedById)?.name}
                  </span>
                </>
              ) : (
                "Not finalized"
              )}
            </KeyValue>
          </DefinitionList>

          {!gate.allowed && wo.status === "DRAFT" ? (
            <Callout tone="warn" title="Before finalizing">
              {gate.reason}
            </Callout>
          ) : null}

          {!compact ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Awarded scope" htmlFor="wo-scope">
                <Textarea
                  id="wo-scope"
                  rows={4}
                  disabled={!editable}
                  value={String(value("awardedScope"))}
                  onChange={(event) => setDraft((d) => ({ ...d, awardedScope: event.target.value }))}
                  onBlur={() => saveField("awardedScope")}
                />
              </Field>

              <Field label="Commercial summary" htmlFor="wo-commercial">
                <Textarea
                  id="wo-commercial"
                  rows={4}
                  disabled={!editable}
                  value={String(value("commercialSummary"))}
                  onChange={(event) => setDraft((d) => ({ ...d, commercialSummary: event.target.value }))}
                  onBlur={() => saveField("commercialSummary")}
                  placeholder="Lump sum / remeasured basis, provisional sums, what is included."
                />
              </Field>

              <Field label="Key terms" htmlFor="wo-terms">
                <Textarea
                  id="wo-terms"
                  rows={4}
                  disabled={!editable}
                  value={String(value("keyTerms"))}
                  onChange={(event) => setDraft((d) => ({ ...d, keyTerms: event.target.value }))}
                  onBlur={() => saveField("keyTerms")}
                  placeholder="Access, phasing, client-supplied items, working hours."
                />
              </Field>

              <Field label="Payment terms" htmlFor="wo-payment">
                <Textarea
                  id="wo-payment"
                  rows={4}
                  disabled={!editable}
                  value={String(value("paymentTerms"))}
                  onChange={(event) => setDraft((d) => ({ ...d, paymentTerms: event.target.value }))}
                  onBlur={() => saveField("paymentTerms")}
                  placeholder="Advance, progress payments, certification period."
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
                <Field label="Planned start" htmlFor="wo-start">
                  <Input
                    id="wo-start"
                    type="date"
                    disabled={!editable}
                    value={String(value("plannedStartDate"))}
                    onChange={(event) => setDraft((d) => ({ ...d, plannedStartDate: event.target.value }))}
                    onBlur={() => saveField("plannedStartDate")}
                  />
                </Field>
                <Field label="Duration (days)" htmlFor="wo-duration">
                  <Input
                    id="wo-duration"
                    inputMode="numeric"
                    disabled={!editable}
                    value={String(value("durationDays"))}
                    onChange={(event) => setDraft((d) => ({ ...d, durationDays: event.target.value }))}
                    onBlur={() => saveField("durationDays")}
                  />
                </Field>
                <Field label="Retention (%)" htmlFor="wo-retention">
                  <Input
                    id="wo-retention"
                    inputMode="decimal"
                    disabled={!editable}
                    value={String(value("retentionPercent"))}
                    onChange={(event) => setDraft((d) => ({ ...d, retentionPercent: event.target.value }))}
                    onBlur={() => saveField("retentionPercent")}
                  />
                </Field>
              </div>

              <Field label="Notes" htmlFor="wo-notes" className="lg:col-span-2">
                <Textarea
                  id="wo-notes"
                  rows={2}
                  disabled={!editable}
                  value={String(value("notes"))}
                  onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
                  onBlur={() => saveField("notes")}
                />
              </Field>
            </div>
          ) : null}

          {editable && Object.keys(draft).length > 0 ? (
            <Button
              variant="secondary"
              icon={<Save />}
              disabled={busy}
              onClick={() => Object.keys(draft).forEach(saveField)}
            >
              Save changes
            </Button>
          ) : null}
        </PanelBody>

        <PanelFooter>
          <p className="text-2xs text-ink-500">{workOrderNumberingConfig.note}</p>
        </PanelFooter>
      </Panel>

      <ConfirmDialog
        open={confirmFinalize}
        onClose={() => setConfirmFinalize(false)}
        onConfirm={() =>
          void run(() => repo.finalizeWorkOrder({ workOrderId: wo.id }), {
            onSuccess: () => setConfirmFinalize(false),
          })
        }
        title={`Finalize ${wo.number}?`}
        confirmLabel="Finalize work order"
        busy={busy}
        body={
          <>
            The work order will be locked at{" "}
            <span className="font-semibold">{formatMoney(wo.contractValue, wo.currency)}</span> and can no longer
            be edited. Finalizing is <span className="font-semibold">not</span> the same as handing over to
            Operations — that is a separate step with its own checklist.
          </>
        }
      />
    </>
  );
}

/* =========================================================== kickoff === */

/** Stable mount key for `KickoffPanel`: changes only when the record is saved. */
export function kickoffPanelKey(detail: EnquiryDetail): string {
  return `kickoff-${detail.kickoff?.id ?? "new"}-${detail.kickoff?.recordedAt ?? ""}`;
}

export function KickoffPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const kickoff = detail.kickoff;
  const [editing, setEditing] = React.useState(false);
  const [meetingDate, setMeetingDate] = React.useState(kickoff?.meetingDate ?? todayIso());
  const [location, setLocation] = React.useState(kickoff?.location ?? "");
  const [attendeeIds, setAttendeeIds] = React.useState<string[]>(kickoff?.attendeeIds ?? []);
  const [externalAttendees, setExternalAttendees] = React.useState(kickoff?.externalAttendees ?? "");
  const [minutes, setMinutes] = React.useState(kickoff?.minutes ?? "");
  const [decisions, setDecisions] = React.useState(kickoff?.decisions ?? "");

  // Form state is initialised from the record above. Callers mount this panel
  // with a key derived from the kickoff record, so saving remounts it with the
  // stored values rather than an effect copying them back into state.
  const canEdit = role === "MCP" && Boolean(detail.award);
  const showForm = canEdit && (editing || !kickoff);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<Users />}
          title="Kickoff meeting"
          description="Recorded by the MCP after the award."
          actions={
            kickoff ? (
              <>
                <Badge tone="ok">Recorded</Badge>
                {canEdit ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
                    {editing ? "Cancel edit" : "Edit minutes"}
                  </Button>
                ) : null}
              </>
            ) : (
              <Badge tone="warn">Not recorded</Badge>
            )
          }
        />

        <PanelBody className="space-y-3">
          {!detail.award ? (
            <Callout tone="neutral">A kickoff meeting is recorded after the enquiry is awarded.</Callout>
          ) : null}

          {kickoff && !showForm ? (
            <>
              <DefinitionList cols={3}>
                <KeyValue label="Meeting date">{formatDate(kickoff.meetingDate)}</KeyValue>
                <KeyValue label="Location">{kickoff.location || "—"}</KeyValue>
                <KeyValue label="Recorded by">
                  {userById(db, kickoff.recordedById)?.name ?? "—"}
                  <span className="mt-0.5 block text-2xs text-ink-500">{formatDateTime(kickoff.recordedAt)}</span>
                </KeyValue>
              </DefinitionList>

              <KeyValue label="Internal attendees">
                <span className="flex flex-wrap gap-1.5">
                  {kickoff.attendeeIds.map((id) => (
                    <Badge key={id} tone="neutral">
                      {userById(db, id)?.name ?? id}
                    </Badge>
                  ))}
                </span>
              </KeyValue>

              {kickoff.externalAttendees ? (
                <KeyValue label="Client-side attendees">
                  <span className="text-xs text-ink-700">{kickoff.externalAttendees}</span>
                </KeyValue>
              ) : null}

              <KeyValue label="Minutes">
                <span className="text-xs leading-relaxed whitespace-pre-line text-ink-700">{kickoff.minutes}</span>
              </KeyValue>

              {kickoff.decisions ? (
                <KeyValue label="Decisions">
                  <span className="text-xs leading-relaxed whitespace-pre-line text-ink-700">
                    {kickoff.decisions}
                  </span>
                </KeyValue>
              ) : null}
            </>
          ) : null}

          {showForm ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Meeting date" htmlFor="kom-date" required error={errors.meetingDate}>
                  <Input
                    id="kom-date"
                    type="date"
                    value={meetingDate}
                    invalid={Boolean(errors.meetingDate)}
                    onChange={(event) => setMeetingDate(event.target.value)}
                  />
                </Field>
                <Field label="Location" htmlFor="kom-location">
                  <Input
                    id="kom-location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Site office, client head office, video call…"
                  />
                </Field>
              </div>

              <Field label="Internal attendees" required error={errors.attendeeIds}>
                <div className="grid gap-1.5 rounded-control border border-ink-200 bg-white p-2.5 sm:grid-cols-2">
                  {db.users
                    .filter((user) => user.roles.length > 0 || user.id === detail.enquiry.assignedMcpId)
                    .map((user) => (
                      <Checkbox
                        key={user.id}
                        id={`attendee-${user.id}`}
                        label={user.name}
                        description={user.jobTitle}
                        checked={attendeeIds.includes(user.id)}
                        onChange={(checked) =>
                          setAttendeeIds((current) =>
                            checked ? [...current, user.id] : current.filter((id) => id !== user.id),
                          )
                        }
                      />
                    ))}
                </div>
              </Field>

              <Field label="Client-side attendees" htmlFor="kom-external">
                <Input
                  id="kom-external"
                  value={externalAttendees}
                  onChange={(event) => setExternalAttendees(event.target.value)}
                  placeholder="Names and roles of client attendees"
                />
              </Field>

              <Field label="Minutes" htmlFor="kom-minutes" required error={errors.minutes}>
                <Textarea
                  id="kom-minutes"
                  rows={6}
                  value={minutes}
                  invalid={Boolean(errors.minutes)}
                  onChange={(event) => setMinutes(event.target.value)}
                  placeholder="What was discussed and agreed."
                />
              </Field>

              <Field label="Decisions" htmlFor="kom-decisions">
                <Textarea
                  id="kom-decisions"
                  rows={4}
                  value={decisions}
                  onChange={(event) => setDecisions(event.target.value)}
                  placeholder={"1) …\n2) …"}
                />
              </Field>

              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      repo.recordKickoff({
                        enquiryId: detail.enquiry.id,
                        meetingDate,
                        location,
                        attendeeIds,
                        externalAttendees,
                        minutes,
                        decisions,
                      }),
                    { onSuccess: () => setEditing(false) },
                  )
                }
              >
                {kickoff ? "Save minutes" : "Record kickoff meeting"}
              </Button>
            </div>
          ) : null}

          {!canEdit && detail.award && !kickoff ? (
            <RoleGate allow={["MCP"]} what="Recording the kickoff meeting">
              <span />
            </RoleGate>
          ) : null}
        </PanelBody>
      </Panel>

      <ActionItemsPanel detail={detail} />
    </div>
  );
}

/* ====================================================== action items === */

export function ActionItemsPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [ownerId, setOwnerId] = React.useState(detail.enquiry.assignedMcpId ?? "");
  const [dueDate, setDueDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");

  const items = detail.actionItems;
  const openItems = items.filter((i) => i.status !== "DONE");
  const canEdit = role === "MCP" || role === "CRM_MANAGER";

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<CalendarCheck2 />}
          title="Kickoff action items"
          actions={
            <>
              <Badge tone={openItems.length > 0 ? "warn" : "ok"}>{openItems.length} open</Badge>
              {canEdit && detail.kickoff ? (
                <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                  Add action
                </Button>
              ) : null}
            </>
          }
        />

        {items.length === 0 ? (
          <EmptyState title="No action items" description="Actions agreed at the kickoff meeting are tracked here." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Action</TH>
                  <TH width="11rem">Owner</TH>
                  <TH width="7rem">Due</TH>
                  <TH width="8rem">Status</TH>
                  {canEdit ? <TH align="right" width="13rem" /> : null}
                </TR>
              </THead>
              <TBody>
                {items.map((item) => {
                  const overdue = item.status !== "DONE" && item.dueDate < todayIso();
                  return (
                    <TR key={item.id}>
                      <TD className="max-w-md">
                        <span className="block text-xs font-medium text-ink-800">{item.title}</span>
                        {item.notes ? (
                          <span className="mt-0.5 block text-2xs text-ink-500">{item.notes}</span>
                        ) : null}
                      </TD>
                      <TD>{userById(db, item.ownerId)?.name ?? "—"}</TD>
                      <TD>
                        <span className={cn("numeric text-xs", overdue && "font-semibold text-bad-600")}>
                          {item.dueDate}
                        </span>
                      </TD>
                      <TD>
                        <Badge
                          tone={item.status === "DONE" ? "ok" : item.status === "IN_PROGRESS" ? "info" : "warn"}
                        >
                          {item.status === "DONE" ? "Done" : item.status === "IN_PROGRESS" ? "In progress" : "Open"}
                        </Badge>
                      </TD>
                      {canEdit ? (
                        <TD align="right">
                          <span className="flex justify-end gap-1.5">
                            {item.status !== "IN_PROGRESS" && item.status !== "DONE" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () =>
                                      repo.setActionItemStatus({
                                        actionItemId: item.id,
                                        status: "IN_PROGRESS",
                                      }),
                                    { silentSuccess: true },
                                  )
                                }
                              >
                                Start
                              </Button>
                            ) : null}
                            {item.status !== "DONE" ? (
                              <Button
                                size="sm"
                                variant="success"
                                disabled={busy}
                                onClick={() =>
                                  void run(() =>
                                    repo.setActionItemStatus({ actionItemId: item.id, status: "DONE" }),
                                  )
                                }
                              >
                                Close
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => repo.setActionItemStatus({ actionItemId: item.id, status: "OPEN" }),
                                    { silentSuccess: true },
                                  )
                                }
                              >
                                Reopen
                              </Button>
                            )}
                          </span>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}

        <PanelFooter>
          <p className="text-2xs text-ink-500">{handoverPolicy.note}</p>
        </PanelFooter>
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add action item"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repo.addActionItem({
                      enquiryId: detail.enquiry.id,
                      title,
                      ownerId,
                      dueDate,
                      notes,
                    }),
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setTitle("");
                      setNotes("");
                    },
                  },
                )
              }
            >
              Add action
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Action" htmlFor="action-title" required error={errors.title}>
            <Input
              id="action-title"
              value={title}
              invalid={Boolean(errors.title)}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner" htmlFor="action-owner" required error={errors.ownerId}>
              <Select
                id="action-owner"
                value={ownerId}
                invalid={Boolean(errors.ownerId)}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Select…</option>
                {db.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.jobTitle}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="action-due" required error={errors.dueDate}>
              <Input
                id="action-due"
                type="date"
                value={dueDate}
                invalid={Boolean(errors.dueDate)}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="action-notes">
            <Textarea id="action-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/* =============================================== PCP appointment ======= */

export function PcpPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const pcp = detail.pcp;
  const [appointeeId, setAppointeeId] = React.useState(pcp?.appointeeId ?? "");
  const [appointmentDate, setAppointmentDate] = React.useState(pcp?.appointmentDate ?? todayIso());
  const [notes, setNotes] = React.useState(pcp?.notes ?? "");

  const canAct = role === "MD" && Boolean(detail.kickoff);

  return (
    <Panel>
      <PanelHeader
        icon={<UserPlus />}
        title="PCP appointment"
        description="A Management Team action after the kickoff meeting."
        actions={pcp ? <Badge tone="ok">Appointed</Badge> : <Badge tone="warn">Not appointed</Badge>}
      />
      <PanelBody className="space-y-3">
        <Callout tone="neutral">
          The business has not confirmed an expansion of the acronym “PCP”, so the demo uses the term verbatim and
          does not guess at its meaning.
        </Callout>

        {pcp ? (
          <DefinitionList cols={3}>
            <KeyValue label="Appointed PCP">{userById(db, pcp.appointeeId)?.name ?? "—"}</KeyValue>
            <KeyValue label="Appointment date">{formatDate(pcp.appointmentDate)}</KeyValue>
            <KeyValue label="Appointed by">
              {userById(db, pcp.appointedById)?.name ?? "—"}
              <span className="mt-0.5 block text-2xs text-ink-500">{formatDateTime(pcp.appointedAt)}</span>
            </KeyValue>
          </DefinitionList>
        ) : null}

        {pcp?.notes ? (
          <KeyValue label="Notes">
            <span className="text-xs leading-relaxed text-ink-700">{pcp.notes}</span>
          </KeyValue>
        ) : null}

        {!detail.kickoff ? (
          <Callout tone="warn">The PCP is appointed after the kickoff meeting has been recorded.</Callout>
        ) : null}

        {canAct ? (
          <div className="space-y-3 rounded-control border border-ink-200 bg-ink-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PCP" htmlFor="pcp-appointee" required error={errors.appointeeId}>
                <Select
                  id="pcp-appointee"
                  value={appointeeId}
                  invalid={Boolean(errors.appointeeId)}
                  onChange={(event) => setAppointeeId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {db.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.jobTitle}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Appointment date" htmlFor="pcp-date" required error={errors.appointmentDate}>
                <Input
                  id="pcp-date"
                  type="date"
                  value={appointmentDate}
                  invalid={Boolean(errors.appointmentDate)}
                  onChange={(event) => setAppointmentDate(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="pcp-notes">
              <Textarea id="pcp-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  repo.appointPcp({
                    enquiryId: detail.enquiry.id,
                    appointeeId,
                    appointmentDate,
                    notes,
                  }),
                )
              }
            >
              {pcp ? "Update appointment" : "Appoint PCP"}
            </Button>
          </div>
        ) : detail.kickoff && !pcp ? (
          <RoleGate allow={["MD"]} what="PCP appointment">
            <span />
          </RoleGate>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/* ================================================== purchase order ===== */

export function PurchaseOrderPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const po = detail.purchaseOrder;
  const [poNumber, setPoNumber] = React.useState(po?.poNumber ?? "");
  const [poDate, setPoDate] = React.useState(po?.poDate ?? todayIso());
  const [expiryDate, setExpiryDate] = React.useState(po?.expiryDate ?? "");
  const [status, setStatus] = React.useState<PoStatus>(po?.status ?? "RECEIVED");
  const [value, setValue] = React.useState(po?.value ? String(po.value) : "");
  const [fileName, setFileName] = React.useState(po?.documentFileName ?? "");
  const [notes, setNotes] = React.useState(po?.notes ?? "");

  const canAct = role === "CRM_MANAGER" && Boolean(detail.workOrder);

  return (
    <Panel>
      <PanelHeader
        icon={<ReceiptText />}
        title="Purchase order"
        description="The work-order draft can exist while the PO is pending, but the PO must be recorded before Operations handover."
        actions={po ? <PoStatusBadge status={po.status} /> : <Badge tone="warn">Not recorded</Badge>}
      />
      <PanelBody className="space-y-3">
        {po ? (
          <DefinitionList cols={4}>
            <KeyValue label="PO number">
              <span className="numeric font-medium">{po.poNumber}</span>
            </KeyValue>
            <KeyValue label="PO date">{formatDate(po.poDate)}</KeyValue>
            <KeyValue label="Expiry">{po.expiryDate ? formatDate(po.expiryDate) : "—"}</KeyValue>
            <KeyValue label="PO value">{formatMoney(po.value, po.currency)}</KeyValue>
            <KeyValue label="Supporting document">
              {po.documentFileName ? (
                <span className="font-mono text-2xs">{po.documentFileName}</span>
              ) : (
                "—"
              )}
            </KeyValue>
            <KeyValue label="Recorded by">
              {userById(db, po.recordedById)?.name ?? "—"}
              <span className="mt-0.5 block text-2xs text-ink-500">{formatDateTime(po.recordedAt)}</span>
            </KeyValue>
            {po.notes ? (
              <KeyValue label="Notes" className="col-span-2">
                <span className="text-xs text-ink-700">{po.notes}</span>
              </KeyValue>
            ) : null}
          </DefinitionList>
        ) : (
          <Callout tone="warn" title="Purchase order outstanding">
            Operations handover cannot be completed until the PO number, date and status are recorded.
          </Callout>
        )}

        {!detail.workOrder ? (
          <Callout tone="neutral">A work order must exist before the purchase order is recorded.</Callout>
        ) : null}

        {canAct ? (
          <div className="space-y-3 rounded-control border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs font-semibold text-ink-800">{po ? "Update PO details" : "Record PO details"}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="PO number" htmlFor="po-number" required error={errors.poNumber}>
                <Input
                  id="po-number"
                  value={poNumber}
                  invalid={Boolean(errors.poNumber)}
                  onChange={(event) => setPoNumber(event.target.value)}
                  placeholder="e.g. HLC-PO-2026-00418"
                />
              </Field>
              <Field label="PO date" htmlFor="po-date" required error={errors.poDate}>
                <Input
                  id="po-date"
                  type="date"
                  value={poDate}
                  invalid={Boolean(errors.poDate)}
                  onChange={(event) => setPoDate(event.target.value)}
                />
              </Field>
              <Field label="Expiry date" htmlFor="po-expiry" hint="Where applicable.">
                <Input
                  id="po-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                />
              </Field>
              <Field label="Status" htmlFor="po-status" required>
                <Select
                  id="po-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as PoStatus)}
                >
                  {PO_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {PO_STATUS_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`PO value (${detail.enquiry.currency})`} htmlFor="po-value">
                <Input
                  id="po-value"
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={String(detail.workOrder?.contractValue ?? "")}
                />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-ink-700">Supporting document</p>
                <FilePicker
                  id="po-file"
                  label={fileName || "Select PO document"}
                  onPick={({ fileName: name }) => setFileName(name)}
                />
              </div>
            </div>
            <Field label="Notes" htmlFor="po-notes">
              <Textarea id="po-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  repo.recordPurchaseOrder({
                    enquiryId: detail.enquiry.id,
                    poNumber,
                    poDate,
                    expiryDate: expiryDate || undefined,
                    status,
                    value: value ? parseNumericInput(value) : undefined,
                    documentFileName: fileName || undefined,
                    notes,
                  }),
                )
              }
            >
              {po ? "Update purchase order" : "Record purchase order"}
            </Button>
          </div>
        ) : detail.workOrder && !po ? (
          <RoleGate allow={["CRM_MANAGER"]} what="Recording the purchase order">
            <span />
          </RoleGate>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/* ======================================================== handover ===== */

export function HandoverPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [operationsOwnerId, setOperationsOwnerId] = React.useState(
    detail.handover?.operationsOwnerId ?? "",
  );
  const [notes, setNotes] = React.useState(detail.handover?.notes ?? "");

  const rows = detail.handoverChecklist;
  const handover = detail.handover;
  const completed = Boolean(handover?.completedAt);
  const gate = canCompleteHandover(rows);
  const canAct = role === "CRM_MANAGER" && !completed && Boolean(detail.workOrder);

  if (!detail.workOrder) {
    return (
      <Panel>
        <PanelHeader icon={<Handshake />} title="Operations handover" />
        <EmptyState
          title="Not applicable yet"
          description="The handover checklist becomes available once a work order exists for the award."
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<Handshake />}
          title="Operations handover"
          description="A separate stage from work-order finalization, with its own checklist."
          actions={
            completed ? (
              <Badge tone="ok" dot>
                Handed over to Operations
              </Badge>
            ) : gate.allowed ? (
              <Badge tone="ok">Ready for handover</Badge>
            ) : (
              <Badge tone="warn">{gate.blockers.length} item(s) outstanding</Badge>
            )
          }
        />

        <PanelBody className="space-y-3">
          {completed ? (
            <Callout tone="ok" title="Handed over to Operations">
              Completed by {userById(db, handover?.completedById)?.name} on {formatDateTime(handover?.completedAt)}.
              Received by {userById(db, handover?.operationsOwnerId)?.name ?? "Operations"}. This enquiry is now
              closed in {brand.companyName} — the Operations execution module is outside the scope of this system.
            </Callout>
          ) : null}

          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li
                key={row.key}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 rounded-control border px-3 py-2",
                  row.satisfied
                    ? "border-ok-200 bg-ok-50/40"
                    : row.required
                      ? "border-warn-200 bg-warn-50/40"
                      : "border-ink-200 bg-white",
                )}
              >
                <span className="flex min-w-0 items-start gap-2.5">
                  {row.satisfied ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" aria-hidden />
                  ) : (
                    <CircleAlert
                      className={cn("mt-0.5 size-4 shrink-0", row.required ? "text-warn-600" : "text-ink-400")}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-ink-800">{row.label}</span>
                      {row.required ? (
                        <Badge tone="brand">Required</Badge>
                      ) : (
                        <Badge tone="neutral">Advisory</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-2xs leading-relaxed text-ink-500">{row.description}</span>
                    {row.detail ? (
                      <span className="mt-0.5 block text-2xs font-medium text-ink-600">{row.detail}</span>
                    ) : null}
                  </span>
                </span>

                {row.acknowledgeable && !completed && role === "CRM_MANAGER" ? (
                  <Button
                    size="sm"
                    variant={row.satisfied ? "ghost" : "secondary"}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          repo.toggleHandoverAcknowledgement({
                            enquiryId: detail.enquiry.id,
                            key: row.key,
                            acknowledged: !row.satisfied,
                          }),
                        { silentSuccess: true },
                      )
                    }
                  >
                    {row.satisfied ? "Withdraw" : "Confirm"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          {!completed && !gate.allowed ? (
            <Callout tone="warn" title="Handover is blocked">
              Outstanding required items: {gate.blockers.map((r) => r.label).join("; ")}.
            </Callout>
          ) : null}

          {canAct ? (
            <div className="space-y-3 rounded-control border border-ink-200 bg-ink-50 p-3">
              <Field
                label="Operations owner receiving the project"
                htmlFor="ops-owner"
                required
                error={errors.operationsOwnerId}
              >
                <Select
                  id="ops-owner"
                  value={operationsOwnerId}
                  invalid={Boolean(errors.operationsOwnerId)}
                  onChange={(event) => setOperationsOwnerId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {db.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.jobTitle}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Handover notes" htmlFor="handover-notes">
                <Textarea
                  id="handover-notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What is being passed to Operations."
                />
              </Field>
              <Button
                variant="primary"
                icon={<Handshake />}
                disabled={busy || !gate.allowed}
                onClick={() => setConfirmOpen(true)}
              >
                Complete handover to Operations
              </Button>
            </div>
          ) : !completed && role !== "CRM_MANAGER" ? (
            <RoleGate allow={["CRM_MANAGER"]} what="Completing the handover">
              <span />
            </RoleGate>
          ) : null}

          <PolicyNote>
            Required items block completion. Items the system cannot derive — confirming the client contact list,
            and reviewing the revision history — are explicit CRM confirmations rather than invented
            prerequisites.
          </PolicyNote>
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          void run(
            () =>
              repo.completeHandover({
                enquiryId: detail.enquiry.id,
                operationsOwnerId,
                notes,
              }),
            { onSuccess: () => setConfirmOpen(false) },
          )
        }
        title="Complete handover to Operations?"
        confirmLabel="Complete handover"
        busy={busy}
        body={
          <>
            {detail.enquiry.reference} will be marked as handed over to{" "}
            <span className="font-semibold">
              {db.users.find((u) => u.id === operationsOwnerId)?.name ?? "Operations"}
            </span>
            . This is the terminal state in {brand.companyName} and cannot be undone without resetting the demo data.
          </>
        }
      />
    </>
  );
}
