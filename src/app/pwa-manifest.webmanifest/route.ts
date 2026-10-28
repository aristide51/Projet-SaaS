import type { MetadataRoute } from "next";

const manifest: MetadataRoute.Manifest = {
  id: "/dashboard",
  name: "Boutiques locales",
  short_name: "Boutiques",
  description:
    "Gère ta boutique, ton catalogue et tes commandes au Burkina Faso.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#f5f7f1",
  theme_color: "#155d42",
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
