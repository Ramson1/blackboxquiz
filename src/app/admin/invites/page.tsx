import type { Metadata } from "next";
import { listOrganizations } from "@/services/admin/admin-service";
import { listSetupInvites } from "@/services/invites/invite-service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateInviteDialog, RevokeInviteButton, CopyLinkButton } from "./controls";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Setup Invites" };

const STATUS_VARIANT: Record<string, string> = {
  ACTIVE: "bg-emerald-500 text-white",
  USED: "bg-sky-500 text-white",
  REVOKED: "bg-zinc-500 text-white",
};

export default async function SetupInvitesPage() {
  const [invites, orgs] = await Promise.all([
    listSetupInvites(),
    listOrganizations(),
  ]);
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Setup Invites</h1>
          <p className="text-sm text-muted-foreground">
            Share a setup link and password so a school can configure their
            competition without an account.
          </p>
        </div>
        <CreateInviteDialog organizations={orgs.map((o) => ({ id: o.id, name: o.name }))} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No setup invites yet. Create one and share the link with a school.
                </TableCell>
              </TableRow>
            )}
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">
                  {invite.label || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {orgNames.get(invite.organization_id) ?? invite.organization_id}
                </TableCell>
                <TableCell>
                  <CopyLinkButton token={invite.token} />
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_VARIANT[invite.status]}>
                    {invite.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {invite.expires_at
                    ? format(new Date(invite.expires_at), "d MMM yyyy")
                    : "Never"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(invite.created_at), "d MMM yyyy")}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {invite.status === "ACTIVE" && (
                      <RevokeInviteButton inviteId={invite.id} label={invite.label} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
