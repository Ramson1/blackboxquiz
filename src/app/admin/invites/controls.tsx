"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createSetupInviteAction,
  revokeSetupInviteAction,
} from "@/features/invites/actions";
import type { NewSetupInvite } from "@/services/invites/invite-service";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Absolute setup URL for a token (called from the client, so origin is known). */
export function setupInviteUrl(token: string): string {
  return `${window.location.origin}/setup/${token}`;
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

      <Dialog open={issued != null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Setup invite created
            </DialogTitle>
            <DialogDescription>
              Share both now — the password is shown only once and cannot be
              retrieved.
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="flex flex-col gap-3">
              <CopyField label="Setup link" value={setupInviteUrl(issued.token)} />
              <CopyField label="Password" value={issued.password} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RevokeInviteButton({
  inviteId,
  label,
}: {
  inviteId: string;
  label: string | null;
}) {
  const [pending, start] = useTransition();

  function revoke() {
    start(async () => {
      const res = await revokeSetupInviteAction({ inviteId });
      if (res.ok) toast.success(`Invite ${label ? `"${label}" ` : ""}revoked`);
      else toast.error(res.error);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={revoke}
    >
      Revoke
    </Button>
  );
}
