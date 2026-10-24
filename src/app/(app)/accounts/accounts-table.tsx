"use client";

import Link from "next/link";
import { ClipboardList, Download, ExternalLink, HandCoins, IndianRupee, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { formatDay, formatINR, formatNumber } from "@/lib/format";
import type { AccountRow } from "@/server/queries/accounts";

const rupees = (v: number) => formatINR(v, { decimals: false });
const sum = (rows: AccountRow[], f: (r: AccountRow) => number) => rows.reduce((a, r) => a + f(r), 0);
const href = (r: AccountRow) => (r.kind === "customer" ? `/customers/${r.id}` : `/suppliers/${r.id}`);

/** Customers and suppliers in one sheet: who owes you, whom you owe. */
export function AccountsTable({ rows, today, exportHref }: { rows: AccountRow[]; today: string; exportHref: string }) {
  const columns: SheetColumn<AccountRow>[] = [
    {
      id: "name",
      header: "Name",
      className: "min-w-40 max-w-48 md:min-w-52 md:max-w-64",
      sortValue: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5">
            <Link href={href(r)} className="truncate font-medium hover:text-primary hover:underline">
              {r.name}
            </Link>
            {!r.active && <Pill>{r.kind === "customer" ? "Archived" : "Hidden"}</Pill>}
          </span>
          {r.contact && <span className="block truncate text-xs text-muted-foreground">{r.contact}</span>}
        </span>
      ),
    },
    {
      id: "kind",
      header: "Type",
      sortValue: (r) => r.kind,
      cell: (r) => <Pill tone={r.kind === "customer" ? "primary" : "info"}>{r.kind === "customer" ? "Customer" : "Supplier"}</Pill>,
    },
    {
      id: "phone",
      header: "Phone",
      cell: (r) =>
        r.phone ? (
          <a href={`tel:${r.phone}`} className="num hover:text-primary">
            {r.phone}
          </a>
        ) : (
          <Dash />
        ),
    },
    {
      id: "billed",
      header: "Billed",
      align: "right",
      sortValue: (r) => r.billed + r.extra,
      cell: (r) => rupees(r.billed + r.extra),
      total: (rs) => rupees(sum(rs, (r) => r.billed + r.extra)),
    },
    {
      id: "paid",
      header: "Received / paid",
      align: "right",
      sortValue: (r) => r.paid + r.credits,
      cell: (r) => <span className="text-success">{rupees(r.paid + r.credits)}</span>,
      total: (rs) => rupees(sum(rs, (r) => r.paid + r.credits)),
    },
    {
      id: "theyOwe",
      header: "They owe you",
      align: "right",
      sortValue: (r) => r.theyOwe,
      cell: (r) =>
        r.theyOwe > 0 ? (
          <span className="font-semibold">
            {rupees(r.theyOwe)}
            {r.kind === "supplier" && <span className="block text-[11px] font-normal text-muted-foreground">advance paid</span>}
          </span>
        ) : (
          <Dash />
        ),
      total: (rs) => <span className="font-semibold">{rupees(sum(rs, (r) => r.theyOwe))}</span>,
    },
    {
      id: "weOwe",
      header: "You owe them",
      align: "right",
      sortValue: (r) => r.weOwe,
      cell: (r) =>
        r.weOwe > 0 ? (
          <span className="font-semibold text-warning-foreground dark:text-warning">
            {rupees(r.weOwe)}
            {r.kind === "customer" && <span className="block text-[11px] font-normal text-muted-foreground">advance held</span>}
          </span>
        ) : (
          <Dash />
        ),
      total: (rs) => <span className="font-semibold">{rupees(sum(rs, (r) => r.weOwe))}</span>,
    },
    {
      id: "overdue",
      header: "Overdue",
      align: "right",
      sortValue: (r) => r.overdue,
      cell: (r) => (r.overdue > 0 ? <span className="font-medium text-destructive">{rupees(r.overdue)}</span> : <Dash />),
      total: (rs) => rupees(sum(rs, (r) => r.overdue)),
    },
    {
      id: "ongoing",
      header: "Ongoing",
      align: "right",
      sortValue: (r) => r.ongoing,
      cell: (r) =>
        r.ongoing ? (
          <span className="whitespace-nowrap">
            {formatNumber(r.ongoing)} {r.kind === "customer" ? (r.ongoing === 1 ? "order" : "orders") : r.ongoing === 1 ? "bill" : "bills"}
            {r.ready > 0 && (
              <span className="block text-[11px] text-success">
                {r.ready} ready to {r.kind === "customer" ? "complete" : "close"}
              </span>
            )}
          </span>
        ) : (
          <Dash />
        ),
    },
    {
      id: "last",
      header: "Last activity",
      sortValue: (r) => r.lastActivity,
      cell: (r) => (r.lastActivity ? formatDay(r.lastActivity, today) : <Dash />),
    },
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(r) => r.key}
      noun={["account", "accounts"]}
      searchText={(r) => [r.name, r.contact, r.phone, r.kind].filter(Boolean).join(" ")}
      searchPlaceholder="Search customer or supplier name, or phone"
      rowClassName={(r) => (!r.active ? "opacity-60" : undefined)}
      toolbar={
        rows.length > 0 && (
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <Download aria-hidden /> CSV
            </a>
          </Button>
        )
      }
      empty={<EmptyState icon={Scale} title="No accounts here" description="Try another filter, or clear the search." />}
      expand={(r) => (r.kind === "customer" ? <CustomerDetails r={r} /> : <SupplierDetails r={r} />)}
    />
  );
}

function CustomerDetails({ r }: { r: AccountRow }) {
  const balance = r.theyOwe - r.weOwe;
  return (
    <SheetDetails
      items={[
        ["Opening balance", r.openingBalance ? rupees(r.openingBalance) : null],
        ["Orders billed", rupees(r.billed)],
        ["+ Debit notes", r.extra ? rupees(r.extra) : null],
        ["− Received", rupees(r.paid)],
        ["− Credit notes", r.credits ? rupees(r.credits) : null],
        ["Balance", balance > 0 ? `${rupees(balance)} owed to you` : balance < 0 ? `${rupees(-balance)} advance held for them` : "Settled"],
        ["Overdue", r.overdue ? rupees(r.overdue) : null],
        ["Ongoing orders", r.ongoing ? `${r.ongoing}${r.ready ? ` (${r.ready} ready to complete)` : ""}` : "None"],
      ]}
      actions={
        <>
          <Button asChild size="sm">
            <Link href={href(r)}>
              <ExternalLink aria-hidden /> Open account
            </Link>
          </Button>
          {r.theyOwe > 0 && (
            <NewEntryButton kind="payment" customerId={r.id} size="sm" variant="outline">
              <IndianRupee aria-hidden /> Record payment
            </NewEntryButton>
          )}
          <NewEntryButton kind="order" customerId={r.id} size="sm" variant="outline">
            <ClipboardList aria-hidden /> New order
          </NewEntryButton>
        </>
      }
    />
  );
}

function SupplierDetails({ r }: { r: AccountRow }) {
  const balance = r.weOwe - r.theyOwe;
  return (
    <SheetDetails
      items={[
        ["Opening balance", r.openingBalance ? rupees(r.openingBalance) : null],
        ["Bills", rupees(r.billed)],
        ["+ Extra charges", r.extra ? rupees(r.extra) : null],
        ["− Paid", rupees(r.paid)],
        ["− Supplier credits", r.credits ? rupees(r.credits) : null],
        ["Balance", balance > 0 ? `${rupees(balance)} you owe them` : balance < 0 ? `${rupees(-balance)} advance paid to them` : "Settled"],
        ["Overdue", r.overdue ? rupees(r.overdue) : null],
        ["Ongoing bills", r.ongoing ? `${r.ongoing}${r.ready ? ` (${r.ready} ready to close)` : ""}` : "None"],
      ]}
      actions={
        <>
          <Button asChild size="sm">
            <Link href={href(r)}>
              <ExternalLink aria-hidden /> Open account
            </Link>
          </Button>
          {r.weOwe > 0 && (
            <NewEntryButton kind="supplierPayment" supplierId={r.id} size="sm" variant="outline">
              <HandCoins aria-hidden /> Pay supplier
            </NewEntryButton>
          )}
          <NewEntryButton kind="bill" supplierId={r.id} size="sm" variant="outline">
            <Plus aria-hidden /> New bill
          </NewEntryButton>
        </>
      }
    />
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
