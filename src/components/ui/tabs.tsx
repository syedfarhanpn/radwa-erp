"use client";

/**
 * Radwa Gulf and Co — tab strip.
 *
 * Follows the ARIA tabs pattern: a single tab stop with Left/Right/Home/End
 * keyboard navigation, `aria-selected`, and `aria-controls` linking each tab to
 * its panel. Used by the enquiry detail screen, where one record has a dozen
 * workflow aspects.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "./primitives";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Small count or status marker shown after the label. */
  badge?: { text: string; tone?: React.ComponentProps<typeof Badge>["tone"] };
  disabled?: boolean;
  hidden?: boolean;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className,
  idPrefix = "tab",
}: {
  items: Array<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
  idPrefix?: string;
}) {
  const visible = items.filter((item) => !item.hidden);
  const refs = React.useRef(new Map<T, HTMLButtonElement | null>());

  function focusTab(id: T) {
    onChange(id);
    requestAnimationFrame(() => refs.current.get(id)?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const enabled = visible.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === active);
    if (index === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab(enabled[(index + 1) % enabled.length].id);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab(enabled[(index - 1 + enabled.length) % enabled.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(enabled[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(enabled[enabled.length - 1].id);
    }
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn("thin-scroll flex gap-0.5 overflow-x-auto border-b border-ink-200", className)}
    >
      {visible.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current.set(item.id, node);
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
              selected
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700",
              item.disabled && "cursor-not-allowed opacity-40 hover:border-transparent",
            )}
          >
            {item.label}
            {item.badge ? (
              <Badge tone={item.badge.tone ?? "neutral"} className="px-1.5 py-0">
                {item.badge.text}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<T extends string>({
  id,
  active,
  children,
  idPrefix = "tab",
}: {
  id: T;
  active: T;
  children: React.ReactNode;
  idPrefix?: string;
}) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}panel-${id}`}
      aria-labelledby={`${idPrefix}-${id}`}
      tabIndex={0}
      className="focus-visible:outline-none"
    >
      {children}
    </div>
  );
}
