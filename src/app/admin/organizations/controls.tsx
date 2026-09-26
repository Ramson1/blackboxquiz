"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  createOrganizationAction,
  setOrganizationStatusAction,
} from "@/features/admin/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CreateOrgButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "");
    start(async () => {
      const res = await createOrganizationAction({ name });
      if (res.ok) {
        toast.success("Organization created");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New organization</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Schools, universities, churches and event organizations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              name="name"
              placeholder="Example Academy"
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrgStatusMenu({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}) {
  const [pending, start] = useTransition();

  function setStatus(next: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
    start(async () => {
      const res = await setOrganizationStatusAction({ id, status: next });
      if (res.ok) toast.success(`"${name}" is now ${next.toLowerCase()}`);
      else toast.error(res.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" disabled={pending} aria-label="Organization actions" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status !== "ACTIVE" && (
          <DropdownMenuItem onClick={() => setStatus("ACTIVE")}>
            Reactivate
          </DropdownMenuItem>
        )}
        {status === "ACTIVE" && (
          <DropdownMenuItem onClick={() => setStatus("SUSPENDED")}>
            Suspend
          </DropdownMenuItem>
        )}
        {status !== "ARCHIVED" && (
          <DropdownMenuItem onClick={() => setStatus("ARCHIVED")}>
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
