"use client";

/**
 * Radwa Gulf and Co — shared workflow UI helpers.
 *
 * `useAction` is the single place that turns an `ActionResult` into user
 * feedback: a success toast, or an error toast plus per-field messages. Because
 * every panel uses it, a blocked action always explains why instead of silently
 * doing nothing.
 */

import * as React from "react";
import Link from "next/link";
import { Info, Lock } from "lucide-react";

import { ROLE_LABELS, type DemoRole } from "@/domain/enums";
import type { ActionResult, Enquiry } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useActiveRole } from "@/store/useDemoStore";
import { Callout } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const run = React.useCallback(
    async <T extends ActionResult>(
      fn: () => Promise<T>,
      options?: { onSuccess?: (result: T) => void; silentSuccess?: boolean },
    ): Promise<T> => {
      setBusy(true);
      try {
        const result = await fn();
        if (result.ok) {
          setErrors({});
          if (!options?.silentSuccess) toast.success(result.message);
          options?.onSuccess?.(result);
        } else {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.message);
        }
        return result;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { run, busy, errors, setErrors, clearErrors: () => setErrors({}) };
}

/**
 * Wraps a panel's action area. When the active demo role is not one that owns
 * the action, the controls are replaced with a note naming the right role —
 * better than a disabled button with no explanation.
 */
export function RoleGate({
  allow,
  children,
  what,
  fallback,
}: {
  allow: DemoRole[];
  what: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const role = useActiveRole();
  if (allow.includes(role)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <Callout tone="neutral" icon={<Lock />}>
      {what} is performed by {allow.map((r) => ROLE_LABELS[r]).join(" or ")}. Switch role using the selector in
      the top-right corner to act here.
    </Callout>
  );
}

export function useIsRole(...roles: DemoRole[]): boolean {
  const role = useActiveRole();
  return roles.includes(role);
}

/** Compact enquiry reference + title link used across queue tables. */
export function EnquiryRefLink({
  enquiry,
  tab,
  className,
}: {
  enquiry: Enquiry;
  tab?: string;
  className?: string;
}) {
  return (
    <Link
      href={tab ? `/enquiries/${enquiry.id}?tab=${tab}` : `/enquiries/${enquiry.id}`}
      className={cn("group block min-w-0", className)}
    >
      <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
        {enquiry.reference}
      </span>
      <span className="block truncate text-xs font-medium text-ink-800 group-hover:text-brand-700">
        {enquiry.projectTitle}
      </span>
    </Link>
  );
}

/** Short explanatory note used to document a configurable default in the UI. */
export function PolicyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-500">
      <Info className="mt-px size-3 shrink-0 text-ink-400" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Rows of blockers explaining why an action is unavailable. */
export function BlockerList({ items, title }: { items: string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <Callout tone="warn" title={title ?? "Outstanding before this step"}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </Callout>
  );
}

export function DefinitionList({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  return (
    <dl
      className={cn(
        "grid gap-x-5 gap-y-3",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </dl>
  );
}
