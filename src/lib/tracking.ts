/** Client-safe settings for truck tracking (no server imports). */

/** Speed above which the history screen flags over-speeding. */
export const SPEED_LIMIT_KMH = 60;

/** How often the owner's live map asks for fresh positions. */
export const LIVE_REFRESH_MS = 10_000;

/** Path of the driver app download (served from /public). */
export const DRIVER_APK_PATH = "/downloads/truck-tracker.apk";

export function formatKm(m: number): string {
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-IN")} km`;
}

export function formatKmh(kmh: number | null | undefined): string {
  return kmh === null || kmh === undefined ? "–" : `${Math.round(kmh)} km/h`;
}

/** 3725 → "1 h 02 min", 420 → "7 min", 40 → "40 s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** "just now", "40 s ago", "12 min ago", "3 h ago" */
export function formatAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
