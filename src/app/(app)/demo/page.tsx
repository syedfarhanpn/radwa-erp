"use client";

/**
 * Demo controls and reference.
 *
 * Documents what is simulated, where each configurable default lives, and how
 * to reset to the starting state. Also surfaces the twenty business rules with the
 * module that enforces each one, so a reviewer can check the implementation
 * rather than taking the UI's word for it.
 */

import * as React from "react";
import {
  AlertTriangle,
  Database,
  RotateCcw,
  Settings2,
  ShieldAlert,
} from "lucide-react";

import {
  displayConfig,
  estimateApprovalPolicy,
  finalBidApprovalPolicy,
  handoverPolicy,
  managementConfig,
  revisionPolicy,
  workOrderNumberingConfig,
} from "@/domain/config";
import { ROLE_LABELS, STAGE_LABELS, type EnquiryStage } from "@/domain/enums";
import { validateManagementTeam } from "@/domain/rules";
import { useDemoStore, useDb, ALL_ROLES } from "@/store/useDemoStore";
import {
  Badge,
  Button,
  Callout,
  KeyValue,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  StatTile,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { DefinitionList } from "@/components/workflow/shared";

const BUSINESS_RULES: Array<{ n: number; rule: string; where: string }> = [
  { n: 1, rule: "The Management Team is exactly three members, including the MD.", where: "rules.validateManagementTeam / config.managementConfig" },
  { n: 2, rule: "An enquiry is rejected only when all three members reject it.", where: "rules.evaluatePursuit" },
  { n: 3, rule: "CRM assigns the MCP and Estimator; the MD can override.", where: "rules.canOverrideAssignment / operations.assignTeam" },
  { n: 4, rule: "MCP and Estimator receive the documents in parallel.", where: "Independent read receipts on TenderDocument" },
  { n: 5, rule: "Incomplete survey checklist items require reasons.", where: "rules.validateChecklistItem" },
  { n: 6, rule: "The MCP must review incomplete items before accepting the report.", where: "rules.canAcceptSurveyReport" },
  { n: 7, rule: "The MD must approve the estimate.", where: "rules.requiredEstimateApprovers" },
  { n: 8, rule: "Estimate rejection requires a reason.", where: "operations.decideEstimateApproval" },
  { n: 9, rule: "Document rejection requires a reason and corrective instructions.", where: "rules.validateDocumentRejection" },
  { n: 10, rule: "Approvals are tied to document versions.", where: "rules.documentStatus / BidDocumentVersion" },
  { n: 11, rule: "Only changed documents need renewed departmental approval.", where: "operations.createDocumentVersion" },
  { n: 12, rule: "Required current-version documents must be approved before CRM marks Documents Approved.", where: "rules.canMarkDocumentsApproved" },
  { n: 13, rule: "Final bid approval happens after completeness verification, by the main MD alone.", where: "rules.finalBidApprovers / evaluateFinalBidApproval (gate)" },
  { n: 14, rule: "Major commercial or scope revisions require management approval.", where: "rules.revisionRequiresManagementApproval" },
  { n: 15, rule: "Minor administrative-only revisions do not require MD approval.", where: "config.revisionPolicy" },
  { n: 16, rule: "Client rejection ends the enquiry as lost.", where: "operations.deriveStage" },
  { n: 17, rule: "An award can generate a work-order draft without a PO.", where: "rules.canGenerateWorkOrder" },
  { n: 18, rule: "Work-order finalization and handover are separate stages.", where: "rules.canFinalizeWorkOrder / canCompleteHandover" },
  { n: 19, rule: "The PO must be recorded before handover completes.", where: "rules.buildHandoverChecklist (PO_RECORDED)" },
  { n: 20, rule: "The handover checklist and revision history must be visible.", where: "Handover panel / estimate revision history" },
];

export default function DemoPage() {
  const db = useDb();
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const toast = useToast();
  const [confirmReset, setConfirmReset] = React.useState(false);

  const stageCounts = React.useMemo(() => {
    const counts = new Map<EnquiryStage, number>();
    for (const enquiry of db.enquiries) {
      counts.set(enquiry.stage, (counts.get(enquiry.stage) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [db.enquiries]);

  const teamProblems = validateManagementTeam(db.users);

  return (
    <div className="space-y-4">
      <Callout tone="warn" icon={<ShieldAlert />} title="This is a demonstration build">
        The role switcher is not authentication and grants no real authorization. No backend, database,
        authentication, email delivery, document storage or AI service is connected. All state lives in this
        browser.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Enquiries" value={db.enquiries.length} hint="Across every stage" icon={<Database />} />
        <StatTile label="BOQ line items" value={db.boqLineItems.length} hint={`${db.estimates.length} estimate revisions`} />
        <StatTile
          label="Bid documents"
          value={db.bidPackageDocuments.length}
          hint={`${db.bidPackageDocuments.reduce((sum, d) => sum + d.versions.length, 0)} versions`}
        />
        <StatTile label="Activity records" value={db.activities.length} hint="Full audit trail" />
      </div>

      <Panel>
        <PanelHeader
          icon={<RotateCcw />}
          title="Demo data"
          description="The system starts with no enquiries. Only the people directory and the client list are pre-loaded; everything else is created through the UI."
          actions={<Badge tone="neutral">Schema version {db.schemaVersion}</Badge>}
        />
        <PanelBody className="space-y-3">
          <DefinitionList cols={3}>
            <KeyValue label="Storage">Supabase `workspace_state` (localStorage cache `radwa-erp-demo`)</KeyValue>
            <KeyValue label="Persistence">Shared across every signed-in device</KeyValue>
            <KeyValue label="Next enquiry number">
              <span className="numeric">ENQ-{new Date().getUTCFullYear()}-{String((db.sequences.enquiry ?? 0) + 1).padStart(4, "0")}</span>
            </KeyValue>
          </DefinitionList>

          <Callout tone="neutral">
            Resetting clears every enquiry and workflow record created in this browser and returns the system to
            its starting state: {db.users.length} people and {db.clients.length} clients, no enquiries.
          </Callout>

          <Button variant="danger" icon={<RotateCcw />} onClick={() => setConfirmReset(true)}>
            Reset — clear all enquiries and workflow records
          </Button>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            icon={<Settings2 />}
            title="Configurable defaults"
            description="Decisions the business may change. Each is read from src/domain/config.ts."
          />
          <PanelBody className="space-y-3">
            <KeyValue label="Management Team size (confirmed)">
              {managementConfig.managementTeamSize} members, one of whom is the MD
            </KeyValue>
            <KeyValue label="Estimate approvers (confirmed)">
              MD{estimateApprovalPolicy.requireResponsibleManager ? " + responsible Management Team member" : ""} ·
              mode {estimateApprovalPolicy.mode}
            </KeyValue>
            <KeyValue label="Final bid approval (confirmed)">
              Main MD only — {db.users.find((u) => u.isMD)?.name ?? "—"}
              <span className="mt-0.5 block text-2xs text-ink-500">{finalBidApprovalPolicy.note}</span>
            </KeyValue>
            <KeyValue label="Revision approval rule (confirmed)">
              Classes requiring management approval: {revisionPolicy.classesRequiringManagementApproval.join(", ")}
              <span className="mt-0.5 block text-2xs text-ink-500">{revisionPolicy.note}</span>
            </KeyValue>
            <KeyValue label="Work order numbering (illustrative)">
              <span className="font-mono text-2xs">{workOrderNumberingConfig.pattern}</span>
              <span className="mt-0.5 block text-2xs text-ink-500">{workOrderNumberingConfig.note}</span>
            </KeyValue>
            <KeyValue label="Handover blocking items (confirmed)">
              {handoverPolicy.requiredKeys.length} required, {handoverPolicy.advisoryKeys.length} advisory
              <span className="mt-0.5 block text-2xs text-ink-500">{handoverPolicy.note}</span>
            </KeyValue>
            <KeyValue label="Variance attention threshold">
              {displayConfig.varianceAttentionPercent}% on BOQ amount variance
            </KeyValue>
          </PanelBody>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Sign-in accounts"
              description="Each person signs in with their own username. Use the user menu to switch."
            />
            <PanelBody>
              <ul className="space-y-1.5">
                {ALL_ROLES.map((role) => {
                  const people = db.users.filter((user) =>
                    role === "MD" ? user.isManagementTeam : user.roles.includes(role),
                  );
                  return (
                    <li key={role} className="rounded border border-ink-200 bg-white px-2.5 py-1.5">
                      <span className="text-xs font-medium text-ink-800">{ROLE_LABELS[role]}</span>
                      <span className="mt-0.5 block text-2xs text-ink-500">
                        {people.map((p) => p.name).join(", ") || "No demo user"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {teamProblems.length > 0 ? (
                <Callout tone="bad" title="Seed problem" icon={<AlertTriangle />} className="mt-3">
                  <ul className="list-disc pl-4">
                    {teamProblems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Callout>
              ) : (
                <Callout tone="ok" className="mt-3">
                  Management Team structure validated: three members, exactly one MD, and the MD is one of the
                  three.
                </Callout>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Workflow coverage" description="Enquiries created in this browser, by stage." />
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Stage</TH>
                    <TH align="right" width="6rem">
                      Enquiries
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {stageCounts.length === 0 ? (
                    <TR>
                      <TD colSpan={2} className="py-6 text-center text-ink-500">
                        No enquiries yet. Register one to start the workflow.
                      </TD>
                    </TR>
                  ) : null}
                  {stageCounts.map(([stage, count]) => (
                    <TR key={stage}>
                      <TD>{STAGE_LABELS[stage]}</TD>
                      <TD align="right">{count}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Business rules and where they are enforced"
          description="Centralized in the domain layer; no screen re-implements a rule locally."
        />
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH width="3rem" align="center">
                  #
                </TH>
                <TH>Rule</TH>
                <TH width="26rem">Implementation</TH>
              </TR>
            </THead>
            <TBody>
              {BUSINESS_RULES.map((item) => (
                <TR key={item.n}>
                  <TD align="center" className="text-ink-400">
                    {item.n}
                  </TD>
                  <TD>
                    <span className="text-xs text-ink-800">{item.rule}</span>
                  </TD>
                  <TD>
                    <span className="font-mono text-2xs text-ink-600">{item.where}</span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
        <PanelFooter>
          <p className="text-2xs text-ink-500">
            Full documentation: docs/BUSINESS_RULES.md · API proposal: docs/API_CONTRACT.md
          </p>
        </PanelFooter>
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          setConfirmReset(false);
          toast.success("All enquiries cleared. The system is back to its starting state.");
        }}
        title="Clear all enquiries?"
        confirmLabel="Reset to starting state"
        tone="danger"
        body={
          <>
            Every enquiry registered in this browser, with its decisions, BOQs, documents, work orders and
            activity history, will be permanently discarded. The people directory and client list are kept.
          </>
        }
      />
    </div>
  );
}
