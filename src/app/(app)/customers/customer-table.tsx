"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, ExternalLink, FileMinus, IndianRupee, Pencil, Truck, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataSheet, SheetDetails, type SheetColumn } from "@/components/common/data-sheet";
import { EmptyState } from "@/components/common/empty-state";
import { Pill } from "@/components/common/status-badge";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { formatDate, formatINR, formatNumber, pct } from "@/lib/format";
import type { CustomerBalance, CustomerContact } from "@/server/queries/customers";
import { EditCustomerButton } from "./customer-quick";

/** Contact details plus, for the owner, the account figures. */
export type CustomerRow = Partial<Omit<CustomerContact, "id" | "name" | "firmName" | "phone" | "active">> &
  Pick<CustomerContact, "id" | "name" | "firmName" | "phone" | "active"> & {
    pending: number;
    openOrders?: number;
    account?: Omit<CustomerBalance, "id" | "name" | "firmName" | "phone" | "stateName" | "active" | "pending">;
  };

const rupees = (v: number) => formatINR(v, { decimals: false });
const sum = (rows: CustomerRow[], f: (r: CustomerRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export function CustomerTable({ customers, showMoney }: { customers: CustomerRow[]; showMoney: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(() => customers.filter((c) => showArchived || c.active), [customers, showArchived]);

  const columns: SheetColumn<CustomerRow>[] = [
    {
      id: "customer",
      header: "Customer",
      className: "min-w-40 max-w-48 md:min-w-52 md:max-w-64",
      sortValue: (c) => (c.firmName ?? c.name).toLowerCase(),
      cell: (c) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5">
            {showMoney ? (
              <Link href={`/customers/${c.id}`} className="truncate font-medium hover:text-primary hover:underline">
                {c.firmName ?? c.name}
              </Link>
            ) : (
              <span className="truncate font-medium">{c.firmName ?? c.name}</span>
            )}
            {!c.active && <Pill>Archived</Pill>}
          </span>
          {c.firmName && <span className="block truncate text-xs text-muted-foreground">{c.name}</span>}
        </span>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      sortValue: (c) => c.phone,
      cell: (c) =>
        c.phone ? (
          <a href={`tel:${c.phone}`} className="num hover:text-primary">
            {c.phone}
          </a>
        ) : (
          <Dash />
        ),
    },
    {
      id: "site",
      header: "Site / place",
      className: "max-w-44 md:max-w-60",
      sortValue: (c) => c.siteAddress,
      cell: (c) => (c.siteAddress ? <span className="block truncate">{c.siteAddress}</span> : <Dash />),
    },
    ...(showMoney
      ? ([
          { id: "orders", header: "Orders", align: "right", sortValue: (c) => c.account?.invoiceCount ?? 0, cell: (c) => formatNumber(c.account?.invoiceCount ?? 0), total: (r) => formatNumber(sum(r, (c) => c.account?.invoiceCount ?? 0)) },
          { id: "ordered", header: "Bricks ordered", align: "right", sortValue: (c) => c.account?.ordered ?? 0, cell: (c) => formatNumber(c.account?.ordered ?? 0), total: (r) => formatNumber(sum(r, (c) => c.account?.ordered ?? 0)) },
          { id: "delivered", header: "Delivered", align: "right", sortValue: (c) => c.account?.delivered ?? 0, cell: (c) => formatNumber(c.account?.delivered ?? 0), total: (r) => formatNumber(sum(r, (c) => c.account?.delivered ?? 0)) },
        ] satisfies SheetColumn<CustomerRow>[])
      : []),
    {
      id: "pending",
      header: "To deliver",
      align: "right",
      sortValue: (c) => c.pending,
      cell: (c) => (c.pending > 0 ? <span className="font-semibold text-info">{formatNumber(c.pending)}</span> : <Dash />),
      total: (r) => formatNumber(sum(r, (c) => c.pending)),
    },
    ...(showMoney
      ? ([
          { id: "billed", header: "Billed", align: "right", sortValue: (c) => c.account?.billed ?? 0, cell: (c) => rupees(c.account?.billed ?? 0), total: (r) => rupees(sum(r, (c) => c.account?.billed ?? 0)) },
          { id: "paid", header: "Received", align: "right", sortValue: (c) => c.account?.paid ?? 0, cell: (c) => <span className="text-success">{rupees(c.account?.paid ?? 0)}</span>, total: (r) => rupees(sum(r, (c) => c.account?.paid ?? 0)) },
          {
            id: "balance",
            header: "Balance",
            align: "right",
            sortValue: (c) => c.account?.outstanding ?? 0,
            cell: (c) => <Balance value={c.account?.outstanding ?? 0} />,
            total: (r) => rupees(sum(r, (c) => Math.max(c.account?.outstanding ?? 0, 0))),
          },
          {
            id: "last",
            header: "Last activity",
            sortValue: (c) => c.account?.lastActivity,
            cell: (c) => (c.account?.lastActivity ? formatDate(c.account.lastActivity) : <Dash />),
          },
        ] satisfies SheetColumn<CustomerRow>[])
      : ([
          { id: "openOrders", header: "Open orders", align: "right", sortValue: (c) => c.openOrders ?? 0, cell: (c) => (c.openOrders ? formatNumber(c.openOrders) : <Dash />) },
        ] satisfies SheetColumn<CustomerRow>[])),
  ];

  return (
    <DataSheet
      rows={rows}
      columns={columns}
      rowKey={(c) => c.id}
      noun={["customer", "customers"]}
      searchText={(c) => [c.name, c.firmName, c.phone, c.altPhone, c.siteAddress, c.gstin].filter(Boolean).join(" ")}
      searchPlaceholder="Search name, firm, phone or site"
      initialSort={showMoney ? { id: "balance", dir: "desc" } : { id: "pending", dir: "desc" }}
      rowClassName={(c) => (!c.active ? "opacity-60" : undefined)}
      toolbar={
        <>
          {showMoney && (
            <Button
              variant={showArchived ? "secondary" : "outline"}
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
            >
              Archived
            </Button>
          )}
          <NewEntryButton kind="customer">
            <UserPlus aria-hidden /> New customer
          </NewEntryButton>
        </>
      }
      empty={<EmptyState icon={Users} title="No customers yet" description="Add your first customer with “New customer”." />}
      expand={(c) => <CustomerDetails c={c} showMoney={showMoney} />}
    />
  );
}

function CustomerDetails({ c, showMoney }: { c: CustomerRow; showMoney: boolean }) {
  const a = c.account;
  const ordered = a?.ordered ?? 0;
  const delivered = a?.delivered ?? 0;
  return (
    <SheetDetails
      items={[
        ["Contact person", c.name],
        ["Firm", c.firmName],
        ["Phone", c.phone],
        ["Alternate phone", c.altPhone],
        ["GSTIN", c.gstin ? <span className="font-mono">{c.gstin}</span> : null],
        ["State", c.stateName],
        ["Site / delivery address", c.siteAddress],
        ["Billing address", c.billingAddress],
        ...(showMoney && a
          ? ([
              ["Opening balance", a.openingBalance ? rupees(a.openingBalance) : null],
              ["Credit notes", a.credits ? `− ${rupees(a.credits)}` : null],
              ["Debit notes", a.debits ? `+ ${rupees(a.debits)}` : null],
            ] satisfies [string, React.ReactNode][])
          : []),
      ]}
      actions={
        <>
          <NewEntryButton kind="order" customerId={c.id} size="sm">
            <ClipboardList aria-hidden /> New order
          </NewEntryButton>
          {showMoney && (
            <>
              <NewEntryButton kind="payment" customerId={c.id} size="sm" variant="outline">
                <IndianRupee aria-hidden /> Record payment
              </NewEntryButton>
              <NewEntryButton kind="credit" customerId={c.id} size="sm" variant="outline">
                <FileMinus aria-hidden /> Credit / debit note
              </NewEntryButton>
            </>
          )}
          {c.pending > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dispatch?customer=${c.id}`}>
                <Truck aria-hidden /> Dispatch
              </Link>
            </Button>
          )}
          {showMoney ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/customers/${c.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/customers/${c.id}`}>
                  <ExternalLink aria-hidden /> Full account
                </Link>
              </Button>
            </>
          ) : (
            <EditCustomerButton
              id={c.id}
              initial={{
                name: c.name,
                firmName: c.firmName ?? "",
                phone: c.phone ?? "",
                altPhone: c.altPhone ?? "",
                gstin: c.gstin ?? "",
                billingAddress: c.billingAddress ?? "",
                siteAddress: c.siteAddress ?? "",
                stateName: c.stateName ?? "",
                openingBalance: "",
                notes: "",
              }}
            />
          )}
        </>
      }
    >
      {ordered > 0 && (
        <div className="max-w-md">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {formatNumber(delivered)} of {formatNumber(ordered)} bricks delivered
            </span>
            <span className="num">{pct(delivered, ordered)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-info" style={{ width: `${pct(delivered, ordered)}%` }} />
          </div>
        </div>
      )}
    </SheetDetails>
  );
}

function Balance({ value }: { value: number }) {
  return (
    <span className={cn("font-semibold", value > 0 ? "text-foreground" : value < 0 ? "text-success" : "text-muted-foreground")}>
      {value === 0 ? "Settled" : rupees(Math.abs(value))}
      {value < 0 && <span className="ml-1 text-[11px] font-normal">adv</span>}
    </span>
  );
}

function Dash() {
  return <span className="text-muted-foreground/60">—</span>;
}
