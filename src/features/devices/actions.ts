"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import {
  ensureDeviceStatus,
  setDeviceStatus,
  type DeviceGate,
  type DeviceStatus,
} from "@/services/devices/device-service";

/**
 * Device authorization actions (spec §44). The offline console calls
 * ensureDeviceAction on load so its device is registered and the operator sees
 * the current status; managers authorize/revoke from the devices screen.
 */

const identifier = z.string().min(1).max(200);

export async function ensureDeviceAction(input: {
  competitionId: string;
  deviceIdentifier: string;
  deviceName?: string | null;
}): Promise<DeviceGate> {
  await requireUser();
  const parsed = z
    .object({
      competitionId: z.uuid(),
      deviceIdentifier: identifier,
      deviceName: z.string().trim().max(120).nullish(),
    })
    .parse(input);
  return ensureDeviceStatus(
    parsed.competitionId,
    parsed.deviceIdentifier,
    parsed.deviceName ?? null
  );
}

export type DeviceActionResult = { ok: true } | { ok: false; error: string };

const STATUS_VALUES = ["PENDING", "AUTHORIZED", "REVOKED"] as const;

export async function setDeviceStatusAction(input: {
  competitionId: string;
  deviceId: string;
  status: DeviceStatus;
}): Promise<DeviceActionResult> {
  await requireUser();
  const parsed = z
    .object({
      competitionId: z.uuid(),
      deviceId: z.uuid(),
      status: z.enum(STATUS_VALUES),
    })
    .parse(input);
  try {
    await setDeviceStatus(parsed.deviceId, parsed.status);
    revalidatePath(`/competitions/${parsed.competitionId}/devices`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update device status.",
    };
  }
}
