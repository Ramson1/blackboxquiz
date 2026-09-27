"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  addOrganizationMemberAction,
  removeOrganizationMemberAction,
  updateMemberRoleAction,
} from "@/features/admin/actions";
import { ORG_MEMBER_ROLES, type OrgMemberRole } from "@/lib/permissions/roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MemberCandidate = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/** Assign a user to the organization with a chosen role. */
export function AddMemberDialog({
  organizationId,
  candidates,
}: {
  organizationId: string;
  candidates: MemberCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState<string>("");
  const [role, setRole] = useState<OrgMemberRole>("COMPETITION_ADMIN");

  function add() {
    if (!userId) return;
    start(async () => {
      const res = await addOrganizationMemberAction({
        organizationId,
        userId,
        role,
      });
      if (res.ok) {
        toast.success("Member assigned");
        setOpen(false);
        setUserId("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Assign user</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign user to organization</DialogTitle>
          <DialogDescription>
            The user gains the selected role for this organization and its
            competitions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>User</Label>
            <Select
              value={userId}
              onValueChange={(v) => setUserId(v ?? "")}
              disabled={pending}
            >
              <SelectTrigger className="w-full" aria-label="User">
                <SelectValue
                  placeholder={
                    candidates.length === 0
                      ? "All users are already members"
                      : "Select a user"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email || u.id}
                    {u.full_name && u.email ? ` — ${u.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole((v ?? "VIEWER") as OrgMemberRole)}
              disabled={pending}
            >
              <SelectTrigger className="w-full" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_MEMBER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={add} disabled={pending || !userId}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline role editor for an existing member row. */
export function MemberRoleSelect({
  organizationId,
  memberId,
  role,
}: {
  organizationId: string;
  memberId: string;
  role: OrgMemberRole;
}) {
  const [pending, start] = useTransition();

  function onChange(next: string | null) {
    if (!next) return;
    start(async () => {
      const res = await updateMemberRoleAction({
        organizationId,
        memberId,
        role: next as OrgMemberRole,
      });
      if (res.ok) toast.success("Member role updated");
      else toast.error(res.error);
    });
  }

  return (
    <Select value={role} onValueChange={onChange} disabled={pending}>
      <SelectTrigger size="sm" className="w-48" aria-label="Member role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORG_MEMBER_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveMemberButton({
  organizationId,
  memberId,
  name,
}: {
  organizationId: string;
  memberId: string;
  name: string;
}) {
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(`Remove ${name} from this organization?`)) return;
    start(async () => {
      const res = await removeOrganizationMemberAction({
        organizationId,
        memberId,
      });
      if (res.ok) toast.success("Member removed");
      else toast.error(res.error);
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={remove}
      aria-label={`Remove ${name}`}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 />
    </Button>
  );
}
