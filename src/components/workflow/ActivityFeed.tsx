"use client";

/**
 * Radwa Gulf and Co — activity / audit feed.
 *
 * Every consequential workflow action writes a record with actor, action,
 * timestamp and — where the rule requires one — the reason or corrective
 * instruction given. This component is the only renderer for that trail.
 */

import * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { ROLE_SHORT_LABELS } from "@/domain/enums";
import type { ActivityRecord } from "@/domain/types";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { useDb } from "@/store/useDemoStore";
import { userById } from "@/store/selectors";
import {
  Avatar,
  Badge,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "@/components/ui/primitives";

export function ActivityFeed({
  records,
  title = "Activity history",
  description = "Actor, action, timestamp and the reason recorded with it.",
  limit,
  showEnquiry,
  emptyHint,
}: {
  records: ActivityRecord[];
  title?: string;
  description?: string;
  limit?: number;
  showEnquiry?: boolean;
  emptyHint?: string;
}) {
  const db = useDb();
  const items = limit ? records.slice(0, limit) : records;

  return (
    <Panel>
      <PanelHeader
        icon={<History />}
        title={title}
        description={description}
        actions={<Badge tone="neutral">{records.length} record(s)</Badge>}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No activity recorded"
          description={emptyHint ?? "Workflow actions appear here as they happen."}
        />
      ) : (
        <PanelBody className="px-0 py-0">
          <ol className="divide-y divide-ink-100">
            {items.map((record) => {
              const actor = userById(db, record.actorId);
              const enquiry = showEnquiry
                ? db.enquiries.find((e) => e.id === record.enquiryId)
                : undefined;

              return (
                <li key={record.id} className="flex gap-3 px-4 py-2.5">
                  <Avatar initials={actor?.initials ?? "??"} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-xs font-semibold text-ink-800">{record.action}</span>
                      {enquiry ? (
                        <Link
                          href={`/enquiries/${enquiry.id}`}
                          className="numeric text-2xs font-medium text-brand-700 hover:underline"
                        >
                          {enquiry.reference}
                        </Link>
                      ) : null}
                      <span className="text-2xs text-ink-400" title={formatDateTime(record.at)}>
                        {timeAgo(record.at)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-2xs text-ink-500">
                      {actor?.name ?? "Unknown user"}
                      <span className="text-ink-400"> · {ROLE_SHORT_LABELS[record.actorRole] ?? record.actorRole}</span>
                    </p>

                    {record.detail ? (
                      <p className="mt-1 text-2xs leading-relaxed text-ink-600">{record.detail}</p>
                    ) : null}

                    {record.reason ? (
                      <p className="mt-1 rounded border border-ink-200 bg-ink-50 px-2 py-1 text-2xs leading-relaxed text-ink-600">
                        <span className="font-semibold text-ink-700">Reason: </span>
                        {record.reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </PanelBody>
      )}
    </Panel>
  );
}
