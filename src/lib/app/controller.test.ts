import { describe, expect, mock, test } from "bun:test";

import type { Engine } from "../model/engine";
import type { SyncClient } from "../sync/client";
import type { SyncController, SyncControllerDeps } from "../sync/controller";
import type { SyncStore } from "../sync/store";
import type { SyncRun } from "../sync/types";
import {
  createAppController,
  emptyAppSnapshot,
  type AppControllerDeps,
  type AppSnapshot,
  type AuthClientLike,
} from "./controller";

const CLOCK = 1_700_000_000_000;
const EMAIL = "user@example.com";
const RUN: SyncRun = {
  clientRunId: "run-1",
  sourceName: "holiday.zip",
  createdAt: CLOCK,
  counts: { sorted: 1, skipped: 0, errors: 0 },
  rows: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function harness(initial: { storedPref?: boolean; cookie?: string } = {}) {
  const values = new Map<string, string>();

  if (initial.storedPref === true) {
    values.set("photo-sorter-sync-enabled", "true");
  }
  const cookie = initial.cookie ?? "";

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Pick<Storage, "getItem" | "setItem">;

  const getSession = mock<AuthClientLike["getSession"]>(async () => ({
    data: { user: { email: EMAIL } },
  }));
  const signInEmail = mock<AuthClientLike["signIn"]["email"]>(async () => ({
    data: { user: { email: EMAIL } },
  }));
  const signUpEmail = mock<AuthClientLike["signUp"]["email"]>(async () => ({
    data: { user: { email: EMAIL } },
  }));
  const signOut = mock<AuthClientLike["signOut"]>(async () => undefined);
  const deleteUser = mock<AuthClientLike["deleteUser"]>(async () => ({}));
  const authClient: AuthClientLike = {
    getSession,
    signIn: { email: signInEmail },
    signUp: { email: signUpEmail },
    signOut,
    deleteUser,
  };

  const pushRun = mock<SyncClient["pushRun"]>(async () => "srv-1");
  const pullRuns = mock<SyncClient["pullRuns"]>(async () => []);
  const getRun = mock<SyncClient["getRun"]>(async (id) => ({
    clientRunId: "run-1",
    sourceName: "holiday.zip",
    createdAt: CLOCK,
    counts: { sorted: 1, skipped: 0, errors: 0 },
    rows: [],
    serverId: id,
  }));
  const deleteRun = mock<SyncClient["deleteRun"]>(async () => undefined);
  const deleteRunByClientId = mock<SyncClient["deleteRunByClientId"]>(async () => undefined);
  const pushSettings = mock<SyncClient["pushSettings"]>(async (settings) => settings);
  const pullSettings = mock<SyncClient["pullSettings"]>(async () => null);
  const syncClient: SyncClient = {
    pushRun,
    pullRuns,
    getRun,
    deleteRun,
    deleteRunByClientId,
    pushSettings,
    pullSettings,
  };

  const closeStore = mock(() => undefined);
  const store: SyncStore = {
    getRuns: async () => [],
    putRuns: async () => undefined,
    deleteRuns: async () => undefined,
    getSettings: async () => null,
    putSettings: async () => undefined,
    getOutbox: async () => [],
    setOutbox: async () => undefined,
    close: closeStore,
  };
  const openStore = mock<AppControllerDeps["openStore"]>(async () => store);

  const recordRun = mock<SyncController["recordRun"]>(async () => undefined);
  const syncDeleteRun = mock<SyncController["deleteRun"]>(async () => undefined);
  const loadDetails = mock<SyncController["loadDetails"]>(async () => undefined);
  const sync: SyncController = {
    load: mock<SyncController["load"]>(async () => undefined),
    recordRun,
    updateSettings: mock<SyncController["updateSettings"]>(async () => undefined),
    queueAll: mock<SyncController["queueAll"]>(async () => undefined),
    stop: mock<SyncController["stop"]>(async () => undefined),
    sync: mock<SyncController["sync"]>(async () => undefined),
    deleteRun: syncDeleteRun,
    loadDetails,
  };
  let syncDeps: SyncControllerDeps | null = null;
  const createSyncController = mock<AppControllerDeps["createSyncController"]>((deps) => {
    syncDeps = deps;
    return sync;
  });

  const classify = mock<Engine["classify"]>(async () => ({ scores: [], ms: 1 }));
  const engineDispose = mock(() => undefined);
  const createEngine = mock<AppControllerDeps["createEngine"]>(() => ({
    classify,
    dispose: engineDispose,
  }));
  const sortArchive = mock<AppControllerDeps["sortArchive"]>(async () => ({
    blob: new Blob(["zip"]),
    fileName: "sorted.zip",
    report: [],
    counts: { sorted: 1, skipped: 0, errors: 0 },
  }));

  const snapshots: AppSnapshot[] = [];
  const app = createAppController({
    authClient,
    syncClient,
    createEngine,
    sortArchive,
    createUrl: (blob) => `blob:${blob.size}`,
    revokeUrl: () => undefined,
    now: () => CLOCK,
    uuid: () => "run-1",
    storage,
    cookie: () => cookie,
    openStore,
    createSyncController,
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot);
    },
  });

  const apiCalls = (): number =>
    pushRun.mock.calls.length +
    pullRuns.mock.calls.length +
    getRun.mock.calls.length +
    deleteRun.mock.calls.length +
    deleteRunByClientId.mock.calls.length +
    pushSettings.mock.calls.length +
    pullSettings.mock.calls.length;

  return {
    app,
    sync,
    store,
    closeStore,
    recordRun,
    deleteRun: syncDeleteRun,
    loadDetails,
    syncDeps: () => syncDeps,
    engineDispose,
    classify,
    sortArchive,
    createSyncController,
    openStore,
    signInEmail,
    signUpEmail,
    signOut,
    deleteUser,
    getSession,
    apiCalls,
    values,
    last(): AppSnapshot {
      const last = snapshots.at(-1);

      if (last === undefined) {
        throw new Error("No snapshot emitted");
      }
      return last;
    },
  };
}

describe("createAppController", () => {
  test("makes no auth or API calls while sync is off and no cookie exists", async () => {
    const h = harness();

    await h.app.start();

    expect(h.sync.load).toHaveBeenCalledTimes(1);
    expect(h.getSession).not.toHaveBeenCalled();
    expect(h.apiCalls()).toBe(0);
    expect(h.last().account.syncEnabled).toBe(false);
  });

  test("a stored on flag without a session cookie still makes no requests", async () => {
    const h = harness({ storedPref: true });

    await h.app.start();

    expect(h.last().account.syncEnabled).toBe(true);
    expect(h.getSession).not.toHaveBeenCalled();
    expect(h.apiCalls()).toBe(0);
    expect(h.sync.queueAll).not.toHaveBeenCalled();
    expect(h.sync.sync).not.toHaveBeenCalled();
  });

  test("signIn with the preference already on queues and syncs", async () => {
    const h = harness({ storedPref: true });

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");

    expect(h.signInEmail).toHaveBeenCalledWith({ email: EMAIL, password: "secret" });
    expect(h.last().account.email).toBe(EMAIL);
    expect(h.sync.queueAll).toHaveBeenCalledTimes(1);
    expect(h.sync.sync).toHaveBeenCalledTimes(1);
  });

  test("the repeated CategoriesField value commits deduplicated labels with a timestamp", async () => {
    const h = harness();
    const repeated = "people\n food \npeople\n\n";

    await h.app.start();
    h.app.updateLabels(repeated);
    expect(h.sync.updateSettings).not.toHaveBeenCalled();

    h.app.updateLabels(repeated);

    expect(h.sync.updateSettings).toHaveBeenCalledTimes(1);
    expect(h.sync.updateSettings).toHaveBeenCalledWith({
      labels: ["people", "food"],
      updatedAt: CLOCK,
    });
  });

  test("handleArchive records the sorter run and ignores a null run", async () => {
    const h = harness();
    const archive = new File(["zip"], "holiday.zip", { type: "application/zip" });

    await h.app.start();
    await h.app.handleArchive(archive);

    expect(h.sync.recordRun).toHaveBeenCalledTimes(1);
    expect(h.sync.recordRun).toHaveBeenCalledWith({
      clientRunId: "run-1",
      sourceName: "sorted.zip",
      createdAt: CLOCK,
      counts: { sorted: 1, skipped: 0, errors: 0 },
      rows: [],
    });

    h.recordRun.mockClear();
    h.sortArchive.mockImplementation(async () => {
      throw new Error("corrupt zip");
    });

    await h.app.handleArchive(archive);

    expect(h.sync.recordRun).not.toHaveBeenCalled();
  });

  test("signOut clears the session and the preference and stops sync", async () => {
    const h = harness();

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");
    await h.app.signOut();

    expect(h.values.get("photo-sorter-sync-enabled")).toBe("false");
    expect(h.last().account.email).toBeNull();
    expect(h.last().account.syncEnabled).toBe(false);
    expect(h.sync.stop).toHaveBeenCalledTimes(1);
  });

  test("stop is idempotent and does not stop sync", async () => {
    const h = harness();

    await h.app.start();
    h.app.stop();
    h.app.stop();

    expect(h.sync.stop).not.toHaveBeenCalled();
  });

  test("dispose closes the store once and is idempotent", async () => {
    const h = harness();

    await h.app.start();
    h.app.dispose();
    h.app.dispose();

    expect(h.closeStore).toHaveBeenCalledTimes(1);
    expect(h.engineDispose).toHaveBeenCalledTimes(1);
  });

  test("an unauthorized callback drops the session and the preference", async () => {
    const h = harness();

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");
    h.syncDeps()?.onUnauthorized();

    expect(h.values.get("photo-sorter-sync-enabled")).toBe("false");
    expect(h.last().account.email).toBeNull();
    expect(h.last().account.syncEnabled).toBe(false);
    expect(h.last().account.error).toBe("Session expired. Please sign in again.");
    expect(h.sync.stop).toHaveBeenCalled();
  });

  test("emptyAppSnapshot is the initial view", () => {
    expect(emptyAppSnapshot()).toEqual({
      labelsText: "people\nfood\nanimals\nnature\ndocuments\nscreenshots\ntransport",
      sorter: {
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
      },
      account: { email: null, syncEnabled: false, busy: false, error: null },
      syncNotice: null,
      recordError: null,
      runs: [],
      runStatuses: {},
      historyBusy: false,
    });
  });

  test("a session cookie restores the email and queues local runs", async () => {
    const h = harness({ storedPref: true, cookie: "other=1; better-auth.session_token=abc" });

    await h.app.start();

    expect(h.getSession).toHaveBeenCalledTimes(1);
    expect(h.last().account.email).toBe(EMAIL);
    expect(h.sync.queueAll).toHaveBeenCalledTimes(1);
    expect(h.sync.sync).toHaveBeenCalledTimes(1);
    expect(h.syncDeps()?.canSync()).toBe(true);
  });

  test("sync callbacks update runs, statuses, notices, settings and the canSync gate", async () => {
    const h = harness({ storedPref: true });

    await h.app.start();
    expect(h.syncDeps()?.canSync()).toBe(false);

    h.syncDeps()?.onSnapshot({
      runs: [RUN],
      statuses: { "run-1": "synced" },
      notice: "No connection",
    });
    h.syncDeps()?.onSettings({ labels: ["cats"], updatedAt: 7 });

    expect(h.last().runs).toEqual([RUN]);
    expect(h.last().runStatuses).toEqual({ "run-1": "synced" });
    expect(h.last().syncNotice).toBe("No connection");
    expect(h.last().labelsText).toBe("cats");

    await h.app.signIn(EMAIL, "secret");
    expect(h.syncDeps()?.canSync()).toBe(true);
  });

  test("stopping while openStore is pending prevents sync controller creation", async () => {
    const h = harness();
    const gate = deferred<SyncStore>();

    h.openStore.mockImplementation(() => gate.promise);
    const work = h.app.start();
    h.app.stop();
    gate.resolve(h.store);
    await work;

    expect(h.createSyncController).not.toHaveBeenCalled();
  });

  test("callbacks after stop are ignored", async () => {
    const h = harness();

    await h.app.start();
    h.app.stop();
    const emitted = h.last();

    h.syncDeps()?.onSnapshot({ runs: [RUN], statuses: {}, notice: "late" });
    h.syncDeps()?.onSettings({ labels: ["late"], updatedAt: 1 });

    expect(h.last()).toBe(emitted);
  });

  test("signIn reports auth errors and always clears busy", async () => {
    const h = harness();

    await h.app.start();
    h.signInEmail.mockImplementation(async () => ({ error: { message: "denied" } }));
    await h.app.signIn(EMAIL, "bad");

    expect(h.last().account.error).toBe("denied");
    expect(h.last().account.busy).toBe(false);
    expect(h.sync.queueAll).not.toHaveBeenCalled();

    h.signInEmail.mockImplementation(async () => {
      throw new Error("offline");
    });
    await h.app.signIn(EMAIL, "bad");

    expect(h.last().account.error).toBe("offline");
    expect(h.last().account.busy).toBe(false);
  });

  test("signUp uses the email prefix as name and starts sync when enabled", async () => {
    const h = harness({ storedPref: true });

    await h.app.start();
    await h.app.signUp(EMAIL, "secret");

    expect(h.signUpEmail).toHaveBeenCalledWith({
      email: EMAIL,
      password: "secret",
      name: "user",
    });
    expect(h.sync.queueAll).toHaveBeenCalledTimes(1);
    expect(h.sync.sync).toHaveBeenCalledTimes(1);

    h.signUpEmail.mockImplementation(async () => ({
      error: { message: undefined },
    }));
    await h.app.signUp(EMAIL, "secret");
    expect(h.last().account.error).toBe("Failed to create an account.");
  });

  test("signOut reports a failure but still clears the local session", async () => {
    const h = harness();

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");
    h.signOut.mockImplementation(async () => {
      throw new Error("signout failed");
    });
    await h.app.signOut();

    expect(h.last().account.error).toBe("signout failed");
    expect(h.last().account.email).toBeNull();
    expect(h.last().account.syncEnabled).toBe(false);
    expect(h.sync.stop).toHaveBeenCalledTimes(1);
  });

  test("deleteAccount clears the session on success and reports server errors", async () => {
    const h = harness();

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");
    await h.app.deleteAccount("secret");

    expect(h.deleteUser).toHaveBeenCalledWith({ password: "secret" });
    expect(h.last().account.email).toBeNull();
    expect(h.values.get("photo-sorter-sync-enabled")).toBe("false");
    expect(h.sync.stop).toHaveBeenCalledTimes(1);

    h.deleteUser.mockImplementation(async () => ({ error: { message: "wrong password" } }));
    await h.app.deleteAccount("wrong");
    expect(h.last().account.error).toBe("wrong password");
  });

  test("setSync stops sync when off and starts it for a signed-in user", async () => {
    const h = harness();

    await h.app.start();
    await h.app.signIn(EMAIL, "secret");
    await h.app.setSync(false);

    expect(h.values.get("photo-sorter-sync-enabled")).toBe("false");
    expect(h.last().account.syncEnabled).toBe(false);
    expect(h.sync.stop).toHaveBeenCalledTimes(1);

    await h.app.setSync(true);

    expect(h.values.get("photo-sorter-sync-enabled")).toBe("true");
    expect(h.last().account.syncEnabled).toBe(true);
    expect(h.sync.queueAll).toHaveBeenCalledTimes(1);
    expect(h.sync.sync).toHaveBeenCalledTimes(1);
  });

  test("setSync on without a session does not start sync", async () => {
    const h = harness();

    await h.app.start();
    await h.app.setSync(true);

    expect(h.sync.queueAll).not.toHaveBeenCalled();
    expect(h.sync.sync).not.toHaveBeenCalled();
  });

  test("handleFiles classifies through the engine with the current labels", async () => {
    const h = harness();
    const photo = new File(["bytes"], "a.jpg", { type: "image/jpeg" });

    await h.app.start();
    h.app.updateLabels("cats\n dogs ");
    await h.app.handleFiles([photo]);

    expect(h.classify).toHaveBeenCalledWith(photo, ["cats", "dogs"]);
  });

  test("deleteRun brackets the call with historyBusy and loadDetails delegates", async () => {
    const h = harness();
    const gate = deferred<void>();

    await h.app.start();
    h.deleteRun.mockImplementation(() => gate.promise);
    const work = h.app.deleteRun(RUN);

    expect(h.last().historyBusy).toBe(true);
    gate.resolve();
    await work;

    expect(h.last().historyBusy).toBe(false);
    expect(h.deleteRun).toHaveBeenCalledWith(RUN);

    await h.app.loadDetails(RUN);
    expect(h.loadDetails).toHaveBeenCalledWith(RUN);
  });

  test("handleArchive reports a failed recordRun with the file name", async () => {
    const h = harness();
    const archive = new File(["zip"], "holiday.zip", { type: "application/zip" });

    await h.app.start();
    h.recordRun.mockImplementation(async () => {
      throw new Error("storage full");
    });
    await h.app.handleArchive(archive);

    expect(h.last().recordError).toBe("holiday.zip: storage full");
  });
});
