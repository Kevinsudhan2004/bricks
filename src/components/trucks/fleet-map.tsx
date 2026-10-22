"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LiveState } from "@/domain/track";
import { createMap, escapeHtml, ICON, mapView } from "./map-base";

export type MapTruck = {
  id: number;
  label: string;
  lat: number;
  lng: number;
  state: LiveState;
  heading: number | null;
  accuracyM: number | null;
};

function pinHtml(t: MapTruck, selected: boolean): string {
  const icon =
    t.state === "moving"
      ? `<span style="display:flex;transform:rotate(${Math.round(t.heading ?? 0)}deg)">${ICON.arrow}</span>`
      : t.state === "stopped"
        ? ICON.pause
        : t.state === "no_signal"
          ? ICON.signal
          : ICON.truck;
  return `<div class="truck-pin" data-state="${t.state}" data-selected="${selected}">
    <div class="truck-pin__disc">${icon}</div>
    <div class="truck-pin__label">${escapeHtml(t.label)}</div>
  </div>`;
}

/** Live map of every truck. Markers update in place so the map never jumps while you look at it. */
export default function FleetMap({
  trucks,
  selectedId,
  onSelect,
  className,
}: {
  trucks: MapTruck[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<number, { marker: L.Marker; html: string }>());
  const accuracy = useRef<L.Circle | null>(null);
  const view = useRef<ReturnType<typeof mapView> | null>(null);
  const fitted = useRef(false);
  const select = useRef(onSelect);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const m = createMap(el.current!);
    map.current = m;
    view.current = mapView(el.current!, m);
    const all = markers.current;
    return () => {
      view.current?.stop();
      view.current = null;
      m.remove();
      map.current = null;
      all.clear();
      fitted.current = false;
    };
  }, []);

  // Add / move / restyle markers.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<number>();
    for (const t of trucks) {
      seen.add(t.id);
      const html = pinHtml(t, t.id === selectedId);
      const existing = markers.current.get(t.id);
      if (!existing) {
        const marker = L.marker([t.lat, t.lng], {
          icon: L.divIcon({ html, className: "", iconSize: [34, 34], iconAnchor: [17, 17] }),
          keyboard: true,
          title: t.label,
          zIndexOffset: t.state === "moving" ? 500 : 0,
        })
          .on("click", () => select.current(t.id))
          .addTo(m);
        markers.current.set(t.id, { marker, html });
      } else {
        existing.marker.setLatLng([t.lat, t.lng]);
        if (existing.html !== html) {
          existing.marker.setIcon(L.divIcon({ html, className: "", iconSize: [34, 34], iconAnchor: [17, 17] }));
          existing.html = html;
        }
        existing.marker.setZIndexOffset(t.id === selectedId ? 1000 : t.state === "moving" ? 500 : 0);
      }
    }
    for (const [id, { marker }] of markers.current) {
      if (!seen.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }

    // GPS accuracy ring around the selected truck.
    accuracy.current?.remove();
    accuracy.current = null;
    const sel = trucks.find((t) => t.id === selectedId);
    if (sel?.accuracyM && sel.accuracyM > 15) {
      accuracy.current = L.circle([sel.lat, sel.lng], {
        radius: sel.accuracyM,
        className: "route-line",
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(m);
    }

    // First time we have positions: zoom to show them all.
    if (!fitted.current && trucks.length) {
      fitted.current = true;
      view.current?.fit(L.latLngBounds(trucks.map((t) => [t.lat, t.lng] as L.LatLngTuple)), 14);
    }
  }, [trucks, selectedId]);

  // Fly to the truck picked in the list.
  useEffect(() => {
    const m = map.current;
    const t = trucks.find((x) => x.id === selectedId);
    if (!m || !t) return;
    view.current?.release();
    m.flyTo([t.lat, t.lng], Math.max(m.getZoom(), 14), { duration: 0.6 });
    // Only when the selection changes, not on every position refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const showAll = () => {
    if (!trucks.length) return;
    view.current?.fit(L.latLngBounds(trucks.map((t) => [t.lat, t.lng] as L.LatLngTuple)), 14);
  };

  return (
    <div className={`map-shell ${className ?? ""}`}>
      <div ref={el} className="size-full" role="region" aria-label="Map of truck positions" />
      {trucks.length > 1 && (
        <button
          type="button"
          onClick={showAll}
          className="absolute top-3 right-3 z-[1001] rounded-lg border bg-card px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted"
        >
          Show all trucks
        </button>
      )}
    </div>
  );
}
