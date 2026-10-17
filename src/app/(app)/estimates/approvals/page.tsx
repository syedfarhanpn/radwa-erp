"use client";

/**
 * Estimate approval queue.
 *
 * Shows estimates submitted for approval. When the active role is MD, the queue
 * is narrowed to the estimates where the acting Management Team member is a
 * required approver and has not yet decided.
 */

import * as React from "react";
import { ShieldCheck } from "lucide-react";

import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { enquiryDetail, estimateApprovalQueue } from "@/store/selectors";
import { BoqReadOnlyTable, EstimateApprovalPanel } from "@/components/workflow/EstimatePanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";
import { formatMoney } from "@/lib/money";

export default function EstimateApprovalsPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const [mineOnly, setMineOnly] = React.useState(role === "MD");

  const queue = React.useMemo(
    () => estimateApprovalQueue(db, mineOnly && role === "MD" ? actingUser.id : undefined),
    [db, mineOnly, role, actingUser.id],
  );

  const entries: QueueEntry[] = React.useMemo(
    () =>
      queue.map((item) => ({
        id: item.enquiry.id,
        enquiry: item.enquiry,
        hint: `Rev ${item.estimate.version} · ${formatMoney(item.totals.grandTotal, item.estimate.currency, 0)}`,
        badge: {
          text: `${item.state.approved}/${item.state.total} approved`,
          tone: item.state.pending > 0 ? ("warn" as const) : ("ok" as const),
        },
      })),
    [queue],
  );

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  return (
    <div className="space-y-4">
      {role === "MD" ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
            className="size-4 accent-brand-600"
          />
          Show only estimates awaiting my decision as {actingUser.name}
        </label>
      ) : null}

      <QueueLayout
        icon={<ShieldCheck />}
        title="Estimates awaiting approval"
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="estimate"
        emptyTitle="No estimates awaiting approval"
        emptyDescription="Estimates appear here when an Estimator submits a revision for approval."
      >
        {detail ? (
          <>
            <EstimateApprovalPanel detail={detail} />
            {detail.latestEstimate ? <BoqReadOnlyTable estimateId={detail.latestEstimate.id} /> : null}
          </>
        ) : null}
      </QueueLayout>
    </div>
  );
}
