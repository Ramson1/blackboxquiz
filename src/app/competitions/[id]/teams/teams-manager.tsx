"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteTeamAction } from "@/features/teams/actions";
import type { PointValue, Team } from "@/types/database";
import { TeamFormDialog } from "@/app/competitions/[id]/teams/team-form-dialog";
import { PointValuesEditor } from "@/app/competitions/[id]/teams/point-values-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TeamsManager({
  competitionId,
  canManage,
  teams,
  pointValues,
}: {
  competitionId: string;
  canManage: boolean;
  teams: Team[];
  pointValues: PointValue[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(team: Team) {
    setEditing(team);
    setDialogOpen(true);
  }

  async function onDelete(team: Team) {
    if (!window.confirm(`Delete team "${team.name}"?`)) return;
    start(async () => {
      const res = await deleteTeamAction({ competitionId, teamId: team.id });
      if (res.ok) {
        toast.success("Team deleted");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            {teams.length}/2 teams configured.
          </p>
        </div>
        {canManage && teams.length < 2 && (
          <Button onClick={openAdd}>
            <Plus />
            Add {teams.length === 0 ? "first" : "second"} team
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {teams.length === 0 && (
          <Card className="sm:col-span-2">
            <CardContent className="py-10 text-center text-muted-foreground">
              No teams yet. Add Team A and Team B to continue setup.
            </CardContent>
          </Card>
        )}
        {teams.map((team) => (
          <Card key={team.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <span
                  className="size-4 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                {team.name}
                {team.short_name && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({team.short_name})
                  </span>
                )}
              </CardTitle>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit team"
                    onClick={() => openEdit(team)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete team"
                    disabled={pending}
                    onClick={() => onDelete(team)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Starting score</p>
                <p className="text-xl font-bold tabular-nums">
                  {team.starting_score.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current score</p>
                <p className="text-xl font-bold tabular-nums">
                  {team.current_score.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PointValuesEditor
        competitionId={competitionId}
        canManage={canManage}
        values={pointValues}
      />

      <TeamFormDialog
        competitionId={competitionId}
        team={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
