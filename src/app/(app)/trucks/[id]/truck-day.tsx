"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CalendarDays, Gauge, MapPin, Pause, Play, Route, Siren, Timer, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { positionAt } from "@/components/trucks/track-utils";
import { DEFAULT_TZ, todayIn } from "@/domain/dates";
import { formatDateShort, formatTime } from "@/lib/format";
import { formatDuration, formatKm, formatKmh, mapsLink, SPEED_LIMIT_KMH } from "@/lib/tracking";
import type { DayTrack } from "@/server/queries/trucks";

const RouteMap = dynamic(() => import("@/components/trucks/route-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-xl" />,
});
const SpeedChart = dynamic(() => import("@/components/trucks/speed-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-lg md:h-56" />,
});

const RATES = [
  { value: 30, label: "30×" },
  { value: 120, label: "2 min/s" },
  { value: 600, label: "10 min/s" },
];
const TODAY_REFRESH_MS = 15_000;

export function TruckDay({ initial, isToday }: { initial: DayTrack; isToday: boolean }) {
  const [day, setDay] = useState(initial);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(120);
  const { points, summary: s } = day;
  const first = points[0]?.[0] ?? null;
  const last = points.at(-1)?.[0] ?? null;

  // Today keeps filling in while the truck drives.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/trucks/${day.truck.id}/day?date=${day.date}`, { cache: "no-store" });
      if (res.ok) setDay((await res.json()) as DayTrack);
    } catch {
      /* next tick will retry */
    }
  }, [day.truck.id, day.date]);
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), TODAY_REFRESH_MS);
    return () => clearInterval(id);
  }, [isToday, refresh]);

  // Playback: advance a virtual clock `rate` times faster than real time.
  const clock = useRef<{ t: number; at: number } | null>(null);
  useEffect(() => {
    if (!playing || first === null || last === null) return;
    let raf = 0;
    const startT = cursorT === null || cursorT >= last ? first : cursorT;
    clock.current = { t: startT, at: performance.now() };
    const step = (now: number) => {
      const c = clock.current!;
      const t = c.t + (now - c.at) * rate;
      if (t >= last) {
        setCursorT(last);
        setPlaying(false);
        return;
      }
      setCursorT(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // cursorT is read once when playback starts; restarting on every frame would reset the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, first, last]);

  const here = useMemo(() => (cursorT === null ? null : positionAt(points, cursorT)), [points, cursorT]);
  const scrub = (t: number) => {
    setPlaying(false);
    setCursorT(t);
  };

  if (points.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title={isToday ? "No trips yet today" : "No trips on this day"}
        description={
          isToday
            ? "The route appears here as soon as the driver taps Start in the Truck Tracker app."
            : "The driver didn't start tracking on this day. Pick another day above."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="Day summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Distance" value={formatKm(s.distanceM)} icon={Route} tone="info" hint={`${day.trips.length} trip${day.trips.length === 1 ? "" : "s"}`} />
        <StatCard label="Driving time" value={formatDuration(s.movingSeconds)} icon={Timer} hint={first && last ? `${formatTime(new Date(first))} – ${formatTime(new Date(last))}` : undefined} />
        <StatCard label="Average speed" value={formatKmh(s.avgMovingKmh)} icon={Gauge} tone="success" hint="While moving" />
        <StatCard label="Top speed" value={formatKmh(s.maxSpeedKmh)} icon={TrendingUp} tone={s.maxSpeedKmh > SPEED_LIMIT_KMH ? "danger" : "default"} />
        <StatCard label="Stops" value={String(day.stops.length)} icon={MapPin} tone="warning" hint={day.stops.length ? `${formatDuration(s.stopSeconds)} stopped` : "5 min or longer"} />
        <StatCard
          label={`Over ${SPEED_LIMIT_KMH} km/h`}
          value={formatDuration(s.overLimitSeconds)}
          icon={Siren}
          tone={s.overLimitSeconds > 60 ? "danger" : "default"}
          hint={s.overLimitSeconds > 0 ? "Red on the map" : "Never over the limit"}
        />
      </section>

      <section aria-label="Route" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="h-[55dvh] min-h-80 lg:h-[60dvh]">
          <RouteMap points={points} stops={day.stops} limitKmh={SPEED_LIMIT_KMH} cursorT={cursorT} follow={playing} className="size-full" />
        </div>
        {/* Playback */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t p-3">
          <Button
            type="button"
            size="icon"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause playback" : "Play the day's route"}
            className="rounded-full"
          >
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
          <input
            type="range"
            min={first!}
            max={last!}
            step={1000}
            value={cursorT ?? first!}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Time of day"
            aria-valuetext={cursorT ? formatTime(new Date(cursorT)) : undefined}
            className="h-2 min-w-40 flex-1 cursor-pointer accent-[var(--info)]"
          />
          <p className="num w-36 text-sm" aria-live="off">
            <span className="font-semibold">{formatTime(new Date(cursorT ?? first!))}</span>
            <span className="text-muted-foreground"> · {here ? formatKmh(here.kmh) : "–"}</span>
          </p>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Playback speed">
            {RATES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRate(r.value)}
                aria-pressed={rate === r.value}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  rate === r.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-1 w-4 rounded-full bg-info" /> Route
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-1 w-4 rounded-full bg-destructive" /> Over {SPEED_LIMIT_KMH} km/h
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" /> No signal (straight line)
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full bg-warning" /> Stop (5 min+)
          </li>
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-labelledby="speed-heading">
        <h2 id="speed-heading" className="font-semibold">
          Speed through the day
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Minute by minute. Point at the chart to see where the truck was on the map.</p>
        <div className="mt-3">
          <SpeedChart series={day.series} limitKmh={SPEED_LIMIT_KMH} cursorT={cursorT} onHover={scrub} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-labelledby="trips-heading">
          <h2 id="trips-heading" className="font-semibold">
            Trips
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Each Start → Stop on the driver&apos;s phone.</p>
          <ul className="mt-3 divide-y">
            {day.trips.map((t, i) => (
              <li key={t.index}>
                <button
                  type="button"
                  onClick={() => scrub(t.firstAt)}
                  className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:text-primary"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">Trip {i + 1}</span>
                    <span className="num block text-xs text-muted-foreground">
                      {formatTime(new Date(t.firstAt))} – {t.endedAt ? formatTime(new Date(t.lastAt)) : "still running"}
                      {t.startedAt < day.dayStart ? ` · started ${formatDateShort(todayIn(DEFAULT_TZ, new Date(t.startedAt)))}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right text-sm">
                    <span className="block font-semibold">{formatKm(t.distanceM)}</span>
                    <span className="block text-xs text-muted-foreground">
                      avg {formatKmh(t.avgMovingKmh)} · top {formatKmh(t.maxSpeedKmh)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-5" aria-labelledby="stops-heading">
          <h2 id="stops-heading" className="font-semibold">
            Stops
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Places the truck stood still for 5 minutes or more.</p>
          {day.stops.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No long stops.</p>
          ) : (
            <ol className="mt-3 divide-y">
              {day.stops.map((st, i) => (
                <li key={st.start} className="flex items-center justify-between gap-3 py-2.5">
                  <button type="button" onClick={() => scrub(st.start)} className="flex min-w-0 items-center gap-3 text-left hover:text-primary">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="num block font-medium">{formatDuration(st.seconds)}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {formatTime(new Date(st.start))} – {formatTime(new Date(st.end))}
                      </span>
                    </span>
                  </button>
                  <a
                    href={mapsLink(st.lat, st.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
                  >
                    Open in Maps
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

/** Today / Yesterday / recent days with distance, plus a calendar for anything older. */
export function DayPicker({
  truckId,
  date,
  today,
  yesterday,
  days,
}: {
  truckId: number;
  date: string;
  today: string;
  yesterday: string;
  days: { date: string; distanceM: number }[];
}) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? `/trucks/${truckId}` : `/trucks/${truckId}?date=${d}`, { scroll: false });
  const chips = [
    { date: today, label: "Today" },
    { date: yesterday, label: "Yesterday" },
    ...days.filter((d) => d.date !== today && d.date !== yesterday).slice(0, 8).map((d) => ({ date: d.date, label: formatDateShort(d.date) })),
  ];
  const km = new Map(days.map((d) => [d.date, d.distanceM]));

  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Choose a day">
        {chips.map((c) => (
          <button
            key={c.date}
            type="button"
            onClick={() => go(c.date)}
            aria-pressed={c.date === date}
            className={cn(
              "flex shrink-0 flex-col items-start rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
              c.date === date ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:border-primary/40",
            )}
          >
            <span className="font-medium">{c.label}</span>
            <span className="num text-xs text-muted-foreground">{km.has(c.date) ? formatKm(km.get(c.date)!) : "–"}</span>
          </button>
        ))}
      </div>
      <label className="relative flex shrink-0 items-center">
        <span className="sr-only">Pick a date</span>
        <CalendarDays className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
        <input
          type="date"
          max={today}
          value={date}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="h-10 rounded-lg border bg-card pr-2 pl-8 text-sm"
        />
      </label>
    </div>
  );
}
