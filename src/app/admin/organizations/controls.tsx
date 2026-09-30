"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createOrganizationAction,
  deleteOrganizationAction,
  updateOrganizationAction,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OrgStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

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

export function OrgActionsMenu({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: OrgStatus;
}) {
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function setStatus(next: OrgStatus) {
    start(async () => {
      const res = await updateOrganizationAction({ id, status: next });
      if (res.ok) toast.success(`"${name}" is now ${next.toLowerCase()}`);
      else toast.error(res.error);
    });
  }

  function onDelete() {
    start(async () => {
      const res = await deleteOrganizationAction({ id });
      if (res.ok) {
        toast.success(`"${name}" deleted`);
        setDeleteOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={pending}
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditOrgDialog
        id={id}
        name={name}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the organization and cascades to every
              competition, team, question and result it contains. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                // Keep the dialog open while the transition runs; close on
                // success inside onDelete().
                e.preventDefault();
                onDelete();
              }}
            >
              Delete organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditOrgDialog({
  id,
  name,
  open,
  onOpenChange,
}: {
  id: string;
  name: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nextName = String(form.get("name") ?? "").trim();
    start(async () => {
      const res = await updateOrganizationAction({ id, name: nextName });
      if (res.ok) {
        toast.success("Organization updated");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit organization</DialogTitle>
          <DialogDescription>
            Renaming also updates the organization slug.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`org-edit-name-${id}`}>Name</Label>
            <Input
              id={`org-edit-name-${id}`}
              name="name"
              defaultValue={name}
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
