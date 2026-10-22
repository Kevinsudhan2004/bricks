import L from "leaflet";

/*
 * Shared Leaflet setup. Street tiles come from OpenStreetMap by default; set
 * NEXT_PUBLIC_MAP_TILE_URL (+ NEXT_PUBLIC_MAP_ATTRIBUTION) to use a paid tile
 * provider if the owner's map gets heavy use.
 */
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Centre of India, used only until the first truck reports in. */
export const INDIA: L.LatLngTuple = [22.5, 79];

/**
 * A map whose mouse-wheel zoom only switches on after the map is clicked, so scrolling
 * the page past it doesn't suddenly zoom the map out.
 */
export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true, scrollWheelZoom: false }).setView(INDIA, 5);
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  map.on("click focus", () => map.scrollWheelZoom.enable());
  el.addEventListener("mouseleave", () => map.scrollWheelZoom.disable());
  return map;
}

/**
 * Keeps the map sized to its box (sidebar collapse, phone rotation) and, until the
 * user pans or zooms, keeps the automatic view (`fit`) framed after every resize.
 */
export function mapView(el: HTMLElement, map: L.Map) {
  let auto: { bounds: L.LatLngBounds; maxZoom: number } | null = null;
  let touched = false;
  const touch = () => {
    touched = true;
  };
  // Page scrolling over the map isn't a zoom unless wheel-zoom was switched on by a click.
  const wheel = () => {
    if (map.scrollWheelZoom.enabled()) touched = true;
  };
  el.addEventListener("pointerdown", touch);
  el.addEventListener("wheel", wheel, { passive: true });
  const ro = new ResizeObserver(() => {
    map.invalidateSize({ debounceMoveend: true });
    if (auto && !touched) map.fitBounds(auto.bounds, { padding: [40, 40], maxZoom: auto.maxZoom, animate: false });
  });
  ro.observe(el);
  return {
    fit(bounds: L.LatLngBounds, maxZoom = 15) {
      auto = { bounds, maxZoom };
      map.fitBounds(bounds, { padding: [40, 40], maxZoom, animate: false });
    },
    /** Stop auto-framing (e.g. the owner picked a truck to follow). */
    release: touch,
    stop() {
      ro.disconnect();
      el.removeEventListener("pointerdown", touch);
      el.removeEventListener("wheel", wheel);
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/* Small inline icons (lucide paths) so markers don't need React. */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICON = {
  arrow: svg('<polygon points="12 2 19 21 12 17 5 21 12 2" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  signal: svg('<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><line x1="2" x2="22" y1="2" y2="22"/>'),
  truck: svg(
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  ),
};
