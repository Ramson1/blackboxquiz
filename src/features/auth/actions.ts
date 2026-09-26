"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveRole, getSessionUser } from "@/features/auth/session";
import { z } from "zod";

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const resetSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  confirm: z.string(),
});

export type ActionResult =
  | { ok: true; next?: string }
  | { ok: false; error: string };

/** Where a signed-in user should land, by effective role (spec §76/§77). */
async function homeForUser(): Promise<string> {
  const user = await getSessionUser();
  if (!user) return "/login";
  const role = effectiveRole(user);
  if (role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "COMPETITION_OPERATOR") return "/operator";
  return "/competitions";
}

export async function signInAction(
  _prev: ActionResult | null,
  input: { email: string; password: string }
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, error: "Email not confirmed. Check your inbox." };
    }
    return { ok: false, error: "Invalid email or password." };
  }

  redirect(await homeForUser());
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(input: {
  email: string;
}): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/reset-password` }
  );
  if (error) return { ok: false, error: "Could not send reset email. Try again." };
  // Always report success to avoid account enumeration.
  return { ok: true };
}

export async function updatePasswordAction(input: {
  password: string;
  confirm: string;
}): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { ok: false, error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Reset link is invalid or has expired." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: "Could not update password. Try again." };
  }
  redirect(await homeForUser());
}
