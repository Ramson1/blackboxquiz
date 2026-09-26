// One-off bootstrap: create/promote a BlackBox Quiz SUPER_ADMIN.
// Uses the Supabase service-role key from .env.local (server-side only).
// Usage: node scripts/create-admin.mjs <email> <password>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}

const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  "Content-Type": "application/json",
};

async function req(path, method, body, extraHeaders) {
  const res = await fetch(url + path, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

// 1) Find an existing auth user with this email.
const users = await req("/auth/v1/admin/users?page=1&per_page=1000", "GET");
const list = users?.users ?? [];
let user = list.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (user) {
  // 2a) Existing user: set the password, confirm email, attach admin metadata.
  user = await req(
    `/auth/v1/admin/users/${user.id}`,
    "PUT",
    { password, email_confirm: true, app_metadata: { role: "SUPER_ADMIN" } }
  );
  console.log(`Updated existing auth user ${email} (id=${user.id})`);
} else {
  // 2b) Create the auth user, email pre-confirmed.
  user = await req(
    "/auth/v1/admin/users",
    "POST",
    { email, password, email_confirm: true, app_metadata: { role: "SUPER_ADMIN" } }
  );
  console.log(`Created auth user ${email} (id=${user.id})`);
}

const id = user.id;

// 3) Upsert the profile as an ACTIVE SUPER_ADMIN. The signup trigger may not
//    have created a row for admin-created users, and never sets the global
//    role, so use a PostgREST merge-duplicates upsert keyed on the id PK.
await req(
  "/rest/v1/blackboxquiz_profiles",
  "POST",
  { id, email, full_name: "Super Admin", role: "SUPER_ADMIN", status: "ACTIVE" },
  { Prefer: "return=representation,resolution=merge-duplicates" }
);
console.log(`Profile ${id} upserted as SUPER_ADMIN / ACTIVE`);
console.log("DONE");
