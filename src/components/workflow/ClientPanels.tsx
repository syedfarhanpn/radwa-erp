"use client";

/**
 * Radwa Gulf and Co — client submission, follow-up, response and revision panels.
 *
 * Submission is simulated: the demo records what was sent, to whom and when,
 * and never sends an email. "Submitted" and "submitted on time" are tracked as
 * separate facts, so a delayed submission is visible as such.
 */

import * as React from "react";
import {
  CalendarPlus,
  CheckCircle2,
  CircleCheck,
  MessageSquareReply,
  RefreshCw,
  Send,
  Undo2,
} from "lucide-react";

import { revisionPolicy } from "@/domain/config";
import {
  BID_SUBMISSION_TYPE_LABELS,
  CLIENT_RESPONSE_LABELS,
  REVISION_CLASS_LABELS,
  REVISION_CLASSES,
  type ClientResponseType,
  type RevisionClass,
} from "@/domain/enums";
import { describeRevisionRequirement, revisionRequiresManagementApproval } from "@/domain/rules";
import { formatMoney, parseNumericInput } from "@/lib/money";
import { formatDate, formatDateTime, todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import { userById, usersWithRole } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  KeyValue,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "@/components/ui/primitives";
import { Field, FilePicker, Input, RadioGroup, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import {
  ClientResponseBadge,
  RevisionClassBadge,
  RevisionStatusBadge,
  SubmissionStatusBadge,
  TaskStatusBadge,
} from "./StatusBadges";
import { DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

/* ========================================================= submission === */

export function SubmissionPanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const { run, busy, errors } = useAction();

  const [open, setOpen] = React.useState(false);
  const [submittedOn, setSubmittedOn] = React.useState(todayIso());
  const [contactId, setContactId] = React.useState(detail.enquiry.contactId);
  const [ack, setAck] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [nextFollowUp, setNextFollowUp] = React.useState("");

  const pkg = detail.bidPackage;
  const approved = pkg?.status === "APPROVED_FOR_SUBMISSION";
  const latest = detail.latestSubmission;
  const openRevision = detail.openRevision;
  const canResubmit = openRevision?.status === "READY_TO_RESUBMIT";

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<Send />}
          title="Client submission"
          description="Transferred to the MCP once the Management Team approves the bid."
          actions={
            latest ? <SubmissionStatusBadge status={latest.status} /> : <Badge tone="neutral">Not submitted</Badge>
          }
        />

        <PanelBody className="space-y-3">
          {!approved && !latest ? (
            <Callout tone="warn" title="Not yet approved for submission">
              The bid package must receive final management approval before the proposal can be submitted.
            </Callout>
          ) : null}

          {detail.submissions.length > 0 ? (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Submitted</TH>
                    <TH>Status</TH>
                    <TH>Method</TH>
                    <TH>Client contact</TH>
                    <TH>Estimate rev</TH>
                    <TH>Acknowledgement</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.submissions.map((submission) => (
                    <TR key={submission.id}>
                      <TD>{formatDateTime(submission.submittedAt)}</TD>
                      <TD>
                        <SubmissionStatusBadge status={submission.status} />
                        {submission.resubmissionOfSubmissionId ? (
                          <Badge tone="accent" className="ml-1">
                            Resubmission
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{BID_SUBMISSION_TYPE_LABELS[submission.method]}</TD>
                      <TD>{userByContact(detail, submission.clientContactId)}</TD>
                      <TD className="numeric">
                        {submission.estimateVersionSubmitted ? `Rev ${submission.estimateVersionSubmitted}` : "—"}
                      </TD>
                      <TD className="font-mono text-2xs">{submission.acknowledgementRef ?? "—"}</TD>
                      <TD className="max-w-xs">
                        <span className="text-2xs leading-relaxed text-ink-600">{submission.notes ?? "—"}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          ) : null}

          <DefinitionList cols={3}>
            <KeyValue label="Submission deadline">{formatDate(detail.enquiry.submissionDeadline)}</KeyValue>
            <KeyValue label="Required method">
              {BID_SUBMISSION_TYPE_LABELS[detail.enquiry.bidSubmissionType]}
            </KeyValue>
            <KeyValue label="Next follow-up">
              {latest?.nextFollowUpDate ? formatDate(latest.nextFollowUpDate) : "—"}
            </KeyValue>
          </DefinitionList>

          <RoleGate allow={["MCP"]} what="Proposal submission" fallback={null}>
            {approved || canResubmit ? (
              <Button variant="primary" icon={<Send />} onClick={() => setOpen(true)}>
                {latest ? "Record resubmission" : "Record proposal submission"}
              </Button>
            ) : null}
          </RoleGate>
        </PanelBody>

        <PanelFooter>
          <p className="text-2xs text-ink-500">
            Submission is simulated. This demo does not send email or upload anything to a client portal.
          </p>
        </PanelFooter>
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={latest ? "Record resubmission" : "Record proposal submission"}
        description="Simulated — nothing is emailed. The record captures what was sent, to whom and when."
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
                    repo.recordSubmission({
                      enquiryId: detail.enquiry.id,
                      submittedOn,
                      clientContactId: contactId,
                      acknowledgementRef: ack,
                      notes,
                      nextFollowUpDate: nextFollowUp || undefined,
                    }),
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Record submission
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Submission date"
              htmlFor="submitted-on"
              required
              error={errors.submittedOn}
              hint={`Deadline: ${detail.enquiry.submissionDeadline}. A later date is recorded as delayed.`}
            >
              <Input
                id="submitted-on"
                type="date"
                value={submittedOn}
                invalid={Boolean(errors.submittedOn)}
                onChange={(event) => setSubmittedOn(event.target.value)}
              />
            </Field>

            <Field label="Client contact" htmlFor="submission-contact">
              <Select id="submission-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
                {detail.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} — {contact.jobTitle}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Acknowledgement reference" htmlFor="submission-ack" hint="Portal receipt or client reference.">
              <Input
                id="submission-ack"
                value={ack}
                onChange={(event) => setAck(event.target.value)}
                placeholder="e.g. EWPU-ACK-884120"
              />
            </Field>

            <Field label="Next follow-up date" htmlFor="submission-followup">
              <Input
                id="submission-followup"
                type="date"
                value={nextFollowUp}
                onChange={(event) => setNextFollowUp(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="submission-notes">
            <Textarea
              id="submission-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How was it submitted, who received it, any conditions noted at submission."
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function userByContact(detail: EnquiryDetail, contactId: string): string {
  return detail.contacts.find((c) => c.id === contactId)?.name ?? "—";
}

/* ======================================================== follow-ups ==== */

export function FollowUpPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState(todayIso());
  const [ownerId, setOwnerId] = React.useState(detail.enquiry.assignedMcpId ?? "");
  const [notes, setNotes] = React.useState("");

  const [completing, setCompleting] = React.useState<string | null>(null);
  const [completionNote, setCompletionNote] = React.useState("");

  const tasks = detail.followUpTasks;
  const openCount = tasks.filter((t) => t.status === "OPEN").length;

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<CircleCheck />}
          title="Follow-up tasks"
          description="A task list, not a calendar module."
          actions={
            <>
              <Badge tone={openCount > 0 ? "warn" : "ok"}>{openCount} open</Badge>
              {role === "MCP" ? (
                <Button size="sm" variant="secondary" icon={<CalendarPlus />} onClick={() => setOpen(true)}>
                  Add task
                </Button>
              ) : null}
            </>
          }
        />

        {tasks.length === 0 ? (
          <EmptyState
            title="No follow-up tasks"
            description="Add a task after submitting the proposal to track chasing the client."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Task</TH>
                  <TH width="8rem">Due</TH>
                  <TH width="10rem">Owner</TH>
                  <TH width="7rem">Status</TH>
                  <TH align="right" width="10rem" />
                </TR>
              </THead>
              <TBody>
                {tasks.map((task) => {
                  const overdue = task.status === "OPEN" && task.dueDate < todayIso();
                  return (
                    <TR key={task.id}>
                      <TD className="max-w-md">
                        <span className="block text-xs font-medium text-ink-800">{task.title}</span>
                        {task.notes ? (
                          <span className="mt-0.5 block text-2xs text-ink-500">{task.notes}</span>
                        ) : null}
                        {task.completionNote ? (
                          <span className="mt-0.5 block text-2xs text-ok-700">
                            Closed: {task.completionNote}
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <span className={cn("numeric text-xs", overdue && "font-semibold text-bad-600")}>
                          {task.dueDate}
                        </span>
                        {overdue ? <span className="block text-2xs text-bad-600">Overdue</span> : null}
                      </TD>
                      <TD>{userById(db, task.ownerId)?.name ?? "—"}</TD>
                      <TD>
                        <TaskStatusBadge status={task.status} />
                      </TD>
                      <TD align="right">
                        {role === "MCP" ? (
                          task.status === "OPEN" ? (
                            <Button size="sm" variant="secondary" onClick={() => setCompleting(task.id)}>
                              Complete
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Undo2 />}
                              disabled={busy}
                              onClick={() => void run(() => repo.reopenFollowUpTask({ taskId: task.id }))}
                            >
                              Reopen
                            </Button>
                          )
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add follow-up task"
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
                    repo.createFollowUpTask({
                      enquiryId: detail.enquiry.id,
                      title,
                      dueDate,
                      ownerId,
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
              Add task
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Task" htmlFor="task-title" required error={errors.title}>
            <Input
              id="task-title"
              value={title}
              invalid={Boolean(errors.title)}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Chase the technical evaluation outcome"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due date" htmlFor="task-due" required error={errors.dueDate}>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                invalid={Boolean(errors.dueDate)}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            <Field label="Owner" htmlFor="task-owner">
              <Select id="task-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {usersWithRole(db, "MCP").map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="task-notes">
            <Textarea id="task-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title="Complete follow-up task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              icon={<CheckCircle2 />}
              disabled={busy}
              onClick={() => {
                if (!completing) return;
                void run(() => repo.completeFollowUpTask({ taskId: completing, completionNote }), {
                  onSuccess: () => {
                    setCompleting(null);
                    setCompletionNote("");
                  },
                });
              }}
            >
              Mark complete
            </Button>
          </>
        }
      >
        <Field label="Outcome" htmlFor="completion-note" hint="What did the client say?">
          <Textarea
            id="completion-note"
            rows={3}
            value={completionNote}
            onChange={(event) => setCompletionNote(event.target.value)}
          />
        </Field>
      </Dialog>
    </>
  );
}

/* ==================================================== client response === */

export function ClientResponsePanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy, errors } = useAction();

  const [open, setOpen] = React.useState(false);
  const [response, setResponse] = React.useState<ClientResponseType | "">("");
  const [detailText, setDetailText] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [revisionClass, setRevisionClass] = React.useState<RevisionClass | "">("");
  const [awardedValue, setAwardedValue] = React.useState("");
  const [awardedScope, setAwardedScope] = React.useState(detail.enquiry.scopeOfWork);
  const [letterFile, setLetterFile] = React.useState("");

  const canRecord = role === "MCP" && detail.submissions.length > 0 && !detail.award;
  const hasFinalResponse = detail.clientResponses.some(
    (r) => r.response === "AWARDED" || r.response === "REJECTED",
  );

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<MessageSquareReply />}
          title="Client response"
          description="Revision requested, rejected, or awarded."
          actions={
            canRecord && !hasFinalResponse ? (
              <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
                Record response
              </Button>
            ) : null
          }
        />

        <PanelBody className="space-y-3">
          {detail.clientResponses.length === 0 ? (
            <p className="text-xs text-ink-500">
              No client response recorded yet.
              {detail.submissions.length === 0 ? " Record the submission first." : ""}
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.clientResponses.map((item) => (
                <li key={item.id} className="rounded-control border border-ink-200 bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ClientResponseBadge response={item.response} />
                    <span className="text-2xs text-ink-500">
                      {formatDateTime(item.receivedAt)}
                      {item.reference ? ` · ${item.reference}` : ""}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-700">{item.detail}</p>
                </li>
              ))}
            </ul>
          )}

          {detail.enquiry.stage === "LOST" ? (
            <Callout tone="bad" title="Enquiry lost">
              The client rejected the bid. The workflow ends here and the enquiry is closed as lost.
            </Callout>
          ) : null}

          {!canRecord && !hasFinalResponse && detail.submissions.length > 0 ? (
            <RoleGate allow={["MCP"]} what="Recording the client response">
              <span />
            </RoleGate>
          ) : null}
        </PanelBody>
      </Panel>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record client response"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !response}
              onClick={() =>
                void run(
                  () =>
                    repo.recordClientResponse({
                      enquiryId: detail.enquiry.id,
                      response: response as ClientResponseType,
                      detail: detailText,
                      reference,
                      revisionClass: revisionClass || undefined,
                      awardedValue: awardedValue ? parseNumericInput(awardedValue) : undefined,
                      awardedScope,
                      awardLetterFileName: letterFile || undefined,
                    }),
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Record response
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Client response" required>
            <RadioGroup
              name="client-response"
              value={response}
              onChange={(value) => setResponse(value)}
              options={[
                {
                  value: "REVISION_REQUESTED",
                  label: CLIENT_RESPONSE_LABELS.REVISION_REQUESTED,
                  description: "Assigned to the Estimator for a revised BOQ and quotation.",
                },
                {
                  value: "AWARDED",
                  label: CLIENT_RESPONSE_LABELS.AWARDED,
                  description: "A work-order draft can then be generated. A purchase order is not required first.",
                },
                {
                  value: "REJECTED",
                  label: CLIENT_RESPONSE_LABELS.REJECTED,
                  description: "Closes the enquiry as lost. The workflow ends.",
                },
              ]}
            />
          </Field>

          <Field label="What did the client say?" htmlFor="response-detail" required error={errors.detail}>
            <Textarea
              id="response-detail"
              rows={3}
              value={detailText}
              invalid={Boolean(errors.detail)}
              onChange={(event) => setDetailText(event.target.value)}
              placeholder="Record the client's own wording where possible."
            />
          </Field>

          <Field label="Client reference" htmlFor="response-ref">
            <Input
              id="response-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. MIRQAB/LOA/2026/27"
            />
          </Field>

          {response === "REVISION_REQUESTED" ? (
            <div className="space-y-3 rounded-control border border-warn-200 bg-warn-50/50 p-3">
              <Field
                label="Revision classification"
                htmlFor="revision-class"
                required
                error={errors.revisionClass}
                hint={revisionPolicy.note}
              >
                <Select
                  id="revision-class"
                  value={revisionClass}
                  invalid={Boolean(errors.revisionClass)}
                  onChange={(event) => setRevisionClass(event.target.value as RevisionClass)}
                >
                  <option value="">Select…</option>
                  {REVISION_CLASSES.map((item) => (
                    <option key={item} value={item}>
                      {REVISION_CLASS_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              {revisionClass ? (
                <Callout tone={revisionRequiresManagementApproval(revisionClass) ? "warn" : "ok"}>
                  {describeRevisionRequirement(revisionClass)}
                </Callout>
              ) : null}
            </div>
          ) : null}

          {response === "AWARDED" ? (
            <div className="space-y-3 rounded-control border border-ok-200 bg-ok-50/50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={`Awarded value (${detail.enquiry.currency})`}
                  htmlFor="awarded-value"
                  required
                  error={errors.awardedValue}
                >
                  <Input
                    id="awarded-value"
                    inputMode="decimal"
                    value={awardedValue}
                    invalid={Boolean(errors.awardedValue)}
                    onChange={(event) => setAwardedValue(event.target.value)}
                    placeholder={String(detail.totals?.grandTotal ?? "")}
                  />
                </Field>
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-700">Approved quotation</p>
                  <p className="text-xs text-ink-600">
                    Estimate revision {detail.approvedEstimate?.version ?? "—"} ·{" "}
                    <span className="numeric">
                      {formatMoney(detail.totals?.grandTotal, detail.enquiry.currency)}
                    </span>
                  </p>
                </div>
              </div>

              <Field label="Awarded scope" htmlFor="awarded-scope" required error={errors.awardedScope}>
                <Textarea
                  id="awarded-scope"
                  rows={3}
                  value={awardedScope}
                  invalid={Boolean(errors.awardedScope)}
                  onChange={(event) => setAwardedScope(event.target.value)}
                />
              </Field>

              <div>
                <p className="mb-1 text-xs font-medium text-ink-700">Award letter (optional)</p>
                <FilePicker
                  id="award-letter"
                  label={letterFile || "Select award letter"}
                  hint="An award letter may be attached but is not mandatory. Demo only — no file is stored."
                  onPick={({ fileName }) => setLetterFile(fileName)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/* ======================================================== revisions ==== */

export function RevisionPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const role = useActiveRole();

  if (detail.revisionRequests.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        icon={<RefreshCw />}
        title="Revision requests"
        description="Revision history is preserved: each revision produces its own estimate version."
      />
      <PanelBody className="space-y-3">
        {detail.revisionRequests.map((revision) => {
          const estimate = db.estimates.find((e) => e.id === revision.resultingEstimateId);
          return (
            <div key={revision.id} className="rounded-control border border-ink-200 bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <RevisionClassBadge revisionClass={revision.revisionClass} />
                  <RevisionStatusBadge status={revision.status} />
                </span>
                <span className="text-2xs text-ink-500">{formatDate(revision.assignedAt)}</span>
              </div>

              <p className="mt-1.5 text-xs leading-relaxed text-ink-700">{revision.requestDetail}</p>

              <DefinitionList cols={3}>
                <KeyValue label="Assigned Estimator">
                  {userById(db, revision.assignedEstimatorId)?.name ?? "—"}
                </KeyValue>
                <KeyValue label="Management approval">
                  {revision.requiresManagementApproval ? (
                    <Badge tone="warn">Required before resubmission</Badge>
                  ) : (
                    <Badge tone="ok">Not required</Badge>
                  )}
                </KeyValue>
                <KeyValue label="Resulting estimate">
                  {estimate ? `Revision ${estimate.version} — ${estimate.status}` : "Not created yet"}
                </KeyValue>
              </DefinitionList>

              <Callout tone="neutral" className="mt-2.5">
                {describeRevisionRequirement(revision.revisionClass)}
              </Callout>

              {role === "ESTIMATOR" && revision.status !== "RESUBMITTED" && !estimate ? (
                <p className="mt-2 text-2xs text-ink-600">
                  Open the BOQ workspace from the Estimate tab and use{" "}
                  <span className="font-medium">Create revision</span> to raise the revised estimate.
                </p>
              ) : null}
            </div>
          );
        })}

        <PolicyNote>
          Major commercial, scope or material revisions require management approval before resubmission.
          Administrative-only changes — a corrected name, date or address with no commercial impact — do not.
          No numeric threshold is applied.
        </PolicyNote>
      </PanelBody>
    </Panel>
  );
}
