import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js request proxy (the v16 replacement for the deprecated `middleware`
 * convention). Refreshes the Supabase session cookie and gates unauthenticated
 * traffic to /login on every request except static assets.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline|icon.png|icon-512.png|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
