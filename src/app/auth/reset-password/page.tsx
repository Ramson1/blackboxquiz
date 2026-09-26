import type { Metadata } from "next";
import { BrandFooter, BrandMark } from "@/components/brand";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Set a new password</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Choose a strong password for your account.
          </p>
          <ResetPasswordForm />
        </div>
        <div className="mt-8">
          <BrandFooter />
        </div>
      </div>
    </main>
  );
}
