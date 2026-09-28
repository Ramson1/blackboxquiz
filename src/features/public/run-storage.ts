/**
 * sessionStorage hand-off between the home "Start Competition" dialog and the
 * public run screen (/run/[id]). Stores the bundle + title + password so a
 * refresh mid-run can either resume from the live snapshot or silently
 * re-verify with publicGetBundleAction. Deliberately sessionStorage (not
 * localStorage): one school's credentials must not linger on shared devices
 * after the tab closes.
 */

import type { PublicBundle } from "@/types/public";

export const PUBLIC_RUN_KEY = "blackboxquiz:public-run";
export const PUBLIC_STATE_KEY = "blackboxquiz:public-run-state";

export interface PublicRunCredential {
  title: string;
  password: string;
  bundle: PublicBundle;
}

export function saveRunCredential(cred: PublicRunCredential): void {
  try {
    sessionStorage.setItem(PUBLIC_RUN_KEY, JSON.stringify(cred));
  } catch {
    /* private mode / quota — the run page will fall back to re-entry */
  }
}

export function loadRunCredential(): PublicRunCredential | null {
  try {
    const raw = sessionStorage.getItem(PUBLIC_RUN_KEY);
    return raw ? (JSON.parse(raw) as PublicRunCredential) : null;
  } catch {
    return null;
  }
}

export function clearRunCredential(): void {
  try {
    sessionStorage.removeItem(PUBLIC_RUN_KEY);
    sessionStorage.removeItem(PUBLIC_STATE_KEY);
  } catch {
    /* ignore */
  }
}
