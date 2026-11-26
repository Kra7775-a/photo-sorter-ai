import type { LoadProgress } from "../model/protocol";
import { createSorterController } from "../sorter/controller";
import type { RunStatus, SyncController } from "../sync/controller";
import type { SyncStore } from "../sync/store";
import type { SyncRun, SyncSettings } from "../sync/types";
import { createAuthFlow } from "./auth";
import {
  DEFAULT_LABELS,
  SYNC_PREF_KEY,
  emptySorterSnapshot,
  messageOf,
  type AppAccountSnapshot,
  type AppController,
  type AppControllerDeps,
} from "./types";

export * from "./types";

/**
 * Owns every piece of app state and every side effect. The component only
 * renders snapshots and forwards events, so all of this is testable without
 * a DOM, a worker or a network.
 */
export function createAppController(deps: AppControllerDeps): AppController {
  let labelsText = DEFAULT_LABELS.join("\n");
  let sorterSnapshot = emptySorterSnapshot();
  const account: AppAccountSnapshot = {
    email: null,
    syncEnabled: false,
    busy: false,
    error: null,
  };
  let syncNotice: string | null = null;
  let recordError: string | null = null;
  let runs: SyncRun[] = [];
  let runStatuses: Record<string, RunStatus> = {};
  let historyBusy = false;
  let sync: SyncController | null = null;
  let syncStore: SyncStore | null = null;
  const lifecycle = { stopped: false, disposed: false };

  // stop() can run while start() awaits openStore(); the helper keeps the
  // check live so late continuations are ignored.
  function isStopped(): boolean {
    return lifecycle.stopped;
  }
  let progressSink: ((progress: LoadProgress) => void) | null = null;

  function emit(): void {
    deps.onSnapshot({
      labelsText,
      sorter: sorterSnapshot,
      account: { ...account },
      syncNotice,
      recordError,
      runs,
      runStatuses,
      historyBusy,
    });
  }

  function labels(): string[] {
    return Array.from(
      new Set(
        labelsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );
  }

  const engine = deps.createEngine({ onProgress: (next) => progressSink?.(next) });
  const sorter = createSorterController({
    classify: (file, nextLabels) => engine.classify(file, nextLabels),
    classifyBatch: (images, labels) => engine.classifyBatch(images, labels),
    // The real sortArchive takes a 4th options object, not a bare callback.
    sortArchive: (file, nextLabels, classify, onProgress, classifyBatch) =>
      deps.sortArchive(file, nextLabels, classify, { onProgress }, classifyBatch),
    createUrl: deps.createUrl,
    revokeUrl: deps.revokeUrl,
    now: deps.now,
    uuid: deps.uuid,
    setProgressSink: (sink) => {
      progressSink = sink;
    },
    onSnapshot: (next) => {
      sorterSnapshot = next;
      emit();
    },
  });

  async function startSyncIfEnabled(): Promise<void> {
    if (account.syncEnabled && account.email !== null) {
      await sync?.queueAll();
      await sync?.sync();
    }
  }

  const {
    readSessionOnce,
    resetSessionLookup,
    checkSession,
    signIn,
    signUp,
    signOut,
    deleteAccount,
  } = createAuthFlow({
    authClient: deps.authClient,
    cookie: deps.cookie,
    storage: deps.storage,
    account,
    emit,
    isStopped,
    startSyncIfEnabled,
    getSync: () => sync,
    syncPrefKey: SYNC_PREF_KEY,
  });

  async function start(): Promise<void> {
    const store = await deps.openStore();
    syncStore = store;

    if (isStopped()) {
      return;
    }

    sync = deps.createSyncController({
      store,
      client: deps.syncClient,
      // The only gate for every sync-network call: session AND explicit opt-in.
      canSync: () => account.email !== null && account.syncEnabled,
      onSnapshot: (snapshot) => {
        if (isStopped()) {
          return;
        }
        runs = snapshot.runs;
        runStatuses = snapshot.statuses;
        syncNotice = snapshot.notice;
        emit();
      },
      onSettings: (settings) => {
        if (isStopped()) {
          return;
        }
        labelsText = settings.labels.join("\n");
        emit();
      },
      onUnauthorized: () => {
        account.email = null;
        account.syncEnabled = false;
        resetSessionLookup();
        deps.storage.setItem(SYNC_PREF_KEY, "false");
        account.error = "Session expired. Please sign in again.";
        emit();
        void sync?.stop();
      },
    });

    account.syncEnabled = deps.storage.getItem(SYNC_PREF_KEY) === "true";
    emit();
    await sync.load();

    if (isStopped()) {
      return;
    }

    // With sync off there is not even an auth request: zero /api traffic.
    // With a stale "on" flag but no session cookie, still make no request.
    if (account.syncEnabled) {
      const session = await readSessionOnce();

      if (session.checked) {
        if (isStopped()) {
          return;
        }
        account.email = session.email;
        emit();

        if (account.email !== null) {
          await sync.queueAll();
          await sync.sync();
        }
      }
    }
  }

  // Unmounting only stops callbacks from reaching the view. Sync keeps running
  // until the user signs out or turns it off explicitly.
  function stop(): void {
    if (isStopped()) {
      return;
    }
    lifecycle.stopped = true;
  }

  function dispose(): void {
    if (lifecycle.disposed) {
      return;
    }
    lifecycle.disposed = true;
    syncStore?.close();
    engine.dispose();
    sorter.dispose();
  }

  async function setSync(next: boolean): Promise<void> {
    account.syncEnabled = next;
    deps.storage.setItem(SYNC_PREF_KEY, String(next));
    emit();

    if (!next) {
      await sync?.stop();
      emit();
      return;
    }

    if (account.email !== null) {
      await sync?.queueAll();
      await sync?.sync();
    }
    emit();
  }

  function updateLabels(next: string): void {
    if (next === labelsText) {
      // CategoriesField repeats the value on `change`: that is the settings commit.
      const settings: SyncSettings = { labels: labels(), updatedAt: deps.now() };

      void sync?.updateSettings(settings);
      return;
    }
    labelsText = next;
    emit();
  }

  async function deleteRun(run: SyncRun): Promise<void> {
    historyBusy = true;
    emit();

    try {
      await sync?.deleteRun(run);
    } finally {
      historyBusy = false;
      emit();
    }
  }

  async function loadDetails(run: SyncRun): Promise<void> {
    await sync?.loadDetails(run);
  }

  async function handleFiles(files: readonly File[]): Promise<void> {
    await sorter.classifyFiles(files, labels());
  }

  async function handleArchive(file: File): Promise<void> {
    recordError = null;
    emit();
    const run = await sorter.sortArchiveFile(file, labels());

    if (run === null) {
      return;
    }

    try {
      await sync?.recordRun(run);
    } catch (error) {
      recordError = `${file.name}: ${messageOf(error)}`;
      emit();
    }
  }

  return {
    start,
    checkSession,
    stop,
    dispose,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    setSync,
    updateLabels,
    handleFiles,
    handleArchive,
    deleteRun,
    loadDetails,
  };
}
