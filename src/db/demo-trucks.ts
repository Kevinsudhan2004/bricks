/**
 * Demo trucks with a week of realistic GPS history along real roads around the
 * factory (routes in demo-routes.json), so the Truck location screens have
 * something to show before the first real driver phone is linked.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { addDays, DEFAULT_TZ, todayIn, zonedDayStartMs } from "../domain/dates";
import { cleanTrack, haversineM, summarizeTrack } from "../domain/track";
import ROUTES from "./demo-routes.json";
import * as s from "./schema";

type Db = PostgresJsDatabase<typeof s>;
type Fix = { t: number; lat: number; lng: number; spd: number; hdg: number; acc: number; bat: number };
type Route = { name: string; label: string; coords: [number, number][] };

const routes = ROUTES as unknown as Route[];

/* Deterministic randomness so every reseed looks the same. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Drive a polyline from time t0, one fix every 5 s while moving. Returns the fixes and the arrival time. */
function drive(coords: [number, number][], t0: number, rnd: () => number, opts: { fast: boolean; until?: number; battery: { v: number } }) {
  const fixes: Fix[] = [];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineM({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }));
  const total = cum[cum.length - 1];

  let t = t0;
  let d = 0;
  let seg = 0;
  let cruise = 38 + rnd() * 10;
  let hold = 0; // seconds left at a signal / in a jam
  let kmh = 0;
  while (d < total) {
    if (opts.until && t > opts.until) break;
    // Every so often: a junction, a jam, or (for some drivers) a burst of speed on the highway.
    const p = rnd();
    if (hold <= 0 && p < 0.012) hold = 20 + rnd() * 70;
    if (p > 0.985) cruise = 30 + rnd() * 22 + (opts.fast && rnd() < 0.5 ? 18 : 0);
    const target = hold > 0 ? 0 : cruise + (rnd() - 0.5) * 6;
    kmh += (target - kmh) * 0.35;
    if (hold > 0) hold -= 5;
    d = Math.min(total, d + (kmh / 3.6) * 5);
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const a = coords[seg];
    const b = coords[seg + 1];
    const jitter = () => (rnd() - 0.5) * 0.00004;
    opts.battery.v = Math.max(18, opts.battery.v - 0.004);
    fixes.push({
      t,
      lat: a[0] + (b[0] - a[0]) * f + jitter(),
      lng: a[1] + (b[1] - a[1]) * f + jitter(),
      spd: Math.max(0, kmh / 3.6),
      hdg: bearing(a, b),
      acc: 4 + rnd() * 8,
      bat: Math.round(opts.battery.v),
    });
    t += 5_000;
  }
  return { fixes, end: t };
}

/** Parked: the app sends one fix a minute. */
function park(at: [number, number], t0: number, seconds: number, rnd: () => number, battery: { v: number }, until?: number) {
  const fixes: Fix[] = [];
  for (let t = t0; t < t0 + seconds * 1000; t += 60_000) {
    if (until && t > until) break;
    fixes.push({
      t,
      lat: at[0] + (rnd() - 0.5) * 0.00008,
      lng: at[1] + (rnd() - 0.5) * 0.00008,
      spd: rnd() * 0.3,
      hdg: 0,
      acc: 6 + rnd() * 10,
      bat: Math.round(battery.v),
    });
  }
  return { fixes, end: t0 + seconds * 1000 };
}

/** Factory → site → unload → back to the factory (optionally cut short at `until` = still on the road). */
function roundTrip(route: Route, t0: number, rnd: () => number, fast: boolean, battery: { v: number }, until?: number) {
  const out = drive(route.coords, t0, rnd, { fast, until, battery });
  const site = route.coords[route.coords.length - 1];
  const unload = park(site, out.end, (35 + rnd() * 25) * 60, rnd, battery, until);
  const back = drive([...route.coords].reverse(), unload.end, rnd, { fast, until, battery });
  const fixes = [...out.fixes, ...unload.fixes, ...back.fixes].filter((f) => !until || f.t <= until);
  return { fixes, end: back.end };
}

const TRUCKS = [
  { name: "Eicher 1", plateNo: "TN 20 BX 4521", driverName: "Ramesh", driverPhone: "9840123456", model: "Redmi Note 12", fast: true },
  { name: "Tata 407", plateNo: "TN 18 AK 7790", driverName: "Selvam", driverPhone: "9790234567", model: "Samsung Galaxy M14", fast: false },
  { name: "Ashok Leyland", plateNo: "TN 05 CQ 1182", driverName: "Murugan", driverPhone: "9962345678", model: "realme C55", fast: false },
  { name: "Bolero Pickup", plateNo: "TN 20 CZ 3018", driverName: "Karthik", driverPhone: "9884456789", model: null, fast: false },
] as const;

const at = (dayStart: number, hours: number) => dayStart + hours * 3_600_000;

/** Plate numbers of the demo trucks, to tell whether they've already been added. */
export const DEMO_TRUCK_PLATES = TRUCKS.map((t) => t.plateNo);

export async function seedDemoTrucks(db: Db, opts: { now?: number; days?: number } = {}) {
  const now = opts.now ?? Date.now();
  const today = todayIn(DEFAULT_TZ, new Date(now));
  const days = opts.days ?? 7;
  const rnd = prng(20261010);
  const route = (name: string) => routes.find((r) => r.name === name) ?? routes[0];

  let totalPoints = 0;
  for (const [ti, spec] of TRUCKS.entries()) {
    const [truck] = await db
      .insert(s.trucks)
      .values({ name: spec.name, plateNo: spec.plateNo, driverName: spec.driverName, driverPhone: spec.driverPhone })
      .returning();
    if (!spec.model) continue; // last truck: phone not linked yet (shows the onboarding state)

    const [device] = await db
      .insert(s.truckDevices)
      .values({
        truckId: truck.id,
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        model: spec.model,
        androidVersion: "14",
        appVersion: "1.0.0",
        pairedAt: new Date(zonedDayStartMs(addDays(today, -days - 3))),
      })
      .returning();

    type TripPlan = { start: number; route: Route; until?: number };
    const plans: TripPlan[] = [];
    for (let back = days; back >= 1; back--) {
      const day = addDays(today, -back);
      if (new Date(`${day}T00:00:00Z`).getUTCDay() === 0 && ti !== 0) continue; // most trucks rest on Sunday
      const ds = zonedDayStartMs(day);
      plans.push({ start: at(ds, 7 + rnd() * 1.2), route: routes[Math.floor(rnd() * routes.length)] });
      plans.push({ start: at(ds, 13 + rnd() * 1.5), route: routes[Math.floor(rnd() * routes.length)] });
    }
    // Today: one truck on the road now, one unloading at a site, one already done for the morning.
    if (ti === 0) {
      const r = route("ambattur");
      plans.push({ start: now - 130 * 60_000, route: r, until: now });
    } else if (ti === 1) {
      const r = route("madhavaram");
      plans.push({ start: now - 65 * 60_000, route: r, until: now });
    } else {
      plans.push({ start: Math.min(now - 3 * 3_600_000, at(zonedDayStartMs(today), 6.2)), route: route("redhills") });
    }

    let last: Fix | null = null;
    let lastMoving = 0;
    let currentTripId: number | null = null;
    const battery = { v: 92 };
    for (const [pi, plan] of plans.entries()) {
      battery.v = 70 + rnd() * 28;
      const { fixes, end } = roundTrip(plan.route, plan.start, rnd, spec.fast, battery, plan.until);
      // Tidy the "today, still running" trip so its last fix is a few seconds ago.
      const open = plan.until !== undefined;
      if (open && fixes.length) {
        const shift = now - 4_000 - fixes[fixes.length - 1].t;
        for (const f of fixes) f.t += shift;
      }
      const clean = cleanTrack(fixes.map((f) => ({ t: f.t, lat: f.lat, lng: f.lng, speed: f.spd * 3.6, acc: f.acc })));
      const sum = summarizeTrack(clean);
      const [trip] = await db
        .insert(s.truckTrips)
        .values({
          truckId: truck.id,
          deviceId: device.id,
          clientId: `demo-${truck.id}-${pi}-${plan.start}`,
          startedAt: new Date(fixes[0].t),
          endedAt: open ? null : new Date(Math.max(end, fixes[fixes.length - 1].t + 1000)),
          distanceM: sum.distanceM,
          movingSeconds: sum.movingSeconds,
          maxSpeedKmh: sum.maxSpeedKmh,
          pointCount: fixes.length,
          lastPointAt: new Date(fixes[fixes.length - 1].t),
        })
        .returning({ id: s.truckTrips.id });
      for (let i = 0; i < fixes.length; i += 2000) {
        await db.insert(s.truckPoints).values(
          fixes.slice(i, i + 2000).map((f) => ({
            truckId: truck.id,
            tripId: trip.id,
            recordedAt: new Date(f.t),
            lat: f.lat,
            lng: f.lng,
            speedKmh: f.spd * 3.6,
            heading: f.hdg,
            accuracyM: f.acc,
            battery: f.bat,
          })),
        );
      }
      totalPoints += fixes.length;
      last = fixes[fixes.length - 1];
      for (const f of fixes) if (f.spd * 3.6 >= 5) lastMoving = Math.max(lastMoving, f.t);
      currentTripId = open ? trip.id : null;
    }

    if (last) {
      await db
        .update(s.trucks)
        .set({
          lastLat: last.lat,
          lastLng: last.lng,
          lastSpeedKmh: last.spd * 3.6,
          lastHeading: last.hdg,
          lastAccuracyM: last.acc,
          lastBattery: last.bat,
          lastCharging: ti === 0,
          lastPointAt: new Date(last.t),
          lastMovingAt: lastMoving ? new Date(lastMoving) : null,
          lastSeenAt: new Date(last.t),
          currentTripId,
        })
        .where(eq(s.trucks.id, truck.id));
      await db.update(s.truckDevices).set({ lastSeenAt: new Date(last.t) }).where(eq(s.truckDevices.id, device.id));
    }
  }
  return { trucks: TRUCKS.length, points: totalPoints };
}
