"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updatePasswordAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Reached via the reset link (redirectTo=/auth/reset-password).
 * Supabase establishes a recovery session; we then set the new password.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setReady(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await updatePasswordAction(values);
    setPending(false);
    if (!result.ok) {
      setError("root", { message: result.error });
      return;
    }
    router.refresh();
  }

  if (ready === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing secure reset…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-destructive">
          This reset link is invalid or has expired. Request a new one.
        </p>
        <Button
          variant="link"
          className="p-0"
          render={<a href="/login/forgot-password" />}
        >
          Request new link
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={pending}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          disabled={pending}
          {...register("confirm")}
        />
        {errors.confirm && (
          <p className="text-xs text-destructive">{errors.confirm.message}</p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Update password
      </Button>
    </form>
  );
}
