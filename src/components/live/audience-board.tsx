"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-validates the server-rendered board on an interval so a passive display
 * (audience screen / admin live monitor) tracks the competition. The competition
 * itself never depends on this — it is read-only (§63).
 */
export function AudienceBoard({
  refreshMs = 3000,
  children,
}: {
  refreshMs?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), refreshMs);
    return () => clearInterval(id);
  }, [router, refreshMs]);
  return <>{children}</>;
}
