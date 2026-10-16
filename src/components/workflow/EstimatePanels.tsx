"use client";

/**
 * Radwa Gulf and Co — estimate summary and approval panels.
 *
 * The approval list is derived from the configured policy: the MD must approve,
 * and so must the Management Team member responsible for the enquiry. Nothing
 * beyond those two confirmed requirements is assumed, and if the MD happens to
 * be the responsible manager the list collapses to one approver instead of
 * demanding two votes from one person.
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, FileStack, ShieldCheck, XCircle } from "lucide-react";

import { estimateApprovalPolicy } from "@/domain/config";
import { computeEstimateTotals } from "@/domain/rules";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import { boqLinesFor, userById } from "@/store/selectors";
import {
  Avatar,
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
import { Field, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { ApprovalBadge, EstimateStatusBadge } from "./StatusBadges";
import { EstimateVersionHistory } from "./BoqWorkspace";
import { DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

/* ================================================== estimate overview ==== */

export function EstimateSummaryPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();

  const estimate = detail.latestEstimate;
  const totals = detail.totals;

  if (!estimate) {
    return (
      <Panel>
        <PanelHeader icon={<FileStack />} title="BOQ and estimate" />
        <EmptyState
          icon={<FileStack />}
          title="No estimate yet"
          description="The Estimator prepares the bill of quantities and the quotation once the tender documents have been reviewed."
          action={
            role === "ESTIMATOR" ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => repo.createEstimate({ enquiryId: detail.enquiry.id }))}
              >
                Start BOQ from the project template
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<FileStack />}
          title={`Estimate revision ${estimate.version}`}
          description={`Prepared by ${userById(db, estimate.preparedById)?.name ?? "—"}`}
          actions={
            <>
              <EstimateStatusBadge status={estimate.status} />
              <LinkButton href={`/estimates/${estimate.id}`} size="sm" variant="secondary">
                Open BOQ workspace
              </LinkButton>
            </>
          }
        />
        <PanelBody className="space-y-3">
          <DefinitionList cols={4}>
            <KeyValue label="BOQ lines">
              <span className="numeric">{totals?.lineCount ?? 0}</span>
            </KeyValue>
            <KeyValue label="Priced line total">
              <span className="numeric">{formatMoney(totals?.lineTotal, estimate.currency)}</span>
            </KeyValue>
            <KeyValue label="Quotation total">
              <span className="numeric font-semibold text-ink-900">
                {formatMoney(totals?.grandTotal, estimate.currency)}
              </span>
            </KeyValue>
            <KeyValue label="Last updated">{formatDateTime(estimate.updatedAt)}</KeyValue>
          </DefinitionList>

          {estimate.notes ? (
            <KeyValue label="Estimator notes">
              <span className="text-xs leading-relaxed text-ink-600">{estimate.notes}</span>
            </KeyValue>
          ) : null}
          {estimate.assumptions ? (
            <KeyValue label="Assumptions and exclusions">
              <span className="text-xs leading-relaxed whitespace-pre-line text-ink-600">
                {estimate.assumptions}
              </span>
            </KeyValue>
          ) : null}
        </PanelBody>
      </Panel>

      <EstimateApprovalPanel detail={detail} />
      <EstimateVersionHistory enquiryId={detail.enquiry.id} />
    </div>
  );
}

/* ================================================= estimate approval ===== */

export function EstimateApprovalPanel({ detail }: { detail: EnquiryDetail }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy, errors } = useAction();

  const [reasonFor, setReasonFor] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const estimate = detail.latestEstimate;
  if (!estimate) return null;

  const approvals = detail.estimateApprovals.filter((a) => a.estimateId === estimate.id);
  const totals = detail.totals;

  if (estimate.status === "DRAFT") {
    return (
      <Panel>
        <PanelHeader icon={<ShieldCheck />} title="Estimate approval" actions={<Badge tone="neutral">Not submitted</Badge>} />
        <PanelBody>
          <Callout tone="neutral">
            The Estimator has not submitted revision {estimate.version} for approval yet. Approvers appear here
            once it is submitted.
          </Callout>
          <PolicyNote>
            Required approvers: the MD{" "}
            {estimateApprovalPolicy.requireResponsibleManager
              ? "and the Management Team member responsible for the enquiry"
              : ""}
            . This is configured in <span className="font-mono">src/domain/config.ts</span>.
          </PolicyNote>
        </PanelBody>
      </Panel>
    );
  }

  const myRow = approvals.find((a) => a.approverId === actingUser.id);
  const canAct = role === "MD" && Boolean(myRow) && estimate.status === "PENDING_APPROVAL";

  return (
    <Panel>
      <PanelHeader
        icon={<ShieldCheck />}
        title="Estimate approval"
        description={`Revision ${estimate.version} · ${formatMoney(totals?.grandTotal, estimate.currency)}`}
        actions={<EstimateStatusBadge status={estimate.status} />}
      />

      <PanelBody className="space-y-3">
        {estimate.status === "REJECTED" ? (
          <Callout tone="bad" title="Estimate rejected">
            The Estimator can correct the BOQ and submit it again. A changed estimate always needs another
            approval cycle.
          </Callout>
        ) : null}

        <ul className="space-y-2">
          {approvals.map((row) => {
            const approver = userById(db, row.approverId);
            const isMe = row.approverId === actingUser.id;
            return (
              <li
                key={row.id}
                className={cn(
                  "rounded-control border px-3 py-2.5",
                  row.decision === "APPROVED"
                    ? "border-ok-200 bg-ok-50/50"
                    : row.decision === "REJECTED"
                      ? "border-bad-200 bg-bad-50/50"
                      : "border-ink-200 bg-white",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Avatar initials={approver?.initials ?? "??"} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                        {approver?.name}
                        <Badge tone={row.requirement === "MD" ? "brand" : "neutral"}>
                          {row.requirement === "MD" ? "MD — required" : "Responsible Manager"}
                        </Badge>
                        {isMe && role === "MD" ? <Badge tone="info">You</Badge> : null}
                      </p>
                      <p className="text-2xs text-ink-500">{approver?.jobTitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ApprovalBadge decision={row.decision} />
                    {row.decidedAt ? (
                      <span className="text-2xs text-ink-500">{formatDate(row.decidedAt)}</span>
                    ) : null}
                  </div>
                </div>

                {row.reason ? (
                  <p className="mt-2 rounded border border-ink-200 bg-white px-2.5 py-1.5 text-2xs leading-relaxed text-ink-600">
                    <span className="font-semibold text-ink-700">
                      {row.decision === "REJECTED" ? "Rejection reason: " : "Note: "}
                    </span>
                    {row.reason}
                  </p>
                ) : null}

                {canAct && isMe && row.decision === "PENDING" ? (
                  <div className="mt-2.5 space-y-2 border-t border-ink-200 pt-2.5">
                    {reasonFor === row.id ? (
                      <Field
                        label="Rejection reason"
                        htmlFor={`est-reason-${row.id}`}
                        required
                        error={errors.reason}
                      >
                        <Textarea
                          id={`est-reason-${row.id}`}
                          rows={2}
                          value={reason}
                          invalid={Boolean(errors.reason)}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Why is the estimate being rejected? The Estimator needs this to correct it."
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () =>
                                  repo.decideEstimateApproval({
                                    estimateId: estimate.id,
                                    approverId: row.approverId,
                                    decision: "REJECTED",
                                    reason,
                                  }),
                                {
                                  onSuccess: () => {
                                    setReasonFor(null);
                                    setReason("");
                                  },
                                },
                              )
                            }
                          >
                            Confirm rejection
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setReasonFor(null)}>
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
                              repo.decideEstimateApproval({
                                estimateId: estimate.id,
                                approverId: row.approverId,
                                decision: "APPROVED",
                                reason: "",
                              }),
                            )
                          }
                        >
                          Approve estimate
                        </Button>
                        <Button size="sm" variant="danger" icon={<XCircle />} onClick={() => setReasonFor(row.id)}>
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

        {role !== "MD" && estimate.status === "PENDING_APPROVAL" ? (
          <RoleGate allow={["MD"]} what="Estimate approval">
            <span />
          </RoleGate>
        ) : null}

        <PolicyNote>
          Every listed approver must approve. A rejection by any approver returns the estimate to the Estimator
          — it cannot be approved around. The matrix is configurable in{" "}
          <span className="font-mono">src/domain/config.ts</span>.
        </PolicyNote>
      </PanelBody>
    </Panel>
  );
}

/* ============================================ queue table (shared view) == */

export function EstimateApprovalQueueTable({
  items,
}: {
  items: Array<{
    enquiry: EnquiryDetail["enquiry"];
    estimate: NonNullable<EnquiryDetail["latestEstimate"]>;
    totals: NonNullable<EnquiryDetail["totals"]>;
    state: { approved: number; total: number; pending: number };
  }>;
}) {
  const db = useDb();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="No estimates awaiting your approval"
        description="Estimates appear here when the Estimator submits them and you are a required approver."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Enquiry</TH>
            <TH>Client</TH>
            <TH>Revision</TH>
            <TH align="right">Quotation total</TH>
            <TH>Approvals</TH>
            <TH>Submitted</TH>
            <TH align="right" />
          </TR>
        </THead>
        <TBody>
          {items.map(({ enquiry, estimate, totals, state }) => (
            <TR key={estimate.id}>
              <TD className="max-w-xs">
                <Link href={`/enquiries/${enquiry.id}?tab=estimate`} className="group block">
                  <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                    {enquiry.reference}
                  </span>
                  <span className="block truncate text-xs font-medium text-ink-800">{enquiry.projectTitle}</span>
                </Link>
              </TD>
              <TD>{db.clients.find((c) => c.id === enquiry.clientId)?.shortName ?? "—"}</TD>
              <TD className="numeric">Rev {estimate.version}</TD>
              <TD align="right" className="font-medium text-ink-900">
                {formatMoney(totals.grandTotal, estimate.currency)}
              </TD>
              <TD>
                <Badge tone={state.pending > 0 ? "warn" : "ok"}>
                  {state.approved} of {state.total} approved
                </Badge>
              </TD>
              <TD>{formatDate(estimate.submittedAt)}</TD>
              <TD align="right">
                <Link
                  href={`/estimates/${estimate.id}`}
                  className="text-2xs font-medium text-brand-600 hover:underline"
                >
                  Review BOQ
                </Link>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

/** Compact read-only BOQ used on approval screens. */
export function BoqReadOnlyTable({ estimateId }: { estimateId: string }) {
  const db = useDb();
  const estimate = db.estimates.find((e) => e.id === estimateId);
  const lines = boqLinesFor(db, estimateId);
  if (!estimate) return null;
  const totals = computeEstimateTotals(estimate, lines);

  return (
    <Panel>
      <PanelHeader
        title={`Bill of quantities — revision ${estimate.version}`}
        actions={<Badge tone="neutral">{lines.length} line(s)</Badge>}
      />
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH width="5rem">Code</TH>
              <TH>Description</TH>
              <TH width="4rem">Unit</TH>
              <TH align="right" width="6rem">
                Qty
              </TH>
              <TH align="right" width="7rem">
                Rate
              </TH>
              <TH align="right" width="8rem">
                Amount
              </TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((line) => (
              <TR key={line.id}>
                <TD className="font-mono text-2xs">{line.itemCode}</TD>
                <TD className="max-w-md">
                  <span className="text-xs leading-relaxed text-ink-700">{line.description}</span>
                  {line.note ? <span className="mt-0.5 block text-2xs text-ink-500">{line.note}</span> : null}
                </TD>
                <TD>{line.unit}</TD>
                <TD align="right">{line.estimatorQuantity}</TD>
                <TD align="right">{formatMoney(line.estimatorUnitRate, estimate.currency, 2)}</TD>
                <TD align="right" className="font-medium text-ink-900">
                  {formatMoney(line.estimatorQuantity * line.estimatorUnitRate, estimate.currency)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      <PanelFooter className="justify-end gap-6">
        <span className="text-2xs text-ink-600">
          Line total <span className="numeric font-medium text-ink-800">{formatMoney(totals.lineTotal, estimate.currency)}</span>
        </span>
        <span className="text-2xs text-ink-600">
          Sub-total <span className="numeric font-medium text-ink-800">{formatMoney(totals.subTotal, estimate.currency)}</span>
        </span>
        <span className="text-xs font-semibold text-ink-900">
          Quotation total{" "}
          <span className="numeric">{formatMoney(totals.grandTotal, estimate.currency)}</span>
        </span>
      </PanelFooter>
    </Panel>
  );
}
