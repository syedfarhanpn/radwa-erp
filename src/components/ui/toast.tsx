"use client";

/**
 * Radwa Gulf and Co — toast feedback.
 *
 * Every workflow action reports its outcome here, including failures, so a
 * blocked action always explains itself rather than appearing to do nothing.
 * The region is an `aria-live` polite log so assistive technology announces it.
 */

import * as React from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastApi {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
  /** Convenience for an `ActionResult`. */
  fromResult: (result: { ok: boolean; message: string }) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const remove = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = React.useCallback(
    (tone: ToastTone, message: string, detail?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, tone, message, detail }]);
      window.setTimeout(() => remove(id), tone === "error" ? AUTO_DISMISS_MS * 1.5 : AUTO_DISMISS_MS);
    },
    [remove],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (message, detail) => push("success", message, detail),
      error: (message, detail) => push("error", message, detail),
      info: (message, detail) => push("info", message, detail),
      fromResult: (result) => push(result.ok ? "success" : "error", result.message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={() => remove(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const TONES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
    success: {
      wrap: "border-ok-200 bg-white",
      icon: <CheckCircle2 className="size-4 text-ok-600" aria-hidden />,
    },
    error: {
      wrap: "border-bad-200 bg-white",
      icon: <XCircle className="size-4 text-bad-600" aria-hidden />,
    },
    info: {
      wrap: "border-info-200 bg-white",
      icon: <Info className="size-4 text-info-600" aria-hidden />,
    },
  };
  const tone = TONES[item.tone];

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border px-3.5 py-3 shadow-overlay",
        tone.wrap,
      )}
      role={item.tone === "error" ? "alert" : "status"}
    >
      <span className="mt-px shrink-0">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed font-medium text-ink-800">{item.message}</p>
        {item.detail ? <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{item.detail}</p> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mt-0.5 -mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
