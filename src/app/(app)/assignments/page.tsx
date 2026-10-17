"use client";

/**
 * Assignment queue.
 *
 * Lists enquiries whose pursuit decision is settled and which need an MCP and
 * an Estimator, plus every live enquiry already assigned so the MD can override.
 */

import * as React from "react";
import { Users } from "lucide-react";

import { isTerminal } from "@/domain/rules";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import { assignmentQueue, enquiryDetail } from "@/store/selectors";
import { AssignmentPanel, TenderDocumentsPanel } from "@/components/workflow/QualifyPanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";

export default function AssignmentsPage() {
  const db = useDb();
  const role = useActiveRole();
  const [includeAssigned, setIncludeAssigned] = React.useState(false);

  const entries: QueueEntry[] = React.useMemo(() => {
    const unassigned = assignmentQueue(db).map((enquiry) => ({
      id: enquiry.id,
      enquiry,
      hint: "Pursuit decision complete — assign the MCP and Estimator",
      badge: { text: "Unassigned", tone: "accent" as const },
    }));

    if (!includeAssigned) return unassigned;

    const assigned = db.enquiries
      .filter((enquiry) => !isTerminal(enquiry) && enquiry.assignedMcpId)
      .map((enquiry) => ({
        id: enquiry.id,
        enquiry,
        hint: `MCP ${db.users.find((u) => u.id === enquiry.assignedMcpId)?.name ?? "—"} · Estimator ${
          db.users.find((u) => u.id === enquiry.assignedEstimatorId)?.name ?? "—"
        }`,
        badge: { text: "Assigned", tone: "ok" as const },
      }));

    return [...unassigned, ...assigned];
  }, [db, includeAssigned]);

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  return (
    <div className="space-y-4">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={includeAssigned}
          onChange={(event) => setIncludeAssigned(event.target.checked)}
          className="size-4 accent-brand-600"
        />
        Include enquiries that are already assigned
        {role === "MD" ? <span className="text-2xs text-ink-500">(to override an assignment)</span> : null}
      </label>

      <QueueLayout
        icon={<Users />}
        title="Awaiting assignment"
        description="Pursuit decision settled."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="assignment"
        emptyTitle="Nothing awaiting assignment"
        emptyDescription="Enquiries appear here once the Management Team has completed the pursuit decision."
      >
        {detail ? (
          <>
            <AssignmentPanel detail={detail} />
            <TenderDocumentsPanel detail={detail} />
          </>
        ) : null}
      </QueueLayout>
    </div>
  );
}
