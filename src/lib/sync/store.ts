import { openDB, type DBSchema } from "idb";

import type { SyncRun, SyncSettings } from "./types";

const DB_NAME = "photo-sorter-sync";
const DB_VERSION = 1;
const SETTINGS_KEY = "current";

type SyncDb = DBSchema & {
  runs: { key: string; value: SyncRun };
  settings: { key: string; value: SyncSettings };
  outbox: { key: string; value: string };
};

export type SyncStore = {
  getRuns(): Promise<SyncRun[]>;
  putRuns(runs: SyncRun[]): Promise<void>;
  getSettings(): Promise<SyncSettings | null>;
  putSettings(settings: SyncSettings): Promise<void>;
  getOutbox(): Promise<string[]>;
  setOutbox(ids: string[]): Promise<void>;
};

/** Opens the offline-first database; creating stores is the only version-1 migration. */
export async function openStore(): Promise<SyncStore> {
  const db = await openDB<SyncDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("runs")) {
        database.createObjectStore("runs", { keyPath: "clientRunId" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings");
      }
      if (!database.objectStoreNames.contains("outbox")) {
        database.createObjectStore("outbox");
      }
    },
  });

  return {
    getRuns: () => db.getAll("runs"),
    putRuns: async (runs) => {
      const tx = db.transaction("runs", "readwrite");
      await Promise.all(runs.map((run) => tx.store.put(run)));
      await tx.done;
    },
    getSettings: async () => (await db.get("settings", SETTINGS_KEY)) ?? null,
    putSettings: async (settings) => {
      await db.put("settings", settings, SETTINGS_KEY);
    },
    getOutbox: () => db.getAll("outbox"),
    setOutbox: async (ids) => {
      const tx = db.transaction("outbox", "readwrite");
      await tx.store.clear();
      await Promise.all(ids.map((id) => tx.store.put(id, id)));
      await tx.done;
    },
  };
}
