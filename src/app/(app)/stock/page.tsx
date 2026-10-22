import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ListSkeleton, StatGridSkeleton } from "@/components/common/skeletons";
import { Pill } from "@/components/common/status-badge";
import { DeleteButton } from "@/components/forms/delete-button";
import { requireOwner } from "@/lib/auth";
import { materialColor, productColor } from "@/lib/colors";
import { formatDay, formatNumber, formatTonnes, pct } from "@/lib/format";
import { today } from "@/lib/today";
import { deleteStockAdjustment } from "@/server/actions/stock";
import { invoiceSummariesUnchecked } from "@/server/queries/invoices";
import { getStock, getStockAdjustments } from "@/server/queries/stock";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage() {
  return (
    <>
      <PageHeader
        title="Stock"
        description="Bricks in the yard and raw material on hand, worked out from every entry."
        actions={
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/stock/adjust">
              <ClipboardList aria-hidden /> Adjust stock
            </Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <StatGridSkeleton count={2} />
            <ListSkeleton />
          </div>
        }
      >
        <StockContent />
      </Suspense>
    </>
  );
}

async function StockContent() {
  await requireOwner();
  const t = await today();
  const [stock, adjustments, invoices] = await Promise.all([getStock(t), getStockAdjustments(), invoiceSummariesUnchecked({}, t)]);
  const pendingByProduct = new Map<number, number>();
  for (const inv of invoices) {
    if (inv.cancelled) continue;
    for (const p of inv.products) pendingByProduct.set(p.productId, (pendingByProduct.get(p.productId) ?? 0) + p.pending);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bricks in the yard</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stock.finished.map((p, i) => {
            const pending = pendingByProduct.get(p.productId) ?? 0;
            const shortfall = pending - p.stock;
            const avgSent = p.dispatched7d / 7;
            const avgMade = p.produced7d / 7;
            const daysToClear = shortfall > 0 && avgMade > 0 ? Math.ceil(shortfall / avgMade) : 0;
            return (
              <div key={p.productId} className="overflow-hidden rounded-xl border bg-card">
                <div className="h-1" style={{ background: productColor(p.code, i) }} aria-hidden />
                <div className="p-4 md:p-5">
                  <p className="text-sm font-medium text-muted-foreground">{p.name}</p>
                  <p className="num mt-1 text-3xl font-semibold">{formatNumber(p.stock)}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Made / day</dt>
                      <dd className="num font-medium">{formatNumber(Math.round(avgMade))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sent / day</dt>
                      <dd className="num font-medium">{formatNumber(Math.round(avgSent))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Orders pending</dt>
                      <dd className="num font-medium">{formatNumber(pending)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm">
                    {shortfall > 0 ? (
                      <span className="flex items-start gap-1.5 text-warning-foreground dark:text-warning">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {formatNumber(shortfall)} short of pending orders
                        {daysToClear ? ` — about ${daysToClear} days of production` : ""}.
                      </span>
                    ) : (
                      <span className="text-success">Enough stock to cover all pending orders.</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2">
          <h2 className="text-lg font-semibold">Raw material</h2>
          <Pill tone="info" className="mt-1">
            Estimated
          </Pill>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Loads received minus (bricks made × mix in Settings). Correct it with a stock adjustment after a physical check.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stock.raw.map((m, i) => (
            <div key={m.materialId} className="rounded-xl border bg-card p-4">
              <p className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: materialColor(m.code, i) }} aria-hidden />
                  {m.name}
                </span>
                {m.low && <Pill tone="danger">Low</Pill>}
              </p>
              <p className="num mt-1 text-2xl font-semibold">{formatTonnes(m.stockKg)}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(pct(m.stockKg, Math.max(m.lowStockKg * 4, 1)), 100)}%`, background: materialColor(m.code, i) }}
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Use / day</dt>
                  <dd className="num font-medium">{formatTonnes(m.avgDailyUseKg)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lasts</dt>
                  <dd className="num font-medium">{m.daysLeft === null ? "—" : `${m.daysLeft} days`}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reorder at</dt>
                  <dd className="num font-medium">{formatTonnes(m.lowStockKg)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Adjustments</h2>
        {adjustments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No adjustments yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {adjustments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {a.itemType === "material" ? a.materialName : a.productName}{" "}
                    <span className={a.quantity >= 0 ? "text-success" : "text-destructive"}>
                      {a.quantity >= 0 ? "+" : "−"}
                      {formatNumber(Math.abs(a.quantity))} {a.itemType === "material" ? "kg" : "nos"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDay(a.adjDate, t)} · {a.reason} · {a.createdByName}
                  </p>
                </div>
                <DeleteButton id={a.id} action={deleteStockAdjustment} title="Delete this adjustment?" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
