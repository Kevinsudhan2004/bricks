import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, IndianRupee, PackageCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChipFilter, RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { InvoiceList } from "@/components/sales/invoice-list";
import { getCurrentUser } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatINRCompact, formatNumber } from "@/lib/format";
import { flatParams, strParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getInvoiceSummaries, type InvoiceSummary } from "@/server/queries/invoices";

export const metadata: Metadata = { title: "Orders" };

type Filter = { label: string; test: (i: InvoiceSummary) => boolean; ownerOnly?: boolean };

/** Every order is Ongoing until the owner marks it Completed (all delivered, debit = credit). */
const STATES = {
  ongoing: { label: "Ongoing", test: (i: InvoiceSummary) => i.state === "ongoing" },
  completed: { label: "Completed", test: (i: InvoiceSummary) => i.state === "closed" },
  cancelled: { label: "Cancelled", test: (i: InvoiceSummary) => i.state === "cancelled" },
  all: { label: "All orders", test: () => true },
} as const;
type StateKey = keyof typeof STATES;

/** Narrower views inside Ongoing. */
const ONGOING: Record<string, Filter> = {
  open: { label: "To deliver", test: (i) => i.pending > 0 },
  unpaid: { label: "Payment due", test: (i) => i.balance > 0, ownerOnly: true },
  overdue: { label: "Overdue", test: (i) => i.paymentStatus === "overdue", ownerOnly: true },
  ready: { label: "Ready to complete", test: (i) => i.readyToClose, ownerOnly: true },
};

/** Older links used ?status=done / cancelled for whole states. */
const LEGACY_STATE: Record<string, StateKey> = { done: "completed", cancelled: "cancelled" };

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Each order stays Ongoing until every brick is delivered and debit = credit (billed = received). Then it can be marked Completed."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={4} />
            <ListSkeleton />
          </div>
        }
      >
        <OrdersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OrdersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, t, user] = await Promise.all([searchParams, today(), getCurrentUser()]);
  const isOwner = user.role === "owner";
  const rawStatus = strParam(sp, "status");
  const rawState = strParam(sp, "state");
  const stateKey: StateKey =
    rawState && rawState in STATES ? (rawState as StateKey) : rawStatus && LEGACY_STATE[rawStatus] ? LEGACY_STATE[rawStatus] : "ongoing";
  const filters = Object.entries(ONGOING).filter(([, f]) => isOwner || !f.ownerOnly);
  // Employees land on what matters to them: ongoing orders still to deliver.
  const filterKey =
    stateKey !== "ongoing"
      ? undefined
      : rawStatus && ONGOING[rawStatus] && (isOwner || !ONGOING[rawStatus].ownerOnly)
        ? rawStatus
        : !isOwner && rawStatus !== "all"
          ? "open"
          : undefined;
  const filter = filterKey ? ONGOING[filterKey] : undefined;
  const range = resolveRange(sp, t, "90d");

  // Ongoing orders are listed whatever their date so nothing old is missed; the other states use the date range.
  const everything = await getInvoiceSummaries({}, t);
  const ongoing = everything.filter(STATES.ongoing.test);
  const inRange = stateKey === "ongoing" ? ongoing : (await getInvoiceSummaries({ from: range.from, to: range.to }, t)).filter(STATES[stateKey].test);
  const list = filter ? inRange.filter(filter.test) : inRange;
  const readyCount = ongoing.filter((i) => i.readyToClose).length;
  const params = flatParams(sp);
  // Switching state drops the Ongoing-only filter.
  const stateParams = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "status"));

  const active = list.filter((i) => !i.cancelled);
  const ordered = active.reduce((a, i) => a + i.ordered, 0);
  const delivered = active.reduce((a, i) => a + i.delivered, 0);
  const pending = active.reduce((a, i) => a + i.pending, 0);
  const billed = active.reduce((a, i) => a + i.total + i.debits, 0);
  const received = active.reduce((a, i) => a + i.paid + i.credits, 0);
  const due = active.reduce((a, i) => a + Math.max(i.balance, 0), 0);
  const overdue = active.filter((i) => i.paymentStatus === "overdue");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ChipFilter
          pathname="/orders"
          params={stateParams}
          name="state"
          value={stateKey === "ongoing" ? undefined : stateKey}
          hideAll
          options={(Object.entries(STATES) as [StateKey, (typeof STATES)[StateKey]][]).map(([value, s]) => ({
            value: value === "ongoing" ? "" : value,
            label: value === "ongoing" ? `${s.label} · ${formatNumber(ongoing.length)}` : s.label,
          }))}
        />
        {stateKey === "ongoing" ? (
          <ChipFilter
            pathname="/orders"
            params={params}
            name="status"
            value={filterKey ?? (isOwner ? undefined : "all")}
            allLabel="All ongoing"
            hideAll={!isOwner}
            options={[
              ...(isOwner ? [] : [{ value: "all", label: "All ongoing" }]),
              ...filters.map(([value, f]) => ({
                value,
                label: value === "ready" && readyCount ? `${f.label} · ${readyCount}` : f.label,
              })),
            ]}
          />
        ) : (
          <RangeFilter
            pathname="/orders"
            params={params}
            preset={range.preset}
            from={range.from}
            to={range.to}
            presets={["7d", "30d", "month", "lastmonth", "90d"]}
          />
        )}
      </div>

      {isOwner && stateKey === "ongoing" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Ongoing orders" value={formatNumber(active.length)} hint={`${formatINRCompact(billed)} billed`} icon={ClipboardList} />
          <StatCard
            label="Balance due"
            value={formatINRCompact(due)}
            hint={overdue.length ? `${overdue.length} overdue` : "Nothing overdue"}
            icon={overdue.length ? AlertTriangle : IndianRupee}
            tone={overdue.length ? "danger" : "warning"}
            href={overdue.length ? "/orders?status=overdue" : "/orders?status=unpaid"}
          />
          <StatCard label="Bricks to deliver" value={formatNumber(pending)} icon={Truck} tone="info" href="/orders?status=open" />
          <StatCard
            label="Ready to complete"
            value={formatNumber(readyCount)}
            hint="Delivered and debit = credit"
            icon={CheckCircle2}
            tone="success"
            href={readyCount ? "/orders?status=ready" : undefined}
          />
        </div>
      ) : isOwner ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Orders" value={formatNumber(list.length)} hint={range.label} icon={ClipboardList} />
          <StatCard label="Billed" value={formatINRCompact(billed)} hint="Order totals + debit notes" icon={FileText} />
          <StatCard label="Received" value={formatINRCompact(received)} hint="Payments + credit notes" icon={IndianRupee} tone="success" />
          <StatCard label="Bricks delivered" value={formatNumber(delivered)} icon={PackageCheck} tone="success" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Orders" value={formatNumber(active.length)} icon={ClipboardList} />
          <StatCard label="Bricks ordered" value={formatNumber(ordered)} icon={FileText} />
          <StatCard label="Delivered" value={formatNumber(delivered)} icon={PackageCheck} tone="success" />
          <StatCard label="Still to deliver" value={formatNumber(pending)} icon={Truck} tone="info" />
        </div>
      )}

      <InvoiceList
        invoices={list}
        showMoney={isOwner}
        bulkClose={stateKey === "ongoing"}
        emptyText={
          filter
            ? filterKey === "ready"
              ? "No orders are ready to complete. An order is ready once every brick is delivered and debit = credit."
              : `No ongoing orders marked “${filter.label}”`
            : stateKey === "ongoing"
              ? "No ongoing orders"
              : `No ${stateKey === "all" ? "" : `${STATES[stateKey].label.toLowerCase()} `}orders in this period`
        }
      />
    </div>
  );
}
