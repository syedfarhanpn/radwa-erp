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
import { KeyRound, LogIn, ShieldAlert, UserRound } from "lucide-react";

import { brand } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useDemoStore, useHydrated } from "@/store/useDemoStore";
import { Button, Callout, Panel, Spinner } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";


export default function LoginPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useDemoStore((s) => s.signedIn);
  const signIn = useDemoStore((s) => s.signIn);

  const restoreSession = useDemoStore((s) => s.restoreSession);

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
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

      <div className="mx-auto w-full max-w-sm px-4 py-10 sm:px-6 lg:py-20">
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
                  Enter your username and password to continue.
                </p>
              </div>

              {error ? (
                <Callout tone="bad" icon={<ShieldAlert />}>
                  {error}
                </Callout>
              ) : null}

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
                    disabled={submitting}
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
                    disabled={submitting}
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
              >
                Sign in
              </Button>

            </form>
          </Panel>

        </div>

      </div>

    </main>
  );
}
