"use client";

import Link from "next/link";
import { materialColor } from "@/lib/colors";
import { formatINR, formatNumber } from "@/lib/format";
import { ChartCard } from "./chart-card";

/* Plain-HTML bar visuals (no chart library), safe to render on the server-side tree. */

/* ------------------------------------------------------------------ */
/* Raw material stock meters                                           */
/* ------------------------------------------------------------------ */

export function MaterialStock({
  materials,
}: {
  materials: { materialId: number; name: string; code: string; stockKg: number; lowStockKg: number; daysLeft: number | null; avgDailyUseKg: number; low: boolean }[];
}) {
  const max = Math.max(...materials.map((m) => Math.max(m.stockKg, m.lowStockKg * 2)), 1);
  return (
    <ChartCard
      title="Raw material in stock"
      subtitle="Estimated from loads received minus the mix used for production"
      action={
        <Link href="/stock" className="text-xs font-medium text-primary hover:underline">
          Details
        </Link>
      }
      table={{
        columns: [
          { key: "name", label: "Material" },
          { key: "stock", label: "In stock", align: "right" },
          { key: "use", label: "Use / day", align: "right" },
          { key: "days", label: "Days left", align: "right" },
        ],
        rows: materials.map((m) => ({
          name: m.name,
          stock: `${(m.stockKg / 1000).toFixed(1)} t`,
          use: `${(m.avgDailyUseKg / 1000).toFixed(1)} t`,
          days: m.daysLeft ?? "—",
        })),
      }}
    >
      <ul className="space-y-5 pt-1">
        {materials.map((m) => {
          const w = Math.max((Math.max(m.stockKg, 0) / max) * 100, 1);
          const low = (m.lowStockKg / max) * 100;
          return (
            <li key={m.materialId}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="size-2.5 rounded-[3px]" style={{ background: materialColor(m.code) }} aria-hidden />
                  {m.name}
                </span>
                <span className="num">
                  <span className="font-semibold">{formatNumber(Math.round(m.stockKg / 1000))} t</span>
                  <span className="text-xs text-muted-foreground">
                    {m.daysLeft !== null ? ` · ~${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${w}%`, background: materialColor(m.code) }} />
                <div
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/60"
                  style={{ left: `${low}%` }}
                  title={`Reorder level ${formatNumber(m.lowStockKg / 1000)} t`}
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.low ? (
                  <span className="font-medium text-destructive">Below reorder level ({formatNumber(m.lowStockKg / 1000)} t)</span>
                ) : (
                  <>Reorder level {formatNumber(m.lowStockKg / 1000)} t</>
                )}
                {" · "}uses ~{formatNumber(Math.round(m.avgDailyUseKg / 1000))} t/day
              </p>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked lists (top customers)                                        */
/* ------------------------------------------------------------------ */

export function RankedBars({
  title,
  subtitle,
  items,
  color,
  kind,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  items: { id: number; name: string; value: number; note?: string }[];
  color: string;
  kind: "money" | "count";
  emptyText: string;
}) {
  const format = (v: number) => (kind === "money" ? formatINR(v, { decimals: false }) : formatNumber(v));
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      table={{
        columns: [
          { key: "name", label: "Customer" },
          { key: "value", label: "Amount", align: "right" },
        ],
        rows: items.map((i) => ({ name: i.name, value: format(i.value) })),
      }}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/customers/${i.id}`} className="group block rounded-lg p-1 -m-1 hover:bg-muted/50">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium group-hover:text-primary">{i.name}</span>
                  <span className="num shrink-0 font-semibold">{format(i.value)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
                  </div>
                  {i.note && <span className="shrink-0 text-[11px] text-muted-foreground">{i.note}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

