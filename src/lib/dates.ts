import type { IsoDate, IsoTimestamp } from "@/domain/types";

/**
 * Date helpers.
 *
 * The demo renders dates with a fixed locale and UTC-safe parsing so server and
 * client markup agree (otherwise React hydration mismatches appear on any
 * machine whose timezone differs from the build host).
 */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** `2026-10-15` -> `15 Oct 2026`. */
export function formatDate(value?: IsoDate | IsoTimestamp | null): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

/** Full timestamp -> `15 Oct 2026, 09:30`. */
export function formatDateTime(value?: IsoTimestamp | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATETIME_FMT.format(d).replace(", ", ", ");
}

/** Today in `YYYY-MM-DD`, UTC. */
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

export function toDateOnly(value: IsoDate | IsoTimestamp): IsoDate {
  return value.slice(0, 10);
}

/** Whole days from today to `target`; negative when `target` is in the past. */
export function daysUntil(target?: IsoDate | null, from: IsoDate = todayIso()): number | null {
  if (!target) return null;
  const a = Date.parse(`${toDateOnly(from)}T00:00:00Z`);
  const b = Date.parse(`${toDateOnly(target)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = new Date(`${toDateOnly(value)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `in 5 days`, `today`, `3 days overdue`. */
export function describeDeadline(target?: IsoDate | null): string {
  const days = daysUntil(target);
  if (days === null) return "No deadline";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}

/** Compact relative label for activity feeds. */
export function timeAgo(value: IsoTimestamp): string {
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "—";
  const diffMinutes = Math.round((Date.now() - then) / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
