"use client";

/**
 * Radwa Gulf and Co — master/detail layout for the role work queues.
 *
 * Each queue screen lists the records waiting on the current role and renders
 * the same workflow panel the enquiry detail page uses, so an action behaves
 * identically wherever it is taken.
 */

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Inbox } from "lucide-react";

import type { Enquiry } from "@/domain/types";
import { cn } from "@/lib/utils";
import {
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  type BadgeTone,
} from "@/components/ui/primitives";
import { DeadlineCell } from "./StatusBadges";

export interface QueueEntry {
  id: string;
  enquiry: Enquiry;
  /** Short status line under the project title. */
  hint?: string;
  badge?: { text: string; tone?: BadgeTone };
}

export function QueueLayout({
  icon,
  title,
  description,
  entries,
  selectedId,
  onSelect,
  emptyTitle,
  emptyDescription,
  detailTab,
  children,
  footer,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  entries: QueueEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  /** Tab to deep-link to on the enquiry detail page. */
  detailTab?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <Panel className="xl:sticky xl:top-20 xl:self-start">
          <PanelHeader
            icon={icon}
            title={title}
            description={description}
            actions={<Badge tone={entries.length > 0 ? "warn" : "ok"}>{entries.length}</Badge>}
          />

          {entries.length === 0 ? (
            <EmptyState icon={<Inbox />} title={emptyTitle} description={emptyDescription} className="py-8" />
          ) : (
            <PanelBody className="px-0 py-0">
              <ul className="thin-scroll max-h-[32rem] divide-y divide-ink-100 overflow-y-auto xl:max-h-[40rem]">
                {entries.map((entry) => {
                  const selected = entry.id === selectedId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(entry.id)}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "block w-full border-l-2 px-3.5 py-2.5 text-left transition-colors",
                          selected
                            ? "border-brand-600 bg-brand-50"
                            : "border-transparent hover:border-ink-300 hover:bg-ink-50",
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="numeric text-2xs font-semibold text-brand-700">
                            {entry.enquiry.reference}
                          </span>
                          {entry.badge ? (
                            <Badge tone={entry.badge.tone ?? "neutral"}>{entry.badge.text}</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-ink-800">
                          {entry.enquiry.projectTitle}
                        </span>
                        {entry.hint ? (
                          <span className="mt-0.5 block text-2xs leading-relaxed text-ink-500">{entry.hint}</span>
                        ) : null}
                        <span className="mt-1 block">
                          <DeadlineCell date={entry.enquiry.submissionDeadline} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PanelBody>
          )}

          {footer}
        </Panel>

        <div className="min-w-0 space-y-4">
          {selectedId ? (
            <>
              <div className="flex justify-end">
                <Link
                  href={`/enquiries/${selectedId}${detailTab ? `?tab=${detailTab}` : ""}`}
                  className="inline-flex items-center gap-1.5 text-2xs font-medium text-brand-600 hover:underline"
                >
                  Open the full enquiry record
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              </div>
              {children}
            </>
          ) : (
            <EmptyState
              icon={<Inbox />}
              title={entries.length > 0 ? "Select a record" : emptyTitle}
              description={entries.length > 0 ? "Choose an enquiry from the queue to act on it." : emptyDescription}
              className="rounded-card border border-dashed border-ink-300 bg-white py-16"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps a valid queue entry selected as the queue changes.
 *
 * The selection is *derived* during render rather than synchronised in an
 * effect: if the chosen record leaves the queue — because the action that was
 * waiting on it has now been taken — the first remaining entry is used, with no
 * extra render pass and no flash of an empty detail pane.
 */
export function useQueueSelection(entries: QueueEntry[]): [string | undefined, (id: string) => void] {
  const [requestedId, setRequestedId] = React.useState<string | undefined>(undefined);

  const selectedId =
    requestedId && entries.some((entry) => entry.id === requestedId) ? requestedId : entries[0]?.id;

  return [selectedId, setRequestedId];
}
