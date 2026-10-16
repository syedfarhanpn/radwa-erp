"use client";

/**
 * Sign-in screen.
 *
 * Deliberately outside the `(app)` route group, so it renders without the
 * sidebar and topbar. Signing in sets the session and sends you to the
 * dashboard for the account's role.
 *
 * The demo-account list underneath is the fast path: one click signs you in as
 * that person, which is what makes a multi-role walkthrough practical without
 * typing a password eighteen times.
 *
 * SECURITY NOTE: a demonstration sign-in, not authentication. Credentials are
 * fictional and checked in the browser. The production system must
 * authenticate server-side.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LogIn, ShieldAlert, UserRound } from "lucide-react";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/data/auth";
import { DEPARTMENT_LABELS, ROLE_LABELS, type DemoRole } from "@/domain/enums";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured, supabaseProjectRef } from "@/lib/supabase/client";
import { useDemoStore, useHydrated } from "@/store/useDemoStore";
import { Avatar, Badge, Button, Callout, Panel, Spinner } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";

/** Role display order on the account list — the workflow's own order. */
const ROLE_ORDER: DemoRole[] = [
  "CRM_MANAGER",
  "MD",
  "ESTIMATOR",
  "MCP",
  "SURVEYOR",
  "DEPARTMENT_REVIEWER",
];

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useDemoStore((s) => s.signedIn);
  const signIn = useDemoStore((s) => s.signIn);
  const signInAs = useDemoStore((s) => s.signInAs);
  const users = useDemoStore((s) => s.db.users);

  const restoreSession = useDemoStore((s) => s.restoreSession);

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  /** Which quick-pick account is signing in, so only that card shows a spinner. */
  const [quickPending, setQuickPending] = React.useState<string | null>(null);
  /** True while we ask Supabase whether there is already a session. */
  const [restoring, setRestoring] = React.useState(isSupabaseConfigured);

  // Already signed in (returning to /login by hand or by back button), or a
  // Supabase session is still live from a previous visit.
  React.useEffect(() => {
    if (!hydrated) return;

    if (signedIn) {
      router.replace("/dashboard");
      return;
    }

    // `restoring` already starts false when Supabase is absent, so there is
    // nothing to wait for and nothing to unset.
    if (!isSupabaseConfigured) return;

    let cancelled = false;
    void restoreSession().then((restored) => {
      if (cancelled) return;
      if (restored) router.replace("/dashboard");
      else setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, signedIn, restoreSession, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = await signIn(username, password);

    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }

    // Keep the button in its loading state through the route change, so the
    // form never flashes back to idle on the way out.
    router.replace("/dashboard");
  }

  async function quickSignIn(account: string) {
    if (quickPending || submitting) return;
    setQuickPending(account);
    setError(null);
    setNotice(
      isSupabaseConfigured
        ? "Signed in with a local demo account — this shortcut does not go through Supabase."
        : null,
    );

    const result = signInAs(account);
    if (result.ok) {
      router.replace("/dashboard");
      return;
    }
    setQuickPending(null);
  }

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    accounts: DEMO_ACCOUNTS.filter((a) => a.role === role).map((account) => ({
      ...account,
      user: users.find((u) => u.id === account.userId),
    })),
  })).filter((group) => group.accounts.length > 0);

  if (!hydrated || restoring) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand vector from /public */}
        <img
          src={brand.logo.src}
          alt={brand.logo.alt}
          width={brand.logo.width}
          height={brand.logo.height}
          className="h-10 w-auto opacity-90"
        />
        <p
          className="flex items-center gap-2 text-xs text-ink-500"
          role="status"
          aria-live="polite"
        >
          <Spinner className="text-brand-600" />
          {restoring ? "Checking for an existing session…" : "Loading…"}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-ink-100">
      <div className="no-print flex items-center justify-center gap-2 bg-ink-900 px-4 py-1 text-center text-2xs font-medium tracking-wide text-ink-100">
        <span className="inline-block size-1.5 rounded-full bg-warn-200" aria-hidden />
        DEMO MODE — Sample Data
        <span className="hidden text-ink-400 sm:inline">
          · Frontend demonstration build · No backend, authentication, email or AI service is connected
        </span>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:py-14">
        {/* --------------------------------------------------- sign-in form */}
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand vector from /public */}
          <img
            src={brand.logo.src}
            alt={brand.logo.alt}
            width={brand.logo.width}
            height={brand.logo.height}
            className="h-11 w-auto"
          />
          <p className="mt-2 text-xs text-ink-500">{brand.tagline}</p>

          <Panel className="mt-5">
            <form onSubmit={submit} className="space-y-3.5 p-4">
              <div>
                <h1 className="text-sm font-semibold text-ink-900">Sign in</h1>
                <p className="mt-0.5 text-2xs text-ink-500">
                  Use your account, or pick one from the list.
                </p>
              </div>

              {error ? (
                <Callout tone="bad" icon={<ShieldAlert />}>
                  {error}
                </Callout>
              ) : null}

              {notice ? <Callout tone="warn">{notice}</Callout> : null}

              <Field label="Username" htmlFor="username" required>
                <span className="relative block">
                  <UserRound
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-400"
                    aria-hidden
                  />
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    invalid={Boolean(error)}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. babukuttan"
                    disabled={submitting || Boolean(quickPending)}
                    className="pl-8"
                  />
                </span>
              </Field>

              <Field label="Password" htmlFor="password" required>
                <span className="relative block">
                  <KeyRound
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-400"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    disabled={submitting || Boolean(quickPending)}
                    value={password}
                    invalid={Boolean(error)}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError(null);
                    }}
                    className="pl-8"
                  />
                </span>
              </Field>

              <Button
                type="submit"
                variant="primary"
                icon={<LogIn />}
                className="w-full"
                loading={submitting}
                loadingLabel="Signing in…"
                disabled={Boolean(quickPending)}
              >
                Sign in
              </Button>

              <div className="space-y-1.5 border-t border-ink-200 pt-3">
                <p className="flex items-center gap-1.5 text-2xs text-ink-500">
                  <span
                    className={cn(
                      "inline-block size-1.5 rounded-full",
                      isSupabaseConfigured ? "bg-ok-600" : "bg-ink-400",
                    )}
                    aria-hidden
                  />
                  {isSupabaseConfigured ? (
                    <>
                      Authenticating against Supabase project{" "}
                      <span className="font-mono text-ink-600">{supabaseProjectRef()}</span>
                    </>
                  ) : (
                    "Supabase is not configured — using the built-in demo accounts."
                  )}
                </p>
                <p className="text-2xs leading-relaxed text-ink-500">
                  Demo password for every account:{" "}
                  <span className="rounded bg-ink-100 px-1 py-0.5 font-mono text-ink-700">{DEMO_PASSWORD}</span>
                </p>
              </div>
            </form>
          </Panel>

          <Callout tone="warn" icon={<ShieldAlert />} className="mt-4">
            {isSupabaseConfigured ? (
              <>
                <span className="font-semibold">Supabase authentication is live</span>, but these are
                demonstration accounts sharing one well-known password. Change every password before this
                project holds anything real, and note that authorization still has to be enforced server-side
                with row-level security.
              </>
            ) : (
              <>
                <span className="font-semibold">Demonstration sign-in.</span> Credentials are fictional and
                checked in the browser. The production system must authenticate server-side and enforce
                permissions on every request.
              </>
            )}
          </Callout>
        </div>

        {/* ------------------------------------------------- account picker */}
        <div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-ink-900">Demo accounts</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Click any person to sign in as them — no password needed. Each lands on their own dashboard.
              {isSupabaseConfigured ? " This shortcut signs in locally and skips Supabase." : ""}
            </p>
          </div>

          <div className="space-y-4">
            {grouped.map((group) => (
              <section key={group.role}>
                <p className="mb-1.5 text-2xs font-semibold tracking-wider text-ink-400 uppercase">
                  {ROLE_LABELS[group.role]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {group.accounts.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => void quickSignIn(account.username)}
                      disabled={submitting || Boolean(quickPending)}
                      aria-busy={quickPending === account.username || undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-card border border-ink-200 bg-white px-3 py-2.5 text-left",
                        "transition-colors hover:border-brand-400 hover:bg-brand-50",
                        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-ink-200 disabled:hover:bg-white",
                      )}
                    >
                      <Avatar initials={account.user?.initials ?? "??"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-ink-800">
                            {account.user?.name ?? account.username}
                          </span>
                          {account.user?.isMD ? <Badge tone="brand">MD</Badge> : null}
                        </span>
                        <span className="block truncate text-2xs text-ink-500">
                          {account.user?.department
                            ? DEPARTMENT_LABELS[account.user.department]
                            : (account.user?.jobTitle ?? "")}
                        </span>
                        <span className="block truncate font-mono text-2xs text-ink-400">
                          {account.username}
                        </span>
                      </span>
                      {quickPending === account.username ? (
                        <Spinner className="shrink-0 text-brand-600" />
                      ) : (
                        <ArrowRight
                          className="size-3.5 shrink-0 text-ink-300 transition-colors group-hover:text-brand-600"
                          aria-hidden
                        />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <footer className="px-4 pb-8 sm:px-6">
        <p className="mx-auto max-w-5xl text-2xs leading-relaxed text-ink-400">
          {brand.companyName} — frontend demonstration build. All clients, people, projects and values shown are
          fictional sample data. No backend, database, authentication, email delivery, document storage or AI
          service is connected.
        </p>
      </footer>
    </main>
  );
}
