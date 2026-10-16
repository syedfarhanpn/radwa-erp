"use client";

/**
 * Radwa Gulf and Co — qualification panels: pursuit decision, assignment, tender
 * documents.
 */

import * as React from "react";
import { CheckCircle2, FileText, Gavel, UserCheck, Users, XCircle } from "lucide-react";

import { managementConfig } from "@/domain/config";
import { ROLE_LABELS, TENDER_DOC_CATEGORY_LABELS } from "@/domain/enums";
import { canOverrideAssignment } from "@/domain/rules";
import type { EnquiryDetail } from "@/store/selectors";
import { formatDateTime, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { usersWithRole, managementTeam, userById } from "@/store/selectors";
import {
  Avatar,
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
import { Field, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

/* ========================================================== pursuit ====== */

export function PursuitPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy } = useAction();

  const team = managementTeam(db);
  const [draft, setDraft] = React.useState<Record<string, { vote: "PURSUE" | "REJECT" | ""; reason: string }>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const { pursuit, enquiry } = detail;
  const settled = pursuit.outcome !== "PENDING";

  function setMemberDraft(memberId: string, patch: Partial<{ vote: "PURSUE" | "REJECT" | ""; reason: string }>) {
    setDraft((current) => ({
      ...current,
      [memberId]: { ...{ vote: "" as const, reason: "" }, ...current[memberId], ...patch },
    }));
  }

  async function submit(memberId: string) {
    const entry = draft[memberId] ?? { vote: "", reason: "" };
    if (!entry.vote) {
      setErrors((e) => ({ ...e, [memberId]: "Choose pursue or reject." }));
      return;
    }
    const result = await run(() =>
      repo.recordPursuitDecision({
        enquiryId: enquiry.id,
        managerId: memberId,
        vote: entry.vote as "PURSUE" | "REJECT",
        reason: entry.reason,
      }),
    );
    if (result.ok) {
      setDraft((current) => ({ ...current, [memberId]: { vote: "", reason: "" } }));
      setErrors((e) => ({ ...e, [memberId]: "" }));
    } else {
      setErrors((e) => ({ ...e, [memberId]: result.fieldErrors?.reason ?? result.message }));
    }
  }

  return (
    <Panel>
      <PanelHeader
        icon={<Gavel />}
        title="Pursuit decision"
        description={`Each of the ${managementConfig.managementTeamSize} Management Team members records an individual decision.`}
        actions={
          <Badge tone={pursuit.outcome === "PURSUE" ? "ok" : pursuit.outcome === "REJECTED" ? "bad" : "warn"}>
            {pursuit.outcome === "PURSUE"
              ? "Decision complete — pursue"
              : pursuit.outcome === "REJECTED"
                ? "Rejected by all members"
                : `${pursuit.decisions.length} of ${pursuit.teamSize} recorded`}
          </Badge>
        }
      />

      <PanelBody className="space-y-3">
        <Callout tone={pursuit.rejectCount > 0 && !settled ? "warn" : "info"}>
          <span className="font-semibold">Business rule.</span> The enquiry becomes void only when{" "}
          <span className="font-semibold">all {pursuit.teamSize}</span> Management Team members reject it. One or
          two rejections leave it open while another member has not decided.
          {pursuit.rejectCount > 0 && !settled ? (
            <>
              {" "}
              Currently {pursuit.rejectCount} rejection(s) and {pursuit.pursueCount} pursue vote(s) with{" "}
              {pursuit.pendingManagers.length} member(s) still to decide — the enquiry stays live.
            </>
          ) : null}
        </Callout>

        <ul className="space-y-2.5">
          {team.map((member) => {
            const decision = pursuit.decisions.find((d) => d.managerId === member.id);
            const entry = draft[member.id] ?? { vote: "", reason: "" };
            const canRecord = role === "MD";

            return (
              <li
                key={member.id}
                className={cn(
                  "rounded-control border px-3 py-2.5",
                  decision?.vote === "PURSUE"
                    ? "border-ok-200 bg-ok-50/50"
                    : decision?.vote === "REJECT"
                      ? "border-bad-200 bg-bad-50/50"
                      : "border-ink-200 bg-white",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Avatar initials={member.initials} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                        {member.name}
                        {member.isMD ? <Badge tone="brand">MD</Badge> : null}
                        {member.id === actingUser.id && role === "MD" ? <Badge tone="info">You</Badge> : null}
                      </p>
                      <p className="text-2xs text-ink-500">{member.jobTitle}</p>
                    </div>
                  </div>

                  {decision ? (
                    <Badge tone={decision.vote === "PURSUE" ? "ok" : "bad"} dot>
                      {decision.vote === "PURSUE" ? "Pursue" : "Reject"} · {formatDateTime(decision.decidedAt)}
                    </Badge>
                  ) : (
                    <Badge tone="warn">Pending</Badge>
                  )}
                </div>

                {decision?.reason ? (
                  <p className="mt-2 rounded border border-ink-200 bg-white px-2.5 py-1.5 text-2xs leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-700">
                      {decision.vote === "REJECT" ? "Rejection reason: " : "Note: "}
                    </span>
                    {decision.reason}
                  </p>
                ) : null}

                {canRecord && !detail.enquiry.closureReason ? (
                  <div className="mt-2.5 space-y-2 border-t border-ink-200 pt-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={entry.vote === "PURSUE" ? "success" : "secondary"}
                        icon={<CheckCircle2 />}
                        onClick={() => setMemberDraft(member.id, { vote: "PURSUE" })}
                      >
                        Pursue
                      </Button>
                      <Button
                        size="sm"
                        variant={entry.vote === "REJECT" ? "danger" : "secondary"}
                        icon={<XCircle />}
                        onClick={() => setMemberDraft(member.id, { vote: "REJECT" })}
                      >
                        Reject
                      </Button>
                      {decision ? <span className="text-2xs text-ink-500">Recording again replaces the decision.</span> : null}
                    </div>

                    {entry.vote ? (
                      <Field
                        htmlFor={`reason-${member.id}`}
                        label={entry.vote === "REJECT" ? "Rejection reason" : "Note (optional)"}
                        required={entry.vote === "REJECT"}
                        error={errors[member.id] || undefined}
                        hint={
                          entry.vote === "REJECT"
                            ? undefined
                            : "An explanation for pursuing is optional but useful for the record."
                        }
                      >
                        <Textarea
                          id={`reason-${member.id}`}
                          rows={2}
                          value={entry.reason}
                          invalid={Boolean(errors[member.id])}
                          placeholder={
                            entry.vote === "REJECT"
                              ? "Why is this opportunity being rejected?"
                              : "Optional rationale for pursuing"
                          }
                          onChange={(event) => setMemberDraft(member.id, { reason: event.target.value })}
                        />
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => submit(member.id)}>
                            Record decision
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setMemberDraft(member.id, { vote: "", reason: "" })}
                          >
                            Cancel
                          </Button>
                        </div>
                      </Field>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {role !== "MD" ? (
          <Callout tone="neutral">
            Pursuit decisions are recorded by the Management Team. Switch to the{" "}
            <span className="font-medium">{ROLE_LABELS.MD}</span> role to record them in this demo.
          </Callout>
        ) : (
          <PolicyNote>
            In this demo the MD role can record a decision on behalf of any Management Team member so all three
            votes are demonstrable. In production each member authenticates and records their own decision.
          </PolicyNote>
        )}
      </PanelBody>
    </Panel>
  );
}

/* ======================================================= assignment ====== */

export function AssignmentPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy, errors } = useAction();

  const { enquiry, pursuit } = detail;
  const mcps = usersWithRole(db, "MCP");
  const estimators = usersWithRole(db, "ESTIMATOR");
  const managers = managementTeam(db);

  // `null` means "show whatever the record currently says", so the selects
  // follow a saved or overridden assignment without an effect copying it in.
  const [mcpChoice, setMcpId] = React.useState<string | null>(null);
  const [estimatorChoice, setEstimatorId] = React.useState<string | null>(null);
  const [managerChoice, setManagerId] = React.useState<string | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const mcpId = mcpChoice ?? enquiry.assignedMcpId ?? "";
  const estimatorId = estimatorChoice ?? enquiry.assignedEstimatorId ?? "";
  const managerId = managerChoice ?? enquiry.responsibleManagerId ?? "";

  const alreadyAssigned = Boolean(enquiry.assignedMcpId);
  const canOverride = canOverrideAssignment(enquiry, actingUser);
  const canAct = role === "CRM_MANAGER" || canOverride;
  const blocked = !pursuit.readyForAssignment && !alreadyAssigned;

  async function submit() {
    await run(() =>
      repo.assignTeam({
        enquiryId: enquiry.id,
        mcpId,
        estimatorId,
        responsibleManagerId: managerId,
        overrideReason: alreadyAssigned ? overrideReason : undefined,
      }),
    );
    setOverrideReason("");
  }

  return (
    <Panel>
      <PanelHeader
        icon={<Users />}
        title="Assignment"
        description="The CRM Manager assigns the MCP and Estimator. The MD can override an assignment."
        actions={
          alreadyAssigned ? <Badge tone="ok">Assigned</Badge> : <Badge tone="warn">Not assigned</Badge>
        }
      />

      <PanelBody className="space-y-3">
        <DefinitionList cols={3}>
          <KeyValue label="MCP / Project Manager">{detail.mcp?.name ?? "—"}</KeyValue>
          <KeyValue label="Estimator">{detail.estimator?.name ?? "—"}</KeyValue>
          <KeyValue label="Responsible Manager">{detail.responsibleManager?.name ?? "—"}</KeyValue>
        </DefinitionList>

        <Callout tone="info">
          The MCP and the Estimator receive the tender documents{" "}
          <span className="font-semibold">in parallel</span>, not one after the other. Read receipts for both are
          shown in the Documents tab.
        </Callout>

        {blocked ? (
          <Callout tone="warn" title="Pursuit decision not complete">
            {pursuit.pendingManagers.length} Management Team member(s) have not recorded a decision yet. Assignment
            opens once the pursuit decision is settled.
          </Callout>
        ) : null}

        {canAct && !blocked ? (
          <div className="space-y-3 rounded-control border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs font-semibold text-ink-800">
              {alreadyAssigned ? (canOverride ? "Override assignment (MD)" : "Reassign") : "Assign the team"}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="MCP / Project Manager" htmlFor="assign-mcp" required error={errors.mcpId}>
                <Select
                  id="assign-mcp"
                  value={mcpId}
                  invalid={Boolean(errors.mcpId)}
                  onChange={(event) => setMcpId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {mcps.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Estimator" htmlFor="assign-estimator" required error={errors.estimatorId}>
                <Select
                  id="assign-estimator"
                  value={estimatorId}
                  invalid={Boolean(errors.estimatorId)}
                  onChange={(event) => setEstimatorId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {estimators.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Responsible Manager"
                htmlFor="assign-manager"
                required
                error={errors.responsibleManagerId}
                hint="Approves the estimate alongside the MD."
              >
                <Select
                  id="assign-manager"
                  value={managerId}
                  invalid={Boolean(errors.responsibleManagerId)}
                  onChange={(event) => setManagerId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {managers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.isMD ? " (MD)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {alreadyAssigned && canOverride ? (
              <Field
                label="Override reason"
                htmlFor="override-reason"
                required
                error={errors.overrideReason}
                hint="Recorded in the activity history against your name."
              >
                <Textarea
                  id="override-reason"
                  rows={2}
                  value={overrideReason}
                  invalid={Boolean(errors.overrideReason)}
                  placeholder="Why is the assignment being changed?"
                  onChange={(event) => setOverrideReason(event.target.value)}
                />
              </Field>
            ) : null}

            <Button variant="primary" icon={<UserCheck />} disabled={busy} onClick={submit}>
              {alreadyAssigned ? "Save new assignment" : "Assign and release documents"}
            </Button>
          </div>
        ) : !canAct ? (
          <RoleGate allow={alreadyAssigned ? ["MD", "CRM_MANAGER"] : ["CRM_MANAGER"]} what="Assignment">
            <span />
          </RoleGate>
        ) : null}

        {detail.assignments.length > 0 ? (
          <div>
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-500 uppercase">
              Assignment history
            </p>
            <ul className="space-y-1.5">
              {detail.assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className={cn(
                    "rounded border px-2.5 py-1.5 text-2xs",
                    assignment.isCurrent ? "border-brand-200 bg-brand-50" : "border-ink-200 bg-white text-ink-500",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-ink-700">
                      MCP {userById(db, assignment.mcpId)?.name} · Estimator{" "}
                      {userById(db, assignment.estimatorId)?.name}
                    </span>
                    <span>by {userById(db, assignment.assignedById)?.name}</span>
                    <span>{formatDateTime(assignment.assignedAt)}</span>
                    {assignment.isCurrent ? <Badge tone="brand">Current</Badge> : null}
                    {assignment.overriddenFromAssignmentId ? <Badge tone="warn">Override</Badge> : null}
                  </span>
                  {assignment.overrideReason ? (
                    <span className="mt-0.5 block text-ink-600">Reason: {assignment.overrideReason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/* ================================================== tender documents ===== */

export function TenderDocumentsPanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();

  const docs = detail.tenderDocuments;

  return (
    <Panel>
      <PanelHeader
        icon={<FileText />}
        title="Tender documents"
        description="Issued to the MCP and the Estimator in parallel. Read receipts are tracked independently for each role."
        actions={<Badge tone="neutral">{docs.length} document(s)</Badge>}
      />

      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No tender documents listed"
          description="Documents are listed when the enquiry is registered. This demo records document metadata only — no file is uploaded or stored."
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Document</TH>
                <TH>Category</TH>
                <TH>File</TH>
                <TH>Received</TH>
                <TH>MCP reviewed</TH>
                <TH>Estimator reviewed</TH>
                {role === "MCP" || role === "ESTIMATOR" ? <TH align="right">Action</TH> : null}
              </TR>
            </THead>
            <TBody>
              {docs.map((doc) => (
                <TR key={doc.id}>
                  <TD className="max-w-xs">
                    <span className="block font-medium text-ink-800">{doc.name}</span>
                    {doc.notes ? <span className="mt-0.5 block text-2xs text-ink-500">{doc.notes}</span> : null}
                  </TD>
                  <TD>
                    <Badge tone="neutral">{TENDER_DOC_CATEGORY_LABELS[doc.category]}</Badge>
                  </TD>
                  <TD>
                    <span className="block truncate font-mono text-2xs text-ink-600">{doc.fileName}</span>
                    <span className="text-2xs text-ink-400">
                      {doc.fileSizeLabel}
                      {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                    </span>
                  </TD>
                  <TD>{formatDate(doc.receivedAt)}</TD>
                  <TD>
                    {doc.reviewedByMcpAt ? (
                      <Badge tone="ok">{formatDate(doc.reviewedByMcpAt)}</Badge>
                    ) : (
                      <span className="text-2xs text-ink-400">Not yet</span>
                    )}
                  </TD>
                  <TD>
                    {doc.reviewedByEstimatorAt ? (
                      <Badge tone="ok">{formatDate(doc.reviewedByEstimatorAt)}</Badge>
                    ) : (
                      <span className="text-2xs text-ink-400">Not yet</span>
                    )}
                  </TD>
                  {role === "MCP" || role === "ESTIMATOR" ? (
                    <TD align="right">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={
                          busy ||
                          (role === "MCP" ? Boolean(doc.reviewedByMcpAt) : Boolean(doc.reviewedByEstimatorAt))
                        }
                        onClick={() =>
                          void run(() =>
                            repo.markTenderDocumentReviewed({
                              documentId: doc.id,
                              as: role === "MCP" ? "MCP" : "ESTIMATOR",
                            }),
                          )
                        }
                      >
                        Mark reviewed
                      </Button>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <PanelFooter>
        <p className="text-2xs text-ink-500">
          Demo metadata only. No document is uploaded to or stored on a server in this build.
        </p>
      </PanelFooter>
    </Panel>
  );
}
