"use client";

/**
 * Supabase browser client.
 *
 * Created lazily and once, so every module shares a single auth session and a
 * single set of realtime listeners.
 *
 * Only browser-safe values are read here. The publishable key is *designed* to
 * ship to the client — row-level security is what protects the data, not the
 * secrecy of this key. The database password and the service-role key must
 * never appear in this app: anything prefixed `NEXT_PUBLIC_` is compiled into
 * the JavaScript bundle and is readable by anyone who opens it.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** False when the environment variables are absent, so the UI can say so. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

/**
 * The shared client, or `null` when Supabase is not configured.
 *
 * Returning null rather than throwing lets the app fall back to its local demo
 * accounts instead of showing a blank screen — useful when the project is
 * paused, the keys are missing, or you are demonstrating offline.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createBrowserClient(url, publishableKey);
  }
  return client;
}

/** The project reference, for display only (never a secret). */
export function supabaseProjectRef(): string | null {
  if (!url) return null;
  return url.replace(/^https:\/\//, "").split(".")[0] ?? null;
}
