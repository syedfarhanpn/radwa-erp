"use client";

/**
 * Enquiry detail — the hub for one record.
 *
 * Every workflow aspect of an enquiry is a tab here, and each tab renders the
 * same panel component the dedicated queue screens use, so an action behaves
 * identically wherever it is taken. The active tab is in the URL (`?tab=`) so
 * queue screens and notifications can deep-link straight to the right step.
 */

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Paperclip } from "lucide-react";

import {
  BID_SUBMISSION_TYPE_LABELS,
  formatProjectTypes,
  SOURCE_LABELS,
  STAGE_LABELS,
  STAGE_PHASE,
  PHASE_LABELS,
  ENQUIRY_PHASES,
  type EnquiryPhase,
} from "@/domain/enums";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { canAccessPath } from "@/components/shell/navigation";
import { useActiveRole, useDb, useUnscopedDb } from "@/store/useDemoStore";
import { describeScope } from "@/store/visibility";
import { enquiryDetail } from "@/store/selectors";
import {
  Badge,
  Callout,
  KeyValue,
  LinkButton,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui/primitives";
import { TabPanel, Tabs, type TabItem } from "@/components/ui/tabs";
import { ActivityFeed } from "@/components/workflow/ActivityFeed";
import {
  AwardPanel,
  HandoverPanel,
  KickoffPanel,
  kickoffPanelKey,
  PcpPanel,
  PurchaseOrderPanel,
  WorkOrderPanel,
} from "@/components/workflow/AwardPanels";
import { BidPackagePanel } from "@/components/workflow/BidPackagePanels";
import { ClientResponsePanel, FollowUpPanel, RevisionPanel, SubmissionPanel } from "@/components/workflow/ClientPanels";
import { EstimateSummaryPanel } from "@/components/workflow/EstimatePanels";
import { FinalApprovalPanel } from "@/components/workflow/FinalApprovalPanel";
import { AssignmentPanel, PursuitPanel, TenderDocumentsPanel } from "@/components/workflow/QualifyPanels";
import { DeadlineCell, PriorityBadge, StageBadge } from "@/components/workflow/StatusBadges";
import { SurveyPanel } from "@/components/workflow/SurveyPanels";
import { DefinitionList } from "@/components/workflow/shared";

const TAB_IDS = [
  "overview",
  "documents",
  "pursuit",
  "assignment",
  "survey",
  "estimate",
  "package",
  "approval",
  "client",
  "award",
  "handover",
  "activity",
] as const;

type TabId = (typeof TAB_IDS)[number];

export default function EnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const db = useDb();
  const fullDb = useUnscopedDb();
  const role = useActiveRole();

  const detail = enquiryDetail(db, params.id);

  // Roles without the Enquiry Register are sent to their dashboard instead of
  // a page they cannot open.
  const hasRegister = canAccessPath("/enquiries", role);
  const backHref = hasRegister ? "/enquiries" : "/dashboard";
  const backLabel = hasRegister ? "Back to the enquiry register" : "Back to your dashboard";

  // The active tab lives in the URL, so deep links and the browser's back
  // button work without a second copy of the state to keep in sync.
  const requested = searchParams.get("tab");
  const active: TabId = TAB_IDS.includes(requested as TabId) ? (requested as TabId) : "overview";

  function changeTab(tab: TabId) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    router.replace(`/enquiries/${params.id}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  if (!detail) {
    // Distinguish "no such record" from "assigned to someone else", so a
    // scoped role is told why rather than being shown a dead end.
    const existsElsewhere = fullDb.enquiries.some((e) => e.id === params.id);

    if (existsElsewhere) {
      return (
        <Callout tone="warn" title="Not assigned to you">
          {describeScope(role) ?? "This enquiry is not in your assigned work."} Ask the CRM Manager to reassign
          it, or sign in as the person it belongs to.{" "}
          <Link href={backHref} className="font-medium underline">
            {backLabel}
          </Link>
          .
        </Callout>
      );
    }

    return (
      <Callout tone="bad" title="Enquiry not found">
        This enquiry does not exist. It may have been removed by a reset.{" "}
        <Link href={backHref} className="font-medium underline">
          {backLabel}
        </Link>
        .
      </Callout>
    );
  }

  const { enquiry, completeness, surveyProgress } = detail;

  const tabs: Array<TabItem<TabId>> = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Tender documents", badge: { text: String(detail.tenderDocuments.length) } },
    {
      id: "pursuit",
      label: "Pursuit",
      badge:
        detail.pursuit.outcome === "PENDING"
          ? { text: `${detail.pursuit.decisions.length}/${detail.pursuit.teamSize}`, tone: "warn" }
          : { text: detail.pursuit.outcome === "PURSUE" ? "Pursue" : "Void", tone: detail.pursuit.outcome === "PURSUE" ? "ok" : "bad" },
    },
    { id: "assignment", label: "Assignment", badge: enquiry.assignedMcpId ? undefined : { text: "!", tone: "warn" } },
    {
      id: "survey",
      label: "Site survey",
      badge: detail.survey
        ? detail.survey.status === "NOT_REQUIRED"
          ? { text: "N/A" }
          : surveyProgress && surveyProgress.unresolvedExceptions.length > 0
            ? { text: String(surveyProgress.unresolvedExceptions.length), tone: "bad" }
            : undefined
        : { text: "?", tone: "accent" },
    },
    {
      id: "estimate",
      label: "BOQ & estimate",
      badge: detail.latestEstimate ? { text: `Rev ${detail.latestEstimate.version}` } : undefined,
    },
    {
      id: "package",
      label: "Bid package",
      badge: completeness
        ? {
            text: `${completeness.approvedCount}/${completeness.requiredCount}`,
            tone: completeness.complete ? "ok" : "warn",
          }
        : undefined,
    },
    {
      id: "approval",
      label: "Final approval",
      badge: detail.finalApproval?.gateOpen
        ? {
            text:
              detail.finalApproval.decision === "APPROVED"
                ? "Approved"
                : `${detail.finalApproval.approved}/${detail.finalApproval.total}`,
            tone: detail.finalApproval.decision === "APPROVED" ? "ok" : "warn",
          }
        : undefined,
    },
    {
      id: "client",
      label: "Client",
      badge: detail.openRevision ? { text: "Revision", tone: "warn" } : undefined,
    },
    { id: "award", label: "Award & work order", badge: detail.award ? { text: "Awarded", tone: "ok" } : undefined },
    {
      id: "handover",
      label: "Kickoff & handover",
      badge: detail.handover?.completedAt
        ? { text: "Done", tone: "ok" }
        : detail.handoverReady
          ? { text: "Ready", tone: "ok" }
          : undefined,
    },
    { id: "activity", label: "Activity", badge: { text: String(detail.activities.length) } },
  ];

  const phase = STAGE_PHASE[enquiry.stage];

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {canAccessPath("/enquiries", role) ? (
            <Link
              href="/enquiries"
              className="inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-brand-600"
            >
              <ArrowLeft className="size-3" aria-hidden />
              Enquiry register
            </Link>
          ) : null}
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-ink-900">
            <span className="numeric text-brand-700">{enquiry.reference}</span>
            <span className="text-ink-300">—</span>
            <span className="min-w-0">{enquiry.projectTitle}</span>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" aria-hidden />
              {detail.client?.name}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {enquiry.projectLocation}
            </span>
            <span>{formatProjectTypes(enquiry.projectTypes)}</span>
            {enquiry.isSampleData ? <Badge tone="neutral">Sample data</Badge> : <Badge tone="info">Created in this session</Badge>}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={enquiry.priority} />
            <StageBadge stage={enquiry.stage} />
          </div>
          {detail.latestEstimate ? (
            <LinkButton href={`/estimates/${detail.latestEstimate.id}`} size="sm" variant="secondary">
              Open BOQ workspace
            </LinkButton>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------------- phase strip */}
      <nav aria-label="Workflow progress" className="flex flex-wrap gap-1">
        {ENQUIRY_PHASES.filter((p) => p !== "CLOSED").map((item) => {
          const reached = phaseIndex(phase) >= phaseIndex(item) && phase !== "CLOSED";
          const current = item === phase;
          return (
            <span
              key={item}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-2xs font-medium",
                current
                  ? "border-brand-600 bg-brand-600 text-white"
                  : reached
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-white text-ink-400",
              )}
            >
              {PHASE_LABELS[item]}
            </span>
          );
        })}
        {phase === "CLOSED" ? (
          <span className="inline-flex items-center gap-1.5 rounded-control border border-ink-300 bg-ink-200 px-2.5 py-1 text-2xs font-medium text-ink-700">
            {STAGE_LABELS[enquiry.stage]}
          </span>
        ) : null}
      </nav>

      {enquiry.closureReason ? (
        <Callout tone={enquiry.stage === "HANDED_OVER" ? "ok" : "bad"} title={STAGE_LABELS[enquiry.stage]}>
          {enquiry.closureReason}
        </Callout>
      ) : null}

      <Tabs items={tabs} active={active} onChange={changeTab} idPrefix="enq" />

      {/* ---------------------------------------------------------- tabs */}
      <TabPanel id="overview" active={active} idPrefix="enq">
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Panel>
              <PanelHeader title="Enquiry details" />
              <PanelBody className="space-y-4">
                <DefinitionList cols={3}>
                  <KeyValue label="Enquiry ID">
                    <span className="numeric">{enquiry.reference}</span>
                  </KeyValue>
                  <KeyValue label="Project type">{formatProjectTypes(enquiry.projectTypes)}</KeyValue>
                  <KeyValue label="Source">
                    {SOURCE_LABELS[enquiry.source]}
                    {enquiry.sourceReference ? (
                      <span className="mt-0.5 block font-mono text-2xs text-ink-500">
                        {enquiry.sourceReference}
                      </span>
                    ) : null}
                  </KeyValue>
                  <KeyValue label="Submission type">
                    {BID_SUBMISSION_TYPE_LABELS[enquiry.bidSubmissionType]}
                  </KeyValue>
                  <KeyValue label="Submission deadline">
                    <DeadlineCell date={enquiry.submissionDeadline} closed={detail.enquiry.stage === "HANDED_OVER"} />
                  </KeyValue>
                  <KeyValue label="Expected value">
                    <span className="numeric">{formatMoney(enquiry.estimatedValue, enquiry.currency)}</span>
                  </KeyValue>
                  <KeyValue label="Registered">
                    {formatDate(enquiry.registeredAt)}
                    <span className="mt-0.5 block text-2xs text-ink-500">
                      by {detail.registeredBy?.name ?? "—"}
                    </span>
                  </KeyValue>
                  <KeyValue label="Last updated">{formatDateTime(enquiry.updatedAt)}</KeyValue>
                  <KeyValue label="Current stage">{STAGE_LABELS[enquiry.stage]}</KeyValue>
                </DefinitionList>

                <KeyValue label="Scope of work">
                  <span className="text-xs leading-relaxed text-ink-700">{enquiry.scopeOfWork}</span>
                </KeyValue>

                {enquiry.notes ? (
                  <KeyValue label="Notes">
                    <span className="text-xs leading-relaxed text-ink-700">{enquiry.notes}</span>
                  </KeyValue>
                ) : null}
              </PanelBody>
            </Panel>

            {detail.latestEstimate ? <EstimateSummaryPanel detail={detail} /> : null}
          </div>

          <div className="space-y-4">
            <Panel>
              <PanelHeader title="Client" icon={<Building2 />} />
              <PanelBody className="space-y-3">
                <KeyValue label="Client">
                  {detail.client?.name}
                  <span className="mt-0.5 block text-2xs text-ink-500">{detail.client?.sector}</span>
                </KeyValue>
                <KeyValue label="Primary contact">
                  {detail.contact?.name}
                  <span className="mt-0.5 block text-2xs text-ink-500">{detail.contact?.jobTitle}</span>
                  <span className="block text-2xs text-ink-500">{detail.contact?.email}</span>
                  <span className="block text-2xs text-ink-500">{detail.contact?.phone}</span>
                </KeyValue>
                {detail.client?.notes ? (
                  <KeyValue label="Client notes">
                    <span className="text-2xs leading-relaxed text-ink-600">{detail.client.notes}</span>
                  </KeyValue>
                ) : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Team" />
              <PanelBody className="space-y-3">
                <KeyValue label="MCP / Project Manager">{detail.mcp?.name ?? "Not assigned"}</KeyValue>
                <KeyValue label="Estimator">{detail.estimator?.name ?? "Not assigned"}</KeyValue>
                <KeyValue label="Responsible Manager">{detail.responsibleManager?.name ?? "Not assigned"}</KeyValue>
                {detail.surveyor ? <KeyValue label="Surveyor">{detail.surveyor.name}</KeyValue> : null}
                {detail.pcp ? (
                  <KeyValue label="PCP">
                    {db.users.find((u) => u.id === detail.pcp?.appointeeId)?.name ?? "—"}
                  </KeyValue>
                ) : null}
              </PanelBody>
            </Panel>

            <ActivityFeed records={detail.activities} title="Latest activity" limit={6} description="" />
          </div>
        </div>
      </TabPanel>

      <TabPanel id="documents" active={active} idPrefix="enq">
        <TenderDocumentsPanel detail={detail} />
      </TabPanel>

      <TabPanel id="pursuit" active={active} idPrefix="enq">
        <PursuitPanel detail={detail} />
      </TabPanel>

      <TabPanel id="assignment" active={active} idPrefix="enq">
        <AssignmentPanel detail={detail} />
      </TabPanel>

      <TabPanel id="survey" active={active} idPrefix="enq">
        <SurveyPanel detail={detail} />
      </TabPanel>

      <TabPanel id="estimate" active={active} idPrefix="enq">
        <EstimateSummaryPanel detail={detail} />
      </TabPanel>

      <TabPanel id="package" active={active} idPrefix="enq">
        <BidPackagePanel detail={detail} />
      </TabPanel>

      <TabPanel id="approval" active={active} idPrefix="enq">
        {detail.bidPackage ? (
          <FinalApprovalPanel detail={detail} />
        ) : (
          <Callout tone="neutral">
            Final bid approval opens once the bid package exists and the CRM Manager has verified that every
            required document holds current-version departmental approval.
          </Callout>
        )}
      </TabPanel>

      <TabPanel id="client" active={active} idPrefix="enq">
        <div className="space-y-4">
          <SubmissionPanel detail={detail} />
          <FollowUpPanel detail={detail} />
          <ClientResponsePanel detail={detail} />
          <RevisionPanel detail={detail} />
        </div>
      </TabPanel>

      <TabPanel id="award" active={active} idPrefix="enq">
        <div className="space-y-4">
          <AwardPanel detail={detail} />
          <WorkOrderPanel detail={detail} />
        </div>
      </TabPanel>

      <TabPanel id="handover" active={active} idPrefix="enq">
        <div className="space-y-4">
          <KickoffPanel key={kickoffPanelKey(detail)} detail={detail} />
          <PcpPanel detail={detail} />
          <PurchaseOrderPanel detail={detail} />
          <HandoverPanel detail={detail} />
        </div>
      </TabPanel>

      <TabPanel id="activity" active={active} idPrefix="enq">
        <ActivityFeed
          records={detail.activities}
          title="Full activity history"
          description="Actor, action, timestamp and the reason recorded with each decision."
          emptyHint="Actions taken on this enquiry will appear here."
        />
      </TabPanel>

      <p className="flex items-center gap-1.5 text-2xs text-ink-400">
        <Paperclip className="size-3" aria-hidden />
        Document metadata only — this demo stores no files and sends no email.
      </p>
    </div>
  );
}

function phaseIndex(phase: EnquiryPhase): number {
  return ENQUIRY_PHASES.indexOf(phase);
}
