"use client";

/**
 * Radwa Gulf and Co — BOQ and estimate workspace.
 *
 * The AI columns are **simulated demo suggestions** carried in the sample data.
 * They are visually separated from the estimator's confirmed figures and
 * labelled as simulated: no AI model produced them and the demo claims no
 * model accuracy.
 *
 * Totals and variances recalculate as the user types (from a local draft), and
 * values are persisted when a field loses focus. Every variance guards its
 * denominator: a missing or zero AI baseline renders as “—”, never as Infinity
 * or NaN.
 */

import * as React from "react";
import Link from "next/link";
import {
  Calculator,
  CircleHelp,
  FileSignature,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { displayConfig } from "@/domain/config";
import { computeBoqLine, computeEstimateTotals } from "@/domain/rules";
import type { BoqLineItem, Estimate } from "@/domain/types";
import { formatAmount, formatMoney, formatPercent, formatQuantity, parseNumericInput } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import { boqLinesFor, enquiryDetail, userById } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  IconButton,
  KeyValue,
  Panel,
  PanelBody,
  PanelHeader,
  SimulatedTag,
} from "@/components/ui/primitives";
import { Field, Input, NumberInput, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TFoot, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { EstimateStatusBadge } from "./StatusBadges";
import { DefinitionList, PolicyNote, useAction } from "./shared";

interface LineDraft {
  itemCode?: string;
  description?: string;
  unit?: string;
  estimatorQuantity?: string;
  estimatorUnitRate?: string;
  note?: string;
}

export function BoqWorkspace({ estimateId }: { estimateId: string }) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();

  const estimate = db.estimates.find((e) => e.id === estimateId);
  const lines = boqLinesFor(db, estimateId);
  const detail = estimate ? enquiryDetail(db, estimate.enquiryId) : undefined;

  const [lineDrafts, setLineDrafts] = React.useState<Record<string, LineDraft>>({});
  const [metaDraft, setMetaDraft] = React.useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = React.useState<BoqLineItem | null>(null);
  const [submitOpen, setSubmitOpen] = React.useState(false);

  if (!estimate || !detail) {
    return (
      <Callout tone="bad" title="Estimate not found">
        This estimate does not exist in the demo dataset. It may have been removed by a demo reset.
      </Callout>
    );
  }

  const editable = (estimate.status === "DRAFT" || estimate.status === "REJECTED") && role === "ESTIMATOR";
  const readOnlyReason =
    role !== "ESTIMATOR"
      ? "Only the Estimator can edit a BOQ. Switch role to make changes."
      : estimate.status === "PENDING_APPROVAL"
        ? "This estimate is awaiting approval and is locked. Create a revision to change it."
        : estimate.status === "APPROVED"
          ? "This estimate is approved and locked. Create a revision to change it."
          : estimate.status === "SUPERSEDED"
            ? "A later revision supersedes this estimate."
            : null;

  /** Lines overlaid with in-progress edits, so totals update as the user types. */
  const effectiveLines: BoqLineItem[] = lines.map((line) => {
    const draft = lineDrafts[line.id];
    if (!draft) return line;
    return {
      ...line,
      itemCode: draft.itemCode ?? line.itemCode,
      description: draft.description ?? line.description,
      unit: draft.unit ?? line.unit,
      estimatorQuantity:
        draft.estimatorQuantity !== undefined
          ? parseNumericInput(draft.estimatorQuantity)
          : line.estimatorQuantity,
      estimatorUnitRate:
        draft.estimatorUnitRate !== undefined
          ? parseNumericInput(draft.estimatorUnitRate)
          : line.estimatorUnitRate,
      note: draft.note ?? line.note,
    };
  });

  const numericMeta = (key: string, fallback: number): number => {
    const raw = metaDraft[key];
    return raw !== undefined ? parseNumericInput(raw) : fallback;
  };

  const effectiveEstimate: Estimate = {
    ...estimate,
    overheadPercent: numericMeta("overheadPercent", estimate.overheadPercent),
    profitPercent: numericMeta("profitPercent", estimate.profitPercent),
    contingencyPercent: numericMeta("contingencyPercent", estimate.contingencyPercent),
    vatPercent: numericMeta("vatPercent", estimate.vatPercent),
  };

  const totals = computeEstimateTotals(effectiveEstimate, effectiveLines);
  const computed = effectiveLines.map(computeBoqLine);
  const currency = estimate.currency;
  const threshold = displayConfig.varianceAttentionPercent;

  const dirty = Object.keys(lineDrafts).length > 0 || Object.keys(metaDraft).length > 0;

  function setLineDraft(lineId: string, patch: LineDraft) {
    setLineDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  async function commitLine(line: BoqLineItem) {
    const draft = lineDrafts[line.id];
    if (!draft) return;
    const patch: Parameters<typeof repo.updateBoqLine>[0]["patch"] = {};
    if (draft.itemCode !== undefined) patch.itemCode = draft.itemCode;
    if (draft.description !== undefined) patch.description = draft.description;
    if (draft.unit !== undefined) patch.unit = draft.unit;
    if (draft.note !== undefined) patch.note = draft.note;
    if (draft.estimatorQuantity !== undefined) patch.estimatorQuantity = parseNumericInput(draft.estimatorQuantity);
    if (draft.estimatorUnitRate !== undefined) patch.estimatorUnitRate = parseNumericInput(draft.estimatorUnitRate);

    const result = await repo.updateBoqLine({ lineId: line.id, patch });
    if (result.ok) {
      setLineDrafts((current) => {
        const next = { ...current };
        delete next[line.id];
        return next;
      });
    }
  }

  const saveAll = async () => {
    for (const line of lines) {
      if (lineDrafts[line.id]) await commitLine(line);
    }
    const metaPatch: Record<string, number | string> = {};
    for (const key of ["overheadPercent", "profitPercent", "contingencyPercent", "vatPercent"]) {
      if (metaDraft[key] !== undefined) metaPatch[key] = parseNumericInput(metaDraft[key]);
    }
    if (metaDraft.notes !== undefined) metaPatch.notes = metaDraft.notes;
    if (metaDraft.assumptions !== undefined) metaPatch.assumptions = metaDraft.assumptions;

    if (Object.keys(metaPatch).length > 0) {
      await run(() => repo.updateEstimateMeta({ estimateId: estimate.id, patch: metaPatch }));
    } else {
      await run(async () => ({ ok: true as const, message: "BOQ saved." }));
    }
    setMetaDraft({});
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- header */}
      <Panel>
        <PanelHeader
          icon={<Calculator />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/enquiries/${detail.enquiry.id}`} className="numeric text-brand-700 hover:underline">
                {detail.enquiry.reference}
              </Link>
              <span className="text-ink-300">/</span>
              <span>Estimate revision {estimate.version}</span>
              <EstimateStatusBadge status={estimate.status} />
            </span>
          }
          description={`${detail.enquiry.projectTitle} — ${detail.client?.name ?? ""}`}
          actions={
            <>
              {editable ? (
                <>
                  <Button icon={<Save />} variant="secondary" disabled={busy || !dirty} onClick={saveAll}>
                    Save draft
                  </Button>
                  <Button icon={<Send />} variant="primary" disabled={busy} onClick={() => setSubmitOpen(true)}>
                    Submit for approval
                  </Button>
                </>
              ) : null}
              {role === "ESTIMATOR" &&
              (estimate.status === "APPROVED" || estimate.status === "REJECTED") ? (
                <RevisionButton detail={detail} />
              ) : null}
            </>
          }
        />
        <PanelBody>
          <DefinitionList cols={4}>
            <KeyValue label="Prepared by">{userById(db, estimate.preparedById)?.name ?? "—"}</KeyValue>
            <KeyValue label="Created">{formatDate(estimate.createdAt)}</KeyValue>
            <KeyValue label="Last updated">{formatDateTime(estimate.updatedAt)}</KeyValue>
            <KeyValue label="Grand total">
              <span className="numeric text-base font-semibold text-ink-900">
                {formatMoney(totals.grandTotal, currency)}
              </span>
            </KeyValue>
          </DefinitionList>

          {estimate.revisionNote ? (
            <Callout tone="info" title={`Revision ${estimate.version} note`} className="mt-3">
              {estimate.revisionNote}
            </Callout>
          ) : null}

          {readOnlyReason ? (
            <Callout tone="neutral" className="mt-3">
              {readOnlyReason}
            </Callout>
          ) : null}

          {dirty ? (
            <Callout tone="warn" className="mt-3">
              Unsaved changes. Totals below already reflect your edits; press{" "}
              <span className="font-semibold">Save draft</span> to store them, or simply move focus out of a
              field to save that value.
            </Callout>
          ) : null}
        </PanelBody>
      </Panel>

      {/* ------------------------------------------------------------ BOQ */}
      <Panel>
        <PanelHeader
          icon={<FileSignature />}
          title="Bill of quantities"
          description="Simulated AI suggestions sit alongside the estimator's confirmed figures. Variance is calculated against the suggestion."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SimulatedTag>AI columns are simulated demo values</SimulatedTag>
              {editable ? (
                <Button
                  size="sm"
                  icon={<Plus />}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => repo.addBoqLine({ estimateId: estimate.id }))}
                >
                  Add line
                </Button>
              ) : null}
            </div>
          }
        />

        <TableWrap stickyHeader={false}>
          <Table className="min-w-[78rem]">
            <THead>
              <TR>
                <TH width="3rem" align="center" className="border-r border-ink-200">
                  #
                </TH>
                <TH width="6rem">Code</TH>
                <TH width="22rem">Description</TH>
                <TH width="4.5rem">Unit</TH>
                <TH align="center" className="border-l border-ink-200 bg-accent-50 text-accent-700" width="16rem">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3" aria-hidden />
                    Simulated AI suggestion
                  </span>
                </TH>
                <TH align="center" className="border-l border-ink-200 bg-brand-50 text-brand-700" width="16rem">
                  Estimator (confirmed)
                </TH>
                <TH align="center" className="border-l border-ink-200" width="14rem">
                  Variance
                </TH>
                <TH width="14rem" className="border-l border-ink-200">
                  Note / assumption
                </TH>
                {editable ? <TH width="3rem" /> : null}
              </TR>
              <TR>
                <TH className="border-r border-ink-200" />
                <TH />
                <TH />
                <TH />
                <TH className="border-l border-ink-200 bg-accent-50/60 p-0">
                  <span className="grid grid-cols-3 text-2xs">
                    <span className="px-2 py-1 text-right">Qty</span>
                    <span className="px-2 py-1 text-right">Rate</span>
                    <span className="px-2 py-1 text-right">Amount</span>
                  </span>
                </TH>
                <TH className="border-l border-ink-200 bg-brand-50/60 p-0">
                  <span className="grid grid-cols-3 text-2xs">
                    <span className="px-2 py-1 text-right">Qty</span>
                    <span className="px-2 py-1 text-right">Rate</span>
                    <span className="px-2 py-1 text-right">Amount</span>
                  </span>
                </TH>
                <TH className="border-l border-ink-200 p-0">
                  <span className="grid grid-cols-3 text-2xs">
                    <span className="px-2 py-1 text-right">Qty</span>
                    <span className="px-2 py-1 text-right">Rate</span>
                    <span className="px-2 py-1 text-right">Amount</span>
                  </span>
                </TH>
                <TH className="border-l border-ink-200" />
                {editable ? <TH /> : null}
              </TR>
            </THead>

            <TBody>
              {computed.length === 0 ? (
                <TR>
                  <TD colSpan={editable ? 9 : 8} className="py-8 text-center text-ink-500">
                    No BOQ lines yet.{" "}
                    {editable ? "Use “Add line” to start pricing." : "The Estimator has not added any lines."}
                  </TD>
                </TR>
              ) : null}

              {computed.map((row, index) => {
                const line = row.line;
                const draft = lineDrafts[line.id] ?? {};
                const attention =
                  row.amountVariancePercent !== null && Math.abs(row.amountVariancePercent) >= threshold;

                return (
                  <TR key={line.id} className={cn(attention && "bg-warn-50/40")}>
                    <TD align="center" className="border-r border-ink-100 text-2xs text-ink-400">
                      {index + 1}
                    </TD>

                    <TD>
                      {editable ? (
                        <Input
                          aria-label={`Item code for line ${index + 1}`}
                          value={draft.itemCode ?? line.itemCode}
                          onChange={(event) => setLineDraft(line.id, { itemCode: event.target.value })}
                          onBlur={() => void commitLine(line)}
                          className="h-7 px-1.5 py-0 font-mono text-2xs"
                        />
                      ) : (
                        <span className="font-mono text-2xs text-ink-600">{line.itemCode}</span>
                      )}
                    </TD>

                    <TD>
                      {editable ? (
                        <Textarea
                          aria-label={`Description for line ${index + 1}`}
                          rows={2}
                          value={draft.description ?? line.description}
                          onChange={(event) => setLineDraft(line.id, { description: event.target.value })}
                          onBlur={() => void commitLine(line)}
                          placeholder="Description of the work item"
                          className="min-h-0 px-2 py-1 text-2xs"
                        />
                      ) : (
                        <span className="text-xs leading-relaxed text-ink-700">{line.description || "—"}</span>
                      )}
                    </TD>

                    <TD>
                      {editable ? (
                        <Input
                          aria-label={`Unit for line ${index + 1}`}
                          value={draft.unit ?? line.unit}
                          onChange={(event) => setLineDraft(line.id, { unit: event.target.value })}
                          onBlur={() => void commitLine(line)}
                          className="h-7 px-1.5 py-0 text-2xs"
                        />
                      ) : (
                        <span className="text-2xs text-ink-600">{line.unit}</span>
                      )}
                    </TD>

                    {/* Simulated AI suggestion */}
                    <TD className="border-l border-ink-100 bg-accent-50/30 p-0">
                      <span className="numeric grid grid-cols-3 text-2xs text-accent-700">
                        <span className="px-2 py-1 text-right">{formatQuantity(line.aiQuantity)}</span>
                        <span className="px-2 py-1 text-right">{formatAmount(line.aiUnitRate)}</span>
                        <span className="px-2 py-1 text-right font-medium">{formatAmount(row.aiAmount)}</span>
                      </span>
                    </TD>

                    {/* Estimator confirmed */}
                    <TD className="border-l border-ink-100 bg-brand-50/30 p-0">
                      <span className="grid grid-cols-3 items-center gap-1 px-1 py-1">
                        {editable ? (
                          <>
                            <NumberInput
                              aria-label={`Estimator quantity for line ${index + 1}`}
                              value={draft.estimatorQuantity ?? String(line.estimatorQuantity)}
                              onChange={(event) =>
                                setLineDraft(line.id, { estimatorQuantity: event.target.value })
                              }
                              onBlur={() => void commitLine(line)}
                            />
                            <NumberInput
                              aria-label={`Estimator unit rate for line ${index + 1}`}
                              value={draft.estimatorUnitRate ?? String(line.estimatorUnitRate)}
                              onChange={(event) =>
                                setLineDraft(line.id, { estimatorUnitRate: event.target.value })
                              }
                              onBlur={() => void commitLine(line)}
                            />
                          </>
                        ) : (
                          <>
                            <span className="numeric px-2 text-right text-2xs text-ink-700">
                              {formatQuantity(line.estimatorQuantity)}
                            </span>
                            <span className="numeric px-2 text-right text-2xs text-ink-700">
                              {formatAmount(line.estimatorUnitRate)}
                            </span>
                          </>
                        )}
                        <span className="numeric px-2 text-right text-2xs font-semibold text-ink-900">
                          {formatAmount(row.estimatorAmount)}
                        </span>
                      </span>
                    </TD>

                    {/* Variance */}
                    <TD className="border-l border-ink-100 p-0">
                      <span className="numeric grid grid-cols-3 text-2xs">
                        <VarianceCell percent={row.quantityVariancePercent} absolute={row.quantityVariance} />
                        <VarianceCell percent={row.rateVariancePercent} absolute={row.rateVariance} />
                        <VarianceCell
                          percent={row.amountVariancePercent}
                          absolute={row.amountVariance}
                          emphasize
                        />
                      </span>
                    </TD>

                    <TD className="border-l border-ink-100">
                      {editable ? (
                        <Textarea
                          aria-label={`Note for line ${index + 1}`}
                          rows={2}
                          value={draft.note ?? line.note ?? ""}
                          onChange={(event) => setLineDraft(line.id, { note: event.target.value })}
                          onBlur={() => void commitLine(line)}
                          placeholder="Assumption or justification"
                          className="min-h-0 px-2 py-1 text-2xs"
                        />
                      ) : line.note ? (
                        <span className="text-2xs leading-relaxed text-ink-600">{line.note}</span>
                      ) : (
                        <span className="text-2xs text-ink-300">—</span>
                      )}
                    </TD>

                    {editable ? (
                      <TD align="center">
                        <IconButton
                          label={`Remove line ${index + 1}`}
                          variant="ghost"
                          onClick={() => setConfirmDelete(line)}
                        >
                          <Trash2 className="text-bad-600" />
                        </IconButton>
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>

            <TFoot>
              <TR>
                <TD colSpan={4} className="text-right text-2xs tracking-wide text-ink-600 uppercase">
                  Priced line total
                </TD>
                <TD className="numeric border-l border-ink-200 bg-accent-50/40 text-right text-xs font-semibold text-accent-700">
                  {totals.aiLineTotal === null ? (
                    <span className="inline-flex items-center gap-1 text-2xs font-normal text-ink-500">
                      <CircleHelp className="size-3" aria-hidden />
                      Partial baseline
                    </span>
                  ) : (
                    formatAmount(totals.aiLineTotal)
                  )}
                </TD>
                <TD className="numeric border-l border-ink-200 bg-brand-50/40 text-right text-xs font-semibold text-ink-900">
                  {formatAmount(totals.lineTotal)}
                </TD>
                <TD className="numeric border-l border-ink-200 text-right text-xs">
                  {totals.aiLineTotal === null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    <VarianceInline
                      percent={
                        totals.aiLineTotal === 0
                          ? null
                          : ((totals.lineTotal - totals.aiLineTotal) / Math.abs(totals.aiLineTotal)) * 100
                      }
                    />
                  )}
                </TD>
                <TD className="border-l border-ink-200" />
                {editable ? <TD /> : null}
              </TR>
            </TFoot>
          </Table>
        </TableWrap>

        <PanelBody className="border-t border-ink-200">
          <PolicyNote>
            A manually added line has no AI suggestion, so its variance shows as “—” rather than a misleading
            100%. Lines whose amount differs from the suggestion by {threshold}% or more are highlighted.
          </PolicyNote>
        </PanelBody>
      </Panel>

      {/* ------------------------------------------------- quotation summary */}
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Panel>
          <PanelHeader title="Quotation summary" icon={<Calculator />} />
          <PanelBody>
            <dl className="divide-y divide-ink-100">
              <SummaryRow label="Priced line total" value={formatMoney(totals.lineTotal, currency)} />
              <PercentRow
                label="Overhead"
                suffix={formatMoney(totals.overhead, currency)}
                value={metaDraft.overheadPercent ?? String(estimate.overheadPercent)}
                editable={editable}
                onChange={(value) => setMetaDraft((m) => ({ ...m, overheadPercent: value }))}
                onCommit={() =>
                  void run(() =>
                    repo.updateEstimateMeta({
                      estimateId: estimate.id,
                      patch: { overheadPercent: parseNumericInput(metaDraft.overheadPercent ?? "") },
                    }),
                  )
                }
                dirty={metaDraft.overheadPercent !== undefined}
              />
              <PercentRow
                label="Profit"
                suffix={formatMoney(totals.profit, currency)}
                value={metaDraft.profitPercent ?? String(estimate.profitPercent)}
                editable={editable}
                onChange={(value) => setMetaDraft((m) => ({ ...m, profitPercent: value }))}
                onCommit={() =>
                  void run(() =>
                    repo.updateEstimateMeta({
                      estimateId: estimate.id,
                      patch: { profitPercent: parseNumericInput(metaDraft.profitPercent ?? "") },
                    }),
                  )
                }
                dirty={metaDraft.profitPercent !== undefined}
              />
              <PercentRow
                label="Contingency"
                suffix={formatMoney(totals.contingency, currency)}
                value={metaDraft.contingencyPercent ?? String(estimate.contingencyPercent)}
                editable={editable}
                onChange={(value) => setMetaDraft((m) => ({ ...m, contingencyPercent: value }))}
                onCommit={() =>
                  void run(() =>
                    repo.updateEstimateMeta({
                      estimateId: estimate.id,
                      patch: { contingencyPercent: parseNumericInput(metaDraft.contingencyPercent ?? "") },
                    }),
                  )
                }
                dirty={metaDraft.contingencyPercent !== undefined}
              />
              <SummaryRow label="Sub-total" value={formatMoney(totals.subTotal, currency)} strong />
              <PercentRow
                label="VAT"
                suffix={formatMoney(totals.vat, currency)}
                value={metaDraft.vatPercent ?? String(estimate.vatPercent)}
                editable={editable}
                onChange={(value) => setMetaDraft((m) => ({ ...m, vatPercent: value }))}
                onCommit={() =>
                  void run(() =>
                    repo.updateEstimateMeta({
                      estimateId: estimate.id,
                      patch: { vatPercent: parseNumericInput(metaDraft.vatPercent ?? "") },
                    }),
                  )
                }
                dirty={metaDraft.vatPercent !== undefined}
              />
            </dl>

            <div className="mt-3 flex items-baseline justify-between gap-3 rounded-control bg-brand-600 px-3 py-2.5 text-white">
              <span className="text-xs font-medium">Quotation total</span>
              <span className="numeric text-lg font-semibold">{formatMoney(totals.grandTotal, currency)}</span>
            </div>
            <p className="mt-1.5 text-2xs text-ink-500">
              {totals.lineCount} line item(s) · {currency}
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Notes and assumptions" />
          <PanelBody className="space-y-3">
            <Field
              label="Estimator notes"
              htmlFor="estimate-notes"
              hint="Shown to the Management Team on the approval screen."
            >
              <Textarea
                id="estimate-notes"
                rows={3}
                disabled={!editable}
                value={metaDraft.notes ?? estimate.notes ?? ""}
                onChange={(event) => setMetaDraft((m) => ({ ...m, notes: event.target.value }))}
                onBlur={() => {
                  if (metaDraft.notes === undefined) return;
                  void run(() =>
                    repo.updateEstimateMeta({ estimateId: estimate.id, patch: { notes: metaDraft.notes } }),
                  );
                }}
                placeholder="Pricing basis, market conditions, anything the approver should know."
              />
            </Field>

            <Field
              label="Assumptions and exclusions"
              htmlFor="estimate-assumptions"
              hint="Carried into the proposal and the work order."
            >
              <Textarea
                id="estimate-assumptions"
                rows={5}
                disabled={!editable}
                value={metaDraft.assumptions ?? estimate.assumptions ?? ""}
                onChange={(event) => setMetaDraft((m) => ({ ...m, assumptions: event.target.value }))}
                onBlur={() => {
                  if (metaDraft.assumptions === undefined) return;
                  void run(() =>
                    repo.updateEstimateMeta({
                      estimateId: estimate.id,
                      patch: { assumptions: metaDraft.assumptions },
                    }),
                  );
                }}
                placeholder={"1) Access assumptions\n2) Client-supplied items\n3) Exclusions"}
              />
            </Field>
          </PanelBody>
        </Panel>
      </div>

      <EstimateVersionHistory enquiryId={detail.enquiry.id} currentEstimateId={estimate.id} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void run(() => repo.removeBoqLine({ lineId: confirmDelete.id }));
          setConfirmDelete(null);
        }}
        title="Remove BOQ line?"
        confirmLabel="Remove line"
        tone="danger"
        body={
          <>
            Line <span className="font-mono">{confirmDelete?.itemCode}</span> will be removed from this estimate
            revision. Previous revisions keep their own copy of the line.
          </>
        }
      />

      <SubmitForApprovalDialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        estimateId={estimate.id}
        enquiryId={detail.enquiry.id}
        total={formatMoney(totals.grandTotal, currency)}
      />
    </div>
  );
}

/* -------------------------------------------------------------- helpers --- */

function VarianceCell({
  percent,
  absolute,
  emphasize,
}: {
  percent: number | null;
  absolute: number | null;
  emphasize?: boolean;
}) {
  if (percent === null && absolute === null) {
    return <span className="px-2 py-1 text-right text-ink-300">—</span>;
  }
  const positive = (percent ?? 0) > 0;
  const attention = percent !== null && Math.abs(percent) >= displayConfig.varianceAttentionPercent;

  return (
    <span
      className={cn(
        "px-2 py-1 text-right",
        percent === null
          ? "text-ink-300"
          : positive
            ? attention
              ? "font-semibold text-bad-600"
              : "text-warn-700"
            : attention
              ? "font-semibold text-ok-700"
              : "text-ok-600",
        emphasize && "font-semibold",
      )}
      title={absolute !== null ? `Absolute difference: ${formatAmount(absolute)}` : undefined}
    >
      {formatPercent(percent)}
    </span>
  );
}

function VarianceInline({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-ink-400">—</span>;
  const attention = Math.abs(percent) >= displayConfig.varianceAttentionPercent;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        percent > 0 ? (attention ? "text-bad-600" : "text-warn-700") : "text-ok-700",
      )}
    >
      {attention ? <TriangleAlert className="size-3" aria-hidden /> : null}
      {formatPercent(percent)}
    </span>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={cn("text-xs", strong ? "font-semibold text-ink-800" : "text-ink-600")}>{label}</dt>
      <dd className={cn("numeric text-xs", strong ? "font-semibold text-ink-900" : "text-ink-800")}>{value}</dd>
    </div>
  );
}

function PercentRow({
  label,
  value,
  suffix,
  editable,
  onChange,
  onCommit,
  dirty,
}: {
  label: string;
  value: string;
  suffix: string;
  editable: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  dirty: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="flex items-center gap-2 text-xs text-ink-600">
        {label}
        {editable ? (
          <span className="inline-flex items-center gap-1">
            <NumberInput
              aria-label={`${label} percentage`}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => {
                if (dirty) onCommit();
              }}
              className="h-6 w-14"
            />
            <span className="text-2xs text-ink-400">%</span>
          </span>
        ) : (
          <span className="numeric text-2xs text-ink-500">{value}%</span>
        )}
      </dt>
      <dd className="numeric text-xs text-ink-800">{suffix}</dd>
    </div>
  );
}

function RevisionButton({ detail }: { detail: NonNullable<ReturnType<typeof enquiryDetail>> }) {
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  return (
    <>
      <Button variant="secondary" icon={<Plus />} onClick={() => setOpen(true)}>
        Create revision
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create a new estimate revision"
        description="The current revision is preserved. The new revision starts as a copy you can edit."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repo.createEstimateRevision({
                      enquiryId: detail.enquiry.id,
                      revisionNote: note,
                      revisionRequestId: detail.openRevision?.id,
                    }),
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              Create revision
            </Button>
          </>
        }
      >
        <Field label="What changed in this revision?" htmlFor="revision-note" required error={errors.revisionNote}>
          <Textarea
            id="revision-note"
            rows={3}
            value={note}
            invalid={Boolean(errors.revisionNote)}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Alternative acoustic system substituted per client request CEDAR/REV/01."
          />
        </Field>
        {detail.openRevision ? (
          <Callout tone="info" className="mt-3">
            This revision will be linked to the open client revision request.
            {detail.openRevision.requiresManagementApproval
              ? " Management approval is required before resubmission."
              : " No MD approval is required for this administrative-only change."}
          </Callout>
        ) : null}
      </Dialog>
    </>
  );
}

function SubmitForApprovalDialog({
  open,
  onClose,
  estimateId,
  enquiryId,
  total,
}: {
  open: boolean;
  onClose: () => void;
  estimateId: string;
  enquiryId: string;
  total: string;
}) {
  const db = useDb();
  const repo = useRepository();
  const { run, busy } = useAction();
  const detail = enquiryDetail(db, enquiryId);
  const approvers = detail ? requiredApproverNames(db, enquiryId) : [];

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() =>
        void run(() => repo.submitEstimateForApproval({ estimateId }), { onSuccess: onClose })
      }
      title="Submit estimate for approval?"
      confirmLabel="Submit for approval"
      busy={busy}
      body={
        <>
          The estimate will be locked at <span className="font-semibold">{total}</span> and sent for approval to{" "}
          <span className="font-semibold">{approvers.join(" and ") || "the Management Team"}</span>. Further
          changes require a new revision.
        </>
      }
    />
  );
}

function requiredApproverNames(db: ReturnType<typeof useDb>, enquiryId: string): string[] {
  const enquiry = db.enquiries.find((e) => e.id === enquiryId);
  if (!enquiry) return [];
  const names: string[] = [];
  const md = db.users.find((u) => u.isMD);
  if (md) names.push(`${md.name} (MD)`);
  const manager = db.users.find((u) => u.id === enquiry.responsibleManagerId);
  if (manager && manager.id !== md?.id) names.push(`${manager.name} (Responsible Manager)`);
  return names;
}

export function EstimateVersionHistory({
  enquiryId,
  currentEstimateId,
}: {
  enquiryId: string;
  currentEstimateId?: string;
}) {
  const db = useDb();
  const estimates = db.estimates
    .filter((e) => e.enquiryId === enquiryId)
    .sort((a, b) => b.version - a.version);

  if (estimates.length <= 1) return null;

  return (
    <Panel>
      <PanelHeader
        title="Estimate revision history"
        description="Previous revisions are preserved with their own BOQ lines and approvals."
        actions={<Badge tone="neutral">{estimates.length} revision(s)</Badge>}
      />
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Revision</TH>
              <TH>Status</TH>
              <TH>Prepared by</TH>
              <TH>Created</TH>
              <TH align="right">Total</TH>
              <TH>Revision note</TH>
              <TH align="right" />
            </TR>
          </THead>
          <TBody>
            {estimates.map((estimate) => {
              const totals = computeEstimateTotals(estimate, boqLinesFor(db, estimate.id));
              return (
                <TR key={estimate.id} selected={estimate.id === currentEstimateId}>
                  <TD className="numeric font-medium text-ink-800">Rev {estimate.version}</TD>
                  <TD>
                    <EstimateStatusBadge status={estimate.status} />
                  </TD>
                  <TD>{userById(db, estimate.preparedById)?.name ?? "—"}</TD>
                  <TD>{formatDate(estimate.createdAt)}</TD>
                  <TD align="right" className="font-medium text-ink-900">
                    {formatMoney(totals.grandTotal, estimate.currency)}
                  </TD>
                  <TD className="max-w-sm">
                    <span className="text-2xs leading-relaxed text-ink-600">{estimate.revisionNote ?? "—"}</span>
                  </TD>
                  <TD align="right">
                    <Link
                      href={`/estimates/${estimate.id}`}
                      className="text-2xs font-medium text-brand-600 hover:underline"
                    >
                      Open
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </Panel>
  );
}
