"use client";

/**
 * Role-specific dashboard.
 *
 * Every number here is derived from the live demo data through the selectors in
 * `src/store/selectors.ts` — there are no static statistics, so a workflow
 * action taken anywhere in the app changes these counts immediately.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  Gauge,
  Handshake,
  ListChecks,
  Scale,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

import { PHASE_LABELS, STAGE_LABELS, STAGE_PHASE, type EnquiryPhase } from "@/domain/enums";
import { isTerminal } from "@/domain/rules";
import { formatMoneyCompact } from "@/lib/money";
import { daysUntil, todayIso } from "@/lib/dates";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import {
  assignmentQueue,
  documentReviewQueue,
  estimateApprovalQueue,
  finalApprovalQueue,
  openActionItems,
  openFollowUpTasks,
  packageQueue,
  pipelineValue,
  pursuitQueue,
  recentActivity,
  rejectedDocuments,
  surveyQueue,
  awardQueue,
  allEnquiryRows,
} from "@/store/selectors";
import {
  Badge,
  EmptyState,
  LinkButton,
  Panel,
  PanelBody,
  PanelHeader,
  ProgressBar,
  StatTile,
} from "@/components/ui/primitives";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { ActivityFeed } from "@/components/workflow/ActivityFeed";
import { DeadlineCell, StageBadge } from "@/components/workflow/StatusBadges";

interface QueueCard {
  label: string;
  value: number;
  hint: string;
  tone: React.ComponentProps<typeof StatTile>["tone"];
  icon: React.ReactNode;
  href: string;
}

export default function DashboardPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();

  const rows = allEnquiryRows(db);
  const canRegisterEnquiries = role === "CRM_MANAGER" || role === "MD";
  const live = rows.filter((row) => !row.isClosed);

  /* ---------------------------------------------------- role-specific tiles
   * These derivations are plain computations: the React Compiler memoizes them
   * automatically, and a manual useMemo over values derived from the store
   * snapshot only gets in its way. */
  const tiles: QueueCard[] = ((): QueueCard[] => {
    const department = actingUser.department;

    switch (role) {
      case "CRM_MANAGER":
        return [
          {
            label: "Awaiting assignment",
            value: assignmentQueue(db).length,
            hint: "Pursuit decision complete",
            tone: "accent",
            icon: <Users />,
            href: "/assignments",
          },
          {
            label: "Packages to verify",
            value: packageQueue(db).filter((p) => p.canVerify).length,
            hint: "All required documents approved",
            tone: "warn",
            icon: <ShieldCheck />,
            href: "/bid-packages",
          },
          {
            label: "Work orders to finalize",
            value: awardQueue(db).filter((a) => !a.workOrder || a.workOrder.status === "DRAFT").length,
            hint: "Awarded, draft not finalized",
            tone: "info",
            icon: <FileStack />,
            href: "/work-orders",
          },
          {
            label: "Handover outstanding",
            value: awardQueue(db).filter((a) => a.workOrder?.status === "FINALIZED").length,
            hint: "PO details or checklist items",
            tone: "bad",
            icon: <Handshake />,
            href: "/handover",
          },
        ];

      case "MD":
        return [
          {
            label: "Pursuit decisions",
            value: pursuitQueue(db).length,
            hint: "Awaiting Management Team",
            tone: "accent",
            icon: <Scale />,
            href: "/pursuit",
          },
          {
            label: "Estimates to approve",
            value: estimateApprovalQueue(db, actingUser.id).length,
            hint: "You are a required approver",
            tone: "warn",
            icon: <ShieldCheck />,
            href: "/estimates/approvals",
          },
          {
            label: "Final bid approvals",
            value: finalApprovalQueue(db, actingUser.id).length,
            hint: "Verified packages awaiting your vote",
            tone: "warn",
            icon: <Scale />,
            href: "/final-approvals",
          },
          {
            label: "Live pipeline value",
            value: 0,
            hint: "Latest estimate or expected value",
            tone: "brand",
            icon: <Gauge />,
            href: "/enquiries",
          },
        ];

      case "ESTIMATOR":
        return [
          {
            label: "Estimates in progress",
            value: db.estimates.filter(
              (e) =>
                (e.status === "DRAFT" || e.status === "REJECTED") &&
                db.enquiries.find((x) => x.id === e.enquiryId)?.assignedEstimatorId === actingUser.id,
            ).length,
            hint: "Draft or returned for correction",
            tone: "info",
            icon: <FileStack />,
            href: "/estimates",
          },
          {
            label: "Rejected documents",
            value: rejectedDocuments(db, actingUser.id).length,
            hint: "Correction required",
            tone: "bad",
            icon: <ListChecks />,
            href: "/bid-packages",
          },
          {
            label: "Survey decisions due",
            value: live.filter(
              (row) =>
                row.enquiry.assignedEstimatorId === actingUser.id &&
                !db.surveys.some((s) => s.enquiryId === row.enquiry.id),
            ).length,
            hint: "Site survey required or not",
            tone: "accent",
            icon: <ClipboardCheck />,
            href: "/surveys",
          },
          {
            label: "Packages in review",
            value: packageQueue(db).filter(
              (p) =>
                p.enquiry.assignedEstimatorId === actingUser.id && !p.completeness.complete,
            ).length,
            hint: "Documents not yet all approved",
            tone: "warn",
            icon: <ShieldCheck />,
            href: "/bid-packages",
          },
        ];

      case "MCP":
        return [
          {
            label: "Surveys to action",
            value: surveyQueue(db).filter(
              (item) =>
                item.survey.status === "REQUIRED_UNASSIGNED" ||
                (item.survey.status === "SUBMITTED" && item.enquiry.assignedMcpId === actingUser.id),
            ).length,
            hint: "Assign a surveyor or review exceptions",
            tone: "warn",
            icon: <ClipboardCheck />,
            href: "/surveys",
          },
          {
            label: "Ready to submit",
            value: packageQueue(db).filter((p) => p.bidPackage.status === "APPROVED_FOR_SUBMISSION").length,
            hint: "Approved for client submission",
            tone: "ok",
            icon: <Send />,
            href: "/submissions",
          },
          {
            label: "Open follow-up tasks",
            value: openFollowUpTasks(db, actingUser.id).length,
            hint: "Client chasing",
            tone: "info",
            icon: <Send />,
            href: "/submissions",
          },
          {
            label: "Kickoff / action items",
            value: openActionItems(db).length,
            hint: "Open across awarded projects",
            tone: "accent",
            icon: <Handshake />,
            href: "/handover",
          },
        ];

      case "SURVEYOR":
        return [
          {
            label: "Assigned surveys",
            value: surveyQueue(db).filter((item) => item.survey.surveyorId === actingUser.id).length,
            hint: "All states",
            tone: "info",
            icon: <ClipboardCheck />,
            href: "/surveys",
          },
          {
            label: "Due to complete",
            value: surveyQueue(db).filter(
              (item) =>
                item.survey.surveyorId === actingUser.id &&
                (item.survey.status === "SCHEDULED" ||
                  item.survey.status === "IN_PROGRESS" ||
                  item.survey.status === "RETURNED_FOR_CLARIFICATION"),
            ).length,
            hint: "Checklist not submitted",
            tone: "warn",
            icon: <ClipboardCheck />,
            href: "/surveys",
          },
          {
            label: "Returned for clarification",
            value: surveyQueue(db).filter(
              (item) =>
                item.survey.surveyorId === actingUser.id &&
                item.survey.status === "RETURNED_FOR_CLARIFICATION",
            ).length,
            hint: "MCP needs more detail",
            tone: "bad",
            icon: <AlertTriangle />,
            href: "/surveys",
          },
          {
            label: "Submitted awaiting MCP",
            value: surveyQueue(db).filter(
              (item) => item.survey.surveyorId === actingUser.id && item.survey.status === "SUBMITTED",
            ).length,
            hint: "With the MCP for acceptance",
            tone: "neutral",
            icon: <ClipboardCheck />,
            href: "/surveys",
          },
        ];

      case "DEPARTMENT_REVIEWER":
        return [
          {
            label: "Awaiting your review",
            value: documentReviewQueue(db, department).length,
            hint: department ? `${department} department` : "All departments",
            tone: "warn",
            icon: <ListChecks />,
            href: "/document-reviews",
          },
          {
            label: "Approved by you",
            value: db.bidPackageDocuments.filter(
              (doc) =>
                doc.department === department &&
                doc.versions.some((v) => v.reviewStatus === "APPROVED" && v.reviewedById === actingUser.id),
            ).length,
            hint: "Version-bound approvals",
            tone: "ok",
            icon: <ShieldCheck />,
            href: "/document-reviews",
          },
          {
            label: "Rejected by you",
            value: db.bidPackageDocuments.filter(
              (doc) =>
                doc.department === department &&
                doc.versions.some((v) => v.reviewStatus === "REJECTED" && v.reviewedById === actingUser.id),
            ).length,
            hint: "Awaiting Estimator correction",
            tone: "bad",
            icon: <AlertTriangle />,
            href: "/document-reviews",
          },
          {
            label: "Documents owned",
            value: db.bidPackageDocuments.filter((doc) => doc.department === department).length,
            hint: "Across all live bids",
            tone: "neutral",
            icon: <ListChecks />,
            href: "/document-reviews",
          },
        ];

      default:
        return [];
    }
  })();

  /* ------------------------------------------------------ priority list */
  const priorities = (() => {
    const items: Array<{ id: string; label: string; detail: string; href: string; tone: "bad" | "warn" | "info" }> =
      [];

    for (const row of live) {
      const days = daysUntil(row.enquiry.submissionDeadline);
      const mine =
        role === "MCP"
          ? row.enquiry.assignedMcpId === actingUser.id
          : role === "ESTIMATOR"
            ? row.enquiry.assignedEstimatorId === actingUser.id
            : true;
      if (!mine) continue;
      if (days !== null && days < 0) {
        items.push({
          id: `${row.enquiry.id}-overdue`,
          label: `${row.enquiry.reference} — submission deadline passed`,
          detail: `${STAGE_LABELS[row.enquiry.stage]} · ${Math.abs(days)} day(s) overdue`,
          href: `/enquiries/${row.enquiry.id}`,
          tone: "bad",
        });
      } else if (days !== null && days <= 7) {
        items.push({
          id: `${row.enquiry.id}-soon`,
          label: `${row.enquiry.reference} — deadline in ${days} day(s)`,
          detail: STAGE_LABELS[row.enquiry.stage],
          href: `/enquiries/${row.enquiry.id}`,
          tone: "warn",
        });
      }
    }

    for (const task of openFollowUpTasks(db, role === "MCP" ? actingUser.id : undefined)) {
      if (task.dueDate <= todayIso()) {
        const enquiry = db.enquiries.find((e) => e.id === task.enquiryId);
        items.push({
          id: task.id,
          label: task.title,
          detail: `Follow-up due ${task.dueDate}${enquiry ? ` · ${enquiry.reference}` : ""}`,
          href: "/submissions",
          tone: task.dueDate < todayIso() ? "bad" : "warn",
        });
      }
    }

    return items.slice(0, 8);
  })();

  /* ----------------------------------------------------- phase rollup */
  const phaseCounts = ((): Map<EnquiryPhase, number> => {
    const counts = new Map<EnquiryPhase, number>();
    for (const row of live) {
      const phase = STAGE_PHASE[row.enquiry.stage];
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    return counts;
  })();

  const upcoming = live.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Only the roles who can actually register an enquiry are offered the
          prompt to do so — the register is theirs alone. */}
      {rows.length === 0 && canRegisterEnquiries ? (
        <Panel>
          <PanelBody>
            <EmptyState
              icon={<ClipboardList />}
              title="No enquiries yet"
              description="The system starts empty. Register an enquiry from the enquiry register to begin the workflow — it enters the Pursuit Decision stage for the Management Team, and these dashboards fill as it progresses."
              action={
                <LinkButton href="/enquiries" variant="primary" icon={<ClipboardList />}>
                  Open the enquiry register
                </LinkButton>
              }
            />
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) =>
          tile.label === "Live pipeline value" ? (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={formatMoneyCompact(pipelineValue(db), "AED")}
              hint={tile.hint}
              tone={tile.tone}
              icon={tile.icon}
              href={tile.href}
            />
          ) : (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={tile.value}
              hint={tile.hint}
              tone={tile.value > 0 ? tile.tone : "neutral"}
              icon={tile.icon}
              href={tile.href}
            />
          ),
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Priority tasks"
              description="Deadlines and overdue follow-ups relevant to your role."
              actions={<Badge tone={priorities.length > 0 ? "warn" : "ok"}>{priorities.length}</Badge>}
            />
            {priorities.length === 0 ? (
              <EmptyState
                title="Nothing urgent"
                description="No overdue deadlines or follow-up tasks for this role right now."
              />
            ) : (
              <PanelBody className="px-0 py-0">
                <ul className="divide-y divide-ink-100">
                  {priorities.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className="block px-4 py-2.5 transition-colors hover:bg-brand-50/60">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.tone} dot>
                            {item.tone === "bad" ? "Overdue" : item.tone === "warn" ? "Due soon" : "Action"}
                          </Badge>
                          <span className="min-w-0 text-xs font-medium break-words text-ink-800">{item.label}</span>
                        </span>
                        <span className="mt-0.5 block text-2xs text-ink-500">{item.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Live enquiries by deadline"
              description="Nearest submission deadline first."
              actions={
                <LinkButton href="/enquiries" size="sm" variant="secondary">
                  Open register
                </LinkButton>
              }
            />
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Enquiry</TH>
                    <TH>Client</TH>
                    <TH>Stage</TH>
                    <TH>MCP</TH>
                    <TH>Estimator</TH>
                    <TH>Deadline</TH>
                  </TR>
                </THead>
                <TBody>
                  {upcoming.length === 0 ? (
                    <TableEmptyRow colSpan={6}>
                      No live enquiries. Register one to start the workflow.
                    </TableEmptyRow>
                  ) : null}
                  {upcoming.map((row) => (
                    <TR key={row.enquiry.id}>
                      <TD className="max-w-xs">
                        <Link href={`/enquiries/${row.enquiry.id}`} className="group block">
                          <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                            {row.enquiry.reference}
                          </span>
                          <span className="block truncate text-xs font-medium text-ink-800">
                            {row.enquiry.projectTitle}
                          </span>
                        </Link>
                      </TD>
                      <TD>{row.client?.shortName ?? "—"}</TD>
                      <TD>
                        <StageBadge stage={row.enquiry.stage} />
                      </TD>
                      <TD>{row.mcp?.name ?? "—"}</TD>
                      <TD>{row.estimator?.name ?? "—"}</TD>
                      <TD>
                        <DeadlineCell date={row.enquiry.submissionDeadline} closed={row.isClosed} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Workflow summary" description={`${live.length} live enquiries`} />
            <PanelBody className="space-y-2.5">
              {(Object.keys(PHASE_LABELS) as EnquiryPhase[]).map((phase) => {
                const count = phaseCounts.get(phase) ?? 0;
                if (phase === "CLOSED") return null;
                return (
                  <div key={phase}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-ink-600">{PHASE_LABELS[phase]}</span>
                      <span className="numeric text-xs font-semibold text-ink-800">{count}</span>
                    </div>
                    <ProgressBar
                      className="mt-1"
                      value={count}
                      total={Math.max(1, live.length)}
                      label={`${count} enquiries in ${PHASE_LABELS[phase]}`}
                    />
                  </div>
                );
              })}

              <div className="border-t border-ink-200 pt-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-600">Closed (handed over / lost / void)</span>
                  <span className="numeric text-xs font-semibold text-ink-800">
                    {rows.filter((row) => isTerminal(row.enquiry)).length}
                  </span>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <ActivityFeed
            records={recentActivity(db, 10)}
            title="Recent activity"
            description="Across all enquiries."
            showEnquiry
          />
        </div>
      </div>
    </div>
  );
}
