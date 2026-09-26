"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCompetitionAction } from "@/features/competitions/actions";
import type { Organization } from "@/types/database";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateCompetitionDialog({
  organizations,
}: {
  organizations: Organization[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [orgId, setOrgId] = useState<string>("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = await createCompetitionAction({
        organizationId: orgId,
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        scheduledAt: String(form.get("scheduledAt") ?? ""),
        defaultTimeLimit: String(form.get("defaultTimeLimit") ?? "30"),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Competition created");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New competition</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create competition</DialogTitle>
          <DialogDescription>
            Sets up a new competition in DRAFT with default point values
            (100–1000) ready to configure.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Organization</Label>
            <Select
              value={orgId}
              onValueChange={(v) => setOrgId(v ?? "")}
              disabled={pending}
            >
              <SelectTrigger className="w-full" aria-label="Organization">
                <SelectValue placeholder="Select an organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comp-name">Name</Label>
            <Input
              id="comp-name"
              name="name"
              placeholder="Example Academic Challenge 2026"
              required
              minLength={3}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comp-desc">Description (optional)</Label>
            <Textarea id="comp-desc" name="description" rows={3} maxLength={2000} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-scheduled">Date &amp; time (optional)</Label>
              <Input id="comp-scheduled" name="scheduledAt" type="datetime-local" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-timer">Default timer (seconds)</Label>
              <Input
                id="comp-timer"
                name="defaultTimeLimit"
                type="number"
                min={5}
                max={600}
                defaultValue={30}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || !orgId}>
              Create competition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
