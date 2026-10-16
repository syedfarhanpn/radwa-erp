"use client";

/**
 * Radwa Gulf and Co — bid package assembly and departmental review.
 *
 * This screen carries the selective re-approval rule, which is modelled in
 * state rather than merely displayed:
 *
 *   - an approval belongs to one document *version*;
 *   - creating a new version leaves that document unapproved while every other
 *     document keeps its approval untouched;
 *   - a newly added required document must complete its own review;
 *   - the CRM "Documents Approved" verification stores a fingerprint of the
 *     approved versions, so any later change makes the verification stale and
 *     final approval closes again until CRM re-verifies.
 */

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FilePlus2,
  History,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import { BID_DOCUMENT_CATALOG } from "@/domain/config";
import { BID_DOC_CATEGORY_LABELS, DEPARTMENT_LABELS } from "@/domain/enums";
import {
  canMarkDocumentsApproved,
  currentVersion,
  finalBidApprovers,
  previousVersions,
} from "@/domain/rules";
import type { BidPackageDocument } from "@/domain/types";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useRepository } from "@/services/mock/mockRepository";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import type { EnquiryDetail } from "@/store/selectors";
import { userById } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  IconButton,
  KeyValue,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  ProgressBar,
} from "@/components/ui/primitives";
import { Checkbox, Field, FilePicker, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { PackageStatusBadge, ReviewStatusBadge } from "./StatusBadges";
import { BlockerList, DefinitionList, PolicyNote, RoleGate, useAction } from "./shared";

/* ============================================================ package ==== */

export function BidPackagePanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();

  const [addOpen, setAddOpen] = React.useState(false);
  const [detailDoc, setDetailDoc] = React.useState<BidPackageDocument | null>(null);

  const pkg = detail.bidPackage;

  if (!pkg) {
    return (
      <Panel>
        <PanelHeader icon={<FileCheck2 />} title="Bid package" />
        <EmptyState
          icon={<FileCheck2 />}
          title="No bid package yet"
          description={
            detail.approvedEstimate
              ? "The estimate is approved. The Estimator can now assemble the bid package."
              : "The bid package is assembled once the estimate has been approved."
          }
          action={
            role === "ESTIMATOR" && detail.approvedEstimate ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => repo.createBidPackage({ enquiryId: detail.enquiry.id }))}
              >
                Create bid package
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  }

  const completeness = detail.completeness!;
  const docs = detail.documents;
  const refreshed = detailDoc ? (docs.find((d) => d.id === detailDoc.id) ?? null) : null;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          icon={<FileCheck2 />}
          title="Bid package"
          description="Required documents must each hold current-version departmental approval."
          actions={
            <>
              <PackageStatusBadge status={pkg.status} />
              {role === "ESTIMATOR" ? (
                <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setAddOpen(true)}>
                  Add document
                </Button>
              ) : null}
            </>
          }
        />
        <PanelBody className="space-y-3">
          <DefinitionList cols={4}>
            <KeyValue label="Required documents">
              <span className="numeric">
                {completeness.approvedCount} of {completeness.requiredCount} approved
              </span>
              <ProgressBar
                className="mt-1.5"
                value={completeness.approvedCount}
                total={Math.max(1, completeness.requiredCount)}
                tone={completeness.complete ? "ok" : "brand"}
                label={`${completeness.approvedCount} of ${completeness.requiredCount} required documents approved`}
              />
            </KeyValue>
            <KeyValue label="Pending review">
              <span className="numeric">{completeness.pendingReview.length}</span>
            </KeyValue>
            <KeyValue label="Rejected">
              <span className={cn("numeric", completeness.rejected.length > 0 && "font-semibold text-bad-600")}>
                {completeness.rejected.length}
              </span>
            </KeyValue>
            <KeyValue label="Optional documents">
              <span className="numeric">{completeness.optionalDocs.length}</span>
            </KeyValue>
          </DefinitionList>

          {pkg.returnedReason ? (
            <Callout tone="bad" title="Returned for correction by management">
              {pkg.returnedReason}
            </Callout>
          ) : null}

          {detail.verificationStale ? (
            <Callout tone="warn" title="CRM verification is stale">
              A document has changed since the CRM Manager verified completeness on{" "}
              {formatDate(pkg.documentsApprovedAt)}. Approvals for unchanged documents remain valid; only the
              changed document needs a new departmental review. CRM must re-verify before final approval.
            </Callout>
          ) : null}
        </PanelBody>
      </Panel>

      <DocumentsTable detail={detail} onOpenDetail={setDetailDoc} />

      <CompletenessVerificationPanel detail={detail} />

      <AddDocumentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        packageId={pkg.id}
        existingNames={docs.map((d) => d.name)}
      />

      <DocumentDetailDialog doc={refreshed} onClose={() => setDetailDoc(null)} />
    </div>
  );
}

/* ================================================== documents table ===== */

function DocumentsTable({
  detail,
  onOpenDetail,
}: {
  detail: EnquiryDetail;
  onOpenDetail: (doc: BidPackageDocument) => void;
}) {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const actingUser = useActingUser();
  const { run, busy } = useAction();

  const [submitDoc, setSubmitDoc] = React.useState<BidPackageDocument | null>(null);
  const [versionDoc, setVersionDoc] = React.useState<BidPackageDocument | null>(null);
  const [reviewDoc, setReviewDoc] = React.useState<BidPackageDocument | null>(null);
  const [removeDoc, setRemoveDoc] = React.useState<BidPackageDocument | null>(null);

  const docs = detail.documents;

  return (
    <>
      <Panel>
        <PanelHeader
          icon={<ListChecks />}
          title="Documents"
          description="Each document is routed to the department responsible for reviewing it."
          actions={<Badge tone="neutral">{docs.length} document(s)</Badge>}
        />

        {docs.length === 0 ? (
          <EmptyState title="No documents in the package" description="Add the documents this client requires." />
        ) : (
          <TableWrap>
            <Table className="min-w-[68rem]">
              <THead>
                <TR>
                  <TH width="20rem">Document</TH>
                  <TH width="8rem">Category</TH>
                  <TH width="6rem" align="center">
                    Required
                  </TH>
                  <TH width="10rem">Department / reviewer</TH>
                  <TH width="5rem" align="center">
                    Version
                  </TH>
                  <TH width="8rem">Review status</TH>
                  <TH>Latest note</TH>
                  <TH width="14rem" align="right">
                    Actions
                  </TH>
                </TR>
              </THead>
              <TBody>
                {docs.map((doc) => {
                  const version = currentVersion(doc);
                  const status = version?.reviewStatus ?? "DRAFT";
                  const reviewer = userById(db, doc.assignedReviewerId);
                  const isMyDepartment =
                    role === "DEPARTMENT_REVIEWER" && actingUser.department === doc.department;
                  const priorApproved = previousVersions(doc).some((v) => v.reviewStatus === "APPROVED");

                  return (
                    <TR key={doc.id}>
                      <TD className="max-w-xs">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(doc)}
                          className="block text-left text-xs font-medium text-ink-800 hover:text-brand-700 hover:underline"
                        >
                          {doc.name}
                        </button>
                        {version?.fileName ? (
                          <span className="mt-0.5 block truncate font-mono text-2xs text-ink-400">
                            {version.fileName}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-2xs text-ink-400">No file recorded</span>
                        )}
                        {doc.addedAfterPackageApproval ? (
                          <Badge tone="accent" className="mt-1">
                            Added after verification
                          </Badge>
                        ) : null}
                      </TD>

                      <TD>
                        <span className="text-2xs text-ink-600">{BID_DOC_CATEGORY_LABELS[doc.category]}</span>
                      </TD>

                      <TD align="center">
                        {role === "ESTIMATOR" ? (
                          <input
                            type="checkbox"
                            checked={doc.isRequired}
                            aria-label={`${doc.name} is required`}
                            disabled={busy}
                            onChange={(event) =>
                              void run(() =>
                                repo.setDocumentRequirement({
                                  documentId: doc.id,
                                  isRequired: event.target.checked,
                                }),
                              )
                            }
                            className="size-4 cursor-pointer accent-brand-600"
                          />
                        ) : doc.isRequired ? (
                          <Badge tone="brand">Required</Badge>
                        ) : (
                          <span className="text-2xs text-ink-400">Optional</span>
                        )}
                      </TD>

                      <TD>
                        <span className="block text-2xs font-medium text-ink-700">
                          {DEPARTMENT_LABELS[doc.department]}
                        </span>
                        <span className="block text-2xs text-ink-500">{reviewer?.name}</span>
                      </TD>

                      <TD align="center">
                        <span className="numeric text-xs font-medium text-ink-800">v{doc.currentVersionNo}</span>
                        {doc.versions.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => onOpenDetail(doc)}
                            className="mt-0.5 block w-full text-2xs text-brand-600 hover:underline"
                          >
                            {doc.versions.length} versions
                          </button>
                        ) : null}
                      </TD>

                      <TD>
                        <ReviewStatusBadge status={status} />
                        {priorApproved && status !== "APPROVED" ? (
                          <span className="mt-1 block text-2xs leading-snug text-warn-700">
                            v{doc.currentVersionNo - 1} was approved — this version needs its own review
                          </span>
                        ) : null}
                      </TD>

                      <TD className="max-w-xs">
                        {status === "REJECTED" && version?.rejectionReason ? (
                          <span className="block text-2xs leading-relaxed text-bad-700">
                            <span className="font-semibold">Rejected: </span>
                            {version.rejectionReason}
                          </span>
                        ) : version?.changeSummary ? (
                          <span className="block text-2xs leading-relaxed text-ink-600">
                            {version.changeSummary}
                          </span>
                        ) : (
                          <span className="text-2xs text-ink-300">—</span>
                        )}
                        {version?.reviewedAt ? (
                          <span className="mt-0.5 block text-2xs text-ink-400">
                            {status === "APPROVED" ? "Approved" : "Reviewed"} {formatDate(version.reviewedAt)} by{" "}
                            {userById(db, version.reviewedById)?.name}
                          </span>
                        ) : null}
                      </TD>

                      <TD align="right">
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          {role === "ESTIMATOR" && status === "DRAFT" ? (
                            <Button size="sm" variant="primary" icon={<Upload />} onClick={() => setSubmitDoc(doc)}>
                              Submit
                            </Button>
                          ) : null}

                          {role === "ESTIMATOR" && (status === "REJECTED" || status === "APPROVED") ? (
                            <Button
                              size="sm"
                              variant={status === "REJECTED" ? "primary" : "secondary"}
                              icon={<FilePlus2 />}
                              onClick={() => setVersionDoc(doc)}
                            >
                              New version
                            </Button>
                          ) : null}

                          {isMyDepartment && status === "PENDING_REVIEW" ? (
                            <Button size="sm" variant="primary" onClick={() => setReviewDoc(doc)}>
                              Review
                            </Button>
                          ) : null}

                          <Button size="sm" variant="ghost" icon={<History />} onClick={() => onOpenDetail(doc)}>
                            History
                          </Button>

                          {role === "ESTIMATOR" && !doc.versions.some((v) => v.reviewStatus === "APPROVED") ? (
                            <IconButton label={`Remove ${doc.name}`} onClick={() => setRemoveDoc(doc)}>
                              <Trash2 className="text-bad-600" />
                            </IconButton>
                          ) : null}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}

        <PanelFooter>
          <PolicyNote>
            Approvals are version-bound. Creating a new version of one document never invalidates the approvals
            of the others.
          </PolicyNote>
        </PanelFooter>
      </Panel>

      {submitDoc ? (
        <SubmitVersionDialog key={submitDoc.id} doc={submitDoc} onClose={() => setSubmitDoc(null)} />
      ) : null}
      {versionDoc ? (
        <NewVersionDialog key={versionDoc.id} doc={versionDoc} onClose={() => setVersionDoc(null)} />
      ) : null}
      {reviewDoc ? (
        <ReviewDocumentDialog key={reviewDoc.id} doc={reviewDoc} onClose={() => setReviewDoc(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(removeDoc)}
        onClose={() => setRemoveDoc(null)}
        onConfirm={() => {
          if (removeDoc) void run(() => repo.removeBidDocument({ documentId: removeDoc.id }));
          setRemoveDoc(null);
        }}
        title="Remove document from package?"
        confirmLabel="Remove document"
        tone="danger"
        body={<>“{removeDoc?.name}” will be removed from the bid package. Documents with an approved version cannot be removed.</>}
      />
    </>
  );
}

/* ============================================= estimator: submit draft === */

/**
 * Mounted with a `key` of the document id by the caller, so each document gets
 * its own fresh form state instead of an effect copying props into state.
 */
function SubmitVersionDialog({ doc, onClose }: { doc: BidPackageDocument; onClose: () => void }) {
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const initial = currentVersion(doc);
  const [fileName, setFileName] = React.useState(initial?.fileName ?? "");
  const [fileSizeLabel, setFileSizeLabel] = React.useState(
    initial?.fileSizeLabel === "—" ? "" : (initial?.fileSizeLabel ?? ""),
  );
  const [changeSummary, setChangeSummary] = React.useState(initial?.changeSummary ?? "");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Submit “${doc.name}” for review`}
      description={`Routed to ${DEPARTMENT_LABELS[doc.department]} for departmental approval.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  repo.submitDocumentForReview({
                    documentId: doc.id,
                    fileName,
                    fileSizeLabel,
                    changeSummary,
                  }),
                { onSuccess: onClose },
              )
            }
          >
            Submit for review
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="File name" htmlFor="doc-file" required error={errors.fileName}>
          <Input
            id="doc-file"
            value={fileName}
            invalid={Boolean(errors.fileName)}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="technical_proposal_rev1.pdf"
          />
        </Field>

        <FilePicker
          id="doc-file-picker"
          label="Or select a file to fill the name and size"
          onPick={({ fileName: name, fileSizeLabel: size }) => {
            setFileName(name);
            setFileSizeLabel(size);
          }}
        />

        <Field label="Note for the reviewer" htmlFor="doc-summary">
          <Textarea
            id="doc-summary"
            rows={2}
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            placeholder="What should the reviewer look at?"
          />
        </Field>
      </div>
    </Dialog>
  );
}

/* ====================================== estimator: create a new version == */

function NewVersionDialog({ doc, onClose }: { doc: BidPackageDocument; onClose: () => void }) {
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const [fileName, setFileName] = React.useState("");
  const [fileSizeLabel, setFileSizeLabel] = React.useState("");
  const [changeSummary, setChangeSummary] = React.useState("");

  const version = currentVersion(doc);
  const nextVersion = doc.currentVersionNo + 1;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Create version ${nextVersion} of “${doc.name}”`}
      description="The previous version and its approval are preserved in the history."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  repo.createDocumentVersion({
                    documentId: doc.id,
                    fileName,
                    fileSizeLabel,
                    changeSummary,
                    submitNow: true,
                  }),
                { onSuccess: onClose },
              )
            }
          >
            Create and resubmit
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {version?.reviewStatus === "REJECTED" ? (
          <Callout tone="bad" title="Corrective instructions from the reviewer">
            <p className="mt-0.5">
              <span className="font-semibold">Reason: </span>
              {version.rejectionReason}
            </p>
            <p className="mt-1">
              <span className="font-semibold">To fix: </span>
              {version.correctiveInstructions}
            </p>
          </Callout>
        ) : (
          <Callout tone="warn" title="This will invalidate the current approval for this document only">
            v{doc.currentVersionNo} is approved. Version {nextVersion} starts unapproved and returns to{" "}
            {DEPARTMENT_LABELS[doc.department]} for review. Every other document in the package keeps its
            approval.
          </Callout>
        )}

        <Field label="File name" htmlFor="new-version-file" required error={errors.fileName}>
          <Input
            id="new-version-file"
            value={fileName}
            invalid={Boolean(errors.fileName)}
            onChange={(event) => setFileName(event.target.value)}
            placeholder={`${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_rev${nextVersion}.pdf`}
          />
        </Field>

        <FilePicker
          id="new-version-picker"
          label="Or select a file to fill the name and size"
          onPick={({ fileName: name, fileSizeLabel: size }) => {
            setFileName(name);
            setFileSizeLabel(size);
          }}
        />

        <Field
          label="What changed in this version?"
          htmlFor="new-version-summary"
          required
          error={errors.changeSummary}
          hint="The reviewer sees this when the version arrives in their queue."
        >
          <Textarea
            id="new-version-summary"
            rows={3}
            value={changeSummary}
            invalid={Boolean(errors.changeSummary)}
            onChange={(event) => setChangeSummary(event.target.value)}
            placeholder="e.g. Added the SIMOPS section and attached the revised lifting plan."
          />
        </Field>
      </div>
    </Dialog>
  );
}

/* ================================== reviewer: approve / reject a version = */

/**
 * Review one document version. Callers mount it with `key={doc.id}` so the
 * reject form never carries text over from a different document.
 */
export function ReviewDocumentDialog({
  doc,
  onClose,
}: {
  doc: BidPackageDocument;
  onClose: () => void;
}) {
  const db = useDb();
  const repo = useRepository();
  const { run, busy, errors } = useAction();
  const [mode, setMode] = React.useState<"none" | "reject">("none");
  const [reason, setReason] = React.useState("");
  const [corrective, setCorrective] = React.useState("");

  const version = currentVersion(doc);
  if (!version) return null;
  const enquiry = db.enquiries.find((e) => e.id === doc.enquiryId);
  const history = previousVersions(doc);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Review “${doc.name}” v${version.versionNo}`}
      description={`${enquiry?.reference} — ${DEPARTMENT_LABELS[doc.department]} review`}
      footer={
        mode === "reject" ? (
          <>
            <Button variant="secondary" onClick={() => setMode("none")}>
              Back
            </Button>
            <Button
              variant="danger"
              icon={<XCircle />}
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    repo.reviewDocument({
                      documentId: doc.id,
                      decision: "REJECTED",
                      reason,
                      correctiveInstructions: corrective,
                    }),
                  { onSuccess: onClose },
                )
              }
            >
              Confirm rejection
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="danger" icon={<XCircle />} onClick={() => setMode("reject")}>
              Reject
            </Button>
            <Button
              variant="success"
              icon={<CheckCircle2 />}
              disabled={busy}
              onClick={() =>
                void run(() => repo.reviewDocument({ documentId: doc.id, decision: "APPROVED" }), {
                  onSuccess: onClose,
                })
              }
            >
              Approve v{version.versionNo}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <DefinitionList cols={3}>
          <KeyValue label="File">
            <span className="font-mono text-2xs break-all">{version.fileName || "—"}</span>
            <span className="mt-0.5 block text-2xs text-ink-500">{version.fileSizeLabel}</span>
          </KeyValue>
          <KeyValue label="Submitted">{formatDateTime(version.submittedAt)}</KeyValue>
          <KeyValue label="Prepared by">{userById(db, version.createdById)?.name ?? "—"}</KeyValue>
        </DefinitionList>

        {version.changeSummary ? (
          <Callout tone="info" title="Note from the Estimator">
            {version.changeSummary}
          </Callout>
        ) : null}

        {history.length > 0 ? (
          <div>
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-500 uppercase">
              Earlier versions
            </p>
            <VersionHistoryList doc={doc} />
          </div>
        ) : null}

        {mode === "reject" ? (
          <div className="space-y-3 rounded-control border border-bad-200 bg-bad-50/50 p-3">
            <p className="text-xs font-semibold text-bad-700">
              A rejection requires both a reason and corrective instructions.
            </p>
            <Field label="Rejection reason" htmlFor="reject-reason" required error={errors.reason}>
              <Textarea
                id="reject-reason"
                rows={3}
                value={reason}
                invalid={Boolean(errors.reason)}
                onChange={(event) => setReason(event.target.value)}
                placeholder="What is wrong with this version?"
              />
            </Field>
            <Field
              label="Corrective instructions"
              htmlFor="reject-corrective"
              required
              error={errors.correctiveInstructions}
              hint="Tell the Estimator exactly what has to change."
            >
              <Textarea
                id="reject-corrective"
                rows={3}
                value={corrective}
                invalid={Boolean(errors.correctiveInstructions)}
                onChange={(event) => setCorrective(event.target.value)}
                placeholder="What must be added, changed or attached?"
              />
            </Field>
          </div>
        ) : (
          <Callout tone="neutral">
            Approving records the approval against{" "}
            <span className="font-semibold">version {version.versionNo} only</span>. If the Estimator issues a
            later version, that version needs its own review.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

/* ================================================ document detail view == */

function DocumentDetailDialog({ doc, onClose }: { doc: BidPackageDocument | null; onClose: () => void }) {
  const db = useDb();
  if (!doc) return null;
  const version = currentVersion(doc);
  const reviewer = userById(db, doc.assignedReviewerId);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={doc.name}
      description={`${BID_DOC_CATEGORY_LABELS[doc.category]} · ${DEPARTMENT_LABELS[doc.department]} · ${
        doc.isRequired ? "Required" : "Optional"
      }`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <DefinitionList cols={3}>
          <KeyValue label="Current version">
            <span className="numeric">v{doc.currentVersionNo}</span>
          </KeyValue>
          <KeyValue label="Review status">
            <ReviewStatusBadge status={version?.reviewStatus ?? "DRAFT"} />
          </KeyValue>
          <KeyValue label="Assigned reviewer">{reviewer?.name ?? "—"}</KeyValue>
        </DefinitionList>

        {version?.reviewStatus === "REJECTED" ? (
          <Callout tone="bad" title="Rejection">
            <p>
              <span className="font-semibold">Reason: </span>
              {version.rejectionReason}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Corrective instructions: </span>
              {version.correctiveInstructions}
            </p>
          </Callout>
        ) : null}

        <div>
          <p className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-500 uppercase">Version history</p>
          <VersionHistoryList doc={doc} includeCurrent />
        </div>
      </div>
    </Dialog>
  );
}

function VersionHistoryList({ doc, includeCurrent }: { doc: BidPackageDocument; includeCurrent?: boolean }) {
  const db = useDb();
  const versions = [...doc.versions]
    .filter((v) => includeCurrent || v.versionNo !== doc.currentVersionNo)
    .sort((a, b) => b.versionNo - a.versionNo);

  return (
    <ul className="space-y-1.5">
      {versions.map((version) => (
        <li
          key={version.id}
          className={cn(
            "rounded border px-2.5 py-2 text-2xs",
            version.versionNo === doc.currentVersionNo ? "border-brand-200 bg-brand-50/50" : "border-ink-200 bg-white",
          )}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="numeric font-semibold text-ink-800">v{version.versionNo}</span>
            <ReviewStatusBadge status={version.reviewStatus} />
            {version.versionNo === doc.currentVersionNo ? <Badge tone="brand">Current</Badge> : null}
            <span className="text-ink-500">
              {formatDate(version.createdAt)} · {userById(db, version.createdById)?.name}
            </span>
            {version.fileName ? (
              <span className="font-mono text-ink-400">{version.fileName}</span>
            ) : null}
          </span>
          {version.changeSummary ? (
            <span className="mt-1 block leading-relaxed text-ink-600">{version.changeSummary}</span>
          ) : null}
          {version.reviewStatus === "APPROVED" && version.reviewedAt ? (
            <span className="mt-1 block text-ok-700">
              Approved {formatDate(version.reviewedAt)} by {userById(db, version.reviewedById)?.name}
              {version.versionNo !== doc.currentVersionNo
                ? " — this approval applies to this version only"
                : ""}
            </span>
          ) : null}
          {version.reviewStatus === "REJECTED" ? (
            <span className="mt-1 block text-bad-700">
              <span className="font-semibold">Rejected: </span>
              {version.rejectionReason}
              {version.correctiveInstructions ? (
                <>
                  <br />
                  <span className="font-semibold">To fix: </span>
                  {version.correctiveInstructions}
                </>
              ) : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ======================================= estimator: add a document ====== */

function AddDocumentDialog({
  open,
  onClose,
  packageId,
  existingNames,
}: {
  open: boolean;
  onClose: () => void;
  packageId: string;
  existingNames: string[];
}) {
  const repo = useRepository();
  const { run, busy } = useAction();
  const [catalogKey, setCatalogKey] = React.useState(BID_DOCUMENT_CATALOG[0].key);
  const [customName, setCustomName] = React.useState("");
  /** `null` means "follow the catalog default for the chosen document type". */
  const [requiredOverride, setRequiredOverride] = React.useState<boolean | null>(null);

  const entry = BID_DOCUMENT_CATALOG.find((c) => c.key === catalogKey);
  const isRequired = requiredOverride ?? entry?.defaultRequired ?? true;

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a document to the bid package"
      description="Not every document is mandatory for every project — choose whether this one is required for this client."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  repo.addBidDocument({
                    packageId,
                    catalogKey,
                    isRequired,
                    customName: customName.trim() || undefined,
                  }),
                { onSuccess: onClose },
              )
            }
          >
            Add document
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Document type" htmlFor="catalog-key" required>
          <Select id="catalog-key" value={catalogKey} onChange={(event) => {
              setCatalogKey(event.target.value);
              setRequiredOverride(null);
              setCustomName("");
            }}>
            {BID_DOCUMENT_CATALOG.map((item) => (
              <option key={item.key} value={item.key} disabled={existingNames.includes(item.name)}>
                {item.name}
                {existingNames.includes(item.name) ? " — already in package" : ""}
              </option>
            ))}
          </Select>
        </Field>

        {entry ? (
          <Callout tone="neutral">
            Reviewed by <span className="font-semibold">{DEPARTMENT_LABELS[entry.department]}</span>. Category:{" "}
            {BID_DOC_CATEGORY_LABELS[entry.category]}.
          </Callout>
        ) : null}

        {catalogKey === "CLIENT_SPECIFIC" ? (
          <Field
            label="Document name"
            htmlFor="custom-name"
            hint="Use the client's own title for the document."
          >
            <Input
              id="custom-name"
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="e.g. Local Content Declaration"
            />
          </Field>
        ) : null}

        <Checkbox
          id="doc-required"
          label="Required for this bid"
          description="Required documents must be approved before CRM can verify package completeness."
          checked={isRequired}
          onChange={setRequiredOverride}
        />
      </div>
    </Dialog>
  );
}

/* ====================================== CRM: verify completeness ======== */

export function CompletenessVerificationPanel({ detail }: { detail: EnquiryDetail }) {
  const repo = useRepository();
  const db = useDb();
  const { run, busy } = useAction();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const pkg = detail.bidPackage;
  if (!pkg) return null;

  const gate = canMarkDocumentsApproved(pkg, detail.documents);
  const completeness = gate.completeness;
  const verified = Boolean(pkg.documentsApprovedAt) && !detail.verificationStale;

  return (
    <Panel>
      <PanelHeader
        icon={<ShieldCheck />}
        title="Document completeness verification"
        description="The CRM Manager confirms every required document holds current-version departmental approval before final bid approval opens."
        actions={
          verified ? (
            <Badge tone="ok" dot>
              Documents Approved
            </Badge>
          ) : detail.verificationStale ? (
            <Badge tone="warn" dot>
              Re-verification required
            </Badge>
          ) : (
            <Badge tone="neutral">Not verified</Badge>
          )
        }
      />

      <PanelBody className="space-y-3">
        <ul className="space-y-1">
          {completeness.requiredDocs.map((doc) => {
            const version = currentVersion(doc);
            const approved = version?.reviewStatus === "APPROVED";
            return (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded border border-ink-200 bg-white px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {approved ? (
                    <CheckCircle2 className="size-4 shrink-0 text-ok-600" aria-hidden />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-warn-600" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink-800">{doc.name}</span>
                    <span className="block text-2xs text-ink-500">
                      {DEPARTMENT_LABELS[doc.department]} · v{doc.currentVersionNo}
                    </span>
                  </span>
                </span>
                <ReviewStatusBadge status={version?.reviewStatus ?? "DRAFT"} />
              </li>
            );
          })}
          {completeness.requiredDocs.length === 0 ? (
            <li className="rounded border border-dashed border-ink-300 px-3 py-4 text-center text-xs text-ink-500">
              No documents are marked required for this bid yet.
            </li>
          ) : null}
        </ul>

        {verified ? (
          <Callout tone="ok" title="Verified">
            Verified by {userById(db, pkg.documentsApprovedById)?.name} on {formatDateTime(pkg.documentsApprovedAt)}.
            Final bid approval is open for the Management Team.
          </Callout>
        ) : (
          <BlockerList items={gate.blockers} title="Cannot verify yet" />
        )}

        <RoleGate allow={["CRM_MANAGER"]} what="Completeness verification" fallback={null}>
          <Button
            variant="primary"
            icon={<ShieldCheck />}
            disabled={busy || !gate.allowed}
            onClick={() => setConfirmOpen(true)}
          >
            {detail.verificationStale ? "Re-verify and mark Documents Approved" : "Mark Documents Approved"}
          </Button>
        </RoleGate>

        <PolicyNote>
          Verification is recorded against the exact approved versions. If any required document changes
          afterwards, this verification becomes stale and final approval closes until CRM verifies again — but
          approvals for unchanged documents stay valid.
        </PolicyNote>
      </PanelBody>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          void run(() => repo.markDocumentsApproved({ packageId: pkg.id }), {
            onSuccess: () => setConfirmOpen(false),
          })
        }
        title="Mark package as Documents Approved?"
        confirmLabel="Confirm verification"
        busy={busy}
        body={
          <>
            All {completeness.requiredCount} required documents hold current-version departmental approval. This
            opens a fresh final-approval round for{" "}
            <span className="font-semibold">
              {finalBidApprovers(db.users, detail.enquiry)
                .map((approver) => approver.name)
                .join(" and ") || "the Management Team"}
            </span>
            . Any management votes from an earlier round are not reused.
          </>
        }
      />
    </Panel>
  );
}
