import { describe, expect, mock, test } from "bun:test";

import { NetworkError, QuotaError, UnauthorizedError, type SyncClient } from "./client";
import { createSyncController, type SyncController, type SyncSnapshot } from "./controller";
import type { SyncStore } from "./store";
import type { SyncRun, SyncSettings } from "./types";

const run: SyncRun = {
  clientRunId: "client-1",
  sourceName: "holiday.zip",
  createdAt: 1_700_000_000_000,
  counts: { sorted: 2, skipped: 1, errors: 0 },
  rows: [],
};

type StoreState = {
  runs: SyncRun[];
  settings: SyncSettings | null;
  outbox: string[];
};

function memoryStore(initial: Partial<StoreState> = {}): { store: SyncStore; state: StoreState } {
  const state: StoreState = {
    runs: initial.runs ?? [],
    settings: initial.settings ?? null,
    outbox: initial.outbox ?? [],
  };

  const store: SyncStore = {
    getRuns: async () => [...state.runs],
    putRuns: async (incoming) => {
      for (const item of incoming) {
        const index = state.runs.findIndex((value) => value.clientRunId === item.clientRunId);

        if (index === -1) {
          state.runs.push(item);
        } else {
          state.runs[index] = item;
        }
      }
    },
    deleteRuns: async (ids) => {
      state.runs = state.runs.filter((value) => !ids.includes(value.clientRunId));
    },
    getSettings: async () => state.settings,
    putSettings: async (value) => {
      state.settings = value;
    },
    getOutbox: async () => [...state.outbox],
    setOutbox: async (ids) => {
      state.outbox = [...ids];
    },
  };

  return { store, state };
}

function harness(initial: Partial<StoreState> = {}) {
  const { store, state } = memoryStore(initial);
  const pushRun = mock<SyncClient["pushRun"]>(async () => "srv-1");
  const pullRuns = mock<SyncClient["pullRuns"]>(async () => []);
  const getRun = mock<SyncClient["getRun"]>(async (id) => ({ ...run, serverId: id }));
  const deleteRun = mock<SyncClient["deleteRun"]>(async () => undefined);
  const pushSettings = mock<SyncClient["pushSettings"]>(async (value) => value);
  const pullSettings = mock<SyncClient["pullSettings"]>(async () => null);
  const client: SyncClient = { pushRun, pullRuns, getRun, deleteRun, pushSettings, pullSettings };

  let canSync = false;
  let unauthorizedCalls = 0;
  const snapshots: SyncSnapshot[] = [];
  const settingsSeen: SyncSettings[] = [];
  const controller: SyncController = createSyncController({
    store,
    client,
    canSync: () => canSync,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onSettings: (settings) => settingsSeen.push(settings),
    onUnauthorized: () => {
      unauthorizedCalls += 1;
      canSync = false;
    },
  });

  return {
    controller,
    state,
    pushRun,
    pullRuns,
    deleteRun,
    pushSettings,
    pullSettings,
    snapshots,
    settingsSeen,
    enable: () => {
      canSync = true;
    },
    disable: () => {
      canSync = false;
    },
    unauthorizedCalls: () => unauthorizedCalls,
    last: (): SyncSnapshot => {
      const last = snapshots.at(-1);

      if (last === undefined) {
        throw new Error("No snapshot emitted");
      }
      return last;
    },
  };
}

describe("createSyncController", () => {
  test("never touches the network or the outbox while sync is off", async () => {
    const h = harness({ runs: [run] });

    await h.controller.load();
    await h.controller.sync();
    await h.controller.queueAll();
    await h.controller.recordRun({ ...run, clientRunId: "local-2" });
    await h.controller.updateSettings({ labels: ["cats"], updatedAt: 100 });

    expect(h.pushRun).not.toHaveBeenCalled();
    expect(h.pullRuns).not.toHaveBeenCalled();
    expect(h.pullSettings).not.toHaveBeenCalled();
    expect(h.pushSettings).not.toHaveBeenCalled();
    expect(h.deleteRun).not.toHaveBeenCalled();
    expect(h.state.outbox).toEqual([]);
    expect(h.state.runs.map((value) => value.clientRunId)).toEqual(["client-1", "local-2"]);
    expect(h.last().statuses["local-2"]).toBe("local");
  });

  test("loads local data and marks queued runs", async () => {
    const settings: SyncSettings = { labels: ["cats"], updatedAt: 42 };
    const h = harness({ runs: [run], outbox: [run.clientRunId], settings });

    await h.controller.load();

    expect(h.settingsSeen).toEqual([settings]);
    expect(h.last().statuses[run.clientRunId]).toBe("pending");
  });

  test("persists a run always, and pushes it once sync is enabled", async () => {
    const h = harness();

    h.enable();
    await h.controller.recordRun(run);

    expect(h.pushRun).toHaveBeenCalledTimes(1);
    expect(h.state.outbox).toEqual([]);
    expect(h.state.runs[0]?.serverId).toBe("srv-1");
    expect(h.last().statuses[run.clientRunId]).toBe("synced");
  });

  test("keeps a failed run in the outbox with an error status", async () => {
    const h = harness();

    h.pushRun.mockImplementation(async () => {
      throw new NetworkError(new Error("offline"));
    });
    h.enable();
    await h.controller.recordRun(run);

    expect(h.state.outbox).toEqual([run.clientRunId]);
    expect(h.last().statuses[run.clientRunId]).toBe("error");
    expect(h.last().notice).toBe("Нет соединения: прогоны останутся в очереди.");
  });

  test("merges remote runs and settings with local data", async () => {
    const remote: SyncRun = { ...run, clientRunId: "remote-1", serverId: "srv-2" };
    const settings: SyncSettings = { labels: ["remote"], updatedAt: 500 };
    const h = harness();

    h.pullRuns.mockImplementation(async () => [remote]);
    h.pullSettings.mockImplementation(async () => settings);
    h.enable();
    await h.controller.sync();

    expect(h.state.runs).toContainEqual(remote);
    expect(h.state.settings).toEqual(settings);
    expect(h.settingsSeen).toEqual([settings]);
  });

  test("pulling the rowless list does not erase local report rows", async () => {
    const rows: SyncRun["rows"] = [
      { source: "a.jpg", category: "people", score: 0.9, status: "sorted", error: "" },
    ];
    const h = harness({ runs: [{ ...run, rows }] });

    await h.controller.load();
    h.pullRuns.mockImplementation(async () => [{ ...run, serverId: "srv-1", rows: [] }]);
    h.enable();
    await h.controller.sync();

    expect(h.state.runs[0]?.rows).toEqual(rows);
    expect(h.state.runs[0]?.serverId).toBe("srv-1");
  });

  test("settings are last-write-wins and only pushed when sync is on", async () => {
    const h = harness();

    await h.controller.updateSettings({ labels: ["old"], updatedAt: 100 });
    expect(h.pushSettings).not.toHaveBeenCalled();

    h.enable();
    await h.controller.updateSettings({ labels: ["new"], updatedAt: 200 });
    expect(h.pushSettings).toHaveBeenCalledTimes(1);
    expect(h.state.settings).toEqual({ labels: ["new"], updatedAt: 200 });

    await h.controller.updateSettings({ labels: ["stale"], updatedAt: 50 });
    expect(h.state.settings).toEqual({ labels: ["new"], updatedAt: 200 });
    expect(h.pushSettings).toHaveBeenCalledTimes(2);
  });

  test("an expired session stops sync and asks for re-login", async () => {
    const h = harness();

    h.pushRun.mockImplementation(async () => {
      throw new UnauthorizedError();
    });
    h.enable();
    await h.controller.recordRun(run);

    expect(h.unauthorizedCalls()).toBe(1);
    expect(h.pullRuns).not.toHaveBeenCalled();
    expect(h.last().notice).toBe("Сессия истекла. Войдите в аккаунт снова.");
  });

  test("a quota error is reported without dropping the local run", async () => {
    const h = harness({ runs: [{ ...run, serverId: "srv-1" }] });

    h.deleteRun.mockImplementation(async () => {
      throw new QuotaError();
    });
    h.enable();
    await h.controller.deleteRun({ ...run, serverId: "srv-1" });

    expect(h.state.runs).toHaveLength(1);
    expect(h.last().notice).toBe("Превышен лимит сервера: данные не синхронизированы.");
  });

  test("deleting a synced run removes both copies", async () => {
    const h = harness({ runs: [{ ...run, serverId: "srv-1" }] });

    h.enable();
    await h.controller.deleteRun({ ...run, serverId: "srv-1" });

    expect(h.deleteRun).toHaveBeenCalledWith("srv-1");
    expect(h.state.runs).toEqual([]);
  });

  test("stopping sync clears the outbox without any request", async () => {
    const h = harness({ runs: [run], outbox: [run.clientRunId] });

    await h.controller.load();
    h.enable();
    await h.controller.stop();

    expect(h.state.outbox).toEqual([]);
    expect(h.pushRun).not.toHaveBeenCalled();
    expect(h.last().statuses[run.clientRunId]).toBe("local");
  });

  test("a generic push error marks the run failed", async () => {
    const h = harness();

    h.pushRun.mockImplementation(async () => {
      throw new Error("boom");
    });
    h.enable();
    await h.controller.recordRun(run);

    expect(h.last().notice).toBe("Не удалось синхронизировать данные.");
    expect(h.last().statuses[run.clientRunId]).toBe("error");
    expect(h.state.runs).toHaveLength(1);
  });

  test("a failed settings push is reported locally without losing labels", async () => {
    const h = harness();

    h.pushSettings.mockImplementation(async () => {
      throw new Error("boom");
    });
    h.enable();
    await h.controller.updateSettings({ labels: ["cats"], updatedAt: 100 });

    expect(h.state.settings).toEqual({ labels: ["cats"], updatedAt: 100 });
    expect(h.last().notice).toBe("Не удалось синхронизировать данные.");
  });

  test("queueAll marks local runs as pending only when sync is on", async () => {
    const h = harness({ runs: [run, { ...run, clientRunId: "synced", serverId: "srv-9" }] });

    await h.controller.load();
    await h.controller.queueAll();
    expect(h.state.outbox).toEqual([]);

    h.enable();
    await h.controller.queueAll();
    expect(h.state.outbox).toEqual([run.clientRunId]);
    expect(h.last().statuses[run.clientRunId]).toBe("pending");
  });

  test("sync stops immediately if the session drops mid-upload", async () => {
    const h = harness({ runs: [run], outbox: [run.clientRunId] });

    h.pushRun.mockImplementation(async () => {
      h.disable();
      return "srv-1";
    });
    h.enable();
    await h.controller.load();
    await h.controller.sync();

    expect(h.state.runs[0]?.serverId).toBe("srv-1");
    expect(h.pullRuns).not.toHaveBeenCalled();
    expect(h.last().statuses[run.clientRunId]).toBe("synced");
  });

  test("stale outbox ids are dropped during sync", async () => {
    const h = harness({ outbox: ["ghost"] });

    h.enable();
    await h.controller.load();
    await h.controller.sync();

    expect(h.state.outbox).toEqual([]);
    expect(h.pushRun).not.toHaveBeenCalled();
  });

  test("sync stops before pulling settings if the session drops", async () => {
    const h = harness();

    h.pullRuns.mockImplementation(async () => {
      h.disable();
      return [];
    });
    h.enable();
    await h.controller.sync();

    expect(h.pullSettings).not.toHaveBeenCalled();
  });

  test("a failed pull is reported without dropping local runs", async () => {
    const h = harness({ runs: [run] });

    h.pullRuns.mockImplementation(async () => {
      throw new Error("boom");
    });
    h.enable();
    await h.controller.load();
    await h.controller.sync();

    expect(h.last().notice).toBe("Не удалось синхронизировать данные.");
    expect(h.state.runs).toEqual([run]);
  });
});
