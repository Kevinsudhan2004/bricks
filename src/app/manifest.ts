import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brick CRM",
    short_name: "Brick CRM",
    description: "Inbound, production, dispatch, orders and customer accounts for the brick factory.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf8f5",
    theme_color: "#b4512d",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Record inbound load", short_name: "Inbound", url: "/inbound", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Record production", short_name: "Production", url: "/production", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Dispatch bricks", short_name: "Dispatch", url: "/dispatch", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
