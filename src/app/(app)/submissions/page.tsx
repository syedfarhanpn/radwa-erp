"use client";

/**
 * Client submission and follow-up queue.
 *
 * Covers approved packages ready to send, submitted bids awaiting a response,
 * and open revision requests.
 */

import * as React from "react";
import { Send } from "lucide-react";

import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { enquiryDetail, openFollowUpTasks, packageQueue } from "@/store/selectors";
import { describeScope } from "@/store/visibility";
import { Badge, Callout, Panel, PanelHeader } from "@/components/ui/primitives";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import {
  ClientResponsePanel,
  FollowUpPanel,
  RevisionPanel,
  SubmissionPanel,
} from "@/components/workflow/ClientPanels";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";
import { TaskStatusBadge } from "@/components/workflow/StatusBadges";
import { userById } from "@/store/selectors";
import { todayIso } from "@/lib/dates";
import Link from "next/link";

export default function SubmissionsPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  // MCPs only ever see their own enquiries (see store/visibility.ts).
  const mineOnly = false;

  const entries: QueueEntry[] = React.useMemo(() => {
    const relevantStages = new Set([
      "CLIENT_SUBMISSION",
      "AWAITING_CLIENT_RESPONSE",
      "REVISION_REQUESTED",
    ]);

    const readyToSubmit = packageQueue(db)
      .filter((item) => item.bidPackage.status === "APPROVED_FOR_SUBMISSION")
      .map((item) => item.enquiry.id);

    return db.enquiries
      .filter(
        (enquiry) =>
          (relevantStages.has(enquiry.stage) || readyToSubmit.includes(enquiry.id)) &&
          (!mineOnly || enquiry.assignedMcpId === actingUser.id),
      )
      .map((enquiry) => {
        const submission = db.clientSubmissions
          .filter((s) => s.enquiryId === enquiry.id)
          .sort((a, b) => ((a.submittedAt ?? "") < (b.submittedAt ?? "") ? 1 : -1))[0];
        const revision = db.revisionRequests.find(
          (r) => r.enquiryId === enquiry.id && r.status !== "RESUBMITTED",
        );
        const openTasks = db.followUpTasks.filter(
          (t) => t.enquiryId === enquiry.id && t.status === "OPEN",
        ).length;

        return {
          id: enquiry.id,
          enquiry,
          hint: revision
            ? "Client revision requested"
            : submission
              ? `Submitted · ${openTasks} open follow-up task(s)`
              : "Approved for submission — not yet sent",
          badge: revision
            ? { text: "Revision", tone: "warn" as const }
            : submission
              ? { text: "Submitted", tone: "ok" as const }
              : { text: "Ready to send", tone: "accent" as const },
        };
      });
  }, [db, mineOnly, actingUser.id]);

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;
  const myTasks = openFollowUpTasks(db, role === "MCP" ? actingUser.id : undefined);

  const scopeNote = describeScope(role);

  return (
    <div className="space-y-4">
      {scopeNote ? <Callout tone="info">{scopeNote}</Callout> : null}

      <QueueLayout
        icon={<Send />}
        title="Client submission"
        description="Ready to send, awaiting response, or in revision."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="client"
        emptyTitle="Nothing with the client"
        emptyDescription="Bids appear here once the Management Team approves the package for submission."
      >
        {detail ? (
          <>
            <SubmissionPanel detail={detail} />
            <FollowUpPanel detail={detail} />
            <ClientResponsePanel detail={detail} />
            <RevisionPanel detail={detail} />
          </>
        ) : null}
      </QueueLayout>

      <Panel>
        <PanelHeader
          title="All open follow-up tasks"
          description={role === "MCP" ? `Assigned to ${actingUser.name}` : "Across all MCPs"}
          actions={<Badge tone={myTasks.length > 0 ? "warn" : "ok"}>{myTasks.length}</Badge>}
        />
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH width="16rem">Enquiry</TH>
                <TH width="8rem">Due</TH>
                <TH width="10rem">Owner</TH>
                <TH width="7rem">Status</TH>
              </TR>
            </THead>
            <TBody>
              {myTasks.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-6 text-center text-ink-500">
                    No open follow-up tasks.
                  </TD>
                </TR>
              ) : null}
              {myTasks.map((task) => {
                const enquiry = db.enquiries.find((e) => e.id === task.enquiryId);
                const overdue = task.dueDate < todayIso();
                return (
                  <TR key={task.id}>
                    <TD className="max-w-md">
                      <span className="text-xs font-medium text-ink-800">{task.title}</span>
                    </TD>
                    <TD>
                      {enquiry ? (
                        <Link
                          href={`/enquiries/${enquiry.id}?tab=client`}
                          className="numeric text-2xs font-semibold text-brand-700 hover:underline"
                        >
                          {enquiry.reference}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <span className={overdue ? "numeric text-xs font-semibold text-bad-600" : "numeric text-xs"}>
                        {task.dueDate}
                      </span>
                    </TD>
                    <TD>{userById(db, task.ownerId)?.name ?? "—"}</TD>
                    <TD>
                      <TaskStatusBadge status={task.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </Panel>
    </div>
  );
}
