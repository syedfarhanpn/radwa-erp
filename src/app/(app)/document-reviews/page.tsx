"use client";

/**
 * Departmental document review queue.
 *
 * Routed by department: a reviewer sees the document versions assigned to their
 * own department. Approving records the approval against that version only;
 * rejecting requires both a reason and corrective instructions.
 */

import * as React from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";

import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "@/domain/enums";
import { previousVersions } from "@/domain/rules";
import type { BidPackageDocument } from "@/domain/types";
import { formatDate } from "@/lib/dates";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { documentReviewQueue, rejectedDocuments, userById } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Panel,
  PanelHeader,
} from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { ReviewDocumentDialog } from "@/components/workflow/BidPackagePanels";
import { DeadlineCell, ReviewStatusBadge } from "@/components/workflow/StatusBadges";
import { PolicyNote } from "@/components/workflow/shared";

export default function DocumentReviewsPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();

  const [chosenDepartment, setDepartment] = React.useState<Department | "">("");
  const [reviewDoc, setReviewDoc] = React.useState<BidPackageDocument | null>(null);

  // A reviewer only ever sees their own department, so the filter is derived
  // from who is acting rather than copied into state.
  const department: Department | "" =
    role === "DEPARTMENT_REVIEWER" && actingUser.department ? actingUser.department : chosenDepartment;

  const pending = React.useMemo(
    () => documentReviewQueue(db, department || undefined),
    [db, department],
  );
  const rejected = React.useMemo(
    () => rejectedDocuments(db).filter((item) => !department || item.document.department === department),
    [db, department],
  );

  const canReview = role === "DEPARTMENT_REVIEWER";
  const refreshed = reviewDoc ? db.bidPackageDocuments.find((d) => d.id === reviewDoc.id) ?? null : null;

  return (
    <div className="space-y-4">
      <Callout tone="info" icon={<ListChecks />}>
        A rejection needs a clear reason <span className="font-semibold">and</span> corrective instructions —
        both fields are enforced. An approval applies to the version you reviewed, not to the document for all
        time.
      </Callout>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Department" htmlFor="review-dept" className="w-64">
          <Select
            id="review-dept"
            value={department}
            disabled={role === "DEPARTMENT_REVIEWER"}
            onChange={(event) => setDepartment(event.target.value as Department)}
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((item) => (
              <option key={item} value={item}>
                {DEPARTMENT_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        {role === "DEPARTMENT_REVIEWER" ? (
          <p className="mb-1.5 text-2xs text-ink-500">
            Locked to your department. Switch the acting reviewer in the role menu to see another department.
          </p>
        ) : null}
      </div>

      <Panel>
        <PanelHeader
          icon={<ListChecks />}
          title="Awaiting review"
          description="Document versions submitted to this department."
          actions={<Badge tone={pending.length > 0 ? "warn" : "ok"}>{pending.length}</Badge>}
        />
        <TableWrap>
          <Table className="min-w-[64rem]">
            <THead>
              <TR>
                <TH width="18rem">Document</TH>
                <TH width="16rem">Enquiry</TH>
                <TH width="9rem">Department</TH>
                <TH width="5rem" align="center">
                  Version
                </TH>
                <TH>Note from the Estimator</TH>
                <TH width="9rem">Deadline</TH>
                <TH align="right" width="8rem" />
              </TR>
            </THead>
            <TBody>
              {pending.length === 0 ? (
                <TableEmptyRow colSpan={7}>
                  Nothing is waiting for this department.
                </TableEmptyRow>
              ) : null}

              {pending.map((item) => {
                const priorApproved = previousVersions(item.document).some((v) => v.reviewStatus === "APPROVED");
                return (
                  <TR key={item.document.id}>
                    <TD className="max-w-xs">
                      <span className="block text-xs font-medium text-ink-800">{item.document.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-2xs text-ink-400">
                        {item.version.fileName || "No file recorded"}
                      </span>
                      {item.document.isRequired ? (
                        <Badge tone="brand" className="mt-1">
                          Required
                        </Badge>
                      ) : (
                        <Badge tone="neutral" className="mt-1">
                          Optional
                        </Badge>
                      )}
                    </TD>
                    <TD className="max-w-xs">
                      <Link href={`/enquiries/${item.enquiry.id}?tab=package`} className="group block">
                        <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                          {item.enquiry.reference}
                        </span>
                        <span className="block truncate text-xs text-ink-700">{item.enquiry.projectTitle}</span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="block text-2xs text-ink-700">
                        {DEPARTMENT_LABELS[item.document.department]}
                      </span>
                      <span className="block text-2xs text-ink-500">{item.reviewer?.name}</span>
                    </TD>
                    <TD align="center">
                      <span className="numeric text-xs font-medium">v{item.version.versionNo}</span>
                      {priorApproved ? (
                        <span className="mt-0.5 block text-2xs leading-snug text-warn-700">
                          v{item.version.versionNo - 1} approved
                        </span>
                      ) : null}
                    </TD>
                    <TD className="max-w-sm">
                      <span className="text-2xs leading-relaxed text-ink-600">
                        {item.version.changeSummary ?? "—"}
                      </span>
                      <span className="mt-0.5 block text-2xs text-ink-400">
                        Submitted {formatDate(item.version.submittedAt)}
                      </span>
                    </TD>
                    <TD>
                      <DeadlineCell date={item.enquiry.submissionDeadline} />
                    </TD>
                    <TD align="right">
                      {canReview && actingUser.department === item.document.department ? (
                        <Button size="sm" variant="primary" onClick={() => setReviewDoc(item.document)}>
                          Review
                        </Button>
                      ) : (
                        <Link
                          href={`/enquiries/${item.enquiry.id}?tab=package`}
                          className="text-2xs font-medium text-brand-600 hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </Panel>

      <Panel>
        <PanelHeader
          title="Rejected — awaiting Estimator correction"
          description="The Estimator issues a new version, which returns to this department."
          actions={<Badge tone={rejected.length > 0 ? "bad" : "ok"}>{rejected.length}</Badge>}
        />
        {rejected.length === 0 ? (
          <EmptyState title="Nothing rejected" description="Rejected documents appear here until a new version is issued." />
        ) : (
          <TableWrap>
            <Table className="min-w-[56rem]">
              <THead>
                <TR>
                  <TH width="18rem">Document</TH>
                  <TH width="14rem">Enquiry</TH>
                  <TH width="5rem" align="center">
                    Version
                  </TH>
                  <TH>Reason and corrective instructions</TH>
                  <TH width="10rem">Rejected by</TH>
                </TR>
              </THead>
              <TBody>
                {rejected.map((item) => (
                  <TR key={item.document.id}>
                    <TD>
                      <span className="block text-xs font-medium text-ink-800">{item.document.name}</span>
                      <ReviewStatusBadge status="REJECTED" />
                    </TD>
                    <TD className="max-w-xs">
                      <Link href={`/enquiries/${item.enquiry.id}?tab=package`} className="group block">
                        <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                          {item.enquiry.reference}
                        </span>
                        <span className="block truncate text-xs text-ink-700">{item.enquiry.projectTitle}</span>
                      </Link>
                    </TD>
                    <TD align="center" className="numeric text-xs">
                      v{item.version.versionNo}
                    </TD>
                    <TD className="max-w-lg">
                      <span className="block text-2xs leading-relaxed text-bad-700">
                        <span className="font-semibold">Reason: </span>
                        {item.version.rejectionReason}
                      </span>
                      <span className="mt-1 block text-2xs leading-relaxed text-ink-600">
                        <span className="font-semibold text-ink-700">To fix: </span>
                        {item.version.correctiveInstructions}
                      </span>
                    </TD>
                    <TD>
                      <span className="block text-2xs text-ink-700">
                        {userById(db, item.version.reviewedById)?.name ?? "—"}
                      </span>
                      <span className="block text-2xs text-ink-500">{formatDate(item.version.reviewedAt)}</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <PolicyNote>
        A revised document returns to the same responsible department. Changing that routing is left to a future
        department-configuration module, which is out of scope for this phase.
      </PolicyNote>

      {refreshed ? (
        <ReviewDocumentDialog key={refreshed.id} doc={refreshed} onClose={() => setReviewDoc(null)} />
      ) : null}
    </div>
  );
}
