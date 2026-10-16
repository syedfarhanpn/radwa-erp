"use client";

/**
 * Radwa Gulf and Co — final bid approval.
 *
 * Gated on the CRM Manager's completeness verification: the Management Team
 * cannot vote while documents are unapproved, and a document change after
 * verification closes the gate again until CRM re-verifies.
 *
 * The approval threshold is a documented, configurable default — the business
 * has not confirmed a voting rule, so the demo uses unanimity and says so
 * rather than inventing a majority.
 */

import * as React from "react";
import { CheckCircle2, Scale, XCircle } from "lucide-react";

import { finalBidApprovalPolicy } from "@/domain/config";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  KeyValue,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui/primitives";
import { Field, Textarea } from "@/components/ui/form";
import { ApprovalBadge } from "./StatusBadges";
import { DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

export function FinalApprovalPanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy, errors } = useAction();

  const [rejectFor, setRejectFor] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const pkg = detail.bidPackage;
  const state = detail.finalApproval;
  if (!pkg || !state) return null;

  const totals = detail.totals;
  const rows = state.approvers.map((approver) => ({
    approver,
    row: state.rows.find((r) => r.approverId === approver.id),
  }));

  return (
    <Panel>
      <PanelHeader
        icon={<Scale />}
        title="Final bid approval"
        description={`Approval round ${state.round || "—"} · the complete package including BOQ, quotation and current document versions.`}
        actions={
          <Badge
            tone={
              !state.gateOpen
                ? "neutral"
                : state.decision === "APPROVED"
                  ? "ok"
                  : state.decision === "REJECTED"
                    ? "bad"
                    : "warn"
            }
          >
            {!state.gateOpen
              ? "Not open"
              : state.decision === "APPROVED"
                ? "Approved for submission"
                : state.decision === "REJECTED"
                  ? "Returned for correction"
                  : `${state.approved} of ${state.total} approved`}
          </Badge>
        }
      />

      <PanelBody className="space-y-3">
        <DefinitionList cols={4}>
          <KeyValue label="Quotation total">
            <span className="numeric font-semibold text-ink-900">
              {formatMoney(totals?.grandTotal, detail.enquiry.currency)}
            </span>
          </KeyValue>
          <KeyValue label="Estimate revision">
            <span className="numeric">{detail.approvedEstimate?.version ?? detail.latestEstimate?.version ?? "—"}</span>
          </KeyValue>
          <KeyValue label="Required documents">
            <span className="numeric">
              {detail.completeness?.approvedCount ?? 0} of {detail.completeness?.requiredCount ?? 0} approved
            </span>
          </KeyValue>
          <KeyValue label="Submission deadline">{formatDate(detail.enquiry.submissionDeadline)}</KeyValue>
        </DefinitionList>

        {!state.gateOpen ? (
          <Callout tone="warn" title="Final approval is not open">
            {state.gateMessage}
          </Callout>
        ) : null}

        {state.round === 0 ? null : (
          <ul className="space-y-2">
            {rows.map(({ approver, row }) => {
              const isMe = approver.id === actingUser.id;
              const decision = row?.decision ?? "PENDING";
              return (
                <li
                  key={approver.id}
                  className={cn(
                    "rounded-control border px-3 py-2.5",
                    decision === "APPROVED"
                      ? "border-ok-200 bg-ok-50/50"
                      : decision === "REJECTED"
                        ? "border-bad-200 bg-bad-50/50"
                        : "border-ink-200 bg-white",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Avatar initials={approver.initials} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                          {approver.name}
                          {approver.isMD ? <Badge tone="brand">MD</Badge> : null}
                          {isMe && role === "MD" ? <Badge tone="info">You</Badge> : null}
                        </p>
                        <p className="text-2xs text-ink-500">{approver.jobTitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ApprovalBadge decision={decision} />
                      {row?.decidedAt ? (
                        <span className="text-2xs text-ink-500">{formatDateTime(row.decidedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  {row?.reason ? (
                    <p className="mt-2 rounded border border-ink-200 bg-white px-2.5 py-1.5 text-2xs leading-relaxed text-ink-600">
                      <span className="font-semibold text-ink-700">
                        {decision === "REJECTED" ? "Rejection reason: " : "Note: "}
                      </span>
                      {row.reason}
                    </p>
                  ) : null}

                  {role === "MD" && isMe && state.gateOpen && decision === "PENDING" ? (
                    <div className="mt-2.5 border-t border-ink-200 pt-2.5">
                      {rejectFor === approver.id ? (
                        <Field label="Rejection reason" htmlFor={`bid-reason-${approver.id}`} required error={errors.reason}>
                          <Textarea
                            id={`bid-reason-${approver.id}`}
                            rows={2}
                            value={reason}
                            invalid={Boolean(errors.reason)}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Why is the bid being returned for correction?"
                          />
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    repo.decideFinalBidApproval({
                                      packageId: pkg.id,
                                      approverId: approver.id,
                                      decision: "REJECTED",
                                      reason,
                                    }),
                                  {
                                    onSuccess: () => {
                                      setRejectFor(null);
                                      setReason("");
                                    },
                                  },
                                )
                              }
                            >
                              Confirm rejection
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejectFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        </Field>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            icon={<CheckCircle2 />}
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                repo.decideFinalBidApproval({
                                  packageId: pkg.id,
                                  approverId: approver.id,
                                  decision: "APPROVED",
                                  reason: "",
                                }),
                              )
                            }
                          >
                            Approve bid
                          </Button>
                          <Button size="sm" variant="danger" icon={<XCircle />} onClick={() => setRejectFor(approver.id)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {state.decision === "APPROVED" ? (
          <Callout tone="ok" title="Approved for submission">
            The package has been transferred to the MCP. Record the submission on the Submission &amp; Follow-up
            screen.
          </Callout>
        ) : null}

        {role !== "MD" && state.gateOpen && state.decision === "PENDING" ? (
          <RoleGate allow={["MD"]} what="Final bid approval">
            <span />
          </RoleGate>
        ) : null}

        <PolicyNote>{finalBidApprovalPolicy.note}</PolicyNote>
      </PanelBody>
    </Panel>
  );
}
