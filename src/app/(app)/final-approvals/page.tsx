"use client";

/**
 * Final bid approval queue.
 *
 * Only packages the CRM Manager has verified appear here. Packages whose
 * verification went stale are listed separately, because the right action there
 * is CRM re-verification, not a management vote.
 */

import * as React from "react";
import Link from "next/link";
import { Scale } from "lucide-react";

import { formatMoney } from "@/lib/money";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { enquiryDetail, finalApprovalQueue, packageQueue, totalsFor } from "@/store/selectors";
import { Badge, Panel, PanelHeader } from "@/components/ui/primitives";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { BoqReadOnlyTable } from "@/components/workflow/EstimatePanels";
import { FinalApprovalPanel } from "@/components/workflow/FinalApprovalPanel";
import { CompletenessVerificationPanel } from "@/components/workflow/BidPackagePanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";
import { DeadlineCell } from "@/components/workflow/StatusBadges";

export default function FinalApprovalsPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const [mineOnly, setMineOnly] = React.useState(role === "MD");

  const queue = React.useMemo(
    () => finalApprovalQueue(db, mineOnly && role === "MD" ? actingUser.id : undefined),
    [db, mineOnly, role, actingUser.id],
  );

  const stale = React.useMemo(() => packageQueue(db).filter((item) => item.stale), [db]);

  const entries: QueueEntry[] = React.useMemo(
    () =>
      queue.map((item) => {
        const estimate = db.estimates.find(
          (e) => e.enquiryId === item.enquiry.id && e.status === "APPROVED",
        );
        return {
          id: item.enquiry.id,
          enquiry: item.enquiry,
          hint: estimate
            ? `Rev ${estimate.version} · ${formatMoney(totalsFor(db, estimate).grandTotal, estimate.currency, 0)}`
            : undefined,
          badge: {
            text: `${item.finalApproval.approved}/${item.finalApproval.total} approved`,
            tone: "warn" as const,
          },
        };
      }),
    [queue, db],
  );

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  return (
    <div className="space-y-4">
      {stale.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Awaiting CRM re-verification"
            description="A document changed after the CRM Manager verified the package, so final approval is closed until it is verified again. Approvals for unchanged documents remain valid."
            actions={<Badge tone="warn">{stale.length}</Badge>}
          />
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Enquiry</TH>
                  <TH width="14rem">Required documents</TH>
                  <TH width="10rem">Deadline</TH>
                  <TH align="right" width="10rem" />
                </TR>
              </THead>
              <TBody>
                {stale.map((item) => (
                  <TR key={item.bidPackage.id}>
                    <TD className="max-w-sm">
                      <Link href={`/enquiries/${item.enquiry.id}?tab=package`} className="group block">
                        <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                          {item.enquiry.reference}
                        </span>
                        <span className="block truncate text-xs font-medium text-ink-800">
                          {item.enquiry.projectTitle}
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="numeric text-xs">
                        {item.completeness.approvedCount} / {item.completeness.requiredCount} approved
                      </span>
                    </TD>
                    <TD>
                      <DeadlineCell date={item.enquiry.submissionDeadline} />
                    </TD>
                    <TD align="right">
                      <Link
                        href={`/bid-packages`}
                        className="text-2xs font-medium text-brand-600 hover:underline"
                      >
                        Open bid package
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Panel>
      ) : null}

      {role === "MD" ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
            className="size-4 accent-brand-600"
          />
          Show only bids awaiting my decision as {actingUser.name}
        </label>
      ) : null}

      <QueueLayout
        icon={<Scale />}
        title="Awaiting final bid approval"
        description="Packages verified by the CRM Manager."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="approval"
        emptyTitle="No bids awaiting final approval"
        emptyDescription="A package reaches this queue once the CRM Manager has verified that every required document holds current-version departmental approval."
      >
        {detail ? (
          <>
            <FinalApprovalPanel detail={detail} />
            <CompletenessVerificationPanel detail={detail} />
            {detail.approvedEstimate ? <BoqReadOnlyTable estimateId={detail.approvedEstimate.id} /> : null}
          </>
        ) : null}
      </QueueLayout>
    </div>
  );
}
