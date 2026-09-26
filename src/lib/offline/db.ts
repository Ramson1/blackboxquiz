import Dexie, { type Table } from "dexie";
import type { DownloadablePackage } from "@/features/offline/package-types";
import type { EngineEvent, LiveState } from "@/features/engine/types";

/**
 * Offline local database (spec §32). Uses Dexie/IndexedDB. Three tables back the
 * offline-first flow:
 *  - packages: the full downloaded competition package (atomic per competition).
 *  - events:   the local event log, doubling as the sync queue (`synced` flag)
 *              drained by the sync engine (Task 14).
 *  - states:   the materialized §33 snapshot, for fast refresh/crash recovery.
 */

export interface StoredPackage {
  competitionId: string;
  name: string;
  schemaVersion: number;
  downloadedAt: number;
  pkg: DownloadablePackage;
}

export interface StoredEvent extends EngineEvent {
  synced: boolean;
  syncedAt: number | null;
  /** Set when the server rejected this event with a sequence conflict (§39). */
  conflict?: boolean;
  /** Last transient error, for diagnostics/retry display (§37). */
  lastError?: string | null;
}

export interface StoredState {
  competitionId: string;
  status: LiveState["status"];
  lastEventSequence: number;
  updatedAt: number;
  snapshot: LiveState;
}

class BlackboxQuizOfflineDB extends Dexie {
  packages!: Table<StoredPackage, string>;
  events!: Table<StoredEvent, string>;
  states!: Table<StoredState, string>;

  constructor() {
    super("blackboxquiz-offline");
    this.version(1).stores({
      packages: "competitionId, downloadedAt",
      events:
        "event_id, competition_id, sequence_number, synced, [competition_id+sequence_number]",
      states: "competitionId, updatedAt",
    });
  }
}

export const offlineDb = new BlackboxQuizOfflineDB();
