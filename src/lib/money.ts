/**
 * Currency and variance formatting.
 *
 * All variance maths lives here so the BOQ workspace, estimate approval screen
 * and dashboards cannot disagree. Every denominator is guarded: a zero or
 * missing AI baseline yields `null`, which renders as `—` rather than Infinity
 * or NaN.
 */

const CURRENCY_CACHE = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, decimals: number): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let fmt = CURRENCY_CACHE.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    CURRENCY_CACHE.set(key, fmt);
  }
  return fmt;
}

const NUMBER_FMT_2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NUMBER_FMT_3 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatMoney(value?: number | null, currency = "AED", decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return currencyFormatter(currency, decimals).format(value);
}

/** Money without the currency symbol, for dense table columns. */
export function formatAmount(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUMBER_FMT_2.format(value);
}

/** Compact form for KPI tiles: 1.25M / 320K. */
export function formatMoneyCompact(value?: number | null, currency = "AED"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${currency} ${(value / 1_000).toFixed(1)}K`;
  return `${currency} ${value.toFixed(0)}`;
}

export function formatQuantity(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUMBER_FMT_3.format(value);
}

/**
 * Percentage change of `actual` against `baseline`.
 * Returns `null` when the baseline is missing or zero — never Infinity.
 */
export function variancePercent(actual: number, baseline: number | null | undefined): number | null {
  if (baseline === null || baseline === undefined) return null;
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  const pct = ((actual - baseline) / Math.abs(baseline)) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/** Absolute difference, or `null` when there is no baseline to compare against. */
export function varianceAbsolute(actual: number, baseline: number | null | undefined): number | null {
  if (baseline === null || baseline === undefined || !Number.isFinite(baseline)) return null;
  return actual - baseline;
}

export function formatPercent(value?: number | null, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Round to 2dp without accumulating binary float drift across a column sum. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Parse a user-typed numeric field; blank and malformed input become 0. */
export function parseNumericInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
