import { describe, expect, it } from "vitest";
import { zonedDayStartMs } from "./dates";
import { cleanTrack, findStops, haversineM, liveState, speedSeries, summarizeTrack, type TrackPoint } from "./track";

const T0 = Date.UTC(2026, 9, 10, 4, 0, 0);
/** ~111 m per 0.001° of latitude */
const pt = (sec: number, lat: number, lng = 80.2, speed: number | null = null, acc: number | null = 8): TrackPoint => ({
  t: T0 + sec * 1000,
  lat,
  lng,
  speed,
  acc,
});

describe("haversine", () => {
  it("measures a known distance", () => {
    // Chennai Central → Chennai Egmore is ~2.1 km as the crow flies
    const d = haversineM({ lat: 13.0827, lng: 80.2757 }, { lat: 13.0732, lng: 80.2609 });
    expect(d).toBeGreaterThan(1900);
    expect(d).toBeLessThan(2000);
  });
});

describe("cleanTrack", () => {
  it("sorts, drops inaccurate fixes and duplicates", () => {
    const out = cleanTrack([pt(10, 13.001), pt(0, 13), pt(5, 13.0005, 80.2, null, 400), pt(10, 13.001)]);
    expect(out.map((p) => p.t - T0)).toEqual([0, 10_000]);
  });
});

describe("summarizeTrack", () => {
  it("adds up distance and moving time, ignoring parked drift", () => {
    // Drive north 10 × 111 m at 10 s intervals (~40 km/h), then sit still with tiny drift for 10 minutes.
    const drive = Array.from({ length: 11 }, (_, i) => pt(i * 10, 13 + i * 0.001, 80.2, 40));
    const parked = Array.from({ length: 10 }, (_, i) => pt(100 + (i + 1) * 60, 13.01 + (i % 2 ? 0.00003 : 0), 80.2, 0));
    const s = summarizeTrack(cleanTrack([...drive, ...parked]));
    expect(s.distanceM).toBeGreaterThan(1100);
    expect(s.distanceM).toBeLessThan(1120);
    expect(s.movingSeconds).toBe(100);
    expect(s.avgMovingKmh).toBeGreaterThan(39);
    expect(s.avgMovingKmh).toBeLessThan(41);
    expect(s.maxSpeedKmh).toBe(40);
    expect(s.totalSeconds).toBe(700);
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0].seconds).toBeGreaterThanOrEqual(600);
  });

  it("counts time over the speed limit", () => {
    const fast = Array.from({ length: 7 }, (_, i) => pt(i * 10, 13 + i * 0.002, 80.2, 72));
    expect(summarizeTrack(fast, 60).overLimitSeconds).toBe(60);
    expect(summarizeTrack(fast, 80).overLimitSeconds).toBe(0);
  });

  it("ignores impossible jumps", () => {
    const s = summarizeTrack([pt(0, 13), pt(5, 13.1), pt(10, 13.0001)]);
    expect(s.distanceM).toBe(0);
  });

  it("derives top speed from positions when the phone gives none", () => {
    const s = summarizeTrack([pt(0, 13), pt(10, 13.001), pt(20, 13.002)]);
    expect(s.maxSpeedKmh).toBeGreaterThan(39);
    expect(s.maxSpeedKmh).toBeLessThan(41);
  });

  it("handles empty and single-point tracks", () => {
    expect(summarizeTrack([]).distanceM).toBe(0);
    expect(summarizeTrack([pt(0, 13)]).avgMovingKmh).toBe(0);
  });
});

describe("findStops", () => {
  it("needs five minutes in one place", () => {
    const short = [pt(0, 13), pt(120, 13.0001), pt(240, 13)];
    expect(findStops(short)).toHaveLength(0);
    const long = [pt(0, 13), pt(200, 13.0001), pt(400, 13)];
    expect(findStops(long)).toHaveLength(1);
  });
});

describe("speedSeries", () => {
  it("buckets by minute and leaves gaps empty", () => {
    const s = speedSeries([pt(0, 13, 80.2, 30), pt(30, 13.0002, 80.2, 50), pt(185, 13.003, 80.2, 20)]);
    expect(s.map((b) => b.kmh)).toEqual([40, null, null, 20]);
  });
});

describe("liveState", () => {
  const now = T0 + 3_600_000;
  it("classifies trucks", () => {
    expect(liveState({ lastPointAt: null, currentTripId: null, lastSpeedKmh: null }, now)).toBe("never");
    expect(liveState({ lastPointAt: new Date(now - 10_000), currentTripId: null, lastSpeedKmh: 0 }, now)).toBe("off");
    expect(liveState({ lastPointAt: new Date(now - 600_000), currentTripId: 4, lastSpeedKmh: 30 }, now)).toBe("no_signal");
    expect(liveState({ lastPointAt: new Date(now - 10_000), currentTripId: 4, lastSpeedKmh: 30 }, now)).toBe("moving");
    expect(liveState({ lastPointAt: new Date(now - 10_000), currentTripId: 4, lastSpeedKmh: 1 }, now)).toBe("stopped");
    expect(liveState({ lastPointAt: new Date(now - 8 * 3_600_000), currentTripId: 4, lastSpeedKmh: 1 }, now)).toBe("off");
  });
});

describe("zonedDayStartMs", () => {
  it("finds midnight in India and in a DST zone", () => {
    expect(new Date(zonedDayStartMs("2026-10-10", "Asia/Kolkata")).toISOString()).toBe("2026-10-09T18:30:00.000Z");
    expect(new Date(zonedDayStartMs("2026-07-01", "Europe/London")).toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(new Date(zonedDayStartMs("2026-01-01", "UTC")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
