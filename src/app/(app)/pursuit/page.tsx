"use client";

/** Pursuit decision queue — the Management Team's pursue / reject decisions. */

import * as React from "react";
import { Scale } from "lucide-react";

import { evaluatePursuit } from "@/domain/rules";
import { useDb } from "@/store/useDemoStore";
import { enquiryDetail, pursuitQueue } from "@/store/selectors";
import { PursuitPanel } from "@/components/workflow/QualifyPanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";

export default function PursuitPage() {
  const db = useDb();

  const entries: QueueEntry[] = React.useMemo(
    () =>
      pursuitQueue(db).map((enquiry) => {
        const state = evaluatePursuit(enquiry.id, db.pursuitDecisions, db.users);
        return {
          id: enquiry.id,
          enquiry,
          hint:
            state.decisions.length === 0
              ? "No decisions recorded yet"
              : `${state.pursueCount} pursue · ${state.rejectCount} reject · ${state.pendingManagers.length} pending`,
          badge: {
            text: `${state.decisions.length}/${state.teamSize}`,
            tone: state.rejectCount > 0 ? ("bad" as const) : ("warn" as const),
          },
        };
      }),
    [db],
  );

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  return (
    <div className="space-y-4">
      <QueueLayout
        icon={<Scale />}
        title="Awaiting pursuit decision"
        description="Newly registered enquiries."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="pursuit"
        emptyTitle="No pursuit decisions outstanding"
        emptyDescription="Register an enquiry, or reset the demo data, to see decisions waiting here."
      >
        {detail ? <PursuitPanel detail={detail} /> : null}
      </QueueLayout>
    </div>
  );
}
