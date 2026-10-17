"use client";

/**
 * Site survey queue.
 *
 * Filtered by what the active role owes: the Surveyor sees their own scheduled
 * and returned surveys, the MCP sees unassigned surveys and reports waiting for
 * acceptance, and the Estimator sees enquiries where the survey decision has
 * not been taken.
 */

import * as React from "react";
import { ClipboardCheck } from "lucide-react";

import { SURVEY_STATUS_LABELS } from "@/domain/enums";
import { isTerminal } from "@/domain/rules";
import { formatDate } from "@/lib/dates";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { enquiryDetail, surveyQueue } from "@/store/selectors";
import { describeScope } from "@/store/visibility";
import { Callout } from "@/components/ui/primitives";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";
import { SurveyPanel } from "@/components/workflow/SurveyPanels";

export default function SurveysPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const [mineOnly, setMineOnly] = React.useState(role === "SURVEYOR" || role === "MCP");

  const entries: QueueEntry[] = React.useMemo(() => {
    const surveys = surveyQueue(db)
      .filter((item) => {
        if (!mineOnly) return true;
        if (role === "SURVEYOR") return item.survey.surveyorId === actingUser.id;
        if (role === "MCP") return item.enquiry.assignedMcpId === actingUser.id || !item.survey.surveyorId;
        return true;
      })
      .map((item) => {
        const unresolved = item.progress.unresolvedExceptions.length;
        return {
          id: item.enquiry.id,
          enquiry: item.enquiry,
          hint: [
            SURVEY_STATUS_LABELS[item.survey.status],
            item.survey.scheduledDate ? `visit ${formatDate(item.survey.scheduledDate)}` : null,
            item.progress.total > 0 ? `${item.progress.complete}/${item.progress.total} items` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badge:
            unresolved > 0
              ? { text: `${unresolved} exception(s)`, tone: "bad" as const }
              : item.survey.status === "SUBMITTED"
                ? { text: "Awaiting MCP", tone: "warn" as const }
                : item.survey.status === "ACCEPTED"
                  ? { text: "Accepted", tone: "ok" as const }
                  : undefined,
        };
      });

    // Enquiries where the Estimator has not decided whether a survey is needed.
    const undecided = db.enquiries
      .filter(
        (enquiry) =>
          !isTerminal(enquiry) &&
          enquiry.assignedEstimatorId &&
          !db.surveys.some((survey) => survey.enquiryId === enquiry.id) &&
          (!mineOnly || role !== "ESTIMATOR" || enquiry.assignedEstimatorId === actingUser.id),
      )
      .map((enquiry) => ({
        id: enquiry.id,
        enquiry,
        hint: "Survey requirement decision not taken",
        badge: { text: "Decision due", tone: "accent" as const },
      }));

    return [...undecided, ...surveys];
  }, [db, role, actingUser, mineOnly]);

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

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
        Show only surveys assigned to me
      </label>
      )}

      <QueueLayout
        icon={<ClipboardCheck />}
        title="Site surveys"
        description="Decisions, visits, checklists and exceptions."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="survey"
        emptyTitle="No surveys to action"
        emptyDescription="Uncheck the filter above, or switch role, to see other surveys in the pipeline."
      >
        {detail ? <SurveyPanel detail={detail} /> : null}
      </QueueLayout>
    </div>
  );
}
