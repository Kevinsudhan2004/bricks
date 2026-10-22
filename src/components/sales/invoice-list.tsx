"use client";

import Link from "next/link";
import { ClipboardList, ExternalLink, FileMinus, FileText, IndianRupee, Printer, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { DeliveryBadge, PaymentBadge } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { productColor } from "@/lib/colors";
import { formatDate, formatINR, formatNumber, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceSummary } from "@/server/queries/invoices";

const rupees = (v: number) => formatINR(v, { decimals: false });
const live = (rows: InvoiceSummary[]) => rows.filter((i) => !i.cancelled);
const sum = (rows: InvoiceSummary[], f: (i: InvoiceSummary) => number) => live(rows).reduce((a, i) => a + f(i), 0);

/** Delivered vs ordered, per product — "8,000 of 20,000 pending". */
export function DeliveryProgress({ invoice, compact = false }: { invoice: InvoiceSummary; compact?: boolean }) {
  if (invoice.cancelled) return <span className="text-xs text-muted-foreground">Cancelled</span>;
  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      {invoice.products.map((p, i) => {
        const done = pct(p.delivered, p.ordered);
        return (
          <div key={p.productId}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{p.productName}</span>
              <span className="num shrink-0">
                {p.pending > 0 ? (
                  <>
                    <span className="font-semibold">{formatNumber(p.pending)}</span>
                    <span className="text-muted-foreground"> of {formatNumber(p.ordered)} pending</span>
                  </>
                ) : (
                  <span className="text-success">{formatNumber(p.ordered)} delivered</span>
                )}
              </span>
            </div>
            <div
              className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${p.productName} delivered`}
            >
              <div className="h-full rounded-full" style={{ width: `${done}%`, background: productColor(p.productCode, i) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InvoiceList({
  invoices,
  showCustomer = true,
  showMoney = true,
  emptyText = "No orders here.",
  customerId,
}: {
  invoices: InvoiceSummary[];
  showCustomer?: boolean;
  /** Owners see amounts and payment status; employees see only bricks. */
  showMoney?: boolean;
  emptyText?: string;
  /** Pre-picks this customer in the "New order" sheet. */
  customerId?: number;
}) {
  const columns: SheetColumn<InvoiceSummary>[] = [
    {
      id: "no",
      header: "Order",
      className: "min-w-28",
      sortValue: (i) => i.invoiceNo,
      cell: (i) => (
        <Link href={`/orders/${i.id}`} className="font-mono text-xs font-semibold hover:text-primary hover:underline">
          {i.invoiceNo}
        </Link>
      ),
    },
    { id: "date", header: "Date", sortValue: (i) => i.invoiceDate, cell: (i) => formatDate(i.invoiceDate) },
    ...(showCustomer
      ? ([
          {
            id: "customer",
            header: "Customer",
            className: "max-w-44 md:max-w-60",
            sortValue: (i) => (i.firmName ?? i.customerName).toLowerCase(),
            cell: (i) =>
              showMoney ? (
                <Link href={`/customers/${i.customerId}`} className="block truncate font-medium hover:text-primary hover:underline">
                  {i.firmName ?? i.customerName}
                </Link>
              ) : (
                <span className="block truncate font-medium">{i.firmName ?? i.customerName}</span>
              ),
          },
        ] satisfies SheetColumn<InvoiceSummary>[])
      : []),
    {
      id: "products",
      header: "Products",
      cell: (i) => (
        <span className="flex gap-1.5">
          {i.products.map((p, k) => (
            <span key={p.productId} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: productColor(p.productCode, k) }} aria-hidden />
              {p.productName}
            </span>
          ))}
        </span>
      ),
    },
    { id: "ordered", header: "Ordered", align: "right", sortValue: (i) => i.ordered, cell: (i) => formatNumber(i.ordered), total: (r) => formatNumber(sum(r, (i) => i.ordered)) },
    { id: "delivered", header: "Delivered", align: "right", sortValue: (i) => i.delivered, cell: (i) => formatNumber(i.delivered), total: (r) => formatNumber(sum(r, (i) => i.delivered)) },
    {
      id: "pending",
      header: "To deliver",
      align: "right",
      sortValue: (i) => (i.cancelled ? -1 : i.pending),
      cell: (i) =>
        i.cancelled ? <Dash /> : i.pending > 0 ? <span className="font-semibold text-info">{formatNumber(i.pending)}</span> : <span className="text-success">0</span>,
      total: (r) => formatNumber(sum(r, (i) => i.pending)),
    },
    {
      id: "progress",
      header: "Delivered %",
      className: "min-w-28",
      sortValue: (i) => pct(i.delivered, i.ordered),
      cell: (i) => (i.cancelled ? <Dash /> : <Meter value={pct(i.delivered, i.ordered)} />),
    },
    ...(showMoney
      ? ([
          { id: "total", header: "Total", align: "right", sortValue: (i) => i.total, cell: (i) => <span className="font-medium">{rupees(i.total)}</span>, total: (r) => rupees(sum(r, (i) => i.total)) },
          {
            id: "received",
            header: "Received",
            align: "right",
            sortValue: (i) => i.paid + i.credits - i.debits,
            cell: (i) => <span className="text-success">{rupees(i.paid + i.credits - i.debits)}</span>,
            total: (r) => rupees(sum(r, (i) => i.paid + i.credits - i.debits)),
          },
          {
            id: "balance",
            header: "Balance",
            align: "right",
            sortValue: (i) => (i.cancelled ? -1 : i.balance),
            cell: (i) =>
              i.cancelled ? <Dash /> : <span className={cn("font-semibold", i.paymentStatus === "overdue" && "text-destructive", i.balance <= 0 && "text-muted-foreground")}>{rupees(i.balance)}</span>,
            total: (r) => rupees(sum(r, (i) => Math.max(i.balance, 0))),
          },
          { id: "due", header: "Due by", sortValue: (i) => i.dueDate, cell: (i) => (i.dueDate && !i.cancelled ? formatDate(i.dueDate) : <Dash />) },
        ] satisfies SheetColumn<InvoiceSummary>[])
      : []),
    {
      id: "status",
      header: "Status",
      cell: (i) => (
        <span className="flex gap-1">
          <DeliveryBadge status={i.deliveryStatus} />
          {showMoney && !i.cancelled && <PaymentBadge status={i.paymentStatus} />}
        </span>
      ),
    },
  ];

  return (
    <DataSheet
      rows={invoices}
      columns={columns}
      rowKey={(i) => i.id}
      noun={["order", "orders"]}
      searchText={(i) => [i.invoiceNo, i.customerName, i.firmName, ...i.products.map((p) => p.productName)].filter(Boolean).join(" ")}
      searchPlaceholder={showCustomer ? "Search order no, customer or product" : "Search order no or product"}
      rowClassName={(i) => (i.cancelled ? "opacity-60" : undefined)}
      toolbar={
        <NewEntryButton kind="order" customerId={customerId}>
          <ClipboardList aria-hidden /> New order
        </NewEntryButton>
      }
      empty={<EmptyState icon={FileText} title={emptyText} />}
      expand={(i) => <InvoiceDetails i={i} showMoney={showMoney} />}
    />
  );
}

function InvoiceDetails({ i, showMoney }: { i: InvoiceSummary; showMoney: boolean }) {
  return (
    <SheetDetails
      items={[
        ["Customer", i.firmName ? `${i.firmName} (${i.customerName})` : i.customerName],
        ["Order date", formatDate(i.invoiceDate)],
        ...(showMoney
          ? ([
              ["Payment due by", i.dueDate ? formatDate(i.dueDate) : null],
              ["Order total", rupees(i.total)],
              ["Paid", rupees(i.paid)],
              ["Credit notes", i.credits ? `− ${rupees(i.credits)}` : null],
              ["Debit notes", i.debits ? `+ ${rupees(i.debits)}` : null],
              ["Balance", i.cancelled ? "Cancelled" : rupees(i.balance)],
            ] satisfies [string, React.ReactNode][])
          : []),
      ]}
      actions={
        <>
          {!i.cancelled && i.pending > 0 && (
            <Button asChild size="sm">
              <Link href={`/dispatch?order=${i.id}`}>
                <Truck aria-hidden /> Dispatch bricks
              </Link>
            </Button>
          )}
          {showMoney && !i.cancelled && (
            <>
              {i.balance > 0 && (
                <NewEntryButton kind="payment" customerId={i.customerId} invoiceId={i.id} size="sm" variant={i.pending > 0 ? "outline" : "default"}>
                  <IndianRupee aria-hidden /> Record payment
                </NewEntryButton>
              )}
              <NewEntryButton kind="credit" customerId={i.customerId} invoiceId={i.id} size="sm" variant="outline">
                <FileMinus aria-hidden /> Credit / debit note
              </NewEntryButton>
              <Button asChild size="sm" variant="ghost">
                <a href={`/print/invoice/${i.id}`} target="_blank" rel="noopener">
                  <Printer aria-hidden /> Invoice
                </a>
              </Button>
            </>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/orders/${i.id}`}>
              <ExternalLink aria-hidden /> Full order
            </Link>
          </Button>
        </>
      }
    >
      <div className="max-w-xl">
        <DeliveryProgress invoice={i} />
      </div>
    </SheetDetails>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", value >= 100 ? "bg-success" : "bg-info")} style={{ width: `${value}%` }} />
      </span>
      <span className="num text-xs text-muted-foreground">{value}%</span>
    </span>
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
