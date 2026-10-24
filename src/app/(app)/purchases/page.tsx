import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileStack, HandCoins, IndianRupee, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ChipFilter, RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { BillList } from "@/components/purchases/bill-list";
import { requireOwner } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatINRCompact, formatNumber, formatTonnes } from "@/lib/format";
import { flatParams, strParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getBillSummaries, unbilledTotalsUnchecked, type BillSummary } from "@/server/queries/purchases";

export const metadata: Metadata = { title: "Raw material bills" };

/** A supplier bill is Ongoing until it is fully paid (debit = credit) and the owner closes it. */
const STATES = {
  ongoing: { label: "Ongoing", test: (b: BillSummary) => b.state === "ongoing" },
  closed: { label: "Closed", test: (b: BillSummary) => b.state === "closed" },
  cancelled: { label: "Cancelled", test: (b: BillSummary) => b.state === "cancelled" },
  all: { label: "All bills", test: () => true },
} as const;
type StateKey = keyof typeof STATES;

const ONGOING: Record<string, { label: string; test: (b: BillSummary) => boolean }> = {
  due: { label: "To pay", test: (b) => b.balance > 0 },
  overdue: { label: "Overdue", test: (b) => b.paymentStatus === "overdue" },
  ready: { label: "Ready to close", test: (b) => b.readyToClose },
};

export default function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  return (
    <>
      <PageHeader
        title="Raw material bills"
        description="Supplier bills for fly ash, cement and M sand. Each bill stays Ongoing until what you owe is paid (debit = credit), then it can be closed."
        actions={
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/purchases/payments">
              <HandCoins aria-hidden /> Payments made
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={4} />
            <ListSkeleton />
          </div>
        }
      >
        <PurchasesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PurchasesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const rawState = strParam(sp, "state");
  const stateKey: StateKey = rawState && rawState in STATES ? (rawState as StateKey) : "ongoing";
  const rawStatus = strParam(sp, "status");
  const filterKey = stateKey === "ongoing" && rawStatus && ONGOING[rawStatus] ? rawStatus : undefined;
  const filter = filterKey ? ONGOING[filterKey] : undefined;
  const range = resolveRange(sp, t, "90d");

  // Ongoing bills are listed whatever their date; the other states use the date range.
  const [everything, unbilled] = await Promise.all([getBillSummaries({}, t), unbilledTotalsUnchecked()]);
  const ongoing = everything.filter(STATES.ongoing.test);
  const inState = stateKey === "ongoing" ? ongoing : (await getBillSummaries({ from: range.from, to: range.to }, t)).filter(STATES[stateKey].test);
  const list = filter ? inState.filter(filter.test) : inState;
  const params = flatParams(sp);
  const stateParams = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "status"));

  const active = list.filter((b) => !b.cancelled);
  const billed = active.reduce((a, b) => a + b.total + b.debits, 0);
  const paid = active.reduce((a, b) => a + b.paid + b.credits, 0);
  const toPay = active.reduce((a, b) => a + Math.max(b.balance, 0), 0);
  const overdue = active.filter((b) => b.paymentStatus === "overdue");
  const readyCount = ongoing.filter((b) => b.readyToClose).length;
  const unbilledLoads = [...unbilled.values()].reduce((a, u) => a + u.loads, 0);
  const unbilledKg = [...unbilled.values()].reduce((a, u) => a + u.kg, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ChipFilter
          pathname="/purchases"
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
            pathname="/purchases"
            params={params}
            name="status"
            value={filterKey}
            allLabel="All ongoing"
            options={Object.entries(ONGOING).map(([value, f]) => ({
              value,
              label: value === "ready" && readyCount ? `${f.label} · ${readyCount}` : f.label,
            }))}
          />
        ) : (
          <RangeFilter
            pathname="/purchases"
            params={params}
            preset={range.preset}
            from={range.from}
            to={range.to}
            presets={["7d", "30d", "month", "lastmonth", "90d"]}
          />
        )}
      </div>

      {stateKey === "ongoing" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="To pay suppliers"
            value={formatINRCompact(toPay)}
            hint={`${active.length} ongoing bill${active.length === 1 ? "" : "s"}`}
            icon={IndianRupee}
            tone="warning"
          />
          <StatCard
            label="Overdue"
            value={formatNumber(overdue.length)}
            hint={overdue.length ? `${formatINRCompact(overdue.reduce((a, b) => a + b.balance, 0))} past the pay-by date` : "Nothing overdue"}
            icon={AlertTriangle}
            tone={overdue.length ? "danger" : "success"}
            href={overdue.length ? "/purchases?status=overdue" : undefined}
          />
          <StatCard
            label="Ready to close"
            value={formatNumber(readyCount)}
            hint="Fully paid: debit = credit"
            icon={CheckCircle2}
            tone="success"
            href={readyCount ? "/purchases?status=ready" : undefined}
          />
          <StatCard
            label="Loads not billed yet"
            value={formatNumber(unbilledLoads)}
            hint={unbilledLoads ? `${formatTonnes(unbilledKg)} received without a bill` : "Every load is on a bill"}
            icon={Warehouse}
            tone={unbilledLoads ? "info" : "default"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Bills" value={formatNumber(list.length)} hint={range.label} icon={FileStack} />
          <StatCard label="Billed" value={formatINRCompact(billed)} hint="Bills + extra charges" icon={FileStack} />
          <StatCard label="Paid + credited" value={formatINRCompact(paid)} icon={HandCoins} tone="success" />
          <StatCard label="Still to pay" value={formatINRCompact(toPay)} icon={IndianRupee} tone="warning" />
        </div>
      )}

      <BillList
        bills={list}
        bulkClose={stateKey === "ongoing"}
        emptyText={
          filter
            ? filterKey === "ready"
              ? "No bills are ready to close. A bill is ready once it is fully paid (debit = credit)."
              : `No ongoing bills marked “${filter.label}”`
            : stateKey === "ongoing"
              ? "No ongoing bills. Add the next supplier bill with “New bill”."
              : `No ${stateKey === "all" ? "" : `${STATES[stateKey].label.toLowerCase()} `}bills in this period`
        }
      />
    </div>
  );
}
