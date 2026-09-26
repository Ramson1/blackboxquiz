"use client";

import { Button } from "@/components/ui/button";

/** Client retry control for the offline fallback screen (spec §30, §55). */
export function RetryButton() {
  return <Button onClick={() => window.location.reload()}>Retry</Button>;
}
