"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveTeamAction } from "@/features/teams/actions";
import type { Team } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TeamFormDialog({
  competitionId,
  team,
  open,
  onOpenChange,
}: {
  competitionId: string;
  team: Team | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "Add team"}</DialogTitle>
          <DialogDescription>
            A competition has exactly two teams.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <TeamForm
            key={team?.id ?? "new"}
            competitionId={competitionId}
            team={team}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamForm({
  competitionId,
  team,
  onDone,
}: {
  competitionId: string;
  team: Team | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: team?.name ?? "",
    shortName: team?.short_name ?? "",
    color: team?.color ?? "#2563EB",
    startingScore: String(team?.starting_score ?? 0),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await saveTeamAction({
        competitionId,
        teamId: team?.id,
        name: form.name,
        shortName: form.shortName,
        color: form.color,
        startingScore: form.startingScore,
      });
      if (res.ok) {
        toast.success(team ? "Team updated" : "Team added");
        onDone();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-name">Name</Label>
        <Input
          id="team-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Blue House"
          required
          maxLength={80}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-short">Short name</Label>
          <Input
            id="team-short"
            value={form.shortName}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
            placeholder="BLU"
            maxLength={12}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-score">Starting score</Label>
          <Input
            id="team-score"
            type="number"
            min={0}
            value={form.startingScore}
            onChange={(e) => setForm({ ...form, startingScore: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-color">Color</Label>
        <div className="flex items-center gap-2">
          <input
            id="team-color"
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="max-w-32 font-mono uppercase"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {team ? "Save changes" : "Add team"}
        </Button>
      </DialogFooter>
    </form>
  );
}
