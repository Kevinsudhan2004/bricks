import type { Metadata } from "next";
import { Suspense } from "react";
import { IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { requireOwner } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatINRCompact } from "@/lib/format";
import { flatParams, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getPayments } from "@/server/queries/money";
import { MODE } from "./modes";
import { PaymentTable } from "./payment-table";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  return (
    <>
      <PageHeader title="Payments received" description="Every rupee collected from customers." />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton />
            <ListSkeleton />
          </div>
        }
      >
        <PaymentsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PaymentsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const range = resolveRange(sp, t, "month");
  const rows = await getPayments(range.from, range.to);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const byMode = new Map<string, number>();
  for (const r of rows) byMode.set(r.mode, (byMode.get(r.mode) ?? 0) + r.amount);

  return (
    <div className="space-y-4">
      <RangeFilter pathname="/payments" params={flatParams(sp)} preset={range.preset} from={range.from} to={range.to} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Collected · ${range.label}`} value={formatINRCompact(total)} hint={`${rows.length} payments`} icon={IndianRupee} tone="success" className="col-span-2 lg:col-span-1" />
        {(["upi", "bank", "cash"] as const).map((m) => (
          <StatCard key={m} label={MODE[m].label} value={formatINRCompact(byMode.get(m) ?? 0)} icon={MODE[m].icon} />
        ))}
      </div>

      <PaymentTable rows={rows} today={t} exportHref={`/api/export/payments?from=${range.from}&to=${range.to}`} />
    </div>
  );
}
