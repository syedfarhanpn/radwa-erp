"use client";

/**
 * Enquiry register — the searchable, filterable list of every enquiry.
 */

import * as React from "react";
import Link from "next/link";
import { ClipboardList, FilePlus2, Search, UserCheck, X } from "lucide-react";

import {
  ENQUIRY_STAGES,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  formatProjectTypes,
  SOURCE_LABELS,
  STAGE_LABELS,
  STAGE_PHASE,
  PHASE_LABELS,
  ENQUIRY_PHASES,
  type EnquiryPhase,
  type EnquiryStage,
  type Priority,
  type ProjectType,
} from "@/domain/enums";
import { stageOrder } from "@/domain/rules";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import { describeScope } from "@/store/visibility";
import { allEnquiryRows, type EnquiryRow } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  LinkButton,
  Panel,
  PanelFooter,
  PanelHeader,
} from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { DeadlineCell, PriorityBadge, StageBadge } from "@/components/workflow/StatusBadges";

type SortKey = "deadline" | "updated" | "stage" | "value" | "reference";

export default function EnquiryRegisterPage() {
  const db = useDb();
  const role = useActiveRole();
  const rows = React.useMemo(() => allEnquiryRows(db), [db]);

  const [query, setQuery] = React.useState("");
  const [phase, setPhase] = React.useState<EnquiryPhase | "">("");
  const [stage, setStage] = React.useState<EnquiryStage | "">("");
  const [projectType, setProjectType] = React.useState<ProjectType | "">("");
  const [priority, setPriority] = React.useState<Priority | "">("");
  const [clientId, setClientId] = React.useState("");
  const [showClosed, setShowClosed] = React.useState(true);
  const [sort, setSort] = React.useState<SortKey>("deadline");
  const [dir, setDir] = React.useState<"asc" | "desc">("asc");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = rows.filter((row) => {
      if (!showClosed && row.isClosed) return false;
      if (phase && STAGE_PHASE[row.enquiry.stage] !== phase) return false;
      if (stage && row.enquiry.stage !== stage) return false;
      if (projectType && !row.enquiry.projectTypes.includes(projectType)) return false;
      if (priority && row.enquiry.priority !== priority) return false;
      if (clientId && row.enquiry.clientId !== clientId) return false;
      if (!q) return true;
      return (
        row.enquiry.reference.toLowerCase().includes(q) ||
        row.enquiry.projectTitle.toLowerCase().includes(q) ||
        row.enquiry.projectLocation.toLowerCase().includes(q) ||
        row.enquiry.scopeOfWork.toLowerCase().includes(q) ||
        (row.client?.name.toLowerCase().includes(q) ?? false) ||
        (row.mcp?.name.toLowerCase().includes(q) ?? false) ||
        (row.estimator?.name.toLowerCase().includes(q) ?? false)
      );
    });

    const factor = dir === "asc" ? 1 : -1;
    return [...result].sort((a, b) => {
      switch (sort) {
        case "reference":
          return a.enquiry.reference.localeCompare(b.enquiry.reference) * factor;
        case "updated":
          return (a.enquiry.updatedAt < b.enquiry.updatedAt ? -1 : 1) * factor;
        case "stage":
          return (stageOrder(a.enquiry.stage) - stageOrder(b.enquiry.stage)) * factor;
        case "value":
          return ((a.estimateTotal ?? a.enquiry.estimatedValue ?? 0) - (b.estimateTotal ?? b.enquiry.estimatedValue ?? 0)) * factor;
        case "deadline":
        default:
          return (a.enquiry.submissionDeadline < b.enquiry.submissionDeadline ? -1 : 1) * factor;
      }
    });
  }, [rows, query, phase, stage, projectType, priority, clientId, showClosed, sort, dir]);

  const activeFilters = [query, phase, stage, projectType, priority, clientId].filter(Boolean).length;

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "updated" || key === "value" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setQuery("");
    setPhase("");
    setStage("");
    setProjectType("");
    setPriority("");
    setClientId("");
    setShowClosed(true);
  }

  const scopeNote = describeScope(role);

  return (
    <div className="space-y-4">
      {scopeNote ? (
        <Callout tone="info" icon={<UserCheck />}>
          {scopeNote} Enquiries assigned to other {role === "MCP" ? "MCPs" : "estimators"} are not listed here or
          in search.
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          icon={<ClipboardList />}
          title="Enquiry register"
          description="Every enquiry in the system. Records are created here and in the workflow screens; nothing is pre-loaded."
          actions={
            <LinkButton href="/enquiries/new" variant="primary" size="sm" icon={<FilePlus2 />}>
              Register enquiry
            </LinkButton>
          }
        />

        {/* ----------------------------------------------------- filters */}
        <div className="border-b border-ink-200 bg-ink-50 px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <Field label="Search" htmlFor="enq-search">
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-400"
                  aria-hidden
                />
                <Input
                  id="enq-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Reference, project, client, location, assignee…"
                  className="pl-8"
                />
              </span>
            </Field>

            <Field label="Phase" htmlFor="enq-phase">
              <Select
                id="enq-phase"
                value={phase}
                onChange={(event) => {
                  setPhase(event.target.value as EnquiryPhase);
                  setStage("");
                }}
              >
                <option value="">All phases</option>
                {ENQUIRY_PHASES.map((item) => (
                  <option key={item} value={item}>
                    {PHASE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Stage" htmlFor="enq-stage">
              <Select id="enq-stage" value={stage} onChange={(event) => setStage(event.target.value as EnquiryStage)}>
                <option value="">All stages</option>
                {ENQUIRY_STAGES.filter((item) => !phase || STAGE_PHASE[item] === phase).map((item) => (
                  <option key={item} value={item}>
                    {STAGE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Client" htmlFor="enq-client">
              <Select id="enq-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">All clients</option>
                {db.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.shortName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority" htmlFor="enq-priority">
              <Select
                id="enq-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                <option value="">All priorities</option>
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {PRIORITY_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>

            <Button variant="ghost" icon={<X />} onClick={clearFilters} disabled={activeFilters === 0 && showClosed}>
              Clear
            </Button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Field label="Project type" htmlFor="enq-type" className="w-56">
              <Select
                id="enq-type"
                value={projectType}
                onChange={(event) => setProjectType(event.target.value as ProjectType)}
              >
                <option value="">All project types</option>
                {PROJECT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {PROJECT_TYPE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(event) => setShowClosed(event.target.checked)}
                className="size-4 accent-brand-600"
              />
              Include closed (handed over, lost, void)
            </label>

            <span className="mt-4 text-2xs text-ink-500">
              Showing <span className="numeric font-semibold text-ink-700">{filtered.length}</span> of{" "}
              <span className="numeric">{rows.length}</span> enquiries
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------- table */}
        <TableWrap>
          <Table className="min-w-[72rem]">
            <THead>
              <TR>
                <TH
                  width="18rem"
                  sort={sort === "reference" ? dir : false}
                  onSort={() => toggleSort("reference")}
                >
                  Enquiry
                </TH>
                <TH width="10rem">Client</TH>
                <TH width="11rem">Project type</TH>
                <TH width="8rem">Source</TH>
                <TH width="11rem" sort={sort === "stage" ? dir : false} onSort={() => toggleSort("stage")}>
                  Current stage
                </TH>
                <TH width="9rem">MCP</TH>
                <TH width="9rem">Estimator</TH>
                <TH width="6rem">Priority</TH>
                <TH width="8rem" align="right" sort={sort === "value" ? dir : false} onSort={() => toggleSort("value")}>
                  Value
                </TH>
                <TH width="9rem" sort={sort === "deadline" ? dir : false} onSort={() => toggleSort("deadline")}>
                  Deadline
                </TH>
                <TH width="9rem" sort={sort === "updated" ? dir : false} onSort={() => toggleSort("updated")}>
                  Last updated
                </TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={11}>
                  {rows.length === 0 ? (
                    <>
                      No enquiries yet. Use <span className="font-medium text-ink-700">Register enquiry</span>{" "}
                      above to add the first one.
                    </>
                  ) : (
                    <>
                      No enquiry matches these filters.{" "}
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  )}
                </TableEmptyRow>
              ) : null}

              {filtered.map((row) => (
                <EnquiryTableRow key={row.enquiry.id} row={row} />
              ))}
            </TBody>
          </Table>
        </TableWrap>

        <PanelFooter>
          <p className="text-2xs text-ink-500">
            Click any row to open the enquiry and its full workflow history.
          </p>
        </PanelFooter>
      </Panel>

    </div>
  );
}

function EnquiryTableRow({ row }: { row: EnquiryRow }) {
  const { enquiry } = row;

  return (
    <TR className={row.isClosed ? "opacity-70" : undefined}>
      <TD className="max-w-xs">
        <Link href={`/enquiries/${enquiry.id}`} className="group block min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="numeric text-2xs font-semibold text-brand-700 group-hover:underline">
              {enquiry.reference}
            </span>
            {!enquiry.isSampleData ? <Badge tone="info">New</Badge> : null}
          </span>
          <span className="block truncate text-xs font-medium text-ink-800 group-hover:text-brand-700">
            {enquiry.projectTitle}
          </span>
          <span className="block truncate text-2xs text-ink-400">{enquiry.projectLocation}</span>
        </Link>
      </TD>
      <TD>{row.client?.shortName ?? "—"}</TD>
      <TD>
        <span className="text-2xs text-ink-600">{formatProjectTypes(enquiry.projectTypes)}</span>
      </TD>
      <TD>
        <span className="text-2xs text-ink-600">{SOURCE_LABELS[enquiry.source]}</span>
      </TD>
      <TD>
        <StageBadge stage={enquiry.stage} />
      </TD>
      <TD>
        <span className="text-2xs text-ink-700">{row.mcp?.name ?? <span className="text-ink-400">Unassigned</span>}</span>
      </TD>
      <TD>
        <span className="text-2xs text-ink-700">
          {row.estimator?.name ?? <span className="text-ink-400">Unassigned</span>}
        </span>
      </TD>
      <TD>
        <PriorityBadge priority={enquiry.priority} />
      </TD>
      <TD align="right">
        <span className="text-xs text-ink-800">
          {formatMoney(row.estimateTotal ?? enquiry.estimatedValue, enquiry.currency, 0)}
        </span>
        {row.estimateTotal ? <span className="block text-2xs text-ink-400">Priced</span> : <span className="block text-2xs text-ink-400">Expected</span>}
      </TD>
      <TD>
        <DeadlineCell date={enquiry.submissionDeadline} closed={row.isClosed} />
      </TD>
      <TD>
        <span className="text-2xs text-ink-500">{formatDateTime(enquiry.updatedAt)}</span>
      </TD>
    </TR>
  );
}
