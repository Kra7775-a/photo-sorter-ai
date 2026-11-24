import type { sortArchive } from "../archive/sort";
import type { createEngine } from "../model/engine";
import type { LoadProgress } from "../model/protocol";
import { createSorterController, type SorterSnapshot } from "../sorter/controller";
import type { SyncClient } from "../sync/client";
import type { createSyncController, RunStatus, SyncController } from "../sync/controller";
import type { openStore, SyncStore } from "../sync/store";
import type { SyncRun, SyncSettings } from "../sync/types";

const DEFAULT_LABELS = [
  "people",
  "food",
  "animals",
  "nature",
  "documents",
  "screenshots",
  "transport",
];

const SYNC_PREF_KEY = "photo-sorter-sync-enabled";

export type AppAccountSnapshot = {
  email: string | null;
  syncEnabled: boolean;
  busy: boolean;
  error: string | null;
};

export type AppSnapshot = {
  labelsText: string;
  sorter: SorterSnapshot;
  account: AppAccountSnapshot;
  syncNotice: string | null;
  recordError: string | null;
  runs: SyncRun[];
  runStatuses: Record<string, RunStatus>;
  historyBusy: boolean;
};

type AuthResult = {
  data?: { user?: { email?: string | null } } | null;
  error?: { message?: string } | null;
};

type AuthDeletionResult = {
  data?: unknown;
  error?: { message?: string } | null;
};

/** The subset of better-auth's client that App actually calls. */
export type AuthClientLike = {
  getSession(): Promise<AuthResult>;
  signIn: {
    email(input: { email: string; password: string }): Promise<AuthResult>;
  };
  signUp: {
    email(input: { email: string; password: string; name: string }): Promise<AuthResult>;
  };
  signOut(): Promise<unknown>;
  deleteUser(input: { password: string }): Promise<AuthDeletionResult>;
};

export type AppControllerDeps = {
  authClient: AuthClientLike;
  syncClient: SyncClient;
  createEngine: typeof createEngine;
  sortArchive: typeof sortArchive;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  now: () => number;
  uuid: () => string;
  storage: Pick<Storage, "getItem" | "setItem">;
  cookie: () => string;
  openStore: typeof openStore;
  createSyncController: typeof createSyncController;
  onSnapshot: (snapshot: AppSnapshot) => void;
};

export type AppController = {
  start(): Promise<void>;
  stop(): void;
  dispose(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  setSync(next: boolean): Promise<void>;
  updateLabels(next: string): void;
  handleFiles(files: readonly File[]): Promise<void>;
  handleArchive(file: File): Promise<void>;
  deleteRun(run: SyncRun): Promise<void>;
  loadDetails(run: SyncRun): Promise<void>;
};

function emptySorterSnapshot(): SorterSnapshot {
  return {
    items: [],
    pending: 0,
    failure: null,
    progress: null,
    percent: 0,
    loadingModel: false,
    archiveProgress: null,
    archivePercent: 0,
    archiveResult: null,
    archiveBusy: false,
    busy: false,
  };
}

/** Initial view state, shared by the component and the controller. */
export function emptyAppSnapshot(): AppSnapshot {
  return {
    labelsText: DEFAULT_LABELS.join("\n"),
    sorter: emptySorterSnapshot(),
    account: { email: null, syncEnabled: false, busy: false, error: null },
    syncNotice: null,
    recordError: null,
    runs: [],
    runStatuses: {},
    historyBusy: false,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
    // The real sortArchive takes a 4th options object, not a bare callback.
    sortArchive: (file, nextLabels, classify, onProgress) =>
      deps.sortArchive(file, nextLabels, classify, { onProgress }),
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
    if (account.syncEnabled && deps.cookie().includes("better-auth.session_token=")) {
      const { data } = await deps.authClient.getSession();

      if (isStopped()) {
        return;
      }
      account.email = data?.user?.email ?? null;
      emit();

      if (account.email !== null) {
        await sync.queueAll();
        await sync.sync();
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

  async function runAuth(action: () => Promise<AuthResult>, failureMessage: string): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      const result = await action();

      if (result.error) {
        account.error = result.error.message ?? failureMessage;
        return;
      }
      account.email = result.data?.user?.email ?? null;
      await startSyncIfEnabled();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }
  }

  function signIn(email: string, password: string): Promise<void> {
    return runAuth(() => deps.authClient.signIn.email({ email, password }), "Failed to sign in.");
  }

  function signUp(email: string, password: string): Promise<void> {
    return runAuth(
      () =>
        deps.authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0] ?? "user",
        }),
      "Failed to create an account.",
    );
  }

  async function signOut(): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      await deps.authClient.signOut();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }

    account.email = null;
    account.syncEnabled = false;
    deps.storage.setItem(SYNC_PREF_KEY, "false");
    await sync?.stop();
    emit();
  }

  async function deleteAccount(password: string): Promise<void> {
    account.busy = true;
    account.error = null;
    emit();

    try {
      const result = await deps.authClient.deleteUser({ password });

      if (result.error) {
        account.error = result.error.message ?? "Failed to delete account.";
        return;
      }

      account.email = null;
      account.syncEnabled = false;
      deps.storage.setItem(SYNC_PREF_KEY, "false");
      await sync?.stop();
    } catch (error) {
      account.error = messageOf(error);
    } finally {
      account.busy = false;
      emit();
    }
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
