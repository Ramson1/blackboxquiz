import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * PWA web app manifest (spec §55, §30 offline-first). Served at
 * /manifest.webmanifest, referenced from the root layout metadata. Declares the
 * app installable and standalone so competitions can run fully offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BLACKBOX QUIZ",
    short_name: "BB Quiz",
    description: `${BRAND.tagline}. Offline-first two-team academic competition platform — ${BRAND.websiteLabel}, ${BRAND.email}`,
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
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
