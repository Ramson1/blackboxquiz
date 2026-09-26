"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Filter, RotateCcw } from "lucide-react";
import type { AuditLog } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AuditFilterValues {
  action: string;
  entityType: string;
  from: string;
  to: string;
}

const ENTITY_TYPES = [
  "competition",
  "question",
  "team",
  "profile",
  "organization",
  "device",
  "access_code",
];

/** Audit-log browser with server-backed filters (spec §57, §114). */
export function AuditLogViewer({
  logs,
  actions,
}: {
  logs: AuditLog[];
  actions: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<AuditFilterValues>({
    action: params.get("action") ?? "",
    entityType: params.get("entityType") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  });

  function apply() {
    const sp = new URLSearchParams();
    if (form.action) sp.set("action", form.action);
    if (form.entityType) sp.set("entityType", form.entityType);
    if (form.from) sp.set("from", form.from);
    if (form.to) sp.set("to", form.to);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  function reset() {
    setForm({ action: "", entityType: "", from: "", to: "" });
    router.push("?", { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-action">Action</Label>
            <select
              id="f-action"
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-entity">Entity</Label>
            <select
              id="f-entity"
              value={form.entityType}
              onChange={(e) => setForm({ ...form, entityType: e.target.value })}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring"
            >
              <option value="">All entities</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-from">From</Label>
            <Input
              id="f-from"
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-to">To</Label>
            <Input
              id="f-to"
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="w-40"
            />
          </div>
          <Button onClick={apply}>
            <Filter />
            Apply
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw />
            Reset
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {logs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit entries match these filters.
            </p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  {log.action}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(log.created_at), "d MMM yyyy, HH:mm:ss")}
                </span>
              </div>
              {log.entity_type && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.entity_type}
                  {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ""}
                </p>
              )}
              {log.reason && (
                <p className="mt-1 text-sm">Reason: {log.reason}</p>
              )}
              {(log.old_value || log.new_value) && (
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {JSON.stringify(
                    { old: log.old_value, new: log.new_value },
                    null,
                    0
                  )}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
