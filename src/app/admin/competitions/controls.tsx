"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCompetitionAction,
  setCompetitionStatusAction,
  updateCompetitionAction,
} from "@/features/competitions/actions";
import { nextStatuses, statusLabel } from "@/features/competitions/lifecycle";
import type { Competition } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Convert a stored ISO timestamp to the value format a datetime-local input expects. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function CompetitionActionsMenu({
  competition,
}: {
  competition: Competition;
}) {
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const transitions = nextStatuses(competition.status);

  function moveTo(next: Competition["status"]) {
    start(async () => {
      const res = await setCompetitionStatusAction({
        competitionId: competition.id,
        status: next,
      });
      if (res.ok) toast.success(`Moved to ${statusLabel(next)}`);
      else toast.error(res.error);
    });
  }

  function onDelete() {
    start(async () => {
      const res = await deleteCompetitionAction({
        competitionId: competition.id,
        organizationId: competition.organization_id,
      });
      if (res.ok) {
        toast.success(`"${competition.name}" deleted`);
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
              aria-label={`Actions for ${competition.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {transitions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => moveTo(s)}>
                  Move to {statusLabel(s)}
                </DropdownMenuItem>
              ))}
            </>
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

      <EditCompetitionDialog
        competition={competition}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{competition.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the competition and cascades to all its
              teams, questions, point values and results. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              Delete competition
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditCompetitionDialog({
  competition,
  open,
  onOpenChange,
}: {
  competition: Competition;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateCompetitionAction({
        competitionId: competition.id,
        organizationId: competition.organization_id,
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        scheduledAt: String(form.get("scheduledAt") ?? ""),
        defaultTimeLimit: String(form.get("defaultTimeLimit") ?? "30"),
      });
      if (res.ok) {
        toast.success("Competition updated");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit competition</DialogTitle>
          <DialogDescription>
            Update the details for &quot;{competition.name}&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`comp-edit-name-${competition.id}`}>Name</Label>
            <Input
              id={`comp-edit-name-${competition.id}`}
              name="name"
              defaultValue={competition.name}
              required
              minLength={3}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`comp-edit-desc-${competition.id}`}>
              Description (optional)
            </Label>
            <Textarea
              id={`comp-edit-desc-${competition.id}`}
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={competition.description ?? ""}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`comp-edit-scheduled-${competition.id}`}>
                Date &amp; time (optional)
              </Label>
              <Input
                id={`comp-edit-scheduled-${competition.id}`}
                name="scheduledAt"
                type="datetime-local"
                defaultValue={toDatetimeLocal(competition.scheduled_at)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`comp-edit-timer-${competition.id}`}>
                Default timer (seconds)
              </Label>
              <Input
                id={`comp-edit-timer-${competition.id}`}
                name="defaultTimeLimit"
                type="number"
                min={5}
                max={600}
                defaultValue={competition.default_time_limit}
                required
              />
            </div>
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
