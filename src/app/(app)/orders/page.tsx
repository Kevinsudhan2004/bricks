import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, ClipboardList, FileText, IndianRupee, PackageCheck, Truck } from "lucide-react";
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

type Status = { label: string; test: (i: InvoiceSummary) => boolean; ownerOnly?: boolean; open?: boolean };

const STATUS: Record<string, Status> = {
  open: { label: "To deliver", test: (i) => !i.cancelled && i.pending > 0, open: true },
  delivered: { label: "Delivered", test: (i) => !i.cancelled && i.pending === 0 },
  unpaid: { label: "Payment due", test: (i) => !i.cancelled && i.balance > 0, ownerOnly: true, open: true },
  overdue: { label: "Overdue", test: (i) => i.paymentStatus === "overdue", ownerOnly: true, open: true },
  done: { label: "Completed", test: (i) => !i.cancelled && i.pending === 0 && i.balance <= 0, ownerOnly: true },
  cancelled: { label: "Cancelled", test: (i) => i.cancelled },
};

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every customer order: bricks ordered, delivered and still pending."
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
  const statuses = Object.entries(STATUS).filter(([, s]) => isOwner || !s.ownerOnly);
  const requested = strParam(sp, "status");
  // Employees land on what matters to them: orders still to deliver.
  const statusKey = requested && STATUS[requested] && (isOwner || !STATUS[requested].ownerOnly) ? requested : isOwner ? undefined : requested === "all" ? undefined : "open";
  const status = statusKey ? STATUS[statusKey] : undefined;
  const range = resolveRange(sp, t, "90d");
  // Open views look across all dates so nothing old is missed.
  const all = await getInvoiceSummaries(status?.open ? {} : { from: range.from, to: range.to }, t);
  const list = status ? all.filter(status.test) : all;
  const params = flatParams(sp);

  const active = list.filter((i) => !i.cancelled);
  const ordered = active.reduce((a, i) => a + i.ordered, 0);
  const delivered = active.reduce((a, i) => a + i.delivered, 0);
  const pending = active.reduce((a, i) => a + i.pending, 0);
  const billed = active.reduce((a, i) => a + i.total, 0);
  const due = active.reduce((a, i) => a + Math.max(i.balance, 0), 0);
  const overdue = active.filter((i) => i.paymentStatus === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ChipFilter
          pathname="/orders"
          params={params}
          name="status"
          value={statusKey ?? (isOwner ? undefined : "all")}
          allLabel="All orders"
          hideAll={!isOwner}
          options={[
            ...statuses.map(([value, s]) => ({ value, label: s.label })),
            ...(isOwner ? [] : [{ value: "all", label: "All orders" }]),
          ]}
        />
        {!status?.open && (
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

      {isOwner ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Billed" value={formatINRCompact(billed)} hint={`${active.length} orders`} icon={FileText} />
          <StatCard label="Balance due" value={formatINRCompact(due)} icon={IndianRupee} tone="warning" />
          <StatCard label="Bricks pending" value={formatNumber(pending)} icon={Truck} tone="info" />
          <StatCard
            label="Overdue orders"
            value={formatNumber(overdue)}
            icon={AlertTriangle}
            tone={overdue ? "danger" : "success"}
            href={overdue ? "/orders?status=overdue" : undefined}
          />
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
        emptyText={status ? `No orders ${status.label.toLowerCase() === "to deliver" ? "waiting for delivery" : `marked “${status.label}”`}` : "No orders in this period"}
      />
    </div>
  );
}
