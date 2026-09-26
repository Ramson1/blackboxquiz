import type { Metadata } from "next";
import { listUsers } from "@/services/admin/admin-service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserRoleSelect, UserStatusButton } from "@/app/admin/users/controls";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          All accounts on the platform. Roles are enforced server-side.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No user accounts yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.full_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email}
                </TableCell>
                <TableCell>
                  <UserRoleSelect userId={u.id} role={u.role} />
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      u.status === "ACTIVE"
                        ? "bg-emerald-500 text-white"
                        : "bg-destructive text-white"
                    }
                  >
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <UserStatusButton
                    userId={u.id}
                    status={u.status}
                    email={u.email}
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
