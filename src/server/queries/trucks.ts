import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { truckDevices, truckPoints, truckTrips, trucks } from "@/db/schema";
import { addDays, zonedDayStartMs } from "@/domain/dates";
import { cleanTrack, liveState, speedSeries, summarizeTrack, type LiveState, type Stop, type TrackPoint } from "@/domain/track";
import { actionUser } from "@/lib/auth";
import { SPEED_LIMIT_KMH } from "@/lib/tracking";
import { APP_TIMEZONE, today } from "@/lib/today";
import { TAG } from "@/server/tags";

/*
 * Truck tracking reads. Owner only. Live positions are never cached (they change every
 * few seconds); finished days are cached and refreshed if a phone uploads late.
 * All times leave here as epoch milliseconds so client components can use them directly.
 */

export type FleetTruck = {
  id: number;
  name: string;
  plateNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  active: boolean;
  state: LiveState;
  lat: number | null;
  lng: number | null;
  speedKmh: number | null;
  heading: number | null;
  accuracyM: number | null;
  battery: number | null;
  charging: boolean | null;
  lastPointAt: number | null;
  lastMovingAt: number | null;
  tripStartedAt: number | null;
  phone: { model: string | null; appVersion: string | null; pairedAt: number; lastSeenAt: number | null } | null;
  pairCode: string | null;
  pairCodeExpiresAt: number | null;
  today: { distanceM: number; movingSeconds: number; maxSpeedKmh: number; trips: number };
};

export type Fleet = { now: number; trucks: FleetTruck[] };

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

async function loadFleet(dayStartMs: number, now: number): Promise<FleetTruck[]> {
  const rows = await db
    .select({
      truck: trucks,
      model: truckDevices.model,
      appVersion: truckDevices.appVersion,
      pairedAt: truckDevices.pairedAt,
      deviceSeenAt: truckDevices.lastSeenAt,
    })
    .from(trucks)
    .leftJoin(truckDevices, and(eq(truckDevices.truckId, trucks.id), isNull(truckDevices.revokedAt)))
    .orderBy(desc(trucks.active), asc(trucks.name));

  const todays = await db
    .select({
      truckId: truckTrips.truckId,
      distanceM: sql<number>`coalesce(sum(${truckTrips.distanceM}), 0)::float8`,
      movingSeconds: sql<number>`coalesce(sum(${truckTrips.movingSeconds}), 0)::int`,
      maxSpeedKmh: sql<number>`coalesce(max(${truckTrips.maxSpeedKmh}), 0)::float8`,
      trips: sql<number>`count(*)::int`,
    })
    .from(truckTrips)
    .where(gte(truckTrips.lastPointAt, new Date(dayStartMs)))
    .groupBy(truckTrips.truckId);

  const openTrips = rows.map((r) => r.truck.currentTripId).filter((x): x is number => x !== null);
  const starts = openTrips.length
    ? await db.select({ id: truckTrips.id, startedAt: truckTrips.startedAt }).from(truckTrips).where(inArray(truckTrips.id, openTrips))
    : [];

  return rows.map(({ truck: t, ...d }) => {
    const day = todays.find((x) => x.truckId === t.id);
    return {
      id: t.id,
      name: t.name,
      plateNo: t.plateNo,
      driverName: t.driverName,
      driverPhone: t.driverPhone,
      active: t.active,
      state: liveState(t, now),
      lat: t.lastLat,
      lng: t.lastLng,
      speedKmh: t.lastSpeedKmh,
      heading: t.lastHeading,
      accuracyM: t.lastAccuracyM,
      battery: t.lastBattery,
      charging: t.lastCharging,
      lastPointAt: ms(t.lastPointAt),
      lastMovingAt: ms(t.lastMovingAt),
      tripStartedAt: ms(starts.find((s) => s.id === t.currentTripId)?.startedAt),
      phone: d.pairedAt ? { model: d.model, appVersion: d.appVersion, pairedAt: d.pairedAt.getTime(), lastSeenAt: ms(d.deviceSeenAt) } : null,
      pairCode: t.pairCodeExpiresAt && t.pairCodeExpiresAt.getTime() > now ? t.pairCode : null,
      pairCodeExpiresAt: t.pairCodeExpiresAt && t.pairCodeExpiresAt.getTime() > now ? t.pairCodeExpiresAt.getTime() : null,
      today: {
        distanceM: day?.distanceM ?? 0,
        movingSeconds: day?.movingSeconds ?? 0,
        maxSpeedKmh: day?.maxSpeedKmh ?? 0,
        trips: day?.trips ?? 0,
      },
    };
  });
}

/** Every truck with its latest position and today's totals. */
export async function getFleetLive(): Promise<Fleet> {
  // today() first: it marks the render as request-time before anything reads the clock.
  const t = await today();
  await actionUser(["owner"]);
  const now = Date.now();
  return { now, trucks: await loadFleet(zonedDayStartMs(t, APP_TIMEZONE), now) };
}

/* ------------------------------------------------------------------ */
/* One truck, one day                                                  */
/* ------------------------------------------------------------------ */

/** [time ms, lat, lng, km/h or null, trip index] — compact so a full day stays small. */
export type DayPoint = [number, number, number, number | null, number];

export type DayTrip = {
  index: number;
  startedAt: number;
  endedAt: number | null;
  firstAt: number;
  lastAt: number;
  distanceM: number;
  movingSeconds: number;
  maxSpeedKmh: number;
  avgMovingKmh: number;
};

export type DayTrack = {
  truck: { id: number; name: string; plateNo: string | null; driverName: string | null; driverPhone: string | null };
  date: string;
  dayStart: number;
  points: DayPoint[];
  trips: DayTrip[];
  stops: Stop[];
  series: { t: number; kmh: number | null }[];
  summary: {
    distanceM: number;
    movingSeconds: number;
    maxSpeedKmh: number;
    avgMovingKmh: number;
    overLimitSeconds: number;
    stopSeconds: number;
    firstAt: number | null;
    lastAt: number | null;
  };
};

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

async function loadDay(truckId: number, date: string): Promise<DayTrack | null> {
  const [truck] = await db
    .select({ id: trucks.id, name: trucks.name, plateNo: trucks.plateNo, driverName: trucks.driverName, driverPhone: trucks.driverPhone })
    .from(trucks)
    .where(eq(trucks.id, truckId));
  if (!truck) return null;

  const dayStart = zonedDayStartMs(date, APP_TIMEZONE);
  const dayEnd = zonedDayStartMs(addDays(date, 1), APP_TIMEZONE);
  const rows = await db
    .select({
      t: truckPoints.recordedAt,
      lat: truckPoints.lat,
      lng: truckPoints.lng,
      speed: truckPoints.speedKmh,
      acc: truckPoints.accuracyM,
      tripId: truckPoints.tripId,
    })
    .from(truckPoints)
    .where(and(eq(truckPoints.truckId, truckId), gte(truckPoints.recordedAt, new Date(dayStart)), lt(truckPoints.recordedAt, new Date(dayEnd))))
    .orderBy(asc(truckPoints.recordedAt));

  // Split by trip so the gap between "Stop" and the next "Start" never counts as driving.
  const groups = new Map<number, TrackPoint[]>();
  for (const r of rows) {
    const key = r.tripId ?? -1;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ t: r.t.getTime(), lat: r.lat, lng: r.lng, speed: r.speed, acc: r.acc });
  }
  const tripRows = groups.size
    ? await db
        .select({ id: truckTrips.id, startedAt: truckTrips.startedAt, endedAt: truckTrips.endedAt })
        .from(truckTrips)
        .where(inArray(truckTrips.id, [...groups.keys()].filter((k) => k > 0)))
    : [];

  const points: DayPoint[] = [];
  const trips: DayTrip[] = [];
  const stops: Stop[] = [];
  const all: TrackPoint[] = [];
  const total = { distanceM: 0, movingSeconds: 0, maxSpeedKmh: 0, overLimitSeconds: 0 };

  [...groups.entries()].forEach(([tripId, raw], index) => {
    const clean = cleanTrack(raw);
    if (clean.length === 0) return;
    const s = summarizeTrack(clean, SPEED_LIMIT_KMH);
    const meta = tripRows.find((t) => t.id === tripId);
    trips.push({
      index,
      startedAt: meta?.startedAt.getTime() ?? clean[0].t,
      endedAt: ms(meta?.endedAt),
      firstAt: clean[0].t,
      lastAt: clean[clean.length - 1].t,
      distanceM: s.distanceM,
      movingSeconds: s.movingSeconds,
      maxSpeedKmh: s.maxSpeedKmh,
      avgMovingKmh: s.avgMovingKmh,
    });
    stops.push(...s.stops);
    total.distanceM += s.distanceM;
    total.movingSeconds += s.movingSeconds;
    total.maxSpeedKmh = Math.max(total.maxSpeedKmh, s.maxSpeedKmh);
    total.overLimitSeconds += s.overLimitSeconds;
    for (const p of clean) {
      points.push([p.t, round(p.lat, 6), round(p.lng, 6), p.speed === null ? null : round(p.speed, 1), index]);
      all.push(p);
    }
  });

  points.sort((a, b) => a[0] - b[0]);
  all.sort((a, b) => a.t - b.t);
  stops.sort((a, b) => a.start - b.start);

  return {
    truck,
    date,
    dayStart,
    points,
    trips,
    stops,
    series: speedSeries(all),
    summary: {
      ...total,
      avgMovingKmh: total.movingSeconds > 0 ? round((total.distanceM / total.movingSeconds) * 3.6, 1) : 0,
      stopSeconds: stops.reduce((a, s) => a + s.seconds, 0),
      firstAt: all[0]?.t ?? null,
      lastAt: all.at(-1)?.t ?? null,
    },
  };
}

async function loadPastDay(truckId: number, date: string) {
  "use cache";
  cacheTag(TAG.tracking, TAG.trucks);
  cacheLife("hours");
  return loadDay(truckId, date);
}

/** A day's route, stops and speeds for one truck. Today is always fresh; older days are cached. */
export async function getTruckDay(truckId: number, date: string): Promise<DayTrack | null> {
  const t = await today();
  await actionUser(["owner"]);
  return date >= t ? loadDay(truckId, date) : loadPastDay(truckId, date);
}

/** Recent days this truck drove, newest first, for the history picker. */
export async function getTruckDays(truckId: number, days = 45) {
  const t = await today();
  await actionUser(["owner"]);
  const since = new Date(zonedDayStartMs(addDays(t, -days), APP_TIMEZONE));
  const rows = await db
    .select({
      date: sql<string>`to_char(${truckTrips.startedAt} at time zone ${APP_TIMEZONE}, 'YYYY-MM-DD')`,
      distanceM: sql<number>`sum(${truckTrips.distanceM})::float8`,
      trips: sql<number>`count(*)::int`,
    })
    .from(truckTrips)
    .where(and(eq(truckTrips.truckId, truckId), gte(truckTrips.startedAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);
  return rows;
}
