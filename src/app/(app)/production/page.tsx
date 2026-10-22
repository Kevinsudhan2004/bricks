import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ChipFilter, RangeFilter } from "@/components/common/range-filter";
import { FormSkeleton, ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { productColor } from "@/lib/colors";
import { resolveRange } from "@/lib/date-range";
import { formatNumber, pct } from "@/lib/format";
import { flatParams, intParam, type SearchParams } from "@/lib/search-params";
import { today } from "@/lib/today";
import { canModifyEntry } from "@/server/permissions";
import { getActiveMasters } from "@/server/queries/masters";
import { addDays } from "@/domain/dates";
import { getProductionForDay, getProductionList } from "@/server/queries/production";
import { ProductionQuickEntry } from "./production-entry";
import { ProductionTable } from "./production-table";

export const metadata: Metadata = { title: "Production" };

export default function ProductionPage({ searchParams }: PageProps<"/production">) {
  return (
    <>
      <PageHeader
        title="Production"
        description="Bricks and blocks made each day, against plant capacity."
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <FormSkeleton />
            <StatGridSkeleton count={2} />
            <ListSkeleton />
          </div>
        }
      >
        <ProductionContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductionContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user, t, masters] = await Promise.all([searchParams, getCurrentUser(), today(), getActiveMasters()]);
  const range = resolveRange(sp, t, user.role === "owner" ? "7d" : "today");
  const productId = intParam(sp, "product");
  const [{ rows, totals }, todayTotals] = await Promise.all([
    getProductionList(range.from, range.to, productId),
    getProductionForDay(t),
  ]);
  const params = flatParams(sp);
  const entryProps = {
    products: masters.products.map((p) => ({ id: p.id, name: p.name, code: p.code, dailyCapacity: p.dailyCapacity })),
    today: t,
    minDate: user.role === "owner" ? undefined : addDays(t, -2),
    todayMade: Object.fromEntries(todayTotals.map((x) => [x.productId, x.produced])),
  };

  return (
    <div className="space-y-4">
      <ProductionQuickEntry {...entryProps} />

      <div className="space-y-2 pt-2">
        <RangeFilter pathname="/production" params={params} preset={range.preset} from={range.from} to={range.to} />
        <ChipFilter
          pathname="/production"
          params={params}
          name="product"
          value={productId ? String(productId) : undefined}
          allLabel="All products"
          options={masters.products.map((p, i) => ({ value: String(p.id), label: p.name, color: productColor(p.code, i) }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {masters.products
          .filter((p) => !productId || p.id === productId)
          .map((p, i) => {
            const tot = totals.find((x) => x.productId === p.id);
            const produced = tot?.produced ?? 0;
            const rejected = tot?.rejected ?? 0;
            const days = tot?.days ?? 0;
            const avg = days ? Math.round(produced / days) : 0;
            const util = pct(avg, p.dailyCapacity);
            return (
              <div key={p.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="h-1" style={{ background: productColor(p.code, i) }} aria-hidden />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-muted-foreground">{p.name}</p>
                    <Pill tone={util >= 85 ? "success" : util >= 60 ? "primary" : "warning"}>{util}% capacity</Pill>
                  </div>
                  <p className="num mt-1 text-2xl font-semibold">{formatNumber(produced)}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Good</p>
                      <p className="num font-medium">{formatNumber(produced - rejected)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Broken</p>
                      <p className="num font-medium">
                        {formatNumber(rejected)}{" "}
                        <span className="text-muted-foreground">({produced ? ((rejected / produced) * 100).toFixed(1) : 0}%)</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg / day</p>
                      <p className="num font-medium">{formatNumber(avg)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <ProductionTable
        rows={rows.map((r) => ({ ...r, canEdit: canModifyEntry(user, r, t) }))}
        today={t}
        entryProps={entryProps}
        emptyHint={`Nothing entered for ${range.label.toLowerCase()}. Use “Add production” above.`}
      />
    </div>
  );
}
