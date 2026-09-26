"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Radio, RadioTower, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MonitorEvent } from "@/services/live/live-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Administrative realtime monitor (spec §28, §797). Live Tail of committed
 * competition events via Supabase Realtime, seeded server-side so it is useful
 * immediately and degrades to "paused" if the socket drops. The scoreboard never
 * depends on this — it is observation only, for admins.
 */
type ConnState = "connecting" | "live" | "closed" | "error";

const MAX_ROWS = 100;

export function RealtimeMonitor({
  competitionId,
  seedEvents,
}: {
  competitionId: string;
  seedEvents: MonitorEvent[];
}) {
  const [events, setEvents] = useState<MonitorEvent[]>(seedEvents);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [received, setReceived] = useState(0);
  const seenIds = useRef<Set<string>>(new Set(seedEvents.map((e) => e.id)));

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel(`bbq-monitor-${competitionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "blackboxquiz_competition_events",
          filter: `competition_id=eq.${competitionId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as MonitorEvent;
          if (!row?.id || seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setEvents((prev) => [...prev, row].slice(-MAX_ROWS));
          setReceived((n) => n + 1);
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setConn("live");
        else if (status === "CLOSED") setConn("closed");
        else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR")
          setConn("error");
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [competitionId]);

  const latest = [...events].slice().reverse();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5" /> Live event stream
        </CardTitle>
        <ConnBadge conn={conn} received={received} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Observation only — the scoreboard is driven by local engine state, not
          this connection.
        </p>
        {latest.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No events yet. New competition actions will appear here live.
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
            {latest.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnBadge({ conn, received }: { conn: ConnState; received: number }) {
  const map: Record<ConnState, { label: string; cls: string; Icon: typeof Radio }> = {
    connecting: { label: "Connecting", cls: "bg-amber-500 text-white", Icon: Radio },
    live: { label: "Live", cls: "bg-emerald-500 text-white", Icon: RadioTower },
    closed: { label: "Closed", cls: "bg-muted text-muted-foreground", Icon: ShieldOff },
    error: { label: "Reconnecting", cls: "bg-red-600 text-white", Icon: ShieldOff },
  };
  const { label, cls, Icon } = map[conn];
  return (
    <div className="flex items-center gap-2">
      {received > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">
          +{received} live
        </span>
      )}
      <Badge className={cls} variant="secondary">
        <Icon className="size-3" /> {label}
      </Badge>
    </div>
  );
}

function EventRow({ event }: { event: MonitorEvent }) {
  const time = new Date(event.created_at).toLocaleTimeString();
  const summary = summarize(event);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          #{event.sequence_number}
        </span>
        <span className="truncate font-medium">{event.event_type}</span>
        {summary && (
          <span className="truncate text-muted-foreground">{summary}</span>
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {time}
      </span>
    </div>
  );
}

function summarize(event: MonitorEvent): string {
  const p = event.payload ?? {};
  const parts: string[] = [];
  if (typeof p.teamId === "string") parts.push("team");
  if (typeof p.result === "string") parts.push(String(p.result));
  if (typeof p.points === "number") parts.push(`${p.points} pts`);
  if (typeof p.adjustment === "number") parts.push(`Δ${p.adjustment}`);
  return parts.join(" · ");
}
