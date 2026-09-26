import type { Metadata } from "next";
import { BrandFooter, BrandMark } from "@/components/brand";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Reset password</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <ForgotPasswordForm />
        </div>
        <div className="mt-8">
          <BrandFooter />
        </div>
      </div>
    </main>
  );
}
