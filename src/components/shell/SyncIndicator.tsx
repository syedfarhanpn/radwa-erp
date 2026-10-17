"use client";

/**
 * Sync state, in the topbar.
 *
 * Worth a permanent place rather than a toast: "is my work on the server yet"
 * is the question this component exists to answer, and the honest answer is
 * sometimes "no". A silent failure here means someone keeps working on a
 * device whose changes are going nowhere, which is exactly the problem the
 * shared workspace was added to solve.
 */

import * as React from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDemoStore, type SyncStatus } from "@/store/useDemoStore";

const PRESENTATION: Record<
  SyncStatus,
  { icon: typeof Cloud; label: string; className: string; spin?: boolean }
> = {
  synced: { icon: Cloud, label: "Synced", className: "text-good-600" },
  syncing: { icon: RefreshCw, label: "Saving…", className: "text-brand-600", spin: true },
  offline: { icon: CloudOff, label: "Not saved", className: "text-warn-600" },
  blocked: { icon: TriangleAlert, label: "Sync problem", className: "text-bad-600" },
  off: { icon: CloudOff, label: "This device only", className: "text-ink-400" },
};

export function SyncIndicator() {
  const status = useDemoStore((s) => s.syncStatus);
  const message = useDemoStore((s) => s.syncMessage);
  const pendingChanges = useDemoStore((s) => s.pendingChanges);
  const retrySync = useDemoStore((s) => s.retrySync);
  const [open, setOpen] = React.useState(false);

  const { icon: Icon, label, className, spin } = PRESENTATION[status];
  const canRetry = status === "offline" || status === "blocked";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Sync status: ${label}`}
        title={message ?? label}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-control border border-ink-200 px-2 text-2xs font-medium transition-colors hover:bg-ink-50",
          className,
        )}
      >
        <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        {pendingChanges > 0 && status !== "synced" ? (
          <span className="rounded-full bg-ink-900 px-1.5 text-2xs text-white">{pendingChanges}</span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-72 rounded-card border border-ink-200 bg-white p-3 shadow-overlay">
            <p className="text-xs font-semibold text-ink-900">{label}</p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-600">
              {message ??
                (status === "synced"
                  ? "Every change on this device is on the server. Other devices see them as they happen."
                  : "Saving your most recent changes.")}
            </p>

            {pendingChanges > 0 ? (
              <p className="mt-2 text-2xs text-ink-500">
                {pendingChanges} change{pendingChanges === 1 ? "" : "s"} waiting to upload. They are kept on
                this device and retried — nothing is lost by leaving this page.
              </p>
            ) : null}

            {canRetry ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void retrySync();
                }}
                className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-control bg-brand-600 px-2.5 text-2xs font-medium text-white hover:bg-brand-700"
              >
                <RefreshCw className="size-3" aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
