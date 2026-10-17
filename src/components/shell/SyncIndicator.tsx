"use client";

/**
 * Sync state, in the topbar.
 *
 * Worth a permanent place rather than a toast: "is my work on the server yet"
 * is the question this component exists to answer, and the honest answer is
 * sometimes "no". A silent failure here means someone keeps working on a
 * device whose changes are going nowhere, which is exactly the problem the
 * shared workspace was added to solve.
 *
 * It also carries the one question the app cannot answer by itself — which
 * copy to keep when a device and the server both hold work that neither
 * derived from the other.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/client";
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
  const choice = useDemoStore((s) => s.syncChoice);
  const authSource = useDemoStore((s) => s.authSource);
  const retrySync = useDemoStore((s) => s.retrySync);
  const resolveSyncChoice = useDemoStore((s) => s.resolveSyncChoice);
  const signOut = useDemoStore((s) => s.signOut);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const { icon: Icon, label, className, spin } = PRESENTATION[status];

  // Sync needs a Supabase session. When the session came from a built-in
  // account there is nothing to retry — the password is not ours to re-send —
  // so the only useful action is to sign in again.
  const needsRealSignIn = isSupabaseConfigured && authSource !== "supabase";
  const canRetry = !needsRealSignIn && (status === "offline" || status === "blocked");

  const close = () => setOpen(false);

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
          choice ? "border-bad-400 bg-bad-50" : null,
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
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-80 rounded-card border border-ink-200 bg-white p-3 shadow-overlay">
            {choice ? (
              <WhichCopy
                local={choice.local}
                server={choice.server}
                onChoose={(keep) => {
                  close();
                  void resolveSyncChoice(keep);
                }}
              />
            ) : (
              <>
                <p className="text-xs font-semibold text-ink-900">{label}</p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-600">
                  {message ??
                    (status === "synced"
                      ? "Every change on this device is on the server. Other devices see them as they happen."
                      : "Saving your most recent changes.")}
                </p>

                {pendingChanges > 0 ? (
                  <p className="mt-2 text-2xs text-ink-500">
                    {pendingChanges} change{pendingChanges === 1 ? "" : "s"} waiting to upload. They are kept
                    on this device and retried — nothing is lost by leaving this page.
                  </p>
                ) : null}

                {needsRealSignIn ? (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      void signOut().then(() => router.replace("/login"));
                    }}
                    className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-control bg-brand-600 px-2.5 text-2xs font-medium text-white hover:bg-brand-700"
                  >
                    Sign in again to sync
                  </button>
                ) : canRetry ? (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      void retrySync();
                    }}
                    className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-control bg-brand-600 px-2.5 text-2xs font-medium text-white hover:bg-brand-700"
                  >
                    <RefreshCw className="size-3" aria-hidden />
                    Try again
                  </button>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The one decision the app refuses to make for you.
 *
 * Both options discard something. The counts are shown because "12 records"
 * versus "0 records" is usually all anyone needs to choose correctly, and
 * because a prompt that hides what is at stake is worse than no prompt.
 */
function WhichCopy({
  local,
  server,
  onChoose,
}: {
  local: { records: number; enquiries: number };
  server: { records: number; enquiries: number };
  onChoose: (keep: "local" | "server") => void;
}) {
  return (
    <>
      <p className="text-xs font-semibold text-ink-900">Two copies of the workspace</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-600">
        This device has work that was never shared, and the shared workspace has work of its own.
        Keeping one discards the other, so nothing has been changed yet.
      </p>

      <div className="mt-3 space-y-2">
        <Option
          title="Keep this device's copy"
          detail={`${local.enquiries} enquir${local.enquiries === 1 ? "y" : "ies"}, ${local.records} records — uploaded over the shared one`}
          onClick={() => onChoose("local")}
        />
        <Option
          title="Use the shared copy"
          detail={`${server.enquiries} enquir${server.enquiries === 1 ? "y" : "ies"}, ${server.records} records — this device's work is discarded`}
          onClick={() => onChoose("server")}
        />
      </div>
    </>
  );
}

function Option({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-control border border-ink-200 px-2.5 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
    >
      <span className="block text-2xs font-semibold text-ink-900">{title}</span>
      <span className="mt-0.5 block text-2xs text-ink-500">{detail}</span>
    </button>
  );
}
