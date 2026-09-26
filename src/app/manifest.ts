import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (spec §55, §30 offline-first). Served at
 * /manifest.webmanifest, referenced from the root layout metadata. Declares the
 * app installable and standalone so competitions can run fully offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BLACKBOX QUIZ",
    short_name: "BB Quiz",
    description:
      "Offline-first two-team academic competition platform. A BlackBox Tech Product.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
