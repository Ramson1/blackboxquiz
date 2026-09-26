"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureDeviceAction } from "@/features/devices/actions";
import { getDeviceId } from "@/features/live/engine-api";
import type { DeviceStatus } from "@/services/devices/device-service";

export interface DeviceStatusState {
  loading: boolean;
  deviceId: string;
  status: DeviceStatus | null;
  /** False only when the device is REVOKED — it must not run the competition (§44). */
  allowed: boolean;
  /** Re-check authorization with the server (e.g. after a manager acts). */
  refresh: () => void;
}

/**
 * Registers this browser as a device for the competition and reports its
 * authorization status (spec §44). Pairing is optional, so PENDING and
 * AUTHORIZED are both allowed to run; only a REVOKED device is blocked. The
 * server independently refuses event syncs from revoked devices (0008 guard).
 */
export function useDeviceStatus(competitionId: string): DeviceStatusState {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const id = getDeviceId();
    void (async () => {
      try {
        const res = await ensureDeviceAction({
          competitionId,
          deviceIdentifier: id,
        });
        if (!cancelled) {
          setDeviceId(res.deviceId);
          setStatus(res.status);
        }
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [competitionId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    loading,
    deviceId,
    status,
    allowed: status !== "REVOKED",
    refresh,
  };
}
