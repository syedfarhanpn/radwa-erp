"use client";

/**
 * Supabase-backed sign-in.
 *
 * A signed-in user is resolved to an application identity in two steps:
 *
 *   1. `auth.signInWithPassword` establishes the Supabase session;
 *   2. the `profiles` row for that auth user supplies the role and which person
 *      in the directory they are.
 *
 * The role lives in the database, not in the token claims the client could
 * edit, and `profiles` is protected by row-level security — see
 * `supabase/migrations/0001_auth_profiles.sql`.
 *
 * If Supabase is not configured or unreachable, callers fall back to the local
 * demo accounts. That keeps a demo running offline rather than failing closed
 * on a screen nobody can get past.
 */

import type { DemoRole } from "@/domain/enums";
import type { Id } from "@/domain/types";
import { getSupabase, isSupabaseConfigured } from "./client";

export interface SupabaseProfile {
  /** Supabase auth user id (uuid). */
  authUserId: string;
  /** Matches a `User.id` in the application directory. */
  directoryUserId: Id;
  role: DemoRole;
  fullName: string;
  username: string;
}

export type SignInOutcome =
  | { ok: true; profile: SupabaseProfile }
  | { ok: false; message: string; unavailable?: boolean };

/** Supabase stores usernames, not emails, for these demo accounts. */
function usernameToEmail(username: string): string {
  const trimmed = username.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@radwa.example`;
}

async function loadProfile(authUserId: string): Promise<SupabaseProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, directory_user_id, role, full_name, username")
    .eq("id", authUserId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    authUserId: data.id as string,
    directoryUserId: data.directory_user_id as Id,
    role: data.role as DemoRole,
    fullName: data.full_name as string,
    username: data.username as string,
  };
}

export async function signInWithSupabase(username: string, password: string): Promise<SignInOutcome> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured.", unavailable: true };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    // A network or project-paused failure is different from bad credentials:
    // the first should fall back to the local accounts, the second should not.
    const unavailable =
      error.status === undefined || error.status === 0 || error.status >= 500 || error.name === "AuthRetryableFetchError";

    if (!unavailable) {
      return { ok: false, message: "That username and password do not match an account." };
    }

    // A 500 from the auth service is not "offline" and must not be reported as
    // one. The usual cause is an unreadable row in `auth.users` — seeding it
    // from SQL leaves token columns NULL, which GoTrue cannot scan, and every
    // sign-in in the project then fails with "Database error querying schema".
    // Saying so here is the difference between a one-line fix and an afternoon
    // spent suspecting the password.
    const schemaFault = /querying schema|unexpected_failure/i.test(error.message);
    return {
      ok: false,
      unavailable: true,
      message: schemaFault
        ? "Supabase auth returned a server error (\"Database error querying schema\"). Run supabase/migrations/0003_repair_auth_tokens.sql — seeded accounts left NULL token columns that break sign-in for the whole project."
        : `Could not reach Supabase (${error.status ?? "network error"}).`,
    };
  }

  const profile = data.user ? await loadProfile(data.user.id) : null;
  if (!profile) {
    await supabase.auth.signOut();
    return {
      ok: false,
      message:
        "Signed in, but this account has no profile row. Run the migration in supabase/migrations to create it.",
    };
  }

  return { ok: true, profile };
}

/** Restore a session on page load. Returns null when there is none. */
export async function restoreSupabaseSession(): Promise<SupabaseProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;

  return loadProfile(data.session.user.id);
}

export async function signOutOfSupabase(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export { isSupabaseConfigured };
