"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatTime } from "@/lib/format";

const config = { kmh: { label: "Speed", color: "var(--info)" } } satisfies ChartConfig;
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

/** Speed through the day, minute by minute. Hovering moves the marker on the route map. */
export default function SpeedChart({
  series,
  limitKmh,
  cursorT,
  onHover,
}: {
  series: { t: number; kmh: number | null }[];
  limitKmh: number;
  cursorT: number | null;
  onHover: (t: number) => void;
}) {
  const top = Math.max(limitKmh + 10, ...series.map((s) => s.kmh ?? 0));
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full md:h-56">
      <AreaChart
        data={series}
        margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
        accessibilityLayer
        onMouseMove={(state) => {
          const i = typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : Number(state.activeTooltipIndex);
          if (Number.isFinite(i) && series[i]) onHover(series[i].t);
        }}
      >
        <defs>
          <linearGradient id="speed-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-kmh)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-kmh)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          tickFormatter={(v: number) => formatTime(new Date(v))}
          minTickGap={40}
        />
        <YAxis tickLine={false} axisLine={false} tick={axisTick} width={34} domain={[0, Math.ceil(top / 10) * 10]} unit="" />
        <ReferenceLine
          y={limitKmh}
          stroke="var(--destructive)"
          strokeDasharray="4 4"
          label={{ value: `${limitKmh} km/h`, position: "insideTopRight", fontSize: 11, fill: "var(--destructive)" }}
        />
        {cursorT !== null && <ReferenceLine x={cursorT} stroke="var(--foreground)" strokeWidth={1} />}
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t as number | undefined;
                return t ? formatTime(new Date(t)) : "";
              }}
              valueFormatter={(v) => `${Math.round(Number(v))} km/h`}
            />
          }
        />
        <Area
          dataKey="kmh"
          type="monotone"
          stroke="var(--color-kmh)"
          strokeWidth={1.75}
          fill="url(#speed-fill)"
          connectNulls={false}
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
