"use client";

/**
 * Radwa Gulf and Co — form controls.
 *
 * Every control is label-associated and reports its validation message through
 * `aria-describedby`/`aria-invalid`, so keyboard and screen-reader users get the
 * same feedback as sighted mouse users.
 */

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "w-full rounded-control border bg-white px-2.5 py-1.5 text-sm text-ink-800 placeholder:text-ink-400 " +
  "transition-colors disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500";

const CONTROL_OK = "border-ink-300 hover:border-ink-400";
const CONTROL_BAD = "border-bad-600 bg-bad-50/40";

/* --------------------------------------------------------------- field --- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  // A `<label>` with nothing to point at is an accessibility smell, so a field
  // wrapping a group of controls (which labels itself with `role="group"` and
  // `aria-label`) gets a plain heading instead.
  const LabelTag = htmlFor ? "label" : "span";

  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <LabelTag
          htmlFor={htmlFor}
          className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-700"
        >
          {label}
          {required ? (
            <span className="text-bad-600" aria-hidden>
              *
            </span>
          ) : null}
        </LabelTag>
      ) : null}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1 flex items-start gap-1 text-2xs text-bad-600">
          <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1 text-2xs leading-relaxed text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- input --- */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={cn(CONTROL_BASE, invalid ? CONTROL_BAD : CONTROL_OK, className)}
      {...props}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={cn(CONTROL_BASE, "resize-y leading-relaxed", invalid ? CONTROL_BAD : CONTROL_OK, className)}
      {...props}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && props.id ? `${props.id}-error` : undefined}
      className={cn(CONTROL_BASE, "cursor-pointer pr-7", invalid ? CONTROL_BAD : CONTROL_OK, className)}
      {...props}
    >
      {children}
    </select>
  );
});

/** Right-aligned numeric input used throughout the BOQ grid. */
export const NumberInput = React.forwardRef<HTMLInputElement, InputProps>(function NumberInput(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      className={cn(
        "numeric w-full rounded-control border bg-white px-2 py-1 text-right text-xs text-ink-800",
        "transition-colors focus:bg-brand-50/40 disabled:cursor-not-allowed disabled:bg-ink-100",
        invalid ? CONTROL_BAD : "border-ink-300 hover:border-ink-400",
        className,
      )}
      {...props}
    />
  );
});

export function Checkbox({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-ink-300 accent-brand-600 disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className={cn("min-w-0 cursor-pointer text-xs", disabled && "cursor-not-allowed opacity-70")}>
        <span className="font-medium text-ink-800">{label}</span>
        {description ? <span className="mt-0.5 block leading-relaxed text-ink-500">{description}</span> : null}
      </label>
    </div>
  );
}

/** Segmented single-choice control — used for small, mutually exclusive sets. */
export function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
}: {
  name: string;
  value: T | "";
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-control border px-3 py-2 transition-colors",
            value === option.value
              ? "border-brand-500 bg-brand-50"
              : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-0.5 size-4 shrink-0 accent-brand-600"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-ink-800">{option.label}</span>
            {option.description ? (
              <span className="mt-0.5 block text-2xs leading-relaxed text-ink-500">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Grouped form section with a heading, used on the long registration form. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-ink-200 px-4 py-4 last:border-b-0", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-3.5",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/**
 * File selection control. Files are read for their name and size only — this
 * demo never uploads or stores a file anywhere.
 */
export function FilePicker({
  id,
  label = "Select file",
  onPick,
  hint = "Demo only — the file is not uploaded or stored anywhere. Only its name and size are recorded.",
  accept,
}: {
  id: string;
  label?: string;
  onPick: (file: { fileName: string; fileSizeLabel: string }) => void;
  hint?: string;
  accept?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          onPick({ fileName: file.name, fileSizeLabel: formatFileSize(file.size) });
          // Allow the same file to be chosen again.
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-8 items-center gap-2 rounded-control border border-dashed border-ink-300 bg-ink-50 px-3 text-xs font-medium text-ink-600 transition-colors hover:border-brand-400 hover:text-brand-700"
      >
        {label}
      </button>
      <p className="mt-1 text-2xs leading-relaxed text-ink-500">{hint}</p>
    </div>
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
