"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Stop } from "@/domain/track";
import { formatTime } from "@/lib/format";
import { formatDuration } from "@/lib/tracking";
import type { DayPoint } from "@/server/queries/trucks";
import { createMap, mapView } from "./map-base";
import { GAP_MS, positionAt } from "./track-utils";

const GAP_M = 300;

function dot(kind: "start" | "end" | "stop" | "cursor", text = "", size = 22) {
  return L.divIcon({
    html: `<div class="route-dot route-dot--${kind}">${text}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** The day's route: blue line, red where over the limit, dashed across gaps; numbered stops; playback marker. */
export default function RouteMap({
  points,
  stops,
  limitKmh,
  cursorT,
  follow,
  className,
}: {
  points: DayPoint[];
  stops: Stop[];
  limitKmh: number;
  cursorT: number | null;
  follow: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cursor = useRef<L.Marker | null>(null);
  const view = useRef<ReturnType<typeof mapView> | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    const m = createMap(el.current!);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    view.current = mapView(el.current!, m);
    return () => {
      view.current?.stop();
      view.current = null;
      m.remove();
      map.current = null;
      layer.current = null;
      cursor.current = null;
      fitted.current = false;
    };
  }, []);

  // (Re)draw the route whenever points arrive. Fit to it only the first time.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!points.length) return;

    const runs: { kind: "normal" | "fast" | "gap"; coords: L.LatLngTuple[] }[] = [];
    let run: (typeof runs)[number] | null = null;
    for (let k = 0; k < points.length; k++) {
      const [t, lat, lng, kmh, trip] = points[k];
      const prev = points[k - 1];
      const here: L.LatLngTuple = [lat, lng];
      if (prev && prev[4] !== trip) {
        run = null; // new trip: never join trips with a line
      } else if (prev && t - prev[0] > GAP_MS && m.distance([prev[1], prev[2]], here) > GAP_M) {
        runs.push({ kind: "gap", coords: [[prev[1], prev[2]], here] });
        run = null;
      }
      const kind = kmh !== null && kmh > limitKmh ? "fast" : "normal";
      if (!run || run.kind !== kind) {
        const start: L.LatLngTuple[] = run ? [run.coords[run.coords.length - 1]] : [];
        run = { kind, coords: [...start, here] };
        runs.push(run);
      } else {
        run.coords.push(here);
      }
    }
    // Wide soft casing under the line so it reads on busy street maps.
    for (const r of runs) {
      if (r.kind === "gap") continue;
      L.polyline(r.coords, { color: "#fff", weight: 8, opacity: 0.85, interactive: false }).addTo(g);
    }
    for (const r of runs) {
      L.polyline(r.coords, {
        className: r.kind === "fast" ? "route-line--fast" : r.kind === "gap" ? "route-line--gap" : "route-line",
        weight: r.kind === "gap" ? 3 : 4.5,
        opacity: 0.95,
        lineJoin: "round",
        interactive: false,
      }).addTo(g);
    }

    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: dot("stop", String(i + 1)), zIndexOffset: 100 })
        .bindTooltip(`<b>Stop ${i + 1}</b> · ${formatDuration(s.seconds)}<br>${formatTime(new Date(s.start))} – ${formatTime(new Date(s.end))}`, {
          direction: "top",
          offset: [0, -10],
        })
        .addTo(g);
    });

    const first = points[0];
    const last = points[points.length - 1];
    L.marker([first[1], first[2]], { icon: dot("start", "S"), zIndexOffset: 200 })
      .bindTooltip(`<b>Start</b> · ${formatTime(new Date(first[0]))}`, { direction: "top", offset: [0, -10] })
      .addTo(g);
    L.marker([last[1], last[2]], { icon: dot("end", "E"), zIndexOffset: 200 })
      .bindTooltip(`<b>Last position</b> · ${formatTime(new Date(last[0]))}`, { direction: "top", offset: [0, -10] })
      .addTo(g);

    if (!fitted.current) {
      fitted.current = true;
      view.current?.fit(L.latLngBounds(points.map((p) => [p[1], p[2]] as L.LatLngTuple)), 16);
    }
  }, [points, stops, limitKmh]);

  // Playback / chart-hover marker.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pos = cursorT === null ? null : positionAt(points, cursorT);
    if (!pos) {
      cursor.current?.remove();
      cursor.current = null;
      return;
    }
    if (!cursor.current) cursor.current = L.marker([pos.lat, pos.lng], { icon: dot("cursor", "", 18), zIndexOffset: 1000, interactive: false }).addTo(m);
    else cursor.current.setLatLng([pos.lat, pos.lng]);
    if (follow && !m.getBounds().pad(-0.15).contains([pos.lat, pos.lng])) m.panTo([pos.lat, pos.lng], { animate: true, duration: 0.4 });
  }, [cursorT, points, follow]);

  return (
    <div className={`map-shell ${className ?? ""}`}>
      <div ref={el} className="size-full" role="region" aria-label="Map of the day's route" />
    </div>
  );
}
