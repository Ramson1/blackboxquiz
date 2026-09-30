import type { Metadata } from "next";
import Link from "next/link";
import { listOrganizations } from "@/services/admin/admin-service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateOrgButton, OrgActionsMenu } from "@/app/admin/organizations/controls";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Organizations" };

const STATUS_VARIANT: Record<string, string> = {
  ACTIVE: "bg-emerald-500 text-white",
  SUSPENDED: "bg-amber-500 text-black",
  ARCHIVED: "bg-zinc-500 text-white",
};

export default async function OrganizationsPage() {
  const orgs = await listOrganizations();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">
            Schools, universities and event organizations using the platform.
          </p>
        </div>
        <CreateOrgButton />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No organizations yet. Create the first one.
                </TableCell>
              </TableRow>
            )}
            {orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {org.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                <TableCell>
                  <Badge className={STATUS_VARIANT[org.status]}>
                    {org.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(org.created_at), "d MMM yyyy")}
                </TableCell>
                <TableCell>
                  <OrgActionsMenu
                    id={org.id}
                    name={org.name}
                    status={org.status}
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
