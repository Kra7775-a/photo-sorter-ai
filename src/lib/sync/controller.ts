import { NetworkError, QuotaError, UnauthorizedError, type SyncClient } from "./client";
import { mergeRuns, mergeSettings } from "./merge";
import type { SyncStore } from "./store";
import type { SyncRun, SyncSettings } from "./types";

export type RunStatus = "local" | "pending" | "synced" | "error";

export type SyncSnapshot = {
  runs: SyncRun[];
  statuses: Record<string, RunStatus>;
  notice: string | null;
};

export type SyncControllerDeps = {
  store: SyncStore;
  client: SyncClient;
  /** True only when a session exists and the user explicitly enabled sync. */
  canSync: () => boolean;
  onSnapshot: (snapshot: SyncSnapshot) => void;
  /** Authoritative settings from a local load or a server pull. */
  onSettings: (settings: SyncSettings) => void;
  /** The session expired: the caller must drop it and stop sync. */
  onUnauthorized: () => void;
};

export type SyncController = {
  load(): Promise<void>;
  recordRun(run: SyncRun): Promise<void>;
  updateSettings(settings: SyncSettings): Promise<void>;
  queueAll(): Promise<void>;
  stop(): Promise<void>;
  sync(): Promise<void>;
  deleteRun(run: SyncRun): Promise<void>;
  /** Fetches full report rows for a run whose list entry had none. */
  loadDetails(run: SyncRun): Promise<void>;
};

/**
 * Offline-first orchestration: IndexedDB is always written, the network is only
 * touched while `canSync()` is true. That single guard is the zero-fetch
 * invariant for a logged-out user or a disabled sync toggle.
 */
export function createSyncController(deps: SyncControllerDeps): SyncController {
  let runs: SyncRun[] = [];
  let outbox = new Set<string>();
  // Deletions made while offline must survive until the next sync, otherwise
  // pullRuns() brings the server copy back and the run "resurrects".
  const deleted = new Set<string>();
  const failed = new Set<string>();
  let settings: SyncSettings | null = null;
  let notice: string | null = null;

  function statusOf(run: SyncRun): RunStatus {
    if (failed.has(run.clientRunId)) {
      return "error";
    }
    if (outbox.has(run.clientRunId)) {
      return "pending";
    }

    return run.serverId === undefined ? "local" : "synced";
  }

  function persistOutbox(): Promise<void> {
    const ids = [...outbox, ...[...deleted].map((id) => `delete:${id}`)];
    return deps.store.setOutbox(ids);
  }

  function snapshot(): void {
    const statuses: Record<string, RunStatus> = {};

    for (const run of runs) {
      statuses[run.clientRunId] = statusOf(run);
    }

    deps.onSnapshot({ runs, statuses, notice });
  }

  function reportError(error: unknown, runId?: string): void {
    if (error instanceof UnauthorizedError) {
      notice = "Сессия истекла. Войдите в аккаунт снова.";
      deps.onUnauthorized();
      return;
    }
    if (error instanceof QuotaError) {
      notice = "Превышен лимит сервера: данные не синхронизированы.";
      return;
    }
    if (error instanceof NetworkError) {
      if (runId !== undefined) {
        failed.add(runId);
      }
      notice = "Нет соединения: прогоны останутся в очереди.";
      return;
    }

    notice = "Не удалось синхронизировать данные.";
    if (runId !== undefined) {
      failed.add(runId);
    }
  }

  async function load(): Promise<void> {
    const [storedRuns, storedOutbox, storedSettings] = await Promise.all([
      deps.store.getRuns(),
      deps.store.getOutbox(),
      deps.store.getSettings(),
    ]);

    runs = storedRuns;
    outbox = new Set(storedOutbox.filter((id) => !id.startsWith("delete:")));
    for (const id of storedOutbox) {
      if (id.startsWith("delete:")) {
        deleted.add(id.slice("delete:".length));
      }
    }
    settings = storedSettings;

    if (settings !== null) {
      deps.onSettings(settings);
    }
    snapshot();
  }

  async function recordRun(run: SyncRun): Promise<void> {
    runs = mergeRuns(runs, [run]);
    await deps.store.putRuns([run]);

    if (deps.canSync()) {
      outbox.add(run.clientRunId);
      deleted.delete(run.clientRunId);
      await persistOutbox();
    }
    snapshot();

    if (deps.canSync()) {
      await sync();
    }
  }

  async function updateSettings(incoming: SyncSettings): Promise<void> {
    // `incoming` is never null, so mergeSettings cannot return null here.
    const merged = mergeSettings(settings, incoming) ?? incoming;

    settings = merged;
    await deps.store.putSettings(merged);

    if (deps.canSync()) {
      try {
        const confirmed = await deps.client.pushSettings(merged);
        settings = mergeSettings(merged, confirmed);
        if (settings !== null) {
          await deps.store.putSettings(settings);
        }
      } catch (error) {
        reportError(error);
      }
    }
    snapshot();
  }

  async function queueAll(): Promise<void> {
    if (!deps.canSync()) {
      return;
    }

    for (const run of runs) {
      if (run.serverId === undefined) {
        outbox.add(run.clientRunId);
      }
    }
    await persistOutbox();
    snapshot();
  }

  async function stop(): Promise<void> {
    outbox.clear();
    failed.clear();
    await persistOutbox();
    snapshot();
  }

  async function sync(): Promise<void> {
    if (!deps.canSync()) {
      return;
    }

    notice = null;

    try {
      // Push offline deletions first, before any pull can restore the rows.
      for (const id of deleted) {
        if (!deps.canSync()) {
          return;
        }
        try {
          await deps.client.deleteRunByClientId(id);
          deleted.delete(id);
          await persistOutbox();
        } catch (error) {
          reportError(error, id);
          if (error instanceof UnauthorizedError || error instanceof QuotaError) {
            break;
          }
        }
      }

      for (const id of outbox) {
        if (!deps.canSync()) {
          return;
        }

        const run = runs.find((item) => item.clientRunId === id);

        if (run === undefined) {
          outbox.delete(id);
          continue;
        }

        try {
          const serverId = await deps.client.pushRun(run);
          const uploaded: SyncRun = { ...run, serverId };

          runs = runs.map((item) => (item.clientRunId === id ? uploaded : item));
          outbox.delete(id);
          failed.delete(id);
          await deps.store.putRuns([uploaded]);
        } catch (error) {
          reportError(error, id);
          if (error instanceof UnauthorizedError || error instanceof QuotaError) {
            break;
          }
        }
      }
      await persistOutbox();

      if (!deps.canSync()) {
        return;
      }
      const remoteRuns = await deps.client.pullRuns(0);
      // The list endpoint has no rows, so persist the merged records: writing
      // remote records directly would wipe the reports of locally created runs.
      runs = mergeRuns(runs, remoteRuns);
      await deps.store.putRuns(runs);

      if (!deps.canSync()) {
        return;
      }
      const remoteSettings = await deps.client.pullSettings();

      if (remoteSettings !== null) {
        const merged = mergeSettings(settings, remoteSettings);

        if (merged !== null && (settings === null || merged.updatedAt !== settings.updatedAt)) {
          settings = merged;
          await deps.store.putSettings(merged);
          deps.onSettings(merged);
        }
      }
    } catch (error) {
      reportError(error);
    } finally {
      snapshot();
    }
  }

  async function deleteRun(run: SyncRun): Promise<void> {
    if (deps.canSync() && run.serverId !== undefined) {
      try {
        await deps.client.deleteRun(run.serverId);
        deleted.delete(run.clientRunId);
      } catch (error) {
        reportError(error);
        snapshot();
        return;
      }
    } else {
      // No server id (local-only) or no session: remember the intent and send
      // it by clientRunId on the next sync so pullRuns cannot restore the run.
      deleted.add(run.clientRunId);
      await persistOutbox();
    }

    runs = runs.filter((item) => item.clientRunId !== run.clientRunId);
    outbox.delete(run.clientRunId);
    failed.delete(run.clientRunId);
    await deps.store.deleteRuns([run.clientRunId]);
    snapshot();
  }

  async function loadDetails(run: SyncRun): Promise<void> {
    if (!deps.canSync() || run.serverId === undefined) {
      return;
    }
    const full = await deps.client.getRun(run.serverId);
    runs = mergeRuns(runs, [full]);
    await deps.store.putRuns([full]);
    snapshot();
  }

  return { load, recordRun, updateSettings, queueAll, stop, sync, deleteRun, loadDetails };
}
