import type { sortArchive } from "../archive/sort";
import type { createEngine } from "../model/engine";
import type { SorterSnapshot } from "../sorter/controller";
import type { SyncClient } from "../sync/client";
import type { createSyncController, RunStatus } from "../sync/controller";
import type { openStore } from "../sync/store";
import type { SyncRun } from "../sync/types";

export const DEFAULT_LABELS = [
  "people",
  "food",
  "animals",
  "nature",
  "documents",
  "screenshots",
  "transport",
];

export const SYNC_PREF_KEY = "photo-sorter-sync-enabled";
// The server sets this readable hint; better-auth's real session cookie is
// HttpOnly and invisible to document.cookie. It only gates the session lookup.
export const SESSION_COOKIE = "photo-sorter-session=1";

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

export type AuthResult = {
  data?: { user?: { email?: string | null } } | null;
  error?: { message?: string } | null;
};

export type AuthDeletionResult = {
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
  checkSession(): Promise<void>;
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

export function emptySorterSnapshot(): SorterSnapshot {
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

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
