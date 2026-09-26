import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }
  return { url, anonKey };
}

/**
 * Standard server client bound to the request cookies (RLS enforced).
 *
 * SECURITY (spec §89): there is intentionally NO service-role client anywhere
 * in the app. Every privileged write goes through a SECURITY DEFINER Postgres
 * RPC using the user-scoped client below, so RLS stays authoritative and the
 * service-role key never appears in any bundle. If a future operation truly
 * needs the service role, keep it in a server-only module outside this file.
 */
export async function createClient() {
  const { url, anonKey } = env();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component: safe to ignore when middleware
          // is refreshing sessions.
        }
      },
    },
  });
}
