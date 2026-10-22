/**
 * Pretend to be the driver phone app: link with an 8-digit code, then drive a real
 * road route in real time, uploading GPS fixes exactly like the Android app does.
 * Handy for demos and for testing the server without a phone.
 *
 *   npx tsx scripts/simulate-driver.ts --code 12345678 [--server http://localhost:3100] [--route madhavaram] [--minutes 10]
 */
import { randomUUID } from "node:crypto";
import ROUTES from "../src/db/demo-routes.json";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const server = (arg("server", "http://localhost:3100") ?? "").replace(/\/$/, "");
const code = arg("code");
const routeName = arg("route", "madhavaram");
const minutes = Number(arg("minutes", "10"));
if (!code) {
  console.error("Usage: npx tsx scripts/simulate-driver.ts --code <8-digit code from the Truck location page>");
  process.exit(1);
}
const route = (ROUTES as unknown as { name: string; coords: [number, number][] }[]).find((r) => r.name === routeName);
if (!route) throw new Error(`Unknown route ${routeName}`);

type Point = { trip: string; t: number; lat: number; lng: number; acc: number; spd: number; hdg: number; bat: number; chg: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rad = Math.PI / 180;
const dist = (a: [number, number], b: [number, number]) => {
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
const bearing = (a: [number, number], b: [number, number]) =>
  ((Math.atan2(Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad), Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad)) / rad) + 360) % 360;

async function main() {
  const pair = await fetch(`${server}/api/tracking/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, device: { model: "Simulator", android: "14", app: "sim" } }),
  });
  const paired = (await pair.json()) as { token?: string; truck?: { name: string }; error?: string };
  if (!pair.ok || !paired.token) throw new Error(`Pairing failed: ${paired.error ?? pair.status}`);
  console.log(`Linked as ${paired.truck?.name}. Driving ${routeName} for ${minutes} min…`);
  const auth = { Authorization: `Bearer ${paired.token}`, "Content-Type": "application/json" };

  const trip = randomUUID();
  const started = Date.now();
  const queue: Point[] = [];
  let tripEvent: { id: string; start: number; end?: number } | null = { id: trip, start: started };

  const cum = [0];
  for (let i = 1; i < route!.coords.length; i++) cum.push(cum[i - 1] + dist(route!.coords[i - 1], route!.coords[i]));
  let d = 0;
  let kmh = 0;
  let seg = 0;
  let lastUpload = Date.now();

  const upload = async () => {
    const points = queue.splice(0, 300);
    const body = { trips: tripEvent ? [tripEvent] : [], points };
    const res = await fetch(`${server}/api/tracking/points`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    if (res.status === 401) throw new Error("This phone was unlinked from the office.");
    if (!res.ok) {
      queue.unshift(...points); // keep for the next try, like the app
      console.log(`upload failed (${res.status}), will retry`);
      return;
    }
    const r = (await res.json()) as { accepted: number };
    tripEvent = null;
    console.log(`${new Date().toLocaleTimeString()} sent ${points.length} fixes (accepted ${r.accepted}) · ${(d / 1000).toFixed(2)} km · ${Math.round(kmh)} km/h`);
  };

  while (Date.now() - started < minutes * 60_000 && d < cum[cum.length - 1]) {
    const target = Math.random() < 0.05 ? 0 : 35 + Math.random() * 25;
    kmh += (target - kmh) * 0.3;
    d += (kmh / 3.6) * 5;
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const a = route!.coords[seg];
    const b = route!.coords[seg + 1];
    const f = Math.min(1, (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1));
    queue.push({
      trip,
      t: Date.now(),
      lat: a[0] + (b[0] - a[0]) * f,
      lng: a[1] + (b[1] - a[1]) * f,
      acc: 5 + Math.random() * 6,
      spd: kmh / 3.6,
      hdg: bearing(a, b),
      bat: 80,
      chg: true,
    });
    if (Date.now() - lastUpload >= 10_000) {
      lastUpload = Date.now();
      await upload();
    }
    await sleep(5_000);
  }
  tripEvent = { id: trip, start: started, end: Date.now() };
  await upload();
  console.log("Trip stopped.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
