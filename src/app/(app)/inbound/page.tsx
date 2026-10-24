import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ChipFilter, RangeFilter } from "@/components/common/range-filter";
import { FormSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { addDays } from "@/domain/dates";
import { getCurrentUser } from "@/lib/auth";
import { materialColor } from "@/lib/colors";
import { resolveRange } from "@/lib/date-range";
import { formatINR, formatTonnes } from "@/lib/format";
import { flatParams, intParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { canModifyEntry } from "@/server/permissions";
import { getInboundList } from "@/server/queries/inbound";
import { getActiveMasters } from "@/server/queries/masters";
import { InboundQuickEntry } from "./inbound-entry";
import { InboundTable } from "./inbound-table";

export const metadata: Metadata = { title: "Inbound" };

export default function InboundPage({ searchParams }: PageProps<"/inbound">) {
  return (
    <>
      <PageHeader
        title="Inbound materials"
        description="Fly ash, cement and M sand received at the factory."
        actions={
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/suppliers">
              <Truck aria-hidden /> Suppliers
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <FormSkeleton />
            <ListSkeleton />
          </div>
        }
      >
        <InboundContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InboundContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user, t, masters] = await Promise.all([searchParams, getCurrentUser(), today(), getActiveMasters()]);
  const range = resolveRange(sp, t, user.role === "owner" ? "7d" : "today");
  const materialId = intParam(sp, "material");
  const { rows, totals, truncated } = await getInboundList(range.from, range.to, materialId);
  const params = flatParams(sp);
  const isOwner = user.role === "owner";

  const entryProps = {
    materials: masters.materials.map((m) => ({ id: m.id, name: m.name, code: m.code })),
    suppliers: masters.suppliers.map((s) => ({ id: s.id, name: s.name })),
    today: t,
    minDate: isOwner ? undefined : addDays(t, -2),
  };

  return (
    <div className="space-y-4">
      <InboundQuickEntry {...entryProps} />

      <div className="space-y-2 pt-2">
        <RangeFilter pathname="/inbound" params={params} preset={range.preset} from={range.from} to={range.to} />
        <ChipFilter
          pathname="/inbound"
          params={params}
          name="material"
          value={materialId ? String(materialId) : undefined}
          allLabel="All materials"
          options={masters.materials.map((m, i) => ({ value: String(m.id), label: m.name, color: materialColor(m.code, i) }))}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {masters.materials.map((m, i) => {
          const tot = totals.find((x) => x.materialId === m.id);
          return (
            <div key={m.id} className="rounded-xl border bg-card p-3 md:p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground md:text-[13px]">
                <span className="size-2 rounded-full" style={{ background: materialColor(m.code, i) }} aria-hidden />
                {m.name}
              </p>
              <p className="num mt-1 text-lg font-semibold md:text-2xl">{formatTonnes(tot?.netKg ?? 0)}</p>
              <p className="text-xs text-muted-foreground">
                {tot?.loads ?? 0} load{tot?.loads === 1 ? "" : "s"}
                {isOwner && tot?.amount ? <span className="hidden sm:inline"> · {formatINR(tot.amount, { decimals: false })}</span> : null}
              </p>
            </div>
          );
        })}
      </div>

      {truncated && <p className="text-sm text-muted-foreground">Showing the latest 500 loads.</p>}
      <InboundTable
        // A billed load is part of what you owe the supplier: change it through the bill.
        rows={rows.map((r) => ({ ...r, canEdit: canModifyEntry(user, r, t) && !r.purchaseBillId }))}
        today={t}
        entryProps={entryProps}
        showMoney={isOwner}
        exportHref={isOwner ? `/api/export/inbound?from=${range.from}&to=${range.to}` : undefined}
        emptyHint={`Nothing entered for ${range.label.toLowerCase()}. Use “Add a load” above.`}
      />
    </div>
  );
}
