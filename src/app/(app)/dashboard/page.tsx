import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Factory,
  FileStack,
  FileText,
  HandCoins,
  IndianRupee,
  MapPin,
  PackageOpen,
  Plus,
  Truck,
  Wallet,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { NewEntryButton } from "@/components/entry/quick-entry";
import { RangeFilter } from "@/components/common/range-filter";
import { ChartSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import {
  AgeingChart,
  CapacityGauge,
  InboundChart,
  MaterialStock,
  MoneyChart,
  ProductionChart,
  RankedBars,
  YardStockChart,
} from "@/components/charts/lazy";
import { requireOwner } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatDate, formatINR, formatINRCompact, formatNumber, formatTonnes, pct } from "@/lib/format";
import { flatParams, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { cn } from "@/lib/utils";
import { STATE_META, statusLine } from "@/components/trucks/status";
import { getDashboard } from "@/server/queries/dashboard";
import { getFleetLive } from "@/server/queries/trucks";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Production, stock, deliveries and money at a glance."
        actions={
          <>
            <NewEntryButton kind="payment" variant="outline" className="flex-1 sm:flex-none">
              <IndianRupee aria-hidden /> Payment
            </NewEntryButton>
            <NewEntryButton kind="order" className="flex-1 sm:flex-none">
              <Plus aria-hidden /> Order
            </NewEntryButton>
          </>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <StatGridSkeleton count={8} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}

async function DashboardContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const range = resolveRange(sp, t, "30d");
  const d = await getDashboard(range.from, range.to, t);
  const k = d.kpis;

  const sentToday = k.todayProduction.reduce((a, p) => a + p.sent, 0);
  const inboundToday = k.todayInbound.reduce((a, m) => a + m.kg, 0);
  const inYard = k.todayProduction.reduce((a, p) => a + p.inYard, 0);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Today */}
      <section aria-labelledby="today-heading" className="space-y-3">
        <h2 id="today-heading" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden /> Today · {formatDate(t)}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {k.todayProduction.map((p) => (
            <StatCard
              key={p.productId}
              label={`${p.name} made`}
              value={formatNumber(p.made)}
              progress={pct(p.made, p.capacity)}
              hint={`${pct(p.made, p.capacity)}% of ${formatNumber(p.capacity)} capacity`}
              icon={Factory}
              tone="primary"
              href="/production"
            />
          ))}
          <StatCard
            label="Dispatched"
            value={formatNumber(sentToday)}
            hint={k.todayProduction.map((p) => `${formatNumber(p.sent)} ${p.name.split(" ")[0].toLowerCase()}`).join(" · ")}
            icon={Truck}
            tone="info"
            href="/dispatch"
          />
          <StatCard
            label="Material received"
            value={formatTonnes(inboundToday)}
            hint={k.todayInbound.map((m) => `${m.name} ${formatTonnes(m.kg)}`).join(" · ")}
            icon={Warehouse}
            href="/inbound"
          />
        </div>
      </section>

      <Suspense fallback={null}>
        <TrucksNow />
      </Suspense>

      {/* Business */}
      <section aria-label="Business health" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Bricks to deliver"
          value={formatNumber(k.pendingDeliveries)}
          hint="Ordered, not yet sent"
          icon={PackageOpen}
          tone="info"
          href="/orders?status=open"
        />
        <StatCard
          label="To collect"
          value={formatINRCompact(k.receivable)}
          hint={
            k.overdueCount
              ? `${formatINRCompact(k.overdueAmount)} overdue on ${k.overdueCount} orders`
              : k.ordersReadyToComplete
                ? `${k.ordersReadyToComplete} orders ready to complete`
                : "Nothing overdue"
          }
          icon={Wallet}
          tone={k.overdueCount ? "danger" : "warning"}
          href="/orders?status=unpaid"
        />
        <StatCard
          label="To pay suppliers"
          value={formatINRCompact(k.payable)}
          hint={
            d.overdueBillsCount
              ? `${formatINRCompact(d.overdueBillsAmount)} overdue on ${d.overdueBillsCount} bills`
              : `${k.ongoingBills} ongoing raw material bill${k.ongoingBills === 1 ? "" : "s"}`
          }
          icon={HandCoins}
          tone={d.overdueBillsCount ? "danger" : "default"}
          href="/purchases"
        />
        <StatCard
          label="Collected this month"
          value={formatINRCompact(k.collectedThisMonth)}
          hint={`Billed ${formatINRCompact(k.billedThisMonth)} this month`}
          icon={IndianRupee}
          tone="success"
          href="/payments"
        />
        <StatCard
          label="Bricks in yard"
          value={formatNumber(inYard)}
          hint={k.todayProduction.map((p) => `${formatNumber(p.inYard)} ${p.name.split(" ")[0].toLowerCase()}`).join(" · ")}
          icon={Boxes}
          href="/stock"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {/* Alerts */}
      {(d.lowStock.length > 0 || d.overdue.length > 0 || d.overdueBills.length > 0) && (
        <section aria-label="Needs attention" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {d.lowStock.length > 0 && (
            <div className="min-w-0 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 text-warning-foreground dark:text-warning" aria-hidden /> Raw material running low
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.lowStock.map((m) => (
                  <li key={m.materialId} className="flex justify-between gap-2">
                    <span>{m.name}</span>
                    <span className="num text-muted-foreground">
                      {formatTonnes(m.stockKg)} left{m.daysLeft !== null ? ` · ~${m.daysLeft} days` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.overdue.length > 0 && (
            <div className="min-w-0 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 font-medium">
                <FileText className="size-4 text-destructive" aria-hidden /> Overdue payments
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.overdue.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex justify-between gap-2 hover:text-primary">
                      <span className="truncate">
                        {o.customer} <span className="font-mono text-xs text-muted-foreground">{o.invoiceNo}</span>
                      </span>
                      <span className="num shrink-0 font-medium">{formatINR(o.balance, { decimals: false })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.overdueBills.length > 0 && (
            <div className="min-w-0 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 font-medium">
                <FileStack className="size-4 text-destructive" aria-hidden /> Supplier bills past their pay-by date
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.overdueBills.map((b) => (
                  <li key={b.id}>
                    <Link href={`/purchases/${b.id}`} className="flex justify-between gap-2 hover:text-primary">
                      <span className="truncate">
                        {b.supplier} <span className="font-mono text-xs text-muted-foreground">{b.billNo}</span>
                      </span>
                      <span className="num shrink-0 font-medium">{formatINR(b.balance, { decimals: false })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Trends */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Trends · {range.label}</h2>
        <RangeFilter
          pathname="/dashboard"
          params={flatParams(sp)}
          preset={range.preset}
          from={range.from}
          to={range.to}
          presets={["7d", "30d", "month", "lastmonth", "90d"]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5">
          <h2 className="font-semibold">Capacity used today</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {k.todayProduction.map((p) => (
              <CapacityGauge
                key={p.productId}
                name={p.name}
                code={p.code}
                made={p.made}
                capacity={p.capacity}
                monthAvg={p.monthDays ? Math.round(p.monthMade / p.monthDays) : 0}
              />
            ))}
          </div>
        </section>
        <YardStockChart products={d.products} data={d.yardSeries} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {d.productionSeries.map((s) => (
          <ProductionChart key={s.productId} name={s.name} code={s.code} capacity={s.capacity} points={s.points} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <InboundChart materials={d.materials} data={d.inboundSeries} />
        <MaterialStock materials={d.materials} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MoneyChart data={d.monthlySeries} />
        <AgeingChart data={d.ageing} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedBars
          title="Who owes the most"
          subtitle="Outstanding balance"
          color="var(--owed)"
          items={d.topOwing.map((c) => ({ id: c.id, name: c.name, value: c.amount }))}
          kind="money"
          emptyText="No one owes money right now."
        />
        <RankedBars
          title="Waiting for bricks"
          subtitle="Bricks ordered but not yet delivered"
          color="var(--prod-solid)"
          items={d.topPending.map((c) => ({
            id: c.id,
            name: c.name,
            value: c.pending,
            note: `${pct(c.delivered, c.ordered)}% sent`,
          }))}
          kind="count"
          emptyText="All orders are delivered."
        />
      </div>
    </div>
  );
}

/** Compact live strip of trucks; the full map is one tap away. */
async function TrucksNow() {
  const fleet = await getFleetLive();
  const trucks = fleet.trucks.filter((t) => t.active && (t.phone || t.lastPointAt));
  if (trucks.length === 0) return null;
  const order = ["moving", "stopped", "no_signal", "off", "never"];
  trucks.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  const km = trucks.reduce((a, t) => a + t.today.distanceM, 0) / 1000;

  return (
    <section aria-labelledby="trucks-heading" className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id="trucks-heading" className="flex items-center gap-2 font-semibold">
          <MapPin className="size-4 text-primary" aria-hidden /> Trucks now
          <span className="num text-sm font-normal text-muted-foreground">· {km.toFixed(km < 10 ? 1 : 0)} km today</span>
        </h2>
        <Button asChild variant="ghost" size="sm" className="text-primary">
          <Link href="/trucks">Open map →</Link>
        </Button>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {trucks.map((t) => {
          const line = statusLine(t, fleet.now);
          return (
            <li key={t.id}>
              <Link href={`/trucks/${t.id}`} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 hover:border-primary/40 hover:bg-accent/30">
                <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", STATE_META[t.state].dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <span className={cn("num block truncate text-xs", STATE_META[t.state].text)}>{line.big}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
