"use client";

/**
 * Kickoff, PCP, purchase order and Operations handover queue.
 *
 * The badge on each entry shows how many required checklist items are still
 * outstanding, so a blocked handover is visible before you open it.
 */

import * as React from "react";
import { Handshake } from "lucide-react";

import { useDb } from "@/store/useDemoStore";
import { awardQueue, enquiryDetail } from "@/store/selectors";
import {
  HandoverPanel,
  KickoffPanel,
  kickoffPanelKey,
  PcpPanel,
  PurchaseOrderPanel,
  WorkOrderPanel,
} from "@/components/workflow/AwardPanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";

export default function HandoverPage() {
  const db = useDb();
  const [includeCompleted, setIncludeCompleted] = React.useState(false);

  const entries: QueueEntry[] = React.useMemo(
    () =>
      awardQueue(db)
        .filter((item) => includeCompleted || item.enquiry.stage !== "HANDED_OVER")
        .map((item) => ({
          id: item.enquiry.id,
          enquiry: item.enquiry,
          hint:
            item.enquiry.stage === "HANDED_OVER"
              ? "Handed over to Operations"
              : item.outstanding.length === 0
                ? "All required checklist items satisfied"
                : `Outstanding: ${item.outstanding.map((row) => row.label).join(", ")}`,
          badge:
            item.enquiry.stage === "HANDED_OVER"
              ? { text: "Complete", tone: "neutral" as const }
              : item.outstanding.length === 0
                ? { text: "Ready", tone: "ok" as const }
                : { text: `${item.outstanding.length} outstanding`, tone: "warn" as const },
        })),
    [db, includeCompleted],
  );

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  return (
    <div className="space-y-4">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={(event) => setIncludeCompleted(event.target.checked)}
          className="size-4 accent-brand-600"
        />
        Include projects already handed over
      </label>

      <QueueLayout
        icon={<Handshake />}
        title="Awarded projects"
        description="Kickoff, PCP, PO and handover."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="handover"
        emptyTitle="No awarded projects"
        emptyDescription="Projects appear here once a client award has been recorded."
      >
        {detail ? (
          <>
            <HandoverPanel detail={detail} />
            <WorkOrderPanel detail={detail} compact />
            <PurchaseOrderPanel detail={detail} />
            <KickoffPanel key={kickoffPanelKey(detail)} detail={detail} />
            <PcpPanel detail={detail} />
          </>
        ) : null}
      </QueueLayout>
    </div>
  );
}
