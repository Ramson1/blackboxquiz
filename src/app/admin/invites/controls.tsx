"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Check,
  Copy,
  Link2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSetupInviteAction,
  deleteSetupInviteAction,
  editSetupInviteAction,
  reactivateSetupInviteAction,
  revokeSetupInviteAction,
} from "@/features/invites/actions";
import {
  type NewSetupInvite,
} from "@/services/invites/invite-service";
import type { SetupInvite } from "@/types/database";
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
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Absolute setup URL for a token (called from the client, so origin is known). */
export function setupInviteUrl(token: string): string {
  return `${window.location.origin}/setup/${token}`;
}

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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success(`${label} copied`);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(setupInviteUrl(token));
        setCopied(true);
        toast.success("Setup link copied");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Link2 />}
      <span className="font-mono text-xs">{token.slice(0, 8)}…</span>
    </Button>
  );
}

/** Reveal-once card shown after creating or resetting an invite's password. */
function RevealInviteDialog({
  data,
  onClose,
}: {
  data: { token: string; password: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={data != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Password ready
          </DialogTitle>
          <DialogDescription>
            Share both now — this password is shown only once and cannot be
            retrieved later.
          </DialogDescription>
        </DialogHeader>
        {data && (
          <div className="flex flex-col gap-3">
            <CopyField label="Setup link" value={setupInviteUrl(data.token)} />
            <CopyField label="Password" value={data.password} />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateInviteDialog({
  organizations,
}: {
  organizations: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<NewSetupInvite | null>(null);

  function create() {
    if (!orgId || password.trim().length < 4) {
      toast.error("Pick an organization and a password (at least 4 characters).");
      return;
    }
    start(async () => {
      const res = await createSetupInviteAction({
        organizationId: orgId,
        password: password.trim(),
        label: label.trim() || null,
      });
      if (res.ok && res.invite) {
        setIssued(res.invite);
        setOpen(false);
        setOrgId("");
        setPassword("");
        setLabel("");
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button>New setup invite</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create setup invite</DialogTitle>
            <DialogDescription>
              The school opens the link, enters this password, and configures
              their competition — no account needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
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
              <Label htmlFor="invite-password">Password</Label>
              <PasswordInput
                id="invite-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Shared with the school host"
                minLength={4}
                maxLength={72}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-label">Label (optional)</Label>
              <Input
                id="invite-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Inter-house quiz, May edition"
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={pending || !orgId}>
              Create invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RevealInviteDialog
        data={
          issued
            ? { token: issued.token, password: issued.password }
            : null
        }
        onClose={() => setIssued(null)}
      />
    </>
  );
}

function EditInviteDialog({
  invite,
  open,
  onOpenChange,
  onReveal,
}: {
  invite: SetupInvite;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReveal: (password: string) => void;
}) {
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "").trim();
    if (password && password.length < 4) {
      toast.error("A new password must be at least 4 characters.");
      return;
    }
    start(async () => {
      const res = await editSetupInviteAction({
        inviteId: invite.id,
        label: String(form.get("label") ?? ""),
        expiresAt: String(form.get("expiresAt") ?? ""),
        password: password || undefined,
      });
      if (res.ok) {
        onOpenChange(false);
        if (res.rotated && res.password) {
          onReveal(res.password);
          toast.success("Password reset");
        } else {
          toast.success("Invite updated");
        }
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit setup invite</DialogTitle>
          <DialogDescription>
            Update this link&apos;s label and expiry, or set a new password for
            it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`invite-edit-label-${invite.id}`}>Label</Label>
            <Input
              id={`invite-edit-label-${invite.id}`}
              name="label"
              defaultValue={invite.label ?? ""}
              placeholder="Inter-house quiz, May edition"
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`invite-edit-expiry-${invite.id}`}>
              Expires (optional)
            </Label>
            <Input
              id={`invite-edit-expiry-${invite.id}`}
              name="expiresAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(invite.expires_at)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank so the link never expires.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`invite-edit-password-${invite.id}`}>
              Set new password (optional)
            </Label>
            <PasswordInput
              id={`invite-edit-password-${invite.id}`}
              name="password"
              placeholder="Leave blank to keep the current password"
              minLength={4}
              maxLength={72}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Existing passwords are stored hashed and can&apos;t be read back —
              set a new one to copy it.
            </p>
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

export function InviteActionsMenu({ invite }: { invite: SetupInvite }) {
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  function runRevoke() {
    start(async () => {
      const res = await revokeSetupInviteAction({ inviteId: invite.id });
      if (res.ok) toast.success("Invite revoked");
      else toast.error(res.error);
    });
  }

  function runReactivate() {
    start(async () => {
      const res = await reactivateSetupInviteAction({ inviteId: invite.id });
      if (res.ok) toast.success("Invite reactivated");
      else toast.error(res.error);
    });
  }

  function runDelete() {
    start(async () => {
      const res = await deleteSetupInviteAction({ inviteId: invite.id });
      if (res.ok) {
        toast.success("Invite deleted");
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
              aria-label={`Actions for invite ${invite.label || invite.token.slice(0, 8)}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(setupInviteUrl(invite.token));
              toast.success("Setup link copied");
            }}
          >
            <Copy /> Copy link
          </DropdownMenuItem>

          {invite.status === "ACTIVE" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={runRevoke}>
                <Ban /> Revoke
              </DropdownMenuItem>
            </>
          )}
          {invite.status === "USED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={runRevoke}>
                <Ban /> Revoke access
              </DropdownMenuItem>
            </>
          )}
          {invite.status === "REVOKED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={runReactivate}>
                <RotateCcw /> Undo revoke
              </DropdownMenuItem>
            </>
          )}

          {invite.status !== "USED" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditInviteDialog
        invite={invite}
        open={editOpen}
        onOpenChange={setEditOpen}
        onReveal={(password) => setReveal(password)}
      />

      <RevealInviteDialog
        data={reveal ? { token: invite.token, password: reveal } : null}
        onClose={() => setReveal(null)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {invite.label ? `"${invite.label}"` : "this invite"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the setup link permanently. Anyone trying to open it
              will get an invalid-link error. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                runDelete();
              }}
            >
              Delete invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
