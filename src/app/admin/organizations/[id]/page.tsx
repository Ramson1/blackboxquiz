import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser, effectiveRole } from "@/features/auth/session";
import {
  getOrganizationById,
  listOrganizationMembers,
  listUsers,
} from "@/services/admin/admin-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AddMemberDialog,
  MemberRoleSelect,
  RemoveMemberButton,
} from "@/app/admin/organizations/members-controls";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Organization members" };

const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "COMPETITION_ADMIN",
] as const;

const MEMBER_STATUS_VARIANT: Record<string, string> = {
  ACTIVE: "bg-emerald-500 text-white",
  INVITED: "bg-amber-500 text-black",
  DISABLED: "bg-zinc-500 text-white",
};

export default async function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Super admins and organization admins manage membership (RLS enforces).
  const user = await requireUser();
  const role = effectiveRole(user);
  if (!role || !MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]))
    notFound();

  const { id } = await params;
  const org = await getOrganizationById(id);
  if (!org) notFound();

  const [members, users] = await Promise.all([
    listOrganizationMembers(id),
    listUsers(),
  ]);
  const memberUserIds = new Set(members.map((m) => m.user_id));
  const candidates = users
    .filter((u) => !memberUserIds.has(u.id))
    .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href="/admin/organizations" />}
            aria-label="Back to organizations"
          >
            <ArrowLeft />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
            <p className="text-sm text-muted-foreground">
              Assign users to this organization and manage their roles.
            </p>
          </div>
        </div>
        <AddMemberDialog organizationId={org.id} candidates={candidates} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No members yet. Use &quot;Assign user&quot; to add people to
                  this organization.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  {m.profile?.full_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.profile?.email ?? "—"}
                </TableCell>
                <TableCell>
                  <MemberRoleSelect
                    organizationId={org.id}
                    memberId={m.id}
                    role={m.role}
                  />
                </TableCell>
                <TableCell>
                  <Badge className={MEMBER_STATUS_VARIANT[m.status]}>
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(m.created_at), "d MMM yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <RemoveMemberButton
                    organizationId={org.id}
                    memberId={m.id}
                    name={m.profile?.full_name || m.profile?.email || "member"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
