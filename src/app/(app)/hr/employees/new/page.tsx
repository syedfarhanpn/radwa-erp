"use client";

/**
 * Register an employee joining.
 *
 * The number is generated from the shared sequence, continuing from 1001 as in
 * the business's workbook. Registration goes through `dispatch` like every
 * other write, so it reaches the other devices on its own.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { registerEmployee, type EmployeeInput } from "@/services/hrOperations";
import { useActiveRole, useDb, useDemoStore } from "@/store/useDemoStore";
import { useToast } from "@/components/ui/toast";
import { Callout } from "@/components/ui/primitives";

export default function RegisterJoiningPage() {
  const db = useDb();
  const role = useActiveRole();
  const dispatch = useDemoStore((s) => s.dispatch);
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // The nav hides this page from everyone but HR; the URL still resolves, so
  // the MD's read-only access stops at reading.
  if (role !== "HR") {
    return (
      <Callout tone="warn" title="Only HR can register a joining">
        You can view the employee register, but adding and changing records is HR&apos;s to do.
      </Callout>
    );
  }

  function submit(input: EmployeeInput) {
    setBusy(true);
    setFieldErrors({});

    const result = dispatch(registerEmployee, input);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.message);
      setBusy(false);
      return;
    }

    toast.success(result.message);
    router.replace(`/hr/employees/${result.employeeId}`);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-base font-semibold text-ink-900">Register employee joining</h1>
        <p className="mt-0.5 text-xs text-ink-500">
          The employee number is generated automatically and continues the existing sequence.
        </p>
      </header>

      <EmployeeForm
        db={db}
        submitLabel="Register employee"
        busy={busy}
        fieldErrors={fieldErrors}
        onSubmit={submit}
        onCancel={() => router.push("/hr/employees")}
      />
    </div>
  );
}
