import type { DayPoint } from "@/server/queries/trucks";

/** A gap this long (with real movement) means we don't know the road taken; drawn dashed. */
export const GAP_MS = 5 * 60_000;

/** Position at time t, interpolated between the two surrounding fixes. */
export function positionAt(points: DayPoint[], t: number): { lat: number; lng: number; kmh: number | null; i: number } | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (t <= points[0][0]) return { lat: points[0][1], lng: points[0][2], kmh: points[0][3], i: 0 };
  if (t >= points[hi][0]) return { lat: points[hi][1], lng: points[hi][2], kmh: points[hi][3], i: hi };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const f = (t - a[0]) / (b[0] - a[0] || 1);
  // Don't slide across a gap or between trips: stay on the last known fix.
  if (b[0] - a[0] > GAP_MS || a[4] !== b[4]) return { lat: a[1], lng: a[2], kmh: a[3], i: lo };
  return { lat: a[1] + (b[1] - a[1]) * f, lng: a[2] + (b[2] - a[2]) * f, kmh: a[3], i: lo };
}

