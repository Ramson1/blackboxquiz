"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await requestPasswordResetAction(values);
    setPending(false);
    if (!result.ok) {
      setError("root", { message: result.error });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="h-10 w-10 text-primary" />
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, a password reset link has been
          sent. Check your inbox.
        </p>
        <Button variant="link" className="p-0" render={<Link href="/login" />}>
          Back to login
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          disabled={pending}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Send reset link
      </Button>

      <Button variant="link" className="p-0" render={<Link href="/login" />}>
        Back to login
      </Button>
    </form>
  );
}
