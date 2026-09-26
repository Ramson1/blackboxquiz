import { createClient } from "@/lib/supabase/server";
import type { CompetitionDevice } from "@/types/database";

/**
 * Device authorization data access (spec §44). A competition can optionally be
 * paired to an authorized device. The operator console registers ("touches") its
 * own device on load so it becomes visible for a manager to authorize or revoke.
 * A REVOKED device is blocked server-side from syncing events (see the 0008
 * ingestion guard), so it cannot start or advance a competition.
 */

export type DeviceStatus = CompetitionDevice["status"];

export async function listDevices(competitionId: string): Promise<CompetitionDevice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competition_devices")
    .select("*")
    .eq("competition_id", competitionId)
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data as CompetitionDevice[];
}

/** Registers or refreshes the current device; returns its row id. */
export async function registerDevice(input: {
  competitionId: string;
  deviceIdentifier: string;
  deviceName?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_register_device", {
    p_competition_id: input.competitionId,
    p_device_identifier: input.deviceIdentifier,
    p_device_name: input.deviceName ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Authorize / revoke / reset a device (manager only, enforced by the RPC). */
export async function setDeviceStatus(
  deviceId: string,
  status: DeviceStatus
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("blackboxquiz_set_device_status", {
    p_device_id: deviceId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export interface DeviceGate {
  deviceId: string;
  status: DeviceStatus;
  /** True when the device is not REVOKED and may therefore run the competition. */
  allowed: boolean;
}

/**
 * Registers the calling device and returns its current authorization status.
 * Used by the offline console to decide whether to allow starting (§44).
 */
export async function ensureDeviceStatus(
  competitionId: string,
  deviceIdentifier: string,
  deviceName?: string | null
): Promise<DeviceGate> {
  await registerDevice({ competitionId, deviceIdentifier, deviceName });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blackboxquiz_competition_devices")
    .select("status")
    .eq("competition_id", competitionId)
    .eq("device_identifier", deviceIdentifier)
    .maybeSingle<{ status: DeviceStatus }>();
  if (error) throw new Error(error.message);
  const status = data?.status ?? "PENDING";
  return { deviceId: deviceIdentifier, status, allowed: status !== "REVOKED" };
}
