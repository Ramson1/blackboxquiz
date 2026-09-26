import { redirect } from "next/navigation";
import { effectiveRole, getSessionUser } from "@/features/auth/session";

/** Role-based landing route; middleware guarantees authentication here. */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const role = effectiveRole(user);
  if (role === "SUPER_ADMIN") redirect("/admin/dashboard");
  if (role === "COMPETITION_OPERATOR") redirect("/operator");
  redirect("/competitions");
}
