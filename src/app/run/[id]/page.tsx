import type { Metadata } from "next";
import { PublicRunScreen } from "@/components/public/public-run";

export const metadata: Metadata = {
  title: "Competition board",
  description: "Live two-team quiz board.",
};

// The bundle lives in sessionStorage client-side; nothing to prerender.
export const dynamic = "force-dynamic";

/**
 * Public run route (plan §E). /run/* is outside PROTECTED_PREFIXES in
 * src/lib/supabase/middleware.ts, so it is already public — the client shell
 * enforces authorization via the stored title + password re-verification.
 */
export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicRunScreen id={id} />;
}
