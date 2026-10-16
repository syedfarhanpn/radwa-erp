"use client";

/**
 * Radwa Gulf and Co — data table primitives.
 *
 * Compact by design: enterprise users scan many rows at a time. The wrapper
 * owns horizontal scrolling so a wide table never breaks the page layout.
 */

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export function TableWrap({
  children,
  className,
  stickyHeader = true,
}: {
  children: React.ReactNode;
  className?: string;
  stickyHeader?: boolean;
}) {
  return (
    <div
      className={cn(
        "thin-scroll w-full overflow-x-auto",
        stickyHeader && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-left text-xs", className)}>{children}</table>;
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-ink-50">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-ink-100">{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-brand-50/60",
        selected && "bg-brand-50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  align = "left",
  width,
  sort,
  onSort,
  scope = "col",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  width?: string;
  sort?: "asc" | "desc" | false;
  onSort?: () => void;
  scope?: "col" | "row";
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
      {children}
      {sort === "asc" ? <ArrowUp className="size-3" aria-hidden /> : null}
      {sort === "desc" ? <ArrowDown className="size-3" aria-hidden /> : null}
    </span>
  );
  return (
    <th
      scope={scope}
      style={width ? { width } : undefined}
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
      className={cn(
        "border-b border-ink-200 bg-ink-50 px-3 py-2 text-2xs font-semibold tracking-wide text-ink-600 uppercase whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {onSort ? (
        <button type="button" onClick={onSort} className="inline-flex items-center gap-1 hover:text-brand-600">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}

export function TD({
  children,
  className,
  align = "left",
  colSpan,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        "px-3 py-2 align-middle text-ink-700",
        align === "right" && "numeric text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-xs text-ink-500">
        {children}
      </td>
    </tr>
  );
}

/** Footer row for totals; kept visually distinct from data rows. */
export function TFoot({ children }: { children: React.ReactNode }) {
  return <tfoot className="border-t-2 border-ink-300 bg-ink-50 font-medium">{children}</tfoot>;
}
