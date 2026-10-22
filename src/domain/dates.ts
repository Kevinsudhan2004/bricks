/**
 * Business dates are plain "YYYY-MM-DD" strings in the company's timezone
 * (default Asia/Kolkata), never Date objects, so they don't drift across timezones.
 */
export const DEFAULT_TZ = "Asia/Kolkata";

export function todayIn(timeZone: string = DEFAULT_TZ, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** List of YYYY-MM-DD from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** List of YYYY-MM month keys ending at `endIso`'s month, `count` long. */
export function lastMonths(endIso: string, count: number): string[] {
  const [y, m] = endIso.split("-").map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Indian financial year (April–March) label, e.g. 2026-10-09 → "26-27". */
export function financialYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUtcDate(toUtcDate(value)) === value;
}

/** Minutes the zone is ahead of UTC at a given instant (e.g. +330 for India). */
function zoneOffsetMinutes(ms: number, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The UTC instant (epoch ms) when a business date starts in the given timezone. */
export function zonedDayStartMs(iso: string, timeZone: string = DEFAULT_TZ): number {
  const utcMidnight = toUtcDate(iso).getTime();
  let start = utcMidnight - zoneOffsetMinutes(utcMidnight, timeZone) * 60_000;
  // Re-check at the guessed instant so DST zones land on the right side of a switch.
  start = utcMidnight - zoneOffsetMinutes(start, timeZone) * 60_000;
  return start;
}
