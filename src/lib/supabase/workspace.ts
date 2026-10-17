"use client";

/**
 * Radwa Gulf and Co — shared workspace transport.
 *
 * The workflow database used to live only in `localStorage`, which is per
 * browser: a change made on one device was invisible on every other. This
 * module makes Supabase the single shared copy, and reduces the whole problem
 * to three operations — pull it, push it, and be told when someone else
 * pushed.
 *
 * `localStorage` is still written, but it is now a cache for instant paint and
 * offline reading, not the source of truth. On every load the server copy wins.
 *
 * See `supabase/migrations/0002_workspace_sync.sql` for the table, the
 * compare-and-swap writer and the row-level security that backs this.
 */

import type { DemoDatabase } from "@/domain/types";
import { getSupabase } from "./client";

/**
 * Identifies this browser tab for the lifetime of the page.
 *
 * Every write carries it, so the realtime echo of our own change can be
 * ignored rather than triggering a pointless re-fetch of state we just sent.
 */
export const CLIENT_ID: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface WorkspaceSnapshot {
  /** Null when the server row has never been initialised. */
  db: DemoDatabase | null;
  revision: number;
}

export type PushResult =
  | { status: "saved"; revision: number }
  /** Someone else wrote first. `db` is their version, to replay against. */
  | { status: "stale"; revision: number; db: DemoDatabase }
  | { status: "unavailable"; message: string };

/**
 * True only when there is a live Supabase session.
 *
 * Sync is impossible without one: row-level security refuses an anonymous
 * reader, and `save_workspace` refuses an anonymous writer. A session
 * established through the built-in demo accounts is not a Supabase session, so
 * this correctly returns false for it.
 */
export async function hasSupabaseSession(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.user);
}

/** Read the shared document. Returns null when Supabase is unreachable. */
export async function pullWorkspace(): Promise<WorkspaceSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("workspace_state")
    .select("data, revision")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return null;

  return {
    db: (data.data as DemoDatabase | null) ?? null,
    revision: Number(data.revision ?? 0),
  };
}

/**
 * Write the document, but only if nobody else has written since `revision`.
 *
 * A `stale` result is not an error — it is the normal outcome of two people
 * working at once, and the caller is expected to replay its operation against
 * the returned document and try again.
 */
export async function pushWorkspace(db: DemoDatabase, revision: number): Promise<PushResult> {
  const supabase = getSupabase();
  if (!supabase) return { status: "unavailable", message: "Supabase is not configured." };

  const { data, error } = await supabase.rpc("save_workspace", {
    p_revision: revision,
    p_data: db,
    p_client: CLIENT_ID,
  });

  if (error) {
    return { status: "unavailable", message: describeError(error.message) };
  }

  // The function returns a single row; PostgREST gives it back as an array.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { status: "unavailable", message: "The server returned no result." };

  if (row.accepted) {
    return { status: "saved", revision: Number(row.new_revision) };
  }

  return {
    status: "stale",
    revision: Number(row.new_revision),
    db: row.server_data as DemoDatabase,
  };
}

/**
 * Call `onRemoteChange` when another device writes.
 *
 * Subscribes to `workspace_pulse`, not to the document itself: realtime
 * delivers whole rows, and the document is far too large to broadcast on every
 * change. The pulse says only "revision N, written by client X"; the listener
 * decides whether to fetch.
 */
export function subscribeToWorkspace(onRemoteChange: (revision: number) => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("workspace-pulse")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workspace_pulse" },
      (payload) => {
        const row = payload.new as { revision?: number; client_id?: string } | null;
        if (!row) return;
        // Our own write, coming back to us. We already have this state.
        if (row.client_id === CLIENT_ID) return;
        onRemoteChange(Number(row.revision ?? 0));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Turn the raw Postgres error into something a user can act on. */
function describeError(message: string): string {
  if (/save_workspace/.test(message) && /function/i.test(message)) {
    return "Sync is not set up yet — run supabase/migrations/0002_workspace_sync.sql.";
  }
  if (/authenticated session/i.test(message)) {
    return "Sync needs a Supabase sign-in. You are signed in with a built-in account.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Supabase refused the write. Check the policies in migration 0002.";
  }
  return message;
}
