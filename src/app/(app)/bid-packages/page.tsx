"use client";

/**
 * Bid package workspace queue.
 *
 * The badge on each entry is the live completeness count, so the effect of a
 * document being revised — which invalidates only that document's approval — is
 * visible immediately in the list.
 */

import * as React from "react";
import { FileCheck2 } from "lucide-react";

import { isTerminal } from "@/domain/rules";
import { useActingUser, useActiveRole, useDb } from "@/store/useDemoStore";
import { approvedEstimateFor, enquiryDetail, packageQueue } from "@/store/selectors";
import { describeScope } from "@/store/visibility";
import { Callout } from "@/components/ui/primitives";
import { BidPackagePanel } from "@/components/workflow/BidPackagePanels";
import { FinalApprovalPanel } from "@/components/workflow/FinalApprovalPanel";
import { QueueLayout, useQueueSelection, type QueueEntry } from "@/components/workflow/QueueLayout";

export default function BidPackagesPage() {
  const db = useDb();
  const role = useActiveRole();
  const actingUser = useActingUser();
  // Estimators only ever see their own packages (see store/visibility.ts), so there
  // is nothing left for a "mine only" toggle to narrow.
  const mineOnly = false;

  const entries: QueueEntry[] = React.useMemo(() => {
    const withPackages = packageQueue(db)
      .filter((item) => !mineOnly || item.enquiry.assignedEstimatorId === actingUser.id)
      .map((item) => ({
        id: item.enquiry.id,
        enquiry: item.enquiry,
        hint: item.stale
          ? "Documents changed after CRM verification — re-verification needed"
          : `${item.completeness.approvedCount}/${item.completeness.requiredCount} required documents approved`,
        badge: item.completeness.rejected.length
          ? { text: `${item.completeness.rejected.length} rejected`, tone: "bad" as const }
          : item.stale
            ? { text: "Stale", tone: "warn" as const }
            : item.completeness.complete
              ? { text: "Complete", tone: "ok" as const }
              : { text: `${item.completeness.pendingReview.length} in review`, tone: "warn" as const },
      }));

    // Estimates approved but no package assembled yet.
    const awaiting = db.enquiries
      .filter(
        (enquiry) =>
          !isTerminal(enquiry) &&
          approvedEstimateFor(db, enquiry.id) &&
          !db.bidPackages.some((pkg) => pkg.enquiryId === enquiry.id) &&
          (!mineOnly || enquiry.assignedEstimatorId === actingUser.id),
      )
      .map((enquiry) => ({
        id: enquiry.id,
        enquiry,
        hint: "Estimate approved — bid package not assembled yet",
        badge: { text: "Not started", tone: "accent" as const },
      }));

    return [...awaiting, ...withPackages];
  }, [db, mineOnly, actingUser.id]);

  const [selectedId, setSelectedId] = useQueueSelection(entries);
  const detail = selectedId ? enquiryDetail(db, selectedId) : undefined;

  const scopeNote = describeScope(role);

  return (
    <div className="space-y-4">
      {scopeNote ? <Callout tone="info">{scopeNote}</Callout> : null}

      <QueueLayout
        icon={<FileCheck2 />}
        title="Bid packages"
        description="Assembly, departmental review and completeness."
        entries={entries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        detailTab="package"
        emptyTitle="No bid packages"
        emptyDescription="A bid package is assembled once the estimate has been approved."
      >
        {detail ? (
          <>
            <BidPackagePanel detail={detail} />
            {detail.bidPackage?.documentsApprovedAt ? <FinalApprovalPanel detail={detail} /> : null}
          </>
        ) : null}
      </QueueLayout>
    </div>
  );
}
