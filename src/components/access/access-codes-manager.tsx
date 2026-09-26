"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Ban, Check, Copy, KeyRound, Plus } from "lucide-react";
import {
  createAccessCodeAction,
  revokeAccessCodeAction,
  validateAccessCodeAction,
  type AccessActionResult,
} from "@/features/access/actions";
import type { CodeValidation } from "@/services/access/access-code-service";
import {
  ACCESS_PERMISSIONS,
  PERMISSION_LABELS,
  type AccessPermission,
} from "@/lib/permissions/roles";
import type { AccessCode } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Admin access-code control (spec §9, §99, §100). Managers issue scoped,
 * expiring, usage-limited codes; the plaintext is shown exactly once. Backend
 * RPCs make every authorization decision — this UI never grants anything itself.
 */
export function AccessCodesManager({
  competitionId,
  codes,
}: {
  competitionId: string;
  codes: AccessCode[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  function onCreated(res: AccessActionResult) {
    if (res.ok && res.code) {
      setCreateOpen(false);
      setIssued(res.code);
      router.refresh();
    }
  }

  function onRevoke(code: AccessCode) {
    if (!window.confirm(`Revoke access code ${code.code_prefix}…? It stops working immediately.`)) return;
    start(async () => {
      const res = await revokeAccessCodeAction({
        competitionId,
        codeId: code.id,
      });
      if (res.ok) {
        toast.success("Access code revoked");
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
          <h2 className="text-lg font-semibold">Access codes</h2>
          <p className="text-sm text-muted-foreground">
            Issue scoped codes for uploads, results and configuration. Codes are
            stored hashed and validated on the server.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New access code
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active codes ({codes.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {codes.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No access codes yet.
            </p>
          )}
          {codes.map((code) => (
            <div
              key={code.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {code.code_prefix}…
                  </span>
                  <StatusBadge status={code.status} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {code.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs">
                      {PERMISSION_LABELS[p as AccessPermission] ?? p}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Used {code.usage_count}
                  {code.max_uses != null ? `/${code.max_uses}` : ""}
                  {code.expires_at
                    ? ` · expires ${format(new Date(code.expires_at), "d MMM yyyy, HH:mm")}`
                    : " · no expiry"}
                </p>
              </div>
              {code.status === "ACTIVE" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onRevoke(code)}
                >
                  <Ban />
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <CreateCodeDialog
        competitionId={competitionId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onCreated}
      />

      <Dialog open={issued != null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" /> Access code created
            </DialogTitle>
            <DialogDescription>
              Copy this code now — it is shown only once and cannot be retrieved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wider">
              {issued}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy code"
              onClick={() => {
                if (issued) void navigator.clipboard.writeText(issued);
                toast.success("Code copied");
              }}
            >
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccessCodeEntry competitionId={competitionId} />
    </div>
  );
}

function CreateCodeDialog({
  competitionId,
  open,
  onOpenChange,
  onCreated,
}: {
  competitionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (res: AccessActionResult) => void;
}) {
  const [selected, setSelected] = useState<AccessPermission[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [pending, start] = useTransition();

  function toggle(p: AccessPermission) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.length === 0) {
      toast.error("Select at least one permission");
      return;
    }
    start(async () => {
      const res = await createAccessCodeAction({
        competitionId,
        permissions: selected,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxUses: maxUses ? Number(maxUses) : null,
      });
      if (res.ok) {
        toast.success("Access code issued");
        setSelected([]);
        setExpiresAt("");
        setMaxUses("");
      } else {
        toast.error(res.error);
      }
      onCreated(res);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New access code</DialogTitle>
          <DialogDescription>
            Choose the permissions this code grants and optional limits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            <div className="flex flex-col gap-2">
              {ACCESS_PERMISSIONS.map((p) => (
                <label
                  key={p}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(p)}
                    onCheckedChange={() => toggle(p)}
                  />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code-expiry">Expires at</Label>
              <Input
                id="code-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code-uses">Max uses</Label>
              <Input
                id="code-uses"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              <KeyRound />
              Generate code
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** §99 — code entry + §100 server validation, demonstrating the granted scope. */
function AccessCodeEntry({ competitionId }: { competitionId: string }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CodeValidation | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    start(async () => {
      const res = await validateAccessCodeAction({ competitionId, code });
      setResult(res);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test an access code</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="entry-code">Competition Access</Label>
            <Input
              id="entry-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BX-XXXX-XXXX"
              className="font-mono uppercase"
            />
          </div>
          <Button type="submit" disabled={pending || !code.trim()}>
            Continue
          </Button>
        </form>

        {result &&
          (result.valid ? (
            <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" /> Access Granted
              </p>
              <div className="flex flex-wrap gap-1">
                {(result.permissions ?? []).map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs">
                    ✓ {PERMISSION_LABELS[p as AccessPermission] ?? p}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm font-medium text-red-600 dark:text-red-400">
              Access denied{result.reason ? ` — ${result.reason}` : ""}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AccessCode["status"] }) {
  const map: Record<AccessCode["status"], string> = {
    ACTIVE: "bg-emerald-500 text-white",
    EXHAUSTED: "bg-amber-500 text-white",
    EXPIRED: "bg-muted text-muted-foreground",
    REVOKED: "bg-red-600 text-white",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}
