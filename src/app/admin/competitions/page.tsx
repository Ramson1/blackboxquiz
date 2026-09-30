import type { Metadata } from "next";
import Link from "next/link";
import {
  getLockedCompetitionIds,
  listAllCompetitionsForAdmin,
  listManagedOrganizations,
} from "@/services/competitions/competition-service";
import { CreateCompetitionDialog } from "@/app/competitions/create-dialog";
import { CompetitionActionsMenu } from "@/app/admin/competitions/controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/features/competitions/lifecycle";
import { format } from "date-fns";

export const metadata: Metadata = { title: "All Competitions" };

export default async function AdminCompetitionsPage() {
  const [competitions, lockedIds, organizations] = await Promise.all([
    listAllCompetitionsForAdmin(),
    getLockedCompetitionIds(),
    listManagedOrganizations(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Competitions</h1>
          <p className="text-sm text-muted-foreground">
            Every competition across all organizations.
          </p>
        </div>
        <CreateCompetitionDialog organizations={organizations} />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No competitions yet.
                </TableCell>
              </TableRow>
            )}
            {competitions.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/competitions/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.organization?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      className={
                        c.status === "LIVE" ? "bg-emerald-500 text-white" : undefined
                      }
                    >
                      {statusLabel(c.status)}
                    </Badge>
                    {lockedIds.has(c.id) && (
                      <Badge className="bg-red-600 text-white">LOCKED</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.scheduled_at
                    ? format(new Date(c.scheduled_at), "d MMM yyyy, HH:mm")
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(c.created_at), "d MMM yyyy")}
                </TableCell>
                <TableCell>
                  <CompetitionActionsMenu competition={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
