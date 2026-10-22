/**
 * GPS track maths for the truck tracker. Pure functions, shared by the upload
 * endpoint (trip totals) and the owner's history screen (stops, speed chart).
 */

export type TrackPoint = {
  /** epoch milliseconds */
  t: number;
  lat: number;
  lng: number;
  /** km/h reported by the phone's GPS (Doppler, more accurate than position deltas) */
  speed: number | null;
  /** metres, 68% confidence radius */
  acc: number | null;
};

export type Stop = { start: number; end: number; lat: number; lng: number; seconds: number };

export type TrackSummary = {
  distanceM: number;
  /** seconds spent actually moving */
  movingSeconds: number;
  /** first point → last point */
  totalSeconds: number;
  maxSpeedKmh: number;
  /** average while moving (what drivers and owners mean by "average speed") */
  avgMovingKmh: number;
  pointCount: number;
  stops: Stop[];
  /** seconds driven above the speed limit passed in */
  overLimitSeconds: number;
};

/** Points worse than this are dropped: they make the line zig-zag across buildings. */
export const MAX_ACCURACY_M = 50;
/** Faster than this between two fixes is a GPS glitch for a loaded truck. */
const MAX_PLAUSIBLE_KMH = 150;
/** Slower than this (between two fixes) counts as standing still. */
const MOVING_KMH = 3;
/** Stay within this radius for STOP_MIN_SECONDS and it's a stop. */
const STOP_RADIUS_M = 80;
export const STOP_MIN_SECONDS = 5 * 60;

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sort by time, drop duplicates and fixes too inaccurate to draw. */
export function cleanTrack(points: TrackPoint[]): TrackPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [];
  for (const p of sorted) {
    if (p.acc !== null && p.acc > MAX_ACCURACY_M) continue;
    if (out.length && out[out.length - 1].t === p.t) continue;
    out.push(p);
  }
  return out;
}

/** Find places the truck stayed (within STOP_RADIUS_M) for at least `minSeconds`. Expects a cleaned track. */
export function findStops(points: TrackPoint[], minSeconds = STOP_MIN_SECONDS): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    const anchor = points[i];
    let j = i;
    let sumLat = anchor.lat;
    let sumLng = anchor.lng;
    while (j + 1 < points.length && haversineM(anchor, points[j + 1]) <= STOP_RADIUS_M) {
      j++;
      sumLat += points[j].lat;
      sumLng += points[j].lng;
    }
    const seconds = (points[j].t - anchor.t) / 1000;
    if (j > i && seconds >= minSeconds) {
      const n = j - i + 1;
      stops.push({ start: anchor.t, end: points[j].t, lat: sumLat / n, lng: sumLng / n, seconds: Math.round(seconds) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return stops;
}

/** Distance, moving time, speeds and stops for one trip or one day. Expects a cleaned track. */
export function summarizeTrack(points: TrackPoint[], limitKmh = Infinity): TrackSummary {
  let distanceM = 0;
  let movingSeconds = 0;
  let maxSpeedKmh = 0;
  let overLimitSeconds = 0;

  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (p.speed !== null && p.speed <= MAX_PLAUSIBLE_KMH) maxSpeedKmh = Math.max(maxSpeedKmh, p.speed);
    if (k === 0) continue;
    const prev = points[k - 1];
    const dt = (p.t - prev.t) / 1000;
    if (dt <= 0) continue;
    const d = haversineM(prev, p);
    const kmh = (d / dt) * 3.6;
    // Parked GPS drift and impossible jumps don't count as driving.
    if (kmh < MOVING_KMH || kmh > MAX_PLAUSIBLE_KMH) continue;
    distanceM += d;
    movingSeconds += dt;
    const segKmh = p.speed ?? kmh;
    if (segKmh > limitKmh && dt <= 60) overLimitSeconds += dt;
    // Phones without Doppler speed: fall back to position-derived speed over short gaps.
    if (p.speed === null && dt <= 30) maxSpeedKmh = Math.max(maxSpeedKmh, kmh);
  }

  const totalSeconds = points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : 0;
  return {
    distanceM: Math.round(distanceM),
    movingSeconds: Math.round(movingSeconds),
    totalSeconds: Math.round(totalSeconds),
    maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
    avgMovingKmh: movingSeconds > 0 ? Math.round((distanceM / movingSeconds) * 3.6 * 10) / 10 : 0,
    pointCount: points.length,
    stops: findStops(points),
    overLimitSeconds: Math.round(overLimitSeconds),
  };
}

/**
 * Speed over time in fixed buckets (default 1 minute) for the chart. A bucket with no
 * fixes is `null` so the line breaks instead of drawing through a gap.
 */
export function speedSeries(points: TrackPoint[], bucketMs = 60_000): { t: number; kmh: number | null }[] {
  if (points.length === 0) return [];
  const start = Math.floor(points[0].t / bucketMs) * bucketMs;
  const end = Math.floor(points[points.length - 1].t / bucketMs) * bucketMs;
  const sums = new Map<number, { s: number; n: number }>();
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    let kmh = p.speed;
    if (kmh === null && k > 0) {
      const prev = points[k - 1];
      const dt = (p.t - prev.t) / 1000;
      kmh = dt > 0 && dt <= 60 ? (haversineM(prev, p) / dt) * 3.6 : null;
    }
    if (kmh === null || kmh > MAX_PLAUSIBLE_KMH) continue;
    const b = Math.floor(p.t / bucketMs) * bucketMs;
    const cur = sums.get(b) ?? { s: 0, n: 0 };
    cur.s += kmh;
    cur.n += 1;
    sums.set(b, cur);
  }
  const out: { t: number; kmh: number | null }[] = [];
  for (let b = start; b <= end; b += bucketMs) {
    const v = sums.get(b);
    out.push({ t: b, kmh: v ? Math.round((v.s / v.n) * 10) / 10 : null });
  }
  return out;
}

export type LiveState = "moving" | "stopped" | "no_signal" | "off" | "never";

/** A truck that hasn't sent a fix for this long while a trip is open has "no signal". */
export const NO_SIGNAL_MS = 3 * 60_000;
export const MOVING_NOW_KMH = 5;
/** A trip left open this long without data (phone died, app removed) is treated as finished. */
export const STALE_TRIP_MS = 6 * 3_600_000;

export function liveState(
  truck: { lastPointAt: Date | null; currentTripId: number | null; lastSpeedKmh: number | null },
  now: number,
): LiveState {
  if (!truck.lastPointAt) return "never";
  const age = now - truck.lastPointAt.getTime();
  if (truck.currentTripId === null || age > STALE_TRIP_MS) return "off";
  if (age > NO_SIGNAL_MS) return "no_signal";
  return (truck.lastSpeedKmh ?? 0) >= MOVING_NOW_KMH ? "moving" : "stopped";
}
