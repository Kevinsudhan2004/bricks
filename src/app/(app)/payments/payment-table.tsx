"use client";

import Link from "next/link";
import { Download, IndianRupee, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { DeleteButton } from "@/components/forms/delete-button";
import { formatDateTime, formatDay, formatINR } from "@/lib/format";
import { deletePayment } from "@/server/actions/money";
import type { PaymentRow } from "@/server/queries/money";
import { MODE } from "./modes";

export function PaymentTable({ rows, today, exportHref }: { rows: PaymentRow[]; today: string; exportHref: string }) {
  const columns: SheetColumn<PaymentRow>[] = [
    { id: "date", header: "Date", className: "min-w-24", sortValue: (r) => r.paymentDate, cell: (r) => formatDay(r.paymentDate, today) },
    { id: "receipt", header: "Receipt", sortValue: (r) => r.receiptNo, cell: (r) => <span className="font-mono text-xs">{r.receiptNo}</span> },
    {
      id: "customer",
      header: "Customer",
      className: "max-w-44 md:max-w-60",
      sortValue: (r) => (r.firmName ?? r.customerName).toLowerCase(),
      cell: (r) => (
        <Link href={`/customers/${r.customerId}`} className="block truncate font-medium hover:text-primary hover:underline">
          {r.firmName ?? r.customerName}
        </Link>
      ),
    },
    {
      id: "order",
      header: "Order",
      sortValue: (r) => r.invoiceNo,
      cell: (r) =>
        r.invoiceId ? (
          <Link href={`/orders/${r.invoiceId}`} className="font-mono text-xs hover:text-primary hover:underline">
            {r.invoiceNo}
          </Link>
        ) : (
          <Pill>On account</Pill>
        ),
    },
    {
      id: "mode",
      header: "Mode",
      sortValue: (r) => r.mode,
      cell: (r) => {
        const M = MODE[r.mode];
        return (
          <span className="inline-flex items-center gap-1.5">
            <M.icon className="size-3.5 text-muted-foreground" aria-hidden /> {M.label}
          </span>
        );
      },
    },
    {
      id: "reference",
      header: "Reference",
      className: "max-w-40",
      sortValue: (r) => r.reference,
      cell: (r) => (r.reference ? <span className="block truncate font-mono text-xs">{r.reference}</span> : <Dash />),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => <span className="font-semibold text-success">{formatINR(r.amount)}</span>,
      total: (rs) => formatINR(rs.reduce((a, r) => a + r.amount, 0)),
    },
    {
      id: "remarks",
      header: "Remarks",
      className: "max-w-56",
      cell: (r) => (r.remarks ? <span className="block truncate text-muted-foreground">{r.remarks}</span> : <Dash />),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      noun={["payment", "payments"]}
      searchText={(r) => [r.receiptNo, r.customerName, r.firmName, r.invoiceNo, r.reference, r.remarks, MODE[r.mode].label].filter(Boolean).join(" ")}
      searchPlaceholder="Search receipt, customer, order or UTR"
      toolbar={
        <>
          {rows.length > 0 && (
            <Button asChild variant="outline">
              <a href={exportHref} download>
                <Download aria-hidden /> CSV
              </a>
            </Button>
          )}
          <NewEntryButton kind="payment">
            <Plus aria-hidden /> Record payment
          </NewEntryButton>
        </>
      }
      empty={<EmptyState icon={IndianRupee} title="No payments in this period" />}
      expand={(r) => (
        <SheetDetails
          items={[
            ["Receipt", <span key="r" className="font-mono">{r.receiptNo}</span>],
            ["Customer", r.firmName ? `${r.firmName} (${r.customerName})` : r.customerName],
            ["Against order", r.invoiceNo ?? "Advance / on account"],
            ["Mode", MODE[r.mode].label],
            ["Reference / UTR", r.reference],
            ["Amount", formatINR(r.amount)],
            ["Remarks", r.remarks],
            ["Entered by", `${r.createdByName} · ${formatDateTime(r.createdAt)}`],
          ]}
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <a href={`/print/receipt/${r.id}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Print receipt
                </a>
              </Button>
              <DeleteButton
                id={r.id}
                action={deletePayment}
                variant="button"
                title={`Delete receipt ${r.receiptNo}?`}
                description="The customer's balance will go back up by this amount."
              />
            </>
          }
        />
      )}
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
