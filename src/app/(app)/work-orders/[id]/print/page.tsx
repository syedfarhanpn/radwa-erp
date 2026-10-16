"use client";

/**
 * Print-friendly work order.
 *
 * The application chrome carries `no-print`, so printing this route produces
 * the document alone. It is a demo rendering, not a legally issued document.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { displayConfig } from "@/domain/config";
import { BID_SUBMISSION_TYPE_LABELS, formatProjectTypes, WORK_ORDER_STATUS_LABELS } from "@/domain/enums";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { brand } from "@/lib/brand";
import { useDb } from "@/store/useDemoStore";
import { boqLinesFor, enquiryDetail, totalsFor, userById } from "@/store/selectors";
import { Button, Callout } from "@/components/ui/primitives";

export default function WorkOrderPrintPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();

  const workOrder = db.workOrders.find((wo) => wo.id === params.id);
  const detail = workOrder ? enquiryDetail(db, workOrder.enquiryId) : undefined;

  if (!workOrder || !detail) {
    return (
      <Callout tone="bad" title="Work order not found">
        This work order does not exist in the demo dataset.{" "}
        <Link href="/work-orders" className="font-medium underline">
          Back to work orders
        </Link>
        .
      </Callout>
    );
  }

  const estimate = db.estimates.find((e) => e.id === workOrder.approvedEstimateId);
  const lines = estimate ? boqLinesFor(db, estimate.id) : [];
  const totals = estimate ? totalsFor(db, estimate) : undefined;
  const po = detail.purchaseOrder;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/work-orders/${workOrder.id}`}
          className="inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-brand-600"
        >
          <ArrowLeft className="size-3" aria-hidden />
          Back to the work order
        </Link>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <article className="rounded-card border border-ink-300 bg-white p-8 shadow-panel print-plain">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink-800 pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand vector from /public */}
            <img
              src={brand.logo.src}
              alt={brand.logo.alt}
              width={brand.logo.width}
              height={brand.logo.height}
              className="h-10 w-auto"
            />
            <p className="mt-1.5 text-2xs text-ink-500">{brand.documentSubtitle}</p>
          </div>
          <div className="text-right">
            <h1 className="text-base font-bold tracking-wide text-ink-900 uppercase">Work Order</h1>
            <p className="numeric mt-0.5 text-sm font-semibold text-ink-800">{workOrder.number}</p>
            <p className="text-2xs text-ink-500">
              Revision {workOrder.version} · {WORK_ORDER_STATUS_LABELS[workOrder.status]}
            </p>
          </div>
        </header>

        <p className="mt-3 rounded border border-warn-200 bg-warn-50 px-2.5 py-1.5 text-2xs text-warn-700">
          {displayConfig.demoBannerText} — illustrative document produced by a frontend demonstration build. Not a
          legally issued work order. The numbering convention shown is a sample and must be administrator
          configurable in production.
        </p>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
          <Row label="Client" value={detail.client?.name ?? "—"} />
          <Row label="Issued date" value={formatDate(workOrder.issuedDate)} />
          <Row label="Client contact" value={`${detail.contact?.name ?? "—"} — ${detail.contact?.jobTitle ?? ""}`} />
          <Row label="Enquiry reference" value={detail.enquiry.reference} />
          <Row label="Project" value={detail.enquiry.projectTitle} />
          <Row label="Project type" value={formatProjectTypes(detail.enquiry.projectTypes)} />
          <Row label="Location" value={detail.enquiry.projectLocation} />
          <Row label="Bid submitted by" value={BID_SUBMISSION_TYPE_LABELS[detail.enquiry.bidSubmissionType]} />
          <Row
            label="Approved quotation"
            value={estimate ? `Estimate revision ${estimate.version}` : "—"}
          />
          <Row label="BOQ reference" value={`${lines.length} priced line item(s)`} />
          <Row label="Award reference" value={detail.award?.clientReference ?? "—"} />
          <Row
            label="Purchase order"
            value={po ? `${po.poNumber} (${po.status}), dated ${formatDate(po.poDate)}` : "Not recorded"}
          />
          <Row label="Planned start" value={workOrder.plannedStartDate ? formatDate(workOrder.plannedStartDate) : "—"} />
          <Row
            label="Duration"
            value={workOrder.durationDays ? `${workOrder.durationDays} days` : "—"}
          />
        </section>

        <Block title="Awarded scope">{workOrder.awardedScope}</Block>
        <Block title="Commercial summary">{workOrder.commercialSummary}</Block>
        <Block title="Key terms">{workOrder.keyTerms || "—"}</Block>
        <Block title="Payment terms">{workOrder.paymentTerms || "—"}</Block>
        {workOrder.retentionPercent !== undefined ? (
          <Block title="Retention">{workOrder.retentionPercent}% of each certified amount</Block>
        ) : null}
        {estimate?.assumptions ? <Block title="Assumptions and exclusions">{estimate.assumptions}</Block> : null}
        {workOrder.notes ? <Block title="Notes">{workOrder.notes}</Block> : null}

        <section className="mt-6 border-t border-ink-300 pt-3">
          <table className="w-full text-xs">
            <tbody>
              {totals ? (
                <>
                  <TotalRow label="Priced line total" value={formatMoney(totals.lineTotal, workOrder.currency)} />
                  <TotalRow label="Overhead, profit and contingency" value={formatMoney(totals.overhead + totals.profit + totals.contingency, workOrder.currency)} />
                  <TotalRow label="Sub-total" value={formatMoney(totals.subTotal, workOrder.currency)} />
                  <TotalRow label={`VAT (${estimate?.vatPercent ?? 0}%)`} value={formatMoney(totals.vat, workOrder.currency)} />
                </>
              ) : null}
              <tr className="border-t-2 border-ink-800">
                <td className="py-2 text-sm font-bold text-ink-900">Contract value</td>
                <td className="numeric py-2 text-right text-sm font-bold text-ink-900">
                  {formatMoney(workOrder.contractValue, workOrder.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-2xs">
          <div>
            <div className="h-12 border-b border-ink-400" />
            <p className="mt-1 font-semibold text-ink-700">Prepared and finalized by</p>
            <p className="text-ink-600">
              {workOrder.finalizedById ? userById(db, workOrder.finalizedById)?.name : "Pending finalization"}
            </p>
            <p className="text-ink-500">{workOrder.finalizedAt ? formatDate(workOrder.finalizedAt) : ""}</p>
          </div>
          <div>
            <div className="h-12 border-b border-ink-400" />
            <p className="mt-1 font-semibold text-ink-700">Accepted for the client</p>
            <p className="text-ink-600">{detail.contact?.name ?? ""}</p>
            <p className="text-ink-500">Date</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-0.5 text-xs text-ink-800">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-ink-800">{children}</p>
    </section>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-ink-200">
      <td className="py-1.5 text-ink-600">{label}</td>
      <td className="numeric py-1.5 text-right text-ink-800">{value}</td>
    </tr>
  );
}
