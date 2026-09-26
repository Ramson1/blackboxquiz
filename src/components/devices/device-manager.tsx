"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Ban, ShieldCheck } from "lucide-react";
import { setDeviceStatusAction } from "@/features/devices/actions";
import type { CompetitionDevice } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Device authorization screen (spec §44). Operators' consoles appear here once
 * they open the offline competition; managers authorize or revoke them. A
 * revoked device is blocked server-side from running the competition.
 */
export function DeviceManager({
  competitionId,
  devices,
  currentDeviceId,
}: {
  competitionId: string;
  devices: CompetitionDevice[];
  currentDeviceId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setStatus(device: CompetitionDevice, status: CompetitionDevice["status"]) {
    const label =
      status === "AUTHORIZED"
        ? "Authorize"
        : status === "REVOKED"
          ? "Revoke"
          : "Reset to pending";
    if (status === "REVOKED" && !window.confirm(`Revoke "${device.device_name ?? device.device_identifier}"? It will be blocked from running this competition.`))
      return;
    start(async () => {
      const res = await setDeviceStatusAction({
        competitionId,
        deviceId: device.id,
        status,
      });
      if (res.ok) {
        toast.success(`${label} — done`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized devices ({devices.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {devices.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No devices registered yet. Open the offline console on a device to
            register it here.
          </p>
        )}
        {devices.map((device) => (
          <div
            key={device.id}
            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {device.device_name || "Unnamed device"}
                </span>
                {currentDeviceId === device.device_identifier && (
                  <Badge variant="secondary" className="text-xs">
                    This device
                  </Badge>
                )}
                <DeviceStatusBadge status={device.status} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {device.device_identifier}
              </p>
              <p className="text-xs text-muted-foreground">
                {device.last_seen_at
                  ? `Last seen ${formatDistanceToNow(new Date(device.last_seen_at))} ago`
                  : "Never seen"}
              </p>
            </div>
            <div className="flex gap-2">
              {device.status !== "AUTHORIZED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStatus(device, "AUTHORIZED")}
                >
                  <ShieldCheck />
                  Authorize
                </Button>
              )}
              {device.status !== "REVOKED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStatus(device, "REVOKED")}
                >
                  <Ban />
                  Revoke
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeviceStatusBadge({ status }: { status: CompetitionDevice["status"] }) {
  const map: Record<CompetitionDevice["status"], string> = {
    AUTHORIZED: "bg-emerald-500 text-white",
    PENDING: "bg-amber-500 text-white",
    REVOKED: "bg-red-600 text-white",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}
