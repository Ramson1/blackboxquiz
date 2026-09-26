import type { Metadata } from "next";
import { BrandFooter, BrandMark } from "@/components/brand";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Access your competitions and dashboards.
          </p>
          <AuthForms params={params} />
        </div>
        <div className="mt-8">
          <BrandFooter />
        </div>
      </div>
    </main>
  );
}

async function AuthForms({
  params,
}: {
  params: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await params;
  return (
    <>
      {error === "unauthorized" && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          You do not have permission to access that area.
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}
