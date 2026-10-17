"use client";

/**
 * Employee register.
 *
 * HR's home screen and the MD's read-only view of the workforce. Everything
 * here is derived from the shared workspace, so a joining recorded on one
 * device shows up on every other.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Users } from "lucide-react";

import {
  EMPLOYEE_CATEGORY_LABELS,
  EMPLOYEE_SPONSOR_LABELS,
  EMPLOYEE_STATUS_LABELS,
  grossMonthly,
  type EmployeeStatus,
} from "@/domain/hr";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate, daysUntil } from "@/lib/dates";
import { monthlyPayroll } from "@/services/hrOperations";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import { Input, Select } from "@/components/ui/form";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  StatTile,
} from "@/components/ui/primitives";
import { Table, TableEmptyRow, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/** How far ahead an iqama expiry is worth flagging. */
const IQAMA_WARNING_DAYS = 60;

export default function EmployeeRegisterPage() {
  const db = useDb();
  const role = useActiveRole();
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<EmployeeStatus | "ALL">("ACTIVE");

  const canRegister = role === "HR";

  const rows = (() => {
    const needle = query.trim().toLowerCase();
    return db.employees
      .filter((e) => (status === "ALL" ? true : e.status === status))
      .filter((e) => {
        if (!needle) return true;
        return [e.name, e.employeeNumber, e.trade, e.nationality, e.passportNumber, e.iqamaNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => b.employeeNumber.localeCompare(a.employeeNumber, undefined, { numeric: true }));
  })();

  const active = db.employees.filter((e) => e.status === "ACTIVE");
  const payroll = monthlyPayroll(db);

  // Flagged here rather than only on the detail page: an iqama that lapses
  // stops someone working, and nobody opens 40 records to go looking.
  const expiring = active
    .filter((e) => {
      const days = daysUntil(e.iqamaExpiry);
      return days !== null && days <= IQAMA_WARNING_DAYS;
    })
    .sort((a, b) => (a.iqamaExpiry ?? "").localeCompare(b.iqamaExpiry ?? ""));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-ink-900">Employee register</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            {role === "MD"
              ? "Read-only view of the workforce. HR maintains these records."
              : "Joining records, pay and contract details for every employee."}
          </p>
        </div>
        {canRegister ? (
          <Button onClick={() => router.push("/hr/employees/new")}>
            <Plus className="size-3.5" aria-hidden />
            Register joining
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active employees" value={String(active.length)} icon={<Users aria-hidden />} />
        <StatTile
          label="Inactive"
          value={String(db.employees.length - active.length)}
          hint="Left the company; records kept"
        />
        <StatTile
          label="Monthly payroll"
          value={formatMoneyCompact(payroll, "SAR")}
          hint="Basic plus allowances, active only"
        />
        <StatTile
          label="Iqama expiring"
          value={String(expiring.length)}
          hint={`Within ${IQAMA_WARNING_DAYS} days`}
          tone={expiring.length > 0 ? "warn" : "neutral"}
        />
      </div>

      {expiring.length > 0 ? (
        <Callout tone="warn" title="Iqama renewals due" icon={<AlertTriangle />}>
          <ul className="space-y-0.5">
            {expiring.slice(0, 5).map((e) => {
              const days = daysUntil(e.iqamaExpiry) ?? 0;
              return (
                <li key={e.id} className="min-w-0 break-words">
                  <Link href={`/hr/employees/${e.id}`} className="font-medium underline-offset-2 hover:underline">
                    {e.name}
                  </Link>{" "}
                  — {days < 0 ? `expired ${Math.abs(days)} days ago` : `expires in ${days} days`} (
                  {formatDate(e.iqamaExpiry)})
                </li>
              );
            })}
            {expiring.length > 5 ? <li>…and {expiring.length - 5} more.</li> : null}
          </ul>
        </Callout>
      ) : null}

      <Panel>
        <PanelHeader
          title="Employees"
          description={`${rows.length} of ${db.employees.length} shown`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Search employees"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, number, trade, passport…"
                className="w-full sm:w-64"
              />
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => setStatus(event.target.value as EmployeeStatus | "ALL")}
                className="w-full sm:w-36"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ALL">All</option>
              </Select>
            </div>
          }
        />
        <PanelBody className="p-0">
          {db.employees.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="No employees yet"
              description={
                canRegister
                  ? "Register the first joining to start the employee register."
                  : "HR has not registered any employees yet."
              }
              action={
                canRegister ? (
                  <Button onClick={() => router.push("/hr/employees/new")}>Register joining</Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Emp #</TH>
                    <TH>Name</TH>
                    <TH>Trade</TH>
                    <TH>Category</TH>
                    <TH>Sponsor</TH>
                    <TH>Joined</TH>
                    <TH align="right">Gross / month</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.length === 0 ? (
                    <TableEmptyRow colSpan={8}>No employee matches that search.</TableEmptyRow>
                  ) : (
                    rows.map((employee) => (
                      <TR key={employee.id} onClick={() => router.push(`/hr/employees/${employee.id}`)}>
                        <TD className="numeric">{employee.employeeNumber}</TD>
                        <TD>
                          <span className="font-medium text-ink-900">{employee.name}</span>
                          <span className="block text-2xs text-ink-500">{employee.nationality}</span>
                        </TD>
                        <TD>{employee.trade}</TD>
                        <TD className="text-2xs">{EMPLOYEE_CATEGORY_LABELS[employee.category]}</TD>
                        <TD>{EMPLOYEE_SPONSOR_LABELS[employee.sponsor]}</TD>
                        <TD>{formatDate(employee.dateOfJoin)}</TD>
                        <TD align="right" className="numeric">
                          {formatMoney(grossMonthly(employee.compensation), "SAR", 0)}
                        </TD>
                        <TD>
                          <Badge tone={employee.status === "ACTIVE" ? "ok" : "neutral"}>
                            {EMPLOYEE_STATUS_LABELS[employee.status]}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
