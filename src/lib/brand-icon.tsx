import { ImageResponse } from "next/og";

/** App icon: a terracotta tile with a small brick-wall pattern. Rendered to PNG at build time. */
export function brandIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.16;
  const inner = size - pad * 2;
  const rowH = inner / 4;
  const gap = Math.max(2, size * 0.02);
  const rows = [0, 1, 2, 3];
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#b4512d",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: inner, height: inner }}>
          {rows.map((r) => (
            <div key={r} style={{ display: "flex", height: rowH, paddingBottom: gap, gap }}>
              {(r % 2 === 0 ? [1, 1] : [0.5, 1, 0.5]).map((w, i) => (
                <div key={i} style={{ flex: w, background: "#fff7f0", borderRadius: size * 0.02 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
