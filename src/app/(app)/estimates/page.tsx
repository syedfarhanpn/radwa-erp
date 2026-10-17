"use client";

/**
 * BOQ and estimate list.
 *
 * Shows every estimate revision with its status and total, plus enquiries that
 * are ready for an estimate but do not have one yet.
 */

import * as React from "react";
import Link from "next/link";
import { FileStack, Plus } from "lucide-react";

import { STAGE_LABELS } from "@/domain/enums";
import { isTerminal } from "@/domain/rules";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { totalsFor, userById } from "@/store/selectors";
import { describeScope } from "@/store/visibility";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  LinkButton,
  Panel,
  PanelHeader,
} from "@/components/ui/primitives";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { EstimateStatusBadge, StageBadge } from "@/components/workflow/StatusBadges";
import { useAction } from "@/components/workflow/shared";

export default function EstimatesPage() {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy } = useAction();
  const [mineOnly, setMineOnly] = React.useState(role === "ESTIMATOR");

  const estimates = React.useMemo(() => {
    return db.estimates
      .map((estimate) => {
        const enquiry = db.enquiries.find((e) => e.id === estimate.enquiryId);
        return { estimate, enquiry, totals: totalsFor(db, estimate) };
      })
      .filter((row) => Boolean(row.enquiry))
      .filter((row) => !mineOnly || row.enquiry!.assignedEstimatorId === actingUser.id)
      .sort((a, b) => {
        const rank = (status: string) =>
          status === "REJECTED" ? 0 : status === "DRAFT" ? 1 : status === "PENDING_APPROVAL" ? 2 : 3;
        const diff = rank(a.estimate.status) - rank(b.estimate.status);
        if (diff !== 0) return diff;
        return a.enquiry!.submissionDeadline < b.enquiry!.submissionDeadline ? -1 : 1;
      });
  }, [db, mineOnly, actingUser.id]);

  const awaitingEstimate = React.useMemo(
    () =>
      db.enquiries.filter(
        (enquiry) =>
          !isTerminal(enquiry) &&
          enquiry.assignedEstimatorId &&
          !db.estimates.some((estimate) => estimate.enquiryId === enquiry.id) &&
          (!mineOnly || enquiry.assignedEstimatorId === actingUser.id),
      ),
    [db, mineOnly, actingUser.id],
  );

  const scopeNote = describeScope(role);

  return (
    <div className="space-y-4">
      {scopeNote ? (
        <Callout tone="info">{scopeNote}</Callout>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={mineOnly}
          onChange={(event) => setMineOnly(event.target.checked)}
          className="size-4 accent-brand-600"
        />
        Show only enquiries assigned to me
      </label>
      )}

      {awaitingEstimate.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Awaiting an estimate"
            description="Assigned enquiries with no BOQ yet."
            actions={<Badge tone="accent">{awaitingEstimate.length}</Badge>}
          />
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Enquiry</TH>
                  <TH width="12rem">Stage</TH>
                  <TH width="10rem">Deadline</TH>
                  <TH width="12rem">Site survey</TH>
                  <TH align="right" width="14rem" />
                </TR>
              </THead>
              <TBody>
                {awaitingEstimate.map((enquiry) => {
                  const survey = db.surveys.find((s) => s.enquiryId === enquiry.id);
                  return (
                    <TR key={enquiry.id}>
                      <TD className="max-w-sm">
                        <Link href={`/enquiries/${enquiry.id}?tab=estimate`} className="group block">
                          <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                            {enquiry.reference}
                          </span>
                          <span className="block truncate text-xs font-medium text-ink-800">
                            {enquiry.projectTitle}
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <StageBadge stage={enquiry.stage} />
                      </TD>
                      <TD className="numeric">{enquiry.submissionDeadline}</TD>
                      <TD>
                        {survey ? (
                          <span className="text-2xs text-ink-600">
                            {survey.status === "NOT_REQUIRED" ? "Not required" : survey.status === "ACCEPTED" ? "Report accepted" : "In progress"}
                          </span>
                        ) : (
                          <Badge tone="accent">Decision due</Badge>
                        )}
                      </TD>
                      <TD align="right">
                        {role === "ESTIMATOR" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Plus />}
                            disabled={busy}
                            onClick={() => void run(() => repo.createEstimate({ enquiryId: enquiry.id }))}
                          >
                            Start BOQ
                          </Button>
                        ) : (
                          <Link
                            href={`/enquiries/${enquiry.id}?tab=estimate`}
                            className="text-2xs font-medium text-brand-600 hover:underline"
                          >
                            View
                          </Link>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          icon={<FileStack />}
          title="Estimates"
          description="Drafts and rejected revisions first — those are the ones that need work."
          actions={<Badge tone="neutral">{estimates.length} revision(s)</Badge>}
        />
        <TableWrap>
          <Table className="min-w-[60rem]">
            <THead>
              <TR>
                <TH width="20rem">Enquiry</TH>
                <TH width="6rem">Revision</TH>
                <TH width="10rem">Status</TH>
                <TH width="11rem">Enquiry stage</TH>
                <TH width="10rem">Estimator</TH>
                <TH align="right" width="6rem">
                  Lines
                </TH>
                <TH align="right" width="10rem">
                  Quotation total
                </TH>
                <TH width="8rem">Updated</TH>
                <TH align="right" width="8rem" />
              </TR>
            </THead>
            <TBody>
              {estimates.length === 0 ? (
                <TableEmptyRow colSpan={9}>
                  No estimates match this filter.
                </TableEmptyRow>
              ) : null}
              {estimates.map(({ estimate, enquiry, totals }) => (
                <TR key={estimate.id}>
                  <TD className="max-w-xs">
                    <Link href={`/enquiries/${enquiry!.id}?tab=estimate`} className="group block">
                      <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                        {enquiry!.reference}
                      </span>
                      <span className="block truncate text-xs font-medium text-ink-800">
                        {enquiry!.projectTitle}
                      </span>
                    </Link>
                  </TD>
                  <TD className="numeric">Rev {estimate.version}</TD>
                  <TD>
                    <EstimateStatusBadge status={estimate.status} />
                  </TD>
                  <TD>
                    <span className="text-2xs text-ink-600">{STAGE_LABELS[enquiry!.stage]}</span>
                  </TD>
                  <TD>
                    <span className="text-2xs text-ink-700">{userById(db, estimate.preparedById)?.name ?? "—"}</span>
                  </TD>
                  <TD align="right">{totals.lineCount}</TD>
                  <TD align="right" className="font-medium text-ink-900">
                    {formatMoney(totals.grandTotal, estimate.currency, 0)}
                  </TD>
                  <TD>
                    <span className="text-2xs text-ink-500">{formatDate(estimate.updatedAt)}</span>
                  </TD>
                  <TD align="right">
                    <LinkButton href={`/estimates/${estimate.id}`} size="sm" variant="secondary">
                      Open
                    </LinkButton>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Panel>

      {estimates.length === 0 && awaitingEstimate.length === 0 ? (
        <EmptyState
          icon={<FileStack />}
          title="Nothing to price"
          description="Uncheck the filter above to see estimates assigned to other estimators."
        />
      ) : null}
    </div>
  );
}
