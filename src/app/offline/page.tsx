import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "@/app/offline/retry-button";

export const metadata: Metadata = { title: "Offline" };

/**
 * Offline fallback screen (spec §30, §55). Served by the service worker when a
 * navigation can't reach the network. Already-cached competition packages keep
 * working from IndexedDB; this page is the graceful landing for everything else.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <WifiOff className="size-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        BLACKBOX QUIZ is offline-first — any competition you downloaded is still
        playable. This page needs a connection. Reconnect and try again.
      </p>
      <RetryButton />
      <p className="mt-6 text-xs text-muted-foreground">
        Designed &amp; Developed by BlackBox Tech
      </p>
    </div>
  );
}
