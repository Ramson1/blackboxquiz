"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { publicStartAction } from "@/features/public/actions";
import { saveRunCredential } from "@/features/public/run-storage";
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
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Home screen entry point (plan §D): the compact gradient pill that opens the
 * title + password dialog. On success the bundle is handed to /run/[id]
 * through sessionStorage — no login, no extra routes.
 */
export function StartCompetitionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function startCompetition() {
    setError(null);
    if (!title.trim() || password.trim().length < 4) {
      setError("Enter the competition title and your password.");
      return;
    }
    start(async () => {
      const res = await publicStartAction({ title: title.trim(), password });
      if (res.ok) {
        saveRunCredential({ title: title.trim(), password, bundle: res.bundle });
        router.push(`/run/${res.bundle.bundle.competition.id}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="lg"
            className="group h-11 rounded-full bg-gradient-to-r from-primary via-sky-500 to-primary bg-[length:200%_100%] px-8 text-base font-bold uppercase tracking-wider shadow-lg shadow-primary/40 transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-primary/60"
          />
        }
      >
        <Play className="size-4 transition-transform duration-300 group-hover:scale-110" />
        Start Competition
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start your competition</DialogTitle>
          <DialogDescription>
            Enter the competition title and the password your administrator
            gave you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-title">Competition title</Label>
            <Input
              id="start-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Inter-House Quiz 2025"
              maxLength={200}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-password">Password</Label>
            <PasswordInput
              id="start-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              onKeyDown={(e) => e.key === "Enter" && startCompetition()}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={startCompetition}
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Checking…" : "Continue"}
          </Button>
        </DialogFooter>
        <p className="text-center text-xs text-muted-foreground">
          Setting up a new competition? Use the setup link your admin shared.
        </p>
      </DialogContent>
    </Dialog>
  );
}
