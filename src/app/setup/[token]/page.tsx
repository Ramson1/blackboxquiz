import type { Metadata } from "next";
import { PublicSetupWizard } from "./setup-wizard";

export const metadata: Metadata = {
  title: "Competition setup",
  description: "Set up your two-team competition — no account needed.",
};

/**
 * Public setup wizard entry (migration 0012). Intentionally performs no DB
 * reads: anon cannot query anything directly — the token is resolved only
 * through the password-verifying SECURITY DEFINER RPCs inside the wizard.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicSetupWizard token={token} />;
}
