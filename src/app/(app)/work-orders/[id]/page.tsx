"use client";

/** Single work order: review, edit while draft, finalize, then PO and handover. */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { useDb } from "@/store/useDemoStore";
import { enquiryDetail } from "@/store/selectors";
import { Callout } from "@/components/ui/primitives";
import {
  AwardPanel,
  HandoverPanel,
  PurchaseOrderPanel,
  WorkOrderPanel,
} from "@/components/workflow/AwardPanels";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();

  const workOrder = db.workOrders.find((wo) => wo.id === params.id);
  const detail = workOrder ? enquiryDetail(db, workOrder.enquiryId) : undefined;

  if (!workOrder || !detail) {
    return (
      <Callout tone="bad" title="Work order not found">
        This work order does not exist in the demo dataset. It may have been removed by a demo reset.{" "}
        <Link href="/work-orders" className="font-medium underline">
          Back to work orders
        </Link>
        .
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/work-orders"
        className="inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-brand-600"
      >
        <ArrowLeft className="size-3" aria-hidden />
        All work orders
      </Link>

      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink-900">
          <span className="numeric">{workOrder.number}</span>
          <span className="text-ink-300">—</span>
          <span>{detail.enquiry.projectTitle}</span>
        </h2>
        <p className="mt-0.5 text-2xs text-ink-500">
          <Link href={`/enquiries/${detail.enquiry.id}`} className="font-medium text-brand-700 hover:underline">
            {detail.enquiry.reference}
          </Link>{" "}
          · {detail.client?.name}
        </p>
      </div>

      <AwardPanel detail={detail} />
      <WorkOrderPanel detail={detail} />
      <PurchaseOrderPanel detail={detail} />
      <HandoverPanel detail={detail} />
    </div>
  );
}
