"use client";

/**
 * Radwa Gulf and Co — site survey panel.
 *
 * Covers the whole survey loop: the Estimator's required / not-required
 * decision, the MCP's surveyor assignment, the surveyor's project-specific
 * checklist, submission, the MCP's review of every incomplete item, and
 * acceptance of the report.
 *
 * Two rules are enforced visibly here:
 *   - every incomplete checklist item must carry a reason;
 *   - the MCP cannot accept the report while any exception is unresolved.
 */

import * as React from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  MapPinned,
  Paperclip,
  Printer,
  Send,
  ThumbsUp,
  Undo2,
  Zap,
} from "lucide-react";

import { canAcceptSurveyReport } from "@/domain/rules";
import type { ChecklistItemStatus } from "@/domain/enums";
import type { SurveyChecklistItem } from "@/domain/types";
import { formatDate, formatDateTime, todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import { usersWithRole, userById } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  KeyValue,
  Panel,
  PanelBody,
  PanelHeader,
  LinkButton,
  ProgressBar,
} from "@/components/ui/primitives";
import { Field, FilePicker, Input, RadioGroup, Select, Textarea } from "@/components/ui/form";
import {
  ChecklistStatusBadge,
  ExceptionRulingBadge,
  SurveyStatusBadge,
} from "./StatusBadges";
import { BlockerList, DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

export function SurveyPanel({ detail }: { detail: EnquiryDetail }) {
  const { survey } = detail;

  return (
    <div className="space-y-4">
      {!survey ? <SurveyRequirementForm detail={detail} /> : null}
      {survey ? <SurveyOverview detail={detail} /> : null}
      {survey && survey.status === "REQUIRED_UNASSIGNED" ? <SurveyorAssignmentForm detail={detail} /> : null}
      {survey && survey.status !== "NOT_REQUIRED" ? <ChecklistSection detail={detail} /> : null}
    </div>
  );
}

/* ------------------------------------------ estimator: is a survey needed? */

function SurveyRequirementForm({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const [required, setRequired] = React.useState<"yes" | "no" | "">("");
  const [reason, setReason] = React.useState("");

  const assigned = Boolean(detail.enquiry.assignedEstimatorId);

  return (
    <Panel>
      <PanelHeader
        icon={<MapPinned />}
        title="Site survey requirement"
        description="The Estimator decides whether a site survey is needed, and records why."
        actions={<Badge tone="warn">Decision pending</Badge>}
      />
      <PanelBody className="space-y-3">
        {!assigned ? (
          <Callout tone="warn">
            No Estimator is assigned yet. The survey decision is taken by the assigned Estimator.
          </Callout>
        ) : null}

        <Callout tone="info">
          A survey that is not required must not block estimation. Marking it “not required” lets the Estimator
          proceed straight to the BOQ.
        </Callout>

        <RoleGate allow={["ESTIMATOR"]} what="The survey requirement decision">
          <div className="space-y-3">
            <RadioGroup
              name="survey-required"
              value={required}
              onChange={setRequired}
              options={[
                {
                  value: "yes",
                  label: "A site survey is required",
                  description: "The MCP will assign a surveyor and a visit date.",
                },
                {
                  value: "no",
                  label: "No site survey is required",
                  description: "Estimation proceeds immediately; nothing is blocked.",
                },
              ]}
            />

            {required ? (
              <Field
                label="Justification"
                htmlFor="survey-reason"
                required
                error={errors.reason}
                hint="Recorded against your name in the activity history."
              >
                <Textarea
                  id="survey-reason"
                  rows={3}
                  value={reason}
                  invalid={Boolean(errors.reason)}
                  placeholder={
                    required === "yes"
                      ? "What has to be verified on site before the BOQ can be priced?"
                      : "Why is the issued information sufficient without a site visit?"
                  }
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            ) : null}

            <Button
              variant="primary"
              disabled={busy || !required}
              onClick={() =>
                void run(() =>
                  repo.setSurveyRequirement({
                    enquiryId: detail.enquiry.id,
                    required: required === "yes",
                    reason,
                  }),
                )
              }
            >
              Record decision
            </Button>
          </div>
        </RoleGate>
      </PanelBody>
    </Panel>
  );
}

/* -------------------------------------------------------- survey summary - */

function SurveyOverview({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();
  const survey = detail.survey!;
  const progress = detail.surveyProgress;

  const gate = progress ? canAcceptSurveyReport(survey, progress) : { allowed: false, blockers: [] };

  return (
    <Panel>
      <PanelHeader
        icon={<ClipboardCheck />}
        title="Survey status"
        actions={<SurveyStatusBadge status={survey.status} />}
      />
      <PanelBody className="space-y-3">
        <DefinitionList cols={4}>
          <KeyValue label="Decided by">
            {userById(db, survey.requiredDecisionById)?.name ?? "—"}
            {survey.requiredDecisionAt ? (
              <span className="mt-0.5 block text-2xs text-ink-500">{formatDate(survey.requiredDecisionAt)}</span>
            ) : null}
          </KeyValue>
          <KeyValue label="Surveyor">{detail.surveyor?.name ?? "Not assigned"}</KeyValue>
          <KeyValue label="Visit date">{survey.scheduledDate ? formatDate(survey.scheduledDate) : "—"}</KeyValue>
          <KeyValue label="Checklist">
            {progress ? (
              <>
                <span className="numeric">
                  {progress.complete}/{progress.total} complete
                </span>
                <ProgressBar
                  className="mt-1.5"
                  value={progress.complete}
                  total={progress.total || 1}
                  tone={progress.incomplete > 0 ? "warn" : "ok"}
                  label={`${progress.complete} of ${progress.total} checklist items complete`}
                />
              </>
            ) : (
              "—"
            )}
          </KeyValue>
        </DefinitionList>

        {survey.requirementReason ? (
          <KeyValue label="Requirement justification">
            <span className="text-xs leading-relaxed text-ink-600">{survey.requirementReason}</span>
          </KeyValue>
        ) : null}

        {survey.summary ? (
          <div className="rounded-control border border-ink-200 bg-ink-50 px-3 py-2.5">
            <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">Survey report summary</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-700">{survey.summary}</p>
            {survey.completedChecklistFileName ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-ink-600">
                <Paperclip className="size-3 shrink-0 text-ink-400" aria-hidden />
                <span className="font-semibold text-ink-700">Completed checklist from site:</span>
                <span className="font-mono">{survey.completedChecklistFileName}</span>
                <span className="text-ink-400">{survey.completedChecklistSizeLabel}</span>
              </p>
            ) : null}
            <p className="mt-1.5 text-2xs text-ink-500">
              Submitted {formatDateTime(survey.submittedAt)} by {detail.surveyor?.name ?? "the surveyor"}. Visible
              to the Surveyor, the MCP and the Estimator.
            </p>
          </div>
        ) : null}

        {survey.returnNote ? (
          <Callout tone="bad" title="Returned for clarification">
            {survey.returnNote}
          </Callout>
        ) : null}

        {survey.status === "SUBMITTED" ? (
          <>
            <BlockerList
              items={gate.blockers}
              title="The MCP must clear these before accepting the report"
            />
            {role === "MCP" ? (
              <Button
                variant="success"
                icon={<CheckCircle2 />}
                disabled={busy || !gate.allowed}
                onClick={() => void run(() => repo.acceptSurveyReport({ enquiryId: detail.enquiry.id }))}
              >
                Accept survey report
              </Button>
            ) : (
              <Callout tone="neutral">
                The MCP reviews the incomplete items and accepts the report. Switch to the MCP role to act.
              </Callout>
            )}
          </>
        ) : null}

        {survey.status === "ACCEPTED" ? (
          <Callout tone="ok" title="Report accepted">
            Accepted by {userById(db, survey.acceptedById)?.name ?? "the MCP"} on{" "}
            {formatDate(survey.acceptedAt)}. The Estimator has the report for pricing.
          </Callout>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------- MCP: assign the surveyor - */

function SurveyorAssignmentForm({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const surveyors = usersWithRole(db, "SURVEYOR");

  const [surveyorId, setSurveyorId] = React.useState("");
  const [scheduledDate, setScheduledDate] = React.useState(todayIso());

  return (
    <Panel>
      <PanelHeader
        icon={<CalendarClock />}
        title="Assign surveyor and visit date"
        description="The project-specific checklist is created when the surveyor is assigned."
      />
      <PanelBody>
        <RoleGate allow={["MCP"]} what="Surveyor assignment">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Surveyor" htmlFor="surveyor" required error={errors.surveyorId}>
              <Select
                id="surveyor"
                value={surveyorId}
                invalid={Boolean(errors.surveyorId)}
                onChange={(event) => setSurveyorId(event.target.value)}
              >
                <option value="">Select…</option>
                {surveyors.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Visit date" htmlFor="survey-date" required error={errors.scheduledDate}>
              <Input
                id="survey-date"
                type="date"
                value={scheduledDate}
                invalid={Boolean(errors.scheduledDate)}
                onChange={(event) => setScheduledDate(event.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  repo.assignSurveyor({ enquiryId: detail.enquiry.id, surveyorId, scheduledDate }),
                )
              }
            >
              Assign surveyor
            </Button>
          </div>
        </RoleGate>
      </PanelBody>
    </Panel>
  );
}

/* -------------------------------------------------------------- checklist */

function ChecklistSection({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();
  const survey = detail.survey!;
  const progress = detail.surveyProgress!;

  const [summary, setSummary] = React.useState(survey.summary ?? "");
  const [completedFile, setCompletedFile] = React.useState<{ fileName: string; fileSizeLabel: string } | null>(
    survey.completedChecklistFileName
      ? { fileName: survey.completedChecklistFileName, fileSizeLabel: survey.completedChecklistSizeLabel ?? "—" }
      : null,
  );

  const editable =
    role === "SURVEYOR" &&
    (survey.status === "SCHEDULED" ||
      survey.status === "IN_PROGRESS" ||
      survey.status === "RETURNED_FOR_CLARIFICATION");

  const groups = React.useMemo(() => {
    const map = new Map<string, SurveyChecklistItem[]>();
    for (const item of detail.checklistItems) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, [detail.checklistItems]);

  if (detail.checklistItems.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Survey checklist" description="Created when the surveyor is assigned." />
        <PanelBody>
          <p className="text-xs text-ink-500">No checklist yet.</p>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        icon={<ClipboardCheck />}
        title="Survey checklist"
        description="Project-specific checklist. These items are demo examples, not a universal mandatory list."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">{progress.complete} complete</Badge>
            {progress.incomplete > 0 ? <Badge tone="bad">{progress.incomplete} incomplete</Badge> : null}
            {progress.pending > 0 ? <Badge tone="neutral">{progress.pending} pending</Badge> : null}
            <LinkButton
              href={`/surveys/${detail.enquiry.id}/print`}
              size="sm"
              variant="secondary"
              icon={<Printer />}
            >
              Print checklist
            </LinkButton>
          </div>
        }
      />

      <PanelBody className="space-y-4">
        {progress.unresolvedExceptions.length > 0 ? (
          <Callout tone="warn" title={`${progress.unresolvedExceptions.length} incomplete item(s) await an MCP decision`}>
            The MCP must approve an exception or return each item for clarification before the report can be
            accepted.
          </Callout>
        ) : null}

        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-500 uppercase">{group}</p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                // The key includes the saved values, so a row remounts with
                // fresh form state after it is saved or the MCP rules on it,
                // instead of an effect copying the record back into state.
                <ChecklistRow
                  key={`${item.id}:${item.status}:${item.exceptionRuling}:${item.updatedAt ?? ""}`}
                  item={item}
                  editable={editable}
                />
              ))}
            </ul>
          </div>
        ))}

        {role === "SURVEYOR" && editable ? (
          <div className="space-y-3 border-t border-ink-200 pt-3">
            <Callout tone="neutral" icon={<Printer />} title="Taking this to site">
              Print the checklist, record findings on site, then attach the completed sheet below and submit it
              with your remarks.
            </Callout>

            <Field
              label="Survey report remarks"
              htmlFor="survey-summary"
              required
              hint="Shared with the MCP and the Estimator."
            >
              <Textarea
                id="survey-summary"
                rows={3}
                value={summary}
                placeholder="Key findings, deviations from the tender information, and anything that affects pricing."
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>

            <div>
              <p className="mb-1 text-xs font-medium text-ink-700">Completed checklist from site</p>
              <FilePicker
                id="completed-checklist"
                label={completedFile ? `Attached: ${completedFile.fileName}` : "Attach the completed checklist"}
                hint="Optional. Demo only — the file is not uploaded or stored anywhere. Only its name and size are recorded."
                onPick={setCompletedFile}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={<Send />}
                disabled={busy || progress.pending > 0}
                onClick={() =>
                  void run(() =>
                    repo.submitSurveyReport({
                      enquiryId: detail.enquiry.id,
                      summary,
                      completedChecklistFileName: completedFile?.fileName,
                      completedChecklistSizeLabel: completedFile?.fileSizeLabel,
                    }),
                  )
                }
              >
                Submit report to MCP
              </Button>

              <Button
                variant="subtle"
                icon={<Zap />}
                disabled={busy}
                onClick={() =>
                  void run(() => repo.completeAndSubmitSurvey({ enquiryId: detail.enquiry.id, summary }))
                }
              >
                Demo: complete all &amp; submit
              </Button>
            </div>

            {progress.pending > 0 ? (
              <p className="text-2xs text-warn-700">
                {progress.pending} item(s) are still pending. Mark every item complete or incomplete before
                submitting — or use the demo shortcut to fill them all in at once.
              </p>
            ) : null}
          </div>
        ) : null}

        <PolicyNote>
          Every item marked incomplete requires a reason. The MCP reviews each one and either approves the
          exception or returns it to the surveyor.
        </PolicyNote>
      </PanelBody>
    </Panel>
  );
}

function ChecklistRow({ item, editable }: { item: SurveyChecklistItem; editable: boolean }) {
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const db = useDb();
  const { run, busy, errors } = useAction();

  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<ChecklistItemStatus>(item.status);
  const [findings, setFindings] = React.useState(item.findings ?? "");
  const [incompleteReason, setIncompleteReason] = React.useState(item.incompleteReason ?? "");

  const [rulingOpen, setRulingOpen] = React.useState(false);
  const [rulingNote, setRulingNote] = React.useState("");

  const mcpCanRule = role === "MCP" && item.status === "INCOMPLETE";

  return (
    <li
      className={cn(
        "rounded-control border px-3 py-2",
        item.status === "INCOMPLETE"
          ? item.exceptionRuling === "ACCEPTED"
            ? "border-warn-200 bg-warn-50/40"
            : "border-bad-200 bg-bad-50/40"
          : item.status === "COMPLETE"
            ? "border-ink-200 bg-white"
            : "border-dashed border-ink-300 bg-ink-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-800">{item.title}</p>
          {item.guidance ? <p className="mt-0.5 text-2xs text-ink-500">{item.guidance}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ChecklistStatusBadge status={item.status} />
          {item.status === "INCOMPLETE" ? <ExceptionRulingBadge ruling={item.exceptionRuling} /> : null}
          {editable ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Record"}
            </Button>
          ) : null}
          {mcpCanRule && item.exceptionRuling !== "ACCEPTED" ? (
            <Button size="sm" variant="secondary" onClick={() => setRulingOpen((v) => !v)}>
              Review
            </Button>
          ) : null}
        </div>
      </div>

      {item.findings ? (
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-700">Findings: </span>
          {item.findings}
        </p>
      ) : null}

      {item.incompleteReason ? (
        <p className="mt-1.5 text-2xs leading-relaxed text-bad-700">
          <span className="font-semibold">Reason not completed: </span>
          {item.incompleteReason}
        </p>
      ) : null}

      {item.exceptionNote ? (
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-600">
          <span className="font-semibold text-ink-700">
            MCP {item.exceptionRuling === "ACCEPTED" ? "exception approval" : "clarification request"}:{" "}
          </span>
          {item.exceptionNote}
          {item.ruledById ? (
            <span className="text-ink-400">
              {" "}
              — {userById(db, item.ruledById)?.name}, {formatDate(item.ruledAt)}
            </span>
          ) : null}
        </p>
      ) : null}

      {open && editable ? (
        <div className="mt-2.5 space-y-2 border-t border-ink-200 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(["COMPLETE", "INCOMPLETE", "PENDING"] as ChecklistItemStatus[]).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={status === option ? (option === "INCOMPLETE" ? "danger" : "primary") : "secondary"}
                onClick={() => setStatus(option)}
              >
                {option === "COMPLETE" ? "Complete" : option === "INCOMPLETE" ? "Incomplete" : "Pending"}
              </Button>
            ))}
          </div>

          <Field label="Findings / observations" htmlFor={`findings-${item.id}`}>
            <Textarea
              id={`findings-${item.id}`}
              rows={2}
              value={findings}
              onChange={(event) => setFindings(event.target.value)}
              placeholder="What was observed on site?"
            />
          </Field>

          {status === "INCOMPLETE" ? (
            <Field
              label="Reason this item could not be completed"
              htmlFor={`incomplete-${item.id}`}
              required
              error={errors.incompleteReason}
            >
              <Textarea
                id={`incomplete-${item.id}`}
                rows={2}
                value={incompleteReason}
                invalid={Boolean(errors.incompleteReason)}
                onChange={(event) => setIncompleteReason(event.target.value)}
                placeholder="Required — the MCP reviews every incomplete item."
              />
            </Field>
          ) : null}

          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  repo.updateChecklistItem({
                    itemId: item.id,
                    status,
                    findings,
                    incompleteReason,
                  }),
                { onSuccess: () => setOpen(false), silentSuccess: true },
              )
            }
          >
            Save item
          </Button>
        </div>
      ) : null}

      {rulingOpen && mcpCanRule ? (
        <div className="mt-2.5 space-y-2 border-t border-ink-200 pt-2.5">
          <Field
            label="MCP decision note"
            htmlFor={`ruling-${item.id}`}
            required
            error={errors.note}
            hint={`Recorded against ${actingUser.name}.`}
          >
            <Textarea
              id={`ruling-${item.id}`}
              rows={2}
              value={rulingNote}
              invalid={Boolean(errors.note)}
              onChange={(event) => setRulingNote(event.target.value)}
              placeholder="Why is the exception acceptable, or what clarification is needed?"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="success"
              icon={<ThumbsUp />}
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repo.ruleOnChecklistException({ itemId: item.id, ruling: "ACCEPTED", note: rulingNote }),
                  { onSuccess: () => setRulingOpen(false) },
                )
              }
            >
              Approve exception
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Undo2 />}
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repo.ruleOnChecklistException({ itemId: item.id, ruling: "RETURNED", note: rulingNote }),
                  { onSuccess: () => setRulingOpen(false) },
                )
              }
            >
              Return for clarification
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
