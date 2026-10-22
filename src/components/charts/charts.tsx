"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { materialColor, productColor } from "@/lib/colors";
import {
  formatCountCompact,
  formatDateShort,
  formatINR,
  formatINRCompact,
  formatMonth,
  formatNumber,
  pct,
} from "@/lib/format";
import { ChartCard } from "./chart-card";

/* Shared mark specs: thin bars ≤ 24px, 4px rounded data end, 2px surface gap, hairline solid grid. */
const BAR_MAX = 24;
const GRID = <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="" />;
const SURFACE = "var(--card)";
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function dayTicks(len: number) {
  // Thin out date labels on phones / long ranges
  return len > 20 ? Math.ceil(len / 8) - 1 : len > 10 ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Production vs capacity (one small multiple per product)             */
/* ------------------------------------------------------------------ */

export function ProductionChart({
  name,
  code,
  capacity,
  points,
}: {
  name: string;
  code: string;
  capacity: number;
  points: { date: string; made: number; sent: number; rejected: number }[];
}) {
  const color = productColor(code);
  const config = {
    made: { label: "Made", color },
    sent: { label: "Dispatched", color: "var(--foreground)" },
  } satisfies ChartConfig;
  const working = points.filter((p) => p.made > 0);
  const avg = working.length ? Math.round(working.reduce((a, p) => a + p.made, 0) / working.length) : 0;
  const totalMade = points.reduce((a, p) => a + p.made, 0);
  const totalSent = points.reduce((a, p) => a + p.sent, 0);
  const maxY = Math.max(capacity * 1.1, ...points.map((p) => Math.max(p.made, p.sent)));

  return (
    <ChartCard
      title={name}
      subtitle={
        <>
          Avg <span className="num font-medium text-foreground">{formatNumber(avg)}</span>/working day ·{" "}
          {pct(avg, capacity)}% of {formatCountCompact(capacity)} capacity
        </>
      }
      legend={[
        { label: "Made", color },
        { label: "Dispatched", color: "var(--foreground)", shape: "line" },
        { label: "Daily capacity", color: "var(--muted-foreground)", shape: "line" },
      ]}
      table={{
        columns: [
          { key: "date", label: "Date" },
          { key: "made", label: "Made", align: "right" },
          { key: "rejected", label: "Broken", align: "right" },
          { key: "sent", label: "Dispatched", align: "right" },
        ],
        rows: [...points].reverse().map((p) => ({
          date: formatDateShort(p.date),
          made: formatNumber(p.made),
          rejected: formatNumber(p.rejected),
          sent: formatNumber(p.sent),
        })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <ComposedChart data={points} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          {GRID}
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={formatDateShort}
            interval={dayTicks(points.length)}
            minTickGap={8}
          />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatCountCompact} width={40} domain={[0, Math.ceil(maxY)]} />
          <ReferenceLine
            y={capacity}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            label={{ value: `Capacity ${formatCountCompact(capacity)}`, position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent labelFormatter={(v) => formatDateShort(String(v))} />}
          />
          <Bar dataKey="made" fill="var(--color-made)" radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
          <Line dataKey="sent" stroke="var(--color-sent)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} type="monotone" />
        </ComposedChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        Made <span className="num font-medium text-foreground">{formatNumber(totalMade)}</span> · dispatched{" "}
        <span className="num font-medium text-foreground">{formatNumber(totalSent)}</span> in this period
      </p>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Capacity gauge                                                      */
/* ------------------------------------------------------------------ */

export function CapacityGauge({
  name,
  code,
  made,
  capacity,
  monthAvg,
}: {
  name: string;
  code: string;
  made: number;
  capacity: number;
  monthAvg: number;
}) {
  const value = pct(made, capacity);
  const color = productColor(code);
  const config = { value: { label: name, color } } satisfies ChartConfig;
  return (
    <div className="flex flex-col items-center text-center">
      <ChartContainer config={config} className="aspect-square h-36 md:h-40">
        <RadialBarChart
          data={[{ value: Math.min(value, 100) }]}
          startAngle={210}
          endAngle={-30}
          innerRadius="78%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={6} fill="var(--color-value)" isAnimationActive />
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-2xl font-semibold">
            {value}%
          </text>
          <text x="50%" y="64%" textAnchor="middle" className="fill-muted-foreground text-[11px]">
            of capacity today
          </text>
        </RadialBarChart>
      </ChartContainer>
      <p className="-mt-2 text-sm font-medium">{name}</p>
      <p className="num text-xs text-muted-foreground">
        {formatNumber(made)} / {formatNumber(capacity)} · month avg {pct(monthAvg, capacity)}%
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bricks in yard (stock trend)                                        */
/* ------------------------------------------------------------------ */

export function YardStockChart({
  products,
  data,
}: {
  products: { productId: number; name: string; code: string }[];
  data: Record<string, number | string>[];
}) {
  const config = Object.fromEntries(
    products.map((p) => [`p${p.productId}`, { label: p.name, color: productColor(p.code) }]),
  ) satisfies ChartConfig;
  const last = data.at(-1);
  return (
    <ChartCard
      title="Bricks in the yard"
      subtitle="Finished stock at the end of each day"
      legend={products.map((p) => ({ label: p.name, color: productColor(p.code), shape: "line" as const }))}
      table={{
        columns: [{ key: "date", label: "Date" }, ...products.map((p) => ({ key: `p${p.productId}`, label: p.name, align: "right" as const }))],
        rows: [...data].reverse().map((r) => ({
          date: formatDateShort(String(r.date)),
          ...Object.fromEntries(products.map((p) => [`p${p.productId}`, formatNumber(Number(r[`p${p.productId}`] ?? 0))])),
        })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <LineChart data={data} margin={{ top: 16, right: 56, left: 0, bottom: 0 }} accessibilityLayer>
          {GRID}
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatDateShort} interval={dayTicks(data.length)} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatCountCompact} width={40} />
          <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="line" labelFormatter={(v) => formatDateShort(String(v))} />} />
          {products.map((p) => (
            <Line
              key={p.productId}
              dataKey={`p${p.productId}`}
              type="monotone"
              stroke={`var(--color-p${p.productId})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
              label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                props.index === data.length - 1 && last ? (
                  <text key={p.productId} x={Number(props.x ?? 0) + 6} y={Number(props.y ?? 0) + 4} className="fill-foreground text-[11px] font-medium">
                    {formatCountCompact(Number(last[`p${p.productId}`] ?? 0))}
                  </text>
                ) : (
                  <g key={`${p.productId}-${props.index}`} />
                )
              }
            />
          ))}
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Inbound raw materials (stacked, tonnes)                             */
/* ------------------------------------------------------------------ */

export function InboundChart({
  materials,
  data,
}: {
  materials: { materialId: number; name: string; code: string }[];
  data: Record<string, number | string>[];
}) {
  const config = Object.fromEntries(
    materials.map((m) => [`m${m.materialId}`, { label: m.name, color: materialColor(m.code) }]),
  ) satisfies ChartConfig;
  const totals = materials.map((m) => ({ ...m, t: data.reduce((a, r) => a + Number(r[`m${m.materialId}`] ?? 0), 0) }));
  return (
    <ChartCard
      title="Raw material received"
      subtitle={totals.map((t) => `${t.name} ${formatNumber(Math.round(t.t))} t`).join(" · ")}
      legend={materials.map((m) => ({ label: m.name, color: materialColor(m.code) }))}
      table={{
        columns: [{ key: "date", label: "Date" }, ...materials.map((m) => ({ key: `m${m.materialId}`, label: `${m.name} (t)`, align: "right" as const }))],
        rows: [...data].reverse().map((r) => ({
          date: formatDateShort(String(r.date)),
          ...Object.fromEntries(materials.map((m) => [`m${m.materialId}`, Number(r[`m${m.materialId}`] ?? 0).toFixed(1)])),
        })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          {GRID}
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatDateShort} interval={dayTicks(data.length)} minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={40} tickFormatter={(v) => `${v}t`} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent labelFormatter={(v) => formatDateShort(String(v))} valueFormatter={(v) => `${v.toFixed(1)} t`} />}
          />
          {materials.map((m, i) => (
            <Bar
              key={m.materialId}
              dataKey={`m${m.materialId}`}
              stackId="in"
              fill={`var(--color-m${m.materialId})`}
              stroke={SURFACE}
              strokeWidth={2}
              maxBarSize={BAR_MAX}
              radius={i === materials.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Invoiced vs collected by month                                      */
/* ------------------------------------------------------------------ */

export function MoneyChart({ data }: { data: { month: string; billed: number; collected: number }[] }) {
  const config = {
    billed: { label: "Billed", color: "var(--money-billed)" },
    collected: { label: "Collected", color: "var(--money-collected)" },
  } satisfies ChartConfig;
  const thisMonth = data.at(-1);
  return (
    <ChartCard
      title="Sales vs collections"
      subtitle={
        thisMonth ? (
          <>
            This month: billed <span className="num font-medium text-foreground">{formatINRCompact(thisMonth.billed)}</span>, collected{" "}
            <span className="num font-medium text-foreground">{formatINRCompact(thisMonth.collected)}</span>
          </>
        ) : undefined
      }
      legend={[
        { label: "Billed", color: "var(--money-billed)" },
        { label: "Collected", color: "var(--money-collected)" },
      ]}
      table={{
        columns: [
          { key: "month", label: "Month" },
          { key: "billed", label: "Billed", align: "right" },
          { key: "collected", label: "Collected", align: "right" },
        ],
        rows: [...data].reverse().map((r) => ({
          month: formatMonth(r.month),
          billed: formatINR(r.billed, { decimals: false }),
          collected: formatINR(r.collected, { decimals: false }),
        })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} accessibilityLayer>
          {GRID}
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatMonth} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={52} tickFormatter={formatINRCompact} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent labelFormatter={(v) => formatMonth(String(v))} valueFormatter={(v) => formatINR(v, { decimals: false })} />}
          />
          <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
          <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Receivables ageing                                                  */
/* ------------------------------------------------------------------ */

export function AgeingChart({ data }: { data: { bucket: string; amount: number }[] }) {
  const config = { amount: { label: "Amount due", color: "var(--age-3)" } } satisfies ChartConfig;
  const total = data.reduce((a, b) => a + b.amount, 0);
  const old = data.slice(2).reduce((a, b) => a + b.amount, 0);
  return (
    <ChartCard
      title="Money due, by age"
      subtitle={
        <>
          <span className="num font-medium text-foreground">{formatINRCompact(total)}</span> outstanding ·{" "}
          {pct(old, total)}% is older than 60 days
        </>
      }
      table={{
        columns: [
          { key: "bucket", label: "Age" },
          { key: "amount", label: "Amount", align: "right" },
        ],
        rows: data.map((d) => ({ bucket: d.bucket, amount: formatINR(d.amount, { decimals: false }) })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full md:h-64">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          {GRID}
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={52} tickFormatter={formatINRCompact} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent hideIndicator valueFormatter={(v) => formatINR(v, { decimals: false })} />}
          />
          <Bar
            dataKey="amount"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            label={{ position: "top", fontSize: 11, fill: "var(--foreground)", formatter: (v: unknown) => formatINRCompact(Number(v)) }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={`var(--age-${i + 1})`} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Customer: monthly deliveries by product                             */
/* ------------------------------------------------------------------ */

export function DeliveriesByMonthChart({
  products,
  data,
}: {
  products: { productId: number; name: string; code: string }[];
  data: Record<string, number | string>[];
}) {
  const config = Object.fromEntries(
    products.map((p) => [`p${p.productId}`, { label: p.name, color: productColor(p.code) }]),
  ) satisfies ChartConfig;
  return (
    <ChartCard
      title="Bricks delivered per month"
      legend={products.map((p) => ({ label: p.name, color: productColor(p.code) }))}
      table={{
        columns: [{ key: "month", label: "Month" }, ...products.map((p) => ({ key: `p${p.productId}`, label: p.name, align: "right" as const }))],
        rows: [...data].reverse().map((r) => ({
          month: formatMonth(String(r.month)),
          ...Object.fromEntries(products.map((p) => [`p${p.productId}`, formatNumber(Number(r[`p${p.productId}`] ?? 0))])),
        })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} accessibilityLayer>
          {GRID}
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={formatMonth} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={40} tickFormatter={formatCountCompact} />
          <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(v) => formatMonth(String(v))} />} />
          {products.map((p) => (
            <Bar key={p.productId} dataKey={`p${p.productId}`} fill={`var(--color-p${p.productId})`} radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/** Billed vs paid per invoice (customer dashboard). */
export function InvoicePaymentChart({ data }: { data: { invoiceNo: string; total: number; received: number }[] }) {
  const config = {
    total: { label: "Billed", color: "var(--money-billed)" },
    received: { label: "Received", color: "var(--money-collected)" },
  } satisfies ChartConfig;
  return (
    <ChartCard
      title="Billed vs received"
      subtitle="Latest orders"
      legend={[
        { label: "Billed", color: "var(--money-billed)" },
        { label: "Received", color: "var(--money-collected)" },
      ]}
      table={{
        columns: [
          { key: "invoiceNo", label: "Order" },
          { key: "total", label: "Billed", align: "right" },
          { key: "received", label: "Received", align: "right" },
        ],
        rows: data.map((d) => ({ invoiceNo: d.invoiceNo, total: formatINR(d.total, { decimals: false }), received: formatINR(d.received, { decimals: false }) })),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} accessibilityLayer>
          {GRID}
          <XAxis dataKey="invoiceNo" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: string) => v.split("/").at(-1) ?? v} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} width={52} tickFormatter={formatINRCompact} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent valueFormatter={(v) => formatINR(v, { decimals: false })} />}
          />
          <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
          <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} maxBarSize={BAR_MAX} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
