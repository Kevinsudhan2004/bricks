import type { Metadata } from "next";
import { Suspense } from "react";
import { FileMinus, FilePlus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { RangeFilter } from "@/components/common/range-filter";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { StatCard } from "@/components/common/stat-card";
import { requireOwner } from "@/lib/auth";
import { resolveRange } from "@/lib/date-range";
import { formatINRCompact } from "@/lib/format";
import { flatParams, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { getNotes } from "@/server/queries/money";
import { NoteTable } from "./note-table";

export const metadata: Metadata = { title: "Credit / debit notes" };

export default function NotesPage({ searchParams }: PageProps<"/notes">) {
  return (
    <>
      <PageHeader
        title="Credit & debit notes"
        description="Credit notes reduce what a customer owes (damage, returns, discounts). Debit notes add to it (extra transport, rate increase)."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={2} />
            <ListSkeleton />
          </div>
        }
      >
        <NotesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NotesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [sp, t] = await Promise.all([searchParams, today()]);
  const range = resolveRange(sp, t, "90d");
  const rows = await getNotes(range.from, range.to);
  const credits = rows.filter((r) => r.type === "credit").reduce((a, r) => a + r.amount, 0);
  const debits = rows.filter((r) => r.type === "debit").reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-4">
      <RangeFilter
        pathname="/notes"
        params={flatParams(sp)}
        preset={range.preset}
        from={range.from}
        to={range.to}
        presets={["30d", "month", "lastmonth", "90d"]}
      />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Credit notes" value={formatINRCompact(credits)} hint="Reduced balances" icon={FileMinus} tone="success" />
        <StatCard label="Debit notes" value={formatINRCompact(debits)} hint="Added to balances" icon={FilePlus} tone="warning" />
      </div>
      <NoteTable rows={rows} today={t} />
    </div>
  );
}
