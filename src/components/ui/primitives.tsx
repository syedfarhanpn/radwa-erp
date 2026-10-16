"use client";

/**
 * Radwa Gulf and Co — UI primitives.
 *
 * A small, hand-written component set rather than a pulled-in library, so the
 * design tokens in `globals.css` stay the single source of visual truth.
 * Everything here is presentational: no component reads the store or a rule.
 */

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------- button --- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 border-brand-600 hover:border-brand-700",
  secondary: "bg-white text-ink-700 border-ink-300 hover:bg-ink-50 hover:border-ink-400",
  ghost: "bg-transparent text-ink-600 border-transparent hover:bg-ink-100 hover:text-ink-800",
  danger: "bg-bad-600 text-white border-bad-600 hover:bg-bad-700 hover:border-bad-700",
  success: "bg-ok-600 text-white border-ok-600 hover:bg-ok-700 hover:border-ok-700",
  subtle: "bg-ink-100 text-ink-700 border-ink-200 hover:bg-ink-200",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-10 px-4 text-sm gap-2",
};

/** Indeterminate activity indicator. Hidden from assistive tech; the control
 *  that owns it announces the state through `aria-busy` and its label. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Swaps the icon for a spinner and blocks further presses. */
  loading?: boolean;
  /** Replaces the label while loading, so the wait says what it is waiting for. */
  loadingLabel?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "secondary",
    size = "md",
    icon,
    iconRight,
    loading = false,
    loadingLabel,
    children,
    type = "button",
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-control border font-medium whitespace-nowrap transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner className="shrink-0" />
      ) : icon ? (
        <span className="shrink-0 [&>svg]:size-4">{icon}</span>
      ) : null}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
      {iconRight && !loading ? <span className="shrink-0 [&>svg]:size-4">{iconRight}</span> : null}
    </button>
  );
});

/**
 * Anchor styled as a button. Navigation must stay a link (middle-click, copy
 * link, keyboard semantics), so this never wraps a `<Link>` in a `<button>`.
 */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  icon,
  className,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-control border font-medium whitespace-nowrap transition-colors",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon ? <span className="shrink-0 [&>svg]:size-4">{icon}</span> : null}
      {children}
    </a>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, variant = "ghost", children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-control border transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-4",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* --------------------------------------------------------------- badge --- */

export type BadgeTone = "neutral" | "info" | "warn" | "ok" | "bad" | "accent" | "brand";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  info: "bg-info-50 text-info-700 border-info-200",
  warn: "bg-warn-50 text-warn-700 border-warn-200",
  ok: "bg-ok-50 text-ok-700 border-ok-200",
  bad: "bg-bad-50 text-bad-700 border-bad-200",
  accent: "bg-accent-50 text-accent-700 border-accent-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- card --- */

export function Panel({
  children,
  className,
  as: As = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <As
      className={cn(
        "rounded-card border border-ink-200 bg-white shadow-panel print-plain",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-ink-400 [&>svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-4 py-3.5", className)}>{children}</div>;
}

export function PanelFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <footer className={cn("flex flex-wrap items-center gap-2 border-t border-ink-200 bg-ink-50 px-4 py-2.5", className)}>
      {children}
    </footer>
  );
}

/* ------------------------------------------------------------ KPI tile --- */

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  href,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const TONE_ACCENT: Record<BadgeTone, string> = {
    neutral: "text-ink-500",
    info: "text-info-600",
    warn: "text-warn-600",
    ok: "text-ok-600",
    bad: "text-bad-600",
    accent: "text-accent-600",
    brand: "text-brand-600",
  };
  const interactive = Boolean(href || onClick);
  const Wrapper: React.ElementType = href ? "a" : onClick ? "button" : "div";

  return (
    <Wrapper
      href={href}
      onClick={onClick}
      type={onClick && !href ? "button" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-card border border-ink-200 bg-white px-3.5 py-3 text-left shadow-panel",
        interactive && "transition-colors hover:border-ink-300 hover:bg-ink-50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium tracking-wide text-ink-500 uppercase">{label}</span>
        {icon ? <span className={cn("[&>svg]:size-4", TONE_ACCENT[tone])}>{icon}</span> : null}
      </div>
      <span className={cn("numeric text-2xl leading-tight font-semibold", tone === "neutral" ? "text-ink-900" : TONE_ACCENT[tone])}>
        {value}
      </span>
      {hint ? <span className="text-2xs text-ink-500">{hint}</span> : null}
    </Wrapper>
  );
}

/* --------------------------------------------------------- empty state --- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? <span className="mb-2.5 text-ink-300 [&>svg]:size-7">{icon}</span> : null}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">{description}</p> : null}
      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- alerts --- */

export function Callout({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: "info" | "warn" | "ok" | "bad" | "neutral";
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const TONES = {
    info: "border-info-200 bg-info-50 text-info-700",
    warn: "border-warn-200 bg-warn-50 text-warn-700",
    ok: "border-ok-200 bg-ok-50 text-ok-700",
    bad: "border-bad-200 bg-bad-50 text-bad-700",
    neutral: "border-ink-200 bg-ink-50 text-ink-700",
  } as const;
  return (
    <div className={cn("rounded-control border px-3 py-2.5 text-xs leading-relaxed", TONES[tone], className)} role="note">
      <div className="flex gap-2">
        {icon ? <span className="mt-px shrink-0 [&>svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- misc elements --- */

export function Avatar({ initials, className, title }: { initials: string; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function PersonChip({ name, initials, note }: { name: string; initials?: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar initials={initials ?? name.slice(0, 2).toUpperCase()} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink-800">{name}</span>
        {note ? <span className="block truncate text-2xs text-ink-500">{note}</span> : null}
      </span>
    </span>
  );
}

export function KeyValue({
  label,
  children,
  className,
  stacked = true,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  stacked?: boolean;
}) {
  if (!stacked) {
    return (
      <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
        <dt className="text-xs text-ink-500">{label}</dt>
        <dd className="text-right text-xs font-medium text-ink-800">{children}</dd>
      </div>
    );
  }
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs font-medium tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-800">{children}</dd>
    </div>
  );
}

export function ProgressBar({
  value,
  total,
  tone = "brand",
  className,
  label,
}: {
  value: number;
  total: number;
  tone?: "brand" | "ok" | "warn" | "bad";
  className?: string;
  label?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const TONES = {
    brand: "bg-brand-600",
    ok: "bg-ok-600",
    warn: "bg-warn-600",
    bad: "bg-bad-600",
  } as const;
  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label ?? `${value} of ${total}`}
      >
        <div className={cn("h-full rounded-full transition-[width]", TONES[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  actions,
  description,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{children}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-2xs text-ink-500">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 ? <ChevronRight className="size-3 shrink-0 text-ink-300" aria-hidden /> : null}
          {item.href && index < items.length - 1 ? (
            <a href={item.href} className="truncate hover:text-brand-600 hover:underline">
              {item.label}
            </a>
          ) : (
            <span className={cn("truncate", index === items.length - 1 && "font-medium text-ink-700")}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Thin inline loading placeholder used while persisted state is read. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-ink-200/70", className)} />;
}

export function LoadingPanel({ label = "Loading demo data…" }: { label?: string }) {
  return (
    <Panel className="p-4">
      <div className="space-y-2.5">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-5/6" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
      <p className="mt-3 text-2xs text-ink-400">{label}</p>
    </Panel>
  );
}

/** Label for values that are simulated rather than produced by a real service. */
export function SimulatedTag({ children = "Simulated demo value" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-accent-200 bg-accent-50 px-1.5 py-0.5 text-2xs font-medium text-accent-700">
      {children}
    </span>
  );
}
