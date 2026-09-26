"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  changeUserRoleAction,
  setUserStatusAction,
} from "@/features/admin/actions";
import { APP_ROLES, type AppRole } from "@/lib/permissions/roles";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UserRoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: AppRole;
}) {
  const [pending, start] = useTransition();

  function onChange(next: string | null) {
    if (!next) return;
    start(async () => {
      const res = await changeUserRoleAction({
        userId,
        role: next as AppRole,
      });
      if (res.ok) toast.success("Role updated");
      else toast.error(res.error);
    });
  }

  return (
    <Select value={role} onValueChange={onChange} disabled={pending}>
      <SelectTrigger size="sm" className="w-48" aria-label="User role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {APP_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UserStatusButton({
  userId,
  status,
  email,
}: {
  userId: string;
  status: "ACTIVE" | "DISABLED";
  email: string | null;
}) {
  const [pending, start] = useTransition();

  function toggle() {
    const next = status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    start(async () => {
      const res = await setUserStatusAction({ userId, status: next });
      if (res.ok)
        toast.success(
          next === "DISABLED"
            ? `${email ?? "User"} disabled`
            : `${email ?? "User"} re-enabled`
        );
      else toast.error(res.error);
    });
  }

  return (
    <Button
      variant={status === "ACTIVE" ? "destructive" : "outline"}
      size="sm"
      disabled={pending}
      onClick={toggle}
    >
      {status === "ACTIVE" ? "Disable" : "Enable"}
    </Button>
  );
}
