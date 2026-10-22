import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, like, sql, type SQL } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { loginAttempts, truckDevices, truckPoints, truckTrips, trucks } from "@/db/schema";
import { zonedDayStartMs, todayIn } from "@/domain/dates";
import { cleanTrack, MOVING_NOW_KMH, summarizeTrack } from "@/domain/track";
import { APP_TIMEZONE } from "@/lib/today";
import { audit } from "./audit";
import { TAG } from "./tags";

/*
 * Server side of the driver phone app.
 *  - pairing: the owner makes a one-time 8-digit code, the phone swaps it for a long random token
 *  - uploads: the phone sends batches of GPS fixes (queued offline, retried until acknowledged)
 */

export const PAIR_CODE_HOURS = 24;
const PAIR_MAX_FAILURES_PER_IP = 10;
const PAIR_MAX_FAILURES_TOTAL = 100;
const PAIR_WINDOW_MS = 15 * 60_000;

/** What the phone is told to do; sent on pairing and with every upload reply. */
export const DEVICE_SETTINGS = { fixSeconds: 5, uploadSeconds: 10 } as const;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newPairCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || "unknown";
}

/* ------------------------------------------------------------------ */
/* Request bodies                                                      */
/* ------------------------------------------------------------------ */

export const pairBody = z.object({
  code: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .pipe(z.string().length(8, "The code has 8 digits")),
  device: z
    .object({
      model: z.string().trim().max(80).optional(),
      android: z.string().trim().max(20).optional(),
      app: z.string().trim().max(20).optional(),
    })
    .optional(),
});

const epochMs = z.number().int().min(1_600_000_000_000).max(4_000_000_000_000);
const tripKey = z.string().regex(/^[A-Za-z0-9-]{8,40}$/);
const optional = <T extends z.ZodType>(s: T) => s.nullable().optional();

export const batchBody = z.object({
  trips: z
    .array(z.object({ id: tripKey, start: epochMs, end: optional(epochMs) }))
    .max(50)
    .default([]),
  points: z
    .array(
      z.object({
        trip: tripKey,
        t: epochMs,
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        acc: optional(z.number().min(0).max(100_000)),
        /** metres per second, as Android reports it */
        spd: optional(z.number().min(0).max(100)),
        hdg: optional(z.number().min(0).max(360)),
        alt: optional(z.number().min(-1000).max(10_000)),
        bat: optional(z.number().int().min(0).max(100)),
        chg: optional(z.boolean()),
      }),
    )
    .max(1000)
    .default([]),
});
export type Batch = z.output<typeof batchBody>;

/* ------------------------------------------------------------------ */
/* Device auth                                                         */
/* ------------------------------------------------------------------ */

export type LinkedDevice = { deviceId: number; truck: typeof trucks.$inferSelect };

/** Resolve `Authorization: Bearer <token>` to a linked, un-revoked phone on an active truck. */
export async function deviceFromRequest(request: Request): Promise<LinkedDevice | null> {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const [row] = await db
    .select({ deviceId: truckDevices.id, truck: trucks })
    .from(truckDevices)
    .innerJoin(trucks, eq(trucks.id, truckDevices.truckId))
    .where(and(eq(truckDevices.tokenHash, hashDeviceToken(m[1])), isNull(truckDevices.revokedAt), eq(trucks.active, true)))
    .limit(1);
  return row ?? null;
}

export function truckInfo(truck: typeof trucks.$inferSelect) {
  return { id: truck.id, name: truck.name, plateNo: truck.plateNo, driverName: truck.driverName };
}

/* ------------------------------------------------------------------ */
/* Pairing                                                             */
/* ------------------------------------------------------------------ */

type PairResult =
  | { ok: true; token: string; truck: ReturnType<typeof truckInfo> }
  | { ok: false; status: number; error: string };

export async function pairDevice(input: z.output<typeof pairBody>, ip: string): Promise<PairResult> {
  const key = `pair:${ip}`.slice(0, 50);
  const since = new Date(Date.now() - PAIR_WINDOW_MS);
  const failures = (where: SQL) =>
    db
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(where, eq(loginAttempts.success, false), gt(loginAttempts.attemptedAt, since)))
      .then((r) => r[0].n);
  const [mine, all] = await Promise.all([failures(eq(loginAttempts.username, key)), failures(like(loginAttempts.username, "pair:%"))]);
  if (mine >= PAIR_MAX_FAILURES_PER_IP || all >= PAIR_MAX_FAILURES_TOTAL) {
    return { ok: false, status: 429, error: "Too many wrong codes. Wait 15 minutes and try again." };
  }

  const token = randomBytes(32).toString("base64url");
  const info = input.device ?? {};
  const truck = await db.transaction(async (tx) => {
    // Claim the code atomically so it can only ever be used once.
    const [claimed] = await tx
      .update(trucks)
      .set({ pairCode: null, pairCodeExpiresAt: null, currentTripId: null, updatedAt: new Date() })
      .where(and(eq(trucks.pairCode, input.code), gt(trucks.pairCodeExpiresAt, new Date()), eq(trucks.active, true)))
      .returning();
    if (!claimed) return null;
    // One phone per truck: linking a new phone unlinks the old one.
    await tx
      .update(truckDevices)
      .set({ revokedAt: new Date() })
      .where(and(eq(truckDevices.truckId, claimed.id), isNull(truckDevices.revokedAt)));
    await tx.insert(truckDevices).values({
      truckId: claimed.id,
      tokenHash: hashDeviceToken(token),
      model: info.model ?? null,
      androidVersion: info.android ?? null,
      appVersion: info.app ?? null,
      lastSeenAt: new Date(),
    });
    await audit(tx, {
      userId: null,
      action: "link",
      entity: "truck",
      entityId: claimed.id,
      summary: `Driver phone${info.model ? ` (${info.model})` : ""} linked to ${claimed.name}`,
    });
    return claimed;
  });

  await db.insert(loginAttempts).values({ username: key, success: !!truck });
  if (!truck) return { ok: false, status: 400, error: "This code is wrong or has expired. Ask the office for a new code." };
  return { ok: true, token, truck: truckInfo(truck) };
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

const MAX_FUTURE_MS = 5 * 60_000;
const MAX_AGE_MS = 30 * 86_400_000;

/** Recalculate a trip's totals from all of its points. */
async function recomputeTrip(tx: Tx, tripId: number) {
  const rows = await tx
    .select({ t: truckPoints.recordedAt, lat: truckPoints.lat, lng: truckPoints.lng, speed: truckPoints.speedKmh, acc: truckPoints.accuracyM })
    .from(truckPoints)
    .where(eq(truckPoints.tripId, tripId))
    .orderBy(asc(truckPoints.recordedAt));
  const s = summarizeTrack(cleanTrack(rows.map((r) => ({ t: r.t.getTime(), lat: r.lat, lng: r.lng, speed: r.speed, acc: r.acc }))));
  await tx
    .update(truckTrips)
    .set({
      distanceM: s.distanceM,
      movingSeconds: s.movingSeconds,
      maxSpeedKmh: s.maxSpeedKmh,
      pointCount: rows.length,
      lastPointAt: rows.at(-1)?.t ?? null,
    })
    .where(eq(truckTrips.id, tripId));
}

export async function ingestBatch(device: LinkedDevice, batch: Batch, now = Date.now()) {
  const truckId = device.truck.id;
  const points = batch.points.filter((p) => p.t <= now + MAX_FUTURE_MS && p.t >= now - MAX_AGE_MS && !(p.lat === 0 && p.lng === 0));

  // Every trip mentioned, with the earliest time we know for it.
  const tripStart = new Map<string, number>();
  for (const t of batch.trips) tripStart.set(t.id, t.start);
  for (const p of points) {
    const known = tripStart.get(p.trip);
    if (known === undefined || p.t < known) tripStart.set(p.trip, p.t);
  }
  const tripEnd = new Map(batch.trips.map((t) => [t.id, t.end ?? null]));

  const result = await db.transaction(async (tx) => {
    // Serialise uploads per truck (a retry can overlap a slow request).
    const [truck] = await tx.select().from(trucks).where(eq(trucks.id, truckId)).for("update");

    let tripIds = new Map<string, number>();
    if (tripStart.size) {
      await tx
        .insert(truckTrips)
        .values(
          [...tripStart].map(([clientId, start]) => {
            const end = tripEnd.get(clientId);
            return { truckId, deviceId: device.deviceId, clientId, startedAt: new Date(start), endedAt: end ? new Date(end) : null };
          }),
        )
        .onConflictDoUpdate({
          target: [truckTrips.truckId, truckTrips.clientId],
          set: {
            startedAt: sql`least(excluded.started_at, ${truckTrips.startedAt})`,
            endedAt: sql`coalesce(excluded.ended_at, ${truckTrips.endedAt})`,
          },
        });
      const rows = await tx
        .select({ id: truckTrips.id, clientId: truckTrips.clientId })
        .from(truckTrips)
        .where(and(eq(truckTrips.truckId, truckId), inArray(truckTrips.clientId, [...tripStart.keys()])));
      tripIds = new Map(rows.map((r) => [r.clientId, r.id]));
    }

    let accepted = 0;
    if (points.length) {
      const inserted = await tx
        .insert(truckPoints)
        .values(
          points.map((p) => ({
            truckId,
            tripId: tripIds.get(p.trip) ?? null,
            recordedAt: new Date(p.t),
            lat: p.lat,
            lng: p.lng,
            speedKmh: p.spd == null ? null : p.spd * 3.6,
            heading: p.hdg ?? null,
            accuracyM: p.acc ?? null,
            altitudeM: p.alt ?? null,
            battery: p.bat ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: truckPoints.id });
      accepted = inserted.length;
      for (const id of new Set(points.map((p) => tripIds.get(p.trip)).filter((x): x is number => !!x))) await recomputeTrip(tx, id);
    }

    // The newest trip decides whether the truck is "on duty".
    const [latest] = await tx
      .select({ id: truckTrips.id, endedAt: truckTrips.endedAt })
      .from(truckTrips)
      .where(eq(truckTrips.truckId, truckId))
      .orderBy(desc(truckTrips.startedAt))
      .limit(1);

    const update: Partial<typeof trucks.$inferInsert> = {
      lastSeenAt: new Date(now),
      currentTripId: latest && !latest.endedAt ? latest.id : null,
    };
    const good = points.filter((p) => p.acc == null || p.acc <= 100);
    const newest = good.reduce<(typeof good)[number] | null>((a, p) => (!a || p.t > a.t ? p : a), null);
    if (newest && (!truck.lastPointAt || newest.t > truck.lastPointAt.getTime())) {
      Object.assign(update, {
        lastLat: newest.lat,
        lastLng: newest.lng,
        lastSpeedKmh: newest.spd == null ? null : newest.spd * 3.6,
        lastHeading: newest.hdg ?? null,
        lastAccuracyM: newest.acc ?? null,
        lastBattery: newest.bat ?? truck.lastBattery,
        lastCharging: newest.chg ?? truck.lastCharging,
        lastPointAt: new Date(newest.t),
      });
    }
    const lastMoving = good.filter((p) => (p.spd ?? 0) * 3.6 >= MOVING_NOW_KMH).reduce((a, p) => Math.max(a, p.t), 0);
    if (lastMoving && (!truck.lastMovingAt || lastMoving > truck.lastMovingAt.getTime())) update.lastMovingAt = new Date(lastMoving);

    await tx.update(trucks).set(update).where(eq(trucks.id, truckId));
    await tx.update(truckDevices).set({ lastSeenAt: new Date(now) }).where(eq(truckDevices.id, device.deviceId));
    return { accepted, tracking: update.currentTripId !== null };
  });

  // Points from a previous day (phone was offline) change history screens that may be cached.
  const dayStart = zonedDayStartMs(todayIn(APP_TIMEZONE, new Date(now)), APP_TIMEZONE);
  if (points.some((p) => p.t < dayStart) || batch.trips.some((t) => t.start < dayStart)) revalidateTag(TAG.tracking, "max");

  return { ...result, received: points.length };
}
