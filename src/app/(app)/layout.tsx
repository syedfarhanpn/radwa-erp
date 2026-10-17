"use client";

/**
 * Layout for every in-app route: toast provider, the persistent shell, and a
 * hydration gate.
 *
 * The gate matters for correctness, not just polish: demo state lives in
 * `localStorage`, which does not exist during the server render. Rendering the
 * same placeholder on the server and on the client's first paint avoids a
 * hydration mismatch, and real content appears once the persisted state has
 * been read.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { canAccessPath } from "@/components/shell/navigation";
import { Callout, SkeletonBlock } from "@/components/ui/primitives";
import { ToastProvider } from "@/components/ui/toast";
import { brand } from "@/lib/brand";
import { useDemoStore, useHydrated } from "@/store/useDemoStore";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const hydrated = useHydrated();
  const signedIn = useDemoStore((s) => s.signedIn);
  const authSource = useDemoStore((s) => s.authSource);
  const restoreSession = useDemoStore((s) => s.restoreSession);
  const signOut = useDemoStore((s) => s.signOut);
  const router = useRouter();
  const pathname = usePathname();
  const role = useDemoStore((s) => s.activeRole);

  // Only once the persisted session has been read — redirecting before that
  // would bounce a signed-in user out on every refresh.
  React.useEffect(() => {
    if (!hydrated) return;
    if (!signedIn) {
      router.replace("/login");
      return;
    }

    // The persisted flag says we were signed in; for a Supabase session that is
    // not proof it is still valid. Re-check with Supabase and sign out if the
    // session has expired or been revoked, rather than trusting local state.
    if (authSource === "supabase") {
      let cancelled = false;
      void restoreSession().then((stillValid) => {
        if (cancelled || stillValid) return;
        void signOut().then(() => router.replace("/login"));
      });
      return () => {
        cancelled = true;
      };
    }
  }, [hydrated, signedIn, authSource, restoreSession, signOut, router]);

  if (!hydrated || !signedIn) return <BootPlaceholder />;

  // Hiding a page from the sidebar is not enough — the URL still resolves.
  // Landing pages outside this role's remit are refused with an explanation.
  const allowed = canAccessPath(pathname, role);

  return (
    <ToastProvider>
      <AppShell>{allowed ? children : <NoAccessNotice />}</AppShell>
    </ToastProvider>
  );
}

function NoAccessNotice() {
  return (
    <Callout tone="warn" title="Not available for your role">
      This page is not part of your work. Use the navigation on the left for the screens assigned to you.
    </Callout>
  );
}

function BootPlaceholder() {
  return (
    <div className="min-h-dvh">
      <div className="h-6 bg-ink-900" />
      <div className="flex">
        <div className="hidden h-dvh w-(--app-sidebar-width) shrink-0 border-r border-ink-200 bg-white p-3 lg:block">
          <SkeletonBlock className="h-9 w-full" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-6 w-full" />
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="h-(--app-header-height) border-b border-ink-200 bg-white" />
          <div className="space-y-3 p-6">
            <SkeletonBlock className="h-5 w-56" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-20 w-full" />
              ))}
            </div>
            <SkeletonBlock className="h-64 w-full" />
            <p className="text-2xs text-ink-400">Loading {brand.companyName}…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
