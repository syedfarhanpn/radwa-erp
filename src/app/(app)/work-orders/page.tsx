"use client";

/**
 * Work order list.
 *
 * Awarded enquiries with no work order appear first — an award can generate a
 * work-order draft with no purchase order on file.
 */

import * as React from "react";
import Link from "next/link";
import { FileSignature } from "lucide-react";

import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useRepository } from "@/services/mock/mockRepository";
import { useActiveRole, useDb } from "@/store/useDemoStore";
import { awardQueue, userById } from "@/store/selectors";
import {
  Badge,
  Button,
  EmptyState,
  LinkButton,
  Panel,
  PanelFooter,
  PanelHeader,
} from "@/components/ui/primitives";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { PoStatusBadge, WorkOrderStatusBadge } from "@/components/workflow/StatusBadges";
import { useAction } from "@/components/workflow/shared";
import { workOrderNumberingConfig } from "@/domain/config";

export default function WorkOrdersPage() {
  const db = useDb();
  const repo = useRepository();
  const role = useActiveRole();
  const { run, busy } = useAction();

  const items = React.useMemo(() => awardQueue(db), [db]);
  const needsDraft = items.filter((item) => !item.workOrder);

  return (
    <div className="space-y-4">
      {needsDraft.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Awarded — work order not drafted"
            actions={<Badge tone="accent">{needsDraft.length}</Badge>}
          />
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Enquiry</TH>
                  <TH width="12rem">Awarded value</TH>
                  <TH width="10rem">Awarded on</TH>
                  <TH align="right" width="16rem" />
                </TR>
              </THead>
              <TBody>
                {needsDraft.map((item) => (
                  <TR key={item.enquiry.id}>
                    <TD className="max-w-sm">
                      <Link href={`/enquiries/${item.enquiry.id}?tab=award`} className="group block">
                        <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                          {item.enquiry.reference}
                        </span>
                        <span className="block truncate text-xs font-medium text-ink-800">
                          {item.enquiry.projectTitle}
                        </span>
                      </Link>
                    </TD>
                    <TD className="numeric font-medium text-ink-900">
                      {formatMoney(item.award?.awardedValue, item.enquiry.currency, 0)}
                    </TD>
                    <TD>{formatDate(item.award?.awardedAt)}</TD>
                    <TD align="right">
                      {role === "CRM_MANAGER" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<FileSignature />}
                          disabled={busy}
                          onClick={() => void run(() => repo.generateWorkOrder({ enquiryId: item.enquiry.id }))}
                        >
                          Generate draft
                        </Button>
                      ) : (
                        <Link
                          href={`/enquiries/${item.enquiry.id}?tab=award`}
                          className="text-2xs font-medium text-brand-600 hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          icon={<FileSignature />}
          title="Work orders"
          description="Draft, finalized and handed over."
          actions={<Badge tone="neutral">{db.workOrders.length}</Badge>}
        />
        <TableWrap>
          <Table className="min-w-[66rem]">
            <THead>
              <TR>
                <TH width="9rem">Number</TH>
                <TH width="20rem">Enquiry</TH>
                <TH width="10rem">Client</TH>
                <TH width="8rem">Status</TH>
                <TH align="right" width="11rem">
                  Contract value
                </TH>
                <TH width="11rem">Purchase order</TH>
                <TH width="9rem">Finalized</TH>
                <TH align="right" width="11rem" />
              </TR>
            </THead>
            <TBody>
              {db.workOrders.length === 0 ? (
                <TableEmptyRow colSpan={8}>No work orders yet.</TableEmptyRow>
              ) : null}
              {db.workOrders.map((wo) => {
                const enquiry = db.enquiries.find((e) => e.id === wo.enquiryId);
                const client = db.clients.find((c) => c.id === enquiry?.clientId);
                const po = db.purchaseOrders.find((p) => p.enquiryId === wo.enquiryId);
                return (
                  <TR key={wo.id}>
                    <TD>
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="numeric text-xs font-semibold text-brand-700 hover:underline"
                      >
                        {wo.number}
                      </Link>
                      <span className="block text-2xs text-ink-400">rev {wo.version}</span>
                    </TD>
                    <TD className="max-w-xs">
                      {enquiry ? (
                        <Link href={`/enquiries/${enquiry.id}?tab=award`} className="group block">
                          <span className="numeric block text-2xs font-semibold text-brand-700 group-hover:underline">
                            {enquiry.reference}
                          </span>
                          <span className="block truncate text-xs text-ink-800">{enquiry.projectTitle}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>{client?.shortName ?? "—"}</TD>
                    <TD>
                      <WorkOrderStatusBadge status={wo.status} />
                    </TD>
                    <TD align="right" className="font-medium text-ink-900">
                      {formatMoney(wo.contractValue, wo.currency, 0)}
                    </TD>
                    <TD>
                      {po ? (
                        <>
                          <PoStatusBadge status={po.status} />
                          <span className="mt-0.5 block font-mono text-2xs text-ink-500">{po.poNumber}</span>
                        </>
                      ) : (
                        <Badge tone="warn">Not recorded</Badge>
                      )}
                    </TD>
                    <TD>
                      {wo.finalizedAt ? (
                        <>
                          <span className="block text-2xs text-ink-700">{formatDate(wo.finalizedAt)}</span>
                          <span className="block text-2xs text-ink-500">
                            {userById(db, wo.finalizedById)?.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-2xs text-ink-400">—</span>
                      )}
                    </TD>
                    <TD align="right">
                      <LinkButton href={`/work-orders/${wo.id}`} size="sm" variant="secondary">
                        Open
                      </LinkButton>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
        <PanelFooter>
          <p className="text-2xs text-ink-500">{workOrderNumberingConfig.note}</p>
        </PanelFooter>
      </Panel>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileSignature />}
          title="No awarded enquiries"
          description="Work orders are generated from an award. Record a client award on the Submission & Follow-up screen."
        />
      ) : null}
    </div>
  );
}
