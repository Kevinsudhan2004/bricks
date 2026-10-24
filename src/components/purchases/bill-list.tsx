"use client";

import Link from "next/link";
import { ExternalLink, FileMinus, FileStack, HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { PaymentBadge, StateBadge } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { CloseButton } from "@/components/forms/close-buttons";
import { materialColor } from "@/lib/colors";
import { formatDate, formatDateTime, formatINR, formatNumber, formatTonnes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { closePurchaseBills } from "@/server/actions/purchases";
import type { BillSummary } from "@/server/queries/purchases";

const rupees = (v: number) => formatINR(v, { decimals: false });
const live = (rows: BillSummary[]) => rows.filter((b) => !b.cancelled);
const sum = (rows: BillSummary[], f: (b: BillSummary) => number) => live(rows).reduce((a, b) => a + f(b), 0);
const STATE_ORDER = { ongoing: 0, closed: 1, cancelled: 2 } as const;

/** Raw material bills from suppliers: what each one costs, what we paid and what's still to pay. */
export function BillList({
  bills,
  showSupplier = true,
  emptyText = "No bills here.",
  supplierId,
  bulkClose = false,
}: {
  bills: BillSummary[];
  showSupplier?: boolean;
  emptyText?: string;
  /** Pre-picks this supplier in the "New bill" sheet. */
  supplierId?: number;
  /** Offer "Close all ready" for the bills in this list whose debit = credit. */
  bulkClose?: boolean;
}) {
  const ready = bills.filter((b) => b.readyToClose);
  const columns: SheetColumn<BillSummary>[] = [
    {
      id: "no",
      header: "Bill",
      className: "min-w-28",
      sortValue: (b) => b.billNo,
      cell: (b) => (
        <Link href={`/purchases/${b.id}`} className="block hover:text-primary">
          <span className="font-mono text-xs font-semibold hover:underline">{b.billNo}</span>
          {b.supplierBillNo && <span className="block text-[11px] text-muted-foreground">Their no. {b.supplierBillNo}</span>}
        </Link>
      ),
    },
    { id: "date", header: "Date", sortValue: (b) => b.billDate, cell: (b) => formatDate(b.billDate) },
    {
      id: "state",
      header: "State",
      sortValue: (b) => STATE_ORDER[b.state] * 2 + (b.readyToClose ? 0 : 1),
      cell: (b) => <StateBadge kind="bill" state={b.state} ready={b.readyToClose} />,
    },
    ...(showSupplier
      ? ([
          {
            id: "supplier",
            header: "Supplier",
            className: "max-w-44 md:max-w-60",
            sortValue: (b) => b.supplierName.toLowerCase(),
            cell: (b) => (
              <Link href={`/suppliers/${b.supplierId}`} className="block truncate font-medium hover:text-primary hover:underline">
                {b.supplierName}
              </Link>
            ),
          },
        ] satisfies SheetColumn<BillSummary>[])
      : []),
    {
      id: "materials",
      header: "Material",
      cell: (b) => (
        <span className="flex gap-1.5">
          {(b.materials ?? "").split(", ").filter(Boolean).map((name, k) => (
            <span key={name} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: materialColor(b.materialCodes[k] ?? "", k) }} aria-hidden />
              {name}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "tonnes",
      header: "Tonnes",
      align: "right",
      sortValue: (b) => b.kg,
      cell: (b) => formatTonnes(b.kg),
      total: (r) => formatTonnes(sum(r, (b) => b.kg)),
    },
    { id: "loads", header: "Loads", align: "right", sortValue: (b) => b.loads, cell: (b) => (b.loads ? formatNumber(b.loads) : <Dash />) },
    {
      id: "total",
      header: "Bill",
      align: "right",
      sortValue: (b) => b.total + b.debits,
      cell: (b) => <span className="font-medium">{rupees(b.total + b.debits)}</span>,
      total: (r) => rupees(sum(r, (b) => b.total + b.debits)),
    },
    {
      id: "paid",
      header: "Paid + credit",
      align: "right",
      sortValue: (b) => b.paid + b.credits,
      cell: (b) => <span className="text-success">{rupees(b.paid + b.credits)}</span>,
      total: (r) => rupees(sum(r, (b) => b.paid + b.credits)),
    },
    {
      id: "balance",
      header: "To pay",
      align: "right",
      sortValue: (b) => (b.cancelled ? -1 : b.balance),
      cell: (b) =>
        b.cancelled ? (
          <Dash />
        ) : (
          <span className={cn("font-semibold", b.paymentStatus === "overdue" && "text-destructive", b.balance <= 0 && "text-muted-foreground")}>
            {b.balance < 0 ? `${rupees(-b.balance)} extra` : rupees(b.balance)}
          </span>
        ),
      total: (r) => rupees(sum(r, (b) => Math.max(b.balance, 0))),
    },
    { id: "due", header: "Pay by", sortValue: (b) => b.dueDate, cell: (b) => (b.dueDate && b.state === "ongoing" ? formatDate(b.dueDate) : <Dash />) },
    {
      id: "status",
      header: "Payment",
      cell: (b) => (b.state === "ongoing" ? <PaymentBadge status={b.paymentStatus} /> : b.state === "closed" ? <span className="text-xs text-muted-foreground">Settled</span> : <Dash />),
    },
  ];

  return (
    <DataSheet
      rows={bills}
      columns={columns}
      rowKey={(b) => b.id}
      noun={["bill", "bills"]}
      searchText={(b) => [b.billNo, b.supplierBillNo, b.supplierName, b.materials].filter(Boolean).join(" ")}
      searchPlaceholder={showSupplier ? "Search bill no, supplier or material" : "Search bill no or material"}
      rowClassName={(b) => (b.cancelled ? "opacity-60" : undefined)}
      toolbar={
        <>
          {bulkClose && ready.length > 0 && (
            <CloseButton
              ids={ready.map((b) => b.id)}
              action={closePurchaseBills}
              variant="outline"
              label={ready.length === 1 ? "Close 1 settled bill" : `Close ${ready.length} settled bills`}
              title={`Close ${ready.length === 1 ? "this bill" : `${ready.length} bills`}?`}
              description={
                <>
                  These bills are fully paid: bill + extra charges = payments + supplier credits. Closed bills move to the Closed list
                  and are locked until you reopen one.
                  <span className="mt-2 block font-mono text-xs">{ready.map((b) => b.billNo).join(", ")}</span>
                </>
              }
            />
          )}
          <NewEntryButton kind="supplierPayment" supplierId={supplierId} variant="outline">
            <HandCoins aria-hidden /> Pay supplier
          </NewEntryButton>
          <NewEntryButton kind="bill" supplierId={supplierId}>
            <Plus aria-hidden /> New bill
          </NewEntryButton>
        </>
      }
      empty={<EmptyState icon={FileStack} title={emptyText} />}
      expand={(b) => (
        <SheetDetails
          items={[
            ["Supplier", b.supplierName],
            ["Their bill no.", b.supplierBillNo],
            ["Bill date", formatDate(b.billDate)],
            [
              "State",
              b.state === "closed" && b.closedAt
                ? `Closed on ${formatDateTime(b.closedAt)}`
                : b.readyToClose
                  ? "Fully paid — ready to close"
                  : b.state === "ongoing"
                    ? "Ongoing"
                    : "Cancelled",
            ],
            ["Bill total", rupees(b.total)],
            ["Extra charges", b.debits ? `+ ${rupees(b.debits)}` : null],
            ["Supplier credits", b.credits ? `− ${rupees(b.credits)}` : null],
            ["Paid", rupees(b.paid)],
            ["To pay", b.cancelled ? "Cancelled" : rupees(b.balance)],
          ]}
          actions={
            <>
              {b.readyToClose && (
                <CloseButton
                  ids={[b.id]}
                  action={closePurchaseBills}
                  size="sm"
                  label="Close bill"
                  title={`Close ${b.billNo}?`}
                  description={`Debit = credit: ${rupees(b.total + b.debits)} billed, ${rupees(b.paid + b.credits)} paid and credited. The bill moves to Closed and is locked until you reopen it.`}
                />
              )}
              {b.state === "ongoing" && b.balance > 0 && (
                <NewEntryButton kind="supplierPayment" supplierId={b.supplierId} billId={b.id} size="sm">
                  <HandCoins aria-hidden /> Pay
                </NewEntryButton>
              )}
              {b.state === "ongoing" && (
                <NewEntryButton kind="supplierCredit" supplierId={b.supplierId} billId={b.id} size="sm" variant="outline">
                  <FileMinus aria-hidden /> Credit / extra charge
                </NewEntryButton>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link href={`/purchases/${b.id}`}>
                  <ExternalLink aria-hidden /> Full bill
                </Link>
              </Button>
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
