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
    return {
      ok: false,
      unavailable,
      message: unavailable
        ? "Could not reach Supabase."
        : "That username and password do not match an account.",
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
