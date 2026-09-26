"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deletePointValueAction,
  savePointValueAction,
} from "@/features/teams/actions";
import type { PointValue } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PointValuesEditor({
  competitionId,
  canManage,
  values,
}: {
  competitionId: string;
  canManage: boolean;
  values: PointValue[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PointValue | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(pv: PointValue) {
    setEditing(pv);
    setDialogOpen(true);
  }

  async function onDelete(pv: PointValue) {
    if (!window.confirm(`Remove the ${pv.points} point value?`)) return;
    start(async () => {
      const res = await deletePointValueAction({
        competitionId,
        id: pv.id,
      });
      if (res.ok) {
        toast.success("Point value removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Point values</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure the point tiers and their colors. Values are shown
            numerically as well as by color.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openAdd} disabled={pending}>
            <Plus />
            Add value
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {values.length === 0 && (
          <p className="text-sm text-muted-foreground">No point values yet.</p>
        )}
        {values.map((pv) => (
          <div
            key={pv.id}
            className="flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm font-bold text-white"
            style={{ backgroundColor: pv.color }}
          >
            {pv.points.toLocaleString()}
            {canManage && (
              <>
                <button
                  type="button"
                  aria-label="Edit"
                  onClick={() => openEdit(pv)}
                  className="rounded-full p-1 hover:bg-black/20"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => onDelete(pv)}
                  className="rounded-full p-1 hover:bg-black/20"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </CardContent>

      <PointValueDialog
        competitionId={competitionId}
        value={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  );
}

function PointValueDialog({
  competitionId,
  value,
  open,
  onOpenChange,
}: {
  competitionId: string;
  value: PointValue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await savePointValueAction({
        competitionId,
        id: value?.id,
        points: String(form.get("points") ?? ""),
        color: String(form.get("color") ?? "#2563EB"),
      });
      if (res.ok) {
        toast.success(value ? "Point value updated" : "Point value added");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{value ? "Edit point value" : "Add point value"}</DialogTitle>
          <DialogDescription>
            e.g. 100 → green, 1000 → red. Pick an accessible color.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pv-points">Points</Label>
            <Input
              id="pv-points"
              name="points"
              type="number"
              min={1}
              defaultValue={value?.points ?? 100}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pv-color">Color</Label>
            <input
              id="pv-color"
              name="color"
              type="color"
              defaultValue={value?.color ?? "#2563EB"}
              className="size-10 cursor-pointer rounded-md border bg-transparent p-1"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {value ? "Save changes" : "Add value"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
