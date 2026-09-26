"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (spec §55) once, on the client, in a
 * production build. Kept silent on failure so a missing/blocked SW never breaks
 * the app — offline packages already work via IndexedDB regardless.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        if (!cancelled && registration && "update" in registration) {
          // Check once shortly after load so fresh shells are picked up.
          setTimeout(() => void registration.update().catch(() => {}), 30_000);
        }
      } catch {
        /* ignore registration errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
