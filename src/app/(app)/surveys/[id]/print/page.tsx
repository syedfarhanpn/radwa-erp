"use client";

/**
 * Printable site-survey checklist.
 *
 * The surveyor prints this, takes it to site, fills it in by hand, and brings
 * it back; the completed sheet is then attached when the report is submitted in
 * the app. The application chrome carries `no-print`, so printing this route
 * produces the checklist alone.
 *
 * Items already recorded in the app are printed with their findings, so a
 * partially completed survey can be taken back to site without losing work.
 * Anything still outstanding prints as blank ruled lines to write on.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { formatProjectTypes } from "@/domain/enums";
import type { SurveyChecklistItem } from "@/domain/types";
import { formatDate } from "@/lib/dates";
import { brand } from "@/lib/brand";
import { useDb } from "@/store/useDemoStore";
import { enquiryDetail } from "@/store/selectors";
import { Button, Callout } from "@/components/ui/primitives";

export default function SurveyChecklistPrintPage() {
  const params = useParams<{ id: string }>();
  const db = useDb();
  const detail = enquiryDetail(db, params.id);

  if (!detail || !detail.survey || detail.survey.status === "NOT_REQUIRED") {
    return (
      <Callout tone="bad" title="No survey checklist">
        This enquiry has no site survey, or the survey was marked as not required.{" "}
        <Link href="/surveys" className="font-medium underline">
          Back to site surveys
        </Link>
        .
      </Callout>
    );
  }

  const { enquiry, survey, checklistItems } = detail;

  // A plain computation, not a hook: it sits after the early return above, and
  // the React Compiler memoizes it without help.
  const groups = ((): Array<[string, SurveyChecklistItem[]]> => {
    const map = new Map<string, SurveyChecklistItem[]>();
    for (const item of checklistItems) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  })();

  let itemNumber = 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/enquiries/${enquiry.id}?tab=survey`}
          className="inline-flex items-center gap-1 text-2xs text-ink-500 hover:text-brand-600"
        >
          <ArrowLeft className="size-3" aria-hidden />
          Back to the survey
        </Link>
        <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
          Print checklist
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
            <h1 className="text-base font-bold tracking-wide text-ink-900 uppercase">Site Survey Checklist</h1>
            <p className="numeric mt-0.5 text-sm font-semibold text-ink-800">{enquiry.reference}</p>
            <p className="text-2xs text-ink-500">{checklistItems.length} items</p>
          </div>
        </header>


        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
          <Row label="Project" value={enquiry.projectTitle} />
          <Row label="Client" value={detail.client?.name ?? "—"} />
          <Row label="Location" value={enquiry.projectLocation} />
          <Row label="Discipline" value={formatProjectTypes(enquiry.projectTypes)} />
          <Row label="Surveyor" value={detail.surveyor?.name ?? "____________________"} />
          <Row
            label="Visit date"
            value={survey.scheduledDate ? formatDate(survey.scheduledDate) : "____________________"}
          />
          <Row label="MCP" value={detail.mcp?.name ?? "—"} />
          <Row label="Site contact" value={detail.contact?.name ?? "—"} />
        </section>

        {survey.requirementReason ? (
          <section className="mt-4 rounded border border-ink-300 px-3 py-2">
            <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">
              Why this survey was requested
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-800">{survey.requirementReason}</p>
          </section>
        ) : null}

        <p className="mt-5 text-2xs leading-relaxed text-ink-600">
          Mark each item <strong>Complete</strong> or <strong>Incomplete</strong>. Every item marked incomplete
          must carry a reason — the MCP reviews each one before the report can be accepted.
        </p>

        {groups.map(([group, items]) => (
          <section key={group} className="mt-5 break-inside-avoid">
            <h2 className="border-b border-ink-300 pb-1 text-xs font-bold tracking-wide text-ink-900 uppercase">
              {group}
            </h2>

            <ul>
              {items.map((item) => {
                itemNumber += 1;
                const recorded = item.status !== "PENDING";

                return (
                  <li key={item.id} className="break-inside-avoid border-b border-ink-200 py-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-xs font-medium text-ink-900">
                        <span className="numeric mr-1.5 text-ink-400">{itemNumber}.</span>
                        {item.title}
                      </p>
                      <span className="flex shrink-0 items-center gap-3 text-2xs text-ink-700">
                        <Tick label="Complete" checked={item.status === "COMPLETE"} />
                        <Tick label="Incomplete" checked={item.status === "INCOMPLETE"} />
                      </span>
                    </div>

                    {item.guidance ? (
                      <p className="mt-0.5 ml-5 text-2xs text-ink-500">{item.guidance}</p>
                    ) : null}

                    <div className="mt-1.5 ml-5">
                      <p className="text-2xs text-ink-500">Findings / observations</p>
                      {recorded && item.findings ? (
                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-800">{item.findings}</p>
                      ) : (
                        <WriteLines count={2} />
                      )}
                    </div>

                    <div className="mt-1.5 ml-5">
                      <p className="text-2xs text-ink-500">If incomplete — reason (required)</p>
                      {item.status === "INCOMPLETE" && item.incompleteReason ? (
                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-800">{item.incompleteReason}</p>
                      ) : (
                        <WriteLines count={1} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="mt-6 break-inside-avoid">
          <h2 className="border-b border-ink-300 pb-1 text-xs font-bold tracking-wide text-ink-900 uppercase">
            Overall remarks
          </h2>
          {survey.summary ? (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-800">{survey.summary}</p>
          ) : (
            <div className="mt-1.5">
              <WriteLines count={4} />
            </div>
          )}
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-2xs break-inside-avoid">
          <div>
            <div className="h-12 border-b border-ink-400" />
            <p className="mt-1 font-semibold text-ink-700">Surveyor</p>
            <p className="text-ink-600">{detail.surveyor?.name ?? ""}</p>
            <p className="text-ink-500">Date</p>
          </div>
          <div>
            <div className="h-12 border-b border-ink-400" />
            <p className="mt-1 font-semibold text-ink-700">Site representative</p>
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

/** Empty ruled lines to write on. */
function WriteLines({ count }: { count: number }) {
  return (
    <span className="mt-1 block space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="block border-b border-dotted border-ink-300" />
      ))}
    </span>
  );
}

function Tick({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="inline-flex size-3.5 items-center justify-center border border-ink-500 text-[9px] leading-none font-bold text-ink-900">
        {checked ? "X" : ""}
      </span>
      {label}
    </span>
  );
}
