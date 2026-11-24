<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { createAuthClient } from "better-auth/client";

  import { sortArchive } from "./lib/archive/sort";
  import AccountPanel from "./lib/components/AccountPanel.svelte";
  import ArchiveResultCard from "./lib/components/ArchiveResultCard.svelte";
  import CategoriesField from "./lib/components/CategoriesField.svelte";
  import HistoryPanel from "./lib/components/HistoryPanel.svelte";
  import PhotoList from "./lib/components/PhotoList.svelte";
  import ProgressPanel from "./lib/components/ProgressPanel.svelte";
  import SourcePicker from "./lib/components/SourcePicker.svelte";
  import { createEngine } from "./lib/model/engine";
  import { createSorterController, type SorterSnapshot } from "./lib/sorter/controller";
  import { createSyncClient } from "./lib/sync/client";
  import { createSyncController, type RunStatus, type SyncController } from "./lib/sync/controller";
  import { openStore } from "./lib/sync/store";
  import type { SyncRun, SyncSettings } from "./lib/sync/types";

  const DEFAULT_LABELS = [
    "people",
    "food",
    "animals",
    "nature",
    "documents",
    "screenshots",
    "transport",
  ];

  const EMPTY_SORTER: SorterSnapshot = {
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

  const SYNC_PREF_KEY = "photo-sorter-sync-enabled";
  const authClient = createAuthClient();
  const syncClient = createSyncClient({ baseUrl: window.location.origin });

  let labelsText = $state(DEFAULT_LABELS.join("\n"));
  let sorterState = $state.raw<SorterSnapshot>(EMPTY_SORTER);
  let recordError = $state<string | null>(null);
  let sessionEmail = $state<string | null>(null);
  let syncEnabled = $state(false);
  let authBusy = $state(false);
  let authError = $state<string | null>(null);
  let syncNotice = $state<string | null>(null);
  let runs = $state<SyncRun[]>([]);
  let runStatuses = $state<Record<string, RunStatus>>({});
  let historyBusy = $state(false);
  let controller: SyncController | null = null;
  let destroyed = false;

  const labels = $derived(
    Array.from(
      new Set(
        labelsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ),
  );

  const archiveProgress = $derived(sorterState.archiveProgress);
  const archiveResult = $derived(sorterState.archiveResult);

  let progressSink: ((progress: { loaded: number; total: number }) => void) | null = null;

  const engine = createEngine({ onProgress: (next) => progressSink?.(next) });

  const sorter = createSorterController({
    classify: (file, nextLabels) => engine.classify(file, nextLabels),
    // The real sortArchive takes a 4th options object, not a bare callback.
    sortArchive: (file, nextLabels, classify, onProgress) =>
      sortArchive(file, nextLabels, classify, { onProgress }),
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    setProgressSink: (sink) => {
      progressSink = sink;
    },
    onSnapshot: (next) => {
      sorterState = next;
    },
  });

  onMount(() => {
    void (async () => {
      const store = await openStore();

      if (destroyed) {
        return;
      }

      controller = createSyncController({
        store,
        client: syncClient,
        // The only gate for every sync-network call: session AND explicit opt-in.
        canSync: () => sessionEmail !== null && syncEnabled,
        onSnapshot: (snapshot) => {
          if (destroyed) {
            return;
          }
          runs = snapshot.runs;
          runStatuses = snapshot.statuses;
          syncNotice = snapshot.notice;
        },
        onSettings: (settings) => {
          if (destroyed) {
            return;
          }
          labelsText = settings.labels.join("\n");
        },
        onUnauthorized: () => {
          sessionEmail = null;
          syncEnabled = false;
          localStorage.setItem(SYNC_PREF_KEY, "false");
          authError = "Сессия истекла. Войдите в аккаунт снова.";
          void controller?.stop();
        },
      });

      syncEnabled = localStorage.getItem(SYNC_PREF_KEY) === "true";
      await controller.load();

      // With sync off there is not even an auth request: zero /api traffic.
      if (syncEnabled) {
        const { data } = await authClient.getSession();

        if (destroyed) {
          return;
        }
        sessionEmail = data?.user.email ?? null;

        if (sessionEmail !== null) {
          await controller.queueAll();
          await controller.sync();
        }
      }
    })();

    return () => {
      destroyed = true;
    };
  });

  onDestroy(() => {
    destroyed = true;
    engine.dispose();
    sorter.dispose();
  });

  function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function signIn(email: string, password: string): Promise<void> {
    authBusy = true;
    authError = null;

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        authError = result.error.message ?? "Не удалось войти.";
        return;
      }
      sessionEmail = result.data?.user.email ?? null;
    } catch (error) {
      authError = messageOf(error);
    } finally {
      authBusy = false;
    }
  }

  async function signUp(email: string, password: string): Promise<void> {
    authBusy = true;
    authError = null;

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: email.split("@")[0] ?? "user",
      });

      if (result.error) {
        authError = result.error.message ?? "Не удалось зарегистрироваться.";
        return;
      }
      sessionEmail = result.data?.user.email ?? null;
    } catch (error) {
      authError = messageOf(error);
    } finally {
      authBusy = false;
    }
  }

  async function signOut(): Promise<void> {
    authBusy = true;
    authError = null;

    try {
      await authClient.signOut();
    } catch (error) {
      authError = messageOf(error);
    } finally {
      authBusy = false;
    }

    sessionEmail = null;
    syncEnabled = false;
    localStorage.setItem(SYNC_PREF_KEY, "false");
    await controller?.stop();
  }

  async function setSync(next: boolean): Promise<void> {
    syncEnabled = next;
    localStorage.setItem(SYNC_PREF_KEY, String(next));

    if (!next) {
      await controller?.stop();
      return;
    }

    if (sessionEmail !== null) {
      await controller?.queueAll();
      await controller?.sync();
    }
  }

  function persistLabels(): void {
    const next: SyncSettings = { labels: [...labels], updatedAt: Date.now() };

    void controller?.updateSettings(next);
  }

  function updateLabels(next: string): void {
    if (next === labelsText) {
      // CategoriesField repeats the value on `change`: that is the settings commit.
      persistLabels();
      return;
    }
    labelsText = next;
  }

  async function deleteRun(run: SyncRun): Promise<void> {
    historyBusy = true;

    try {
      await controller?.deleteRun(run);
    } finally {
      historyBusy = false;
    }
  }

  async function handleFiles(files: readonly File[]): Promise<void> {
    await sorter.classifyFiles(files, labels);
  }

  async function handleArchive(file: File): Promise<void> {
    recordError = null;
    const run = await sorter.sortArchiveFile(file, labels);

    if (run === null) {
      return;
    }

    try {
      await controller?.recordRun(run);
    } catch (error) {
      recordError = `${file.name}: ${messageOf(error)}`;
    }
  }
</script>

<main class="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">AI Photo Sorter</h1>
    <p class="text-sm text-ink-muted">MobileCLIP-B · инференс локально, файлы никуда не уходят</p>
  </header>

  <AccountPanel
    {syncEnabled}
    busy={authBusy}
    email={sessionEmail}
    error={authError}
    onSignIn={signIn}
    onSignUp={signUp}
    onSignOut={signOut}
    onSyncChange={(next) => void setSync(next)}
  />

  {#if syncNotice}
    <p class="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="status">{syncNotice}</p>
  {/if}

  <CategoriesField value={labelsText} onChange={updateLabels} />

  <SourcePicker
    disabled={sorterState.busy}
    pending={sorterState.pending}
    onFiles={(files) => void handleFiles(files)}
    onArchive={(file) => void handleArchive(file)}
  />

  {#if archiveProgress}
    <ProgressPanel
      label="Сортировка архива"
      percent={sorterState.archivePercent}
      valueNow={sorterState.archivePercent}
      caption={`${archiveProgress.done} / ${archiveProgress.total || "…"} · ${archiveProgress.current || "читаю архив…"}`}
    />
  {/if}

  {#if archiveResult}
    <ArchiveResultCard result={archiveResult} />
  {/if}

  {#if sorterState.loadingModel}
    <ProgressPanel
      label="Загрузка модели"
      percent={sorterState.percent}
      valueNow={sorterState.percent}
      caption={`модель: ${sorterState.percent}%`}
    />
  {/if}

  {#if sorterState.failure || recordError}
    <p class="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
      {sorterState.failure ?? recordError}
    </p>
  {/if}

  {#if sorterState.items.length === 0 && sorterState.pending === 0 && !sorterState.failure && !recordError && !archiveResult && !archiveProgress}
    <p class="text-sm text-ink-muted">
      Выберите фотографии или ZIP-архив — при первом запуске модель скачает ~145 МБ.
    </p>
  {/if}

  <PhotoList items={sorterState.items} />

  <HistoryPanel
    {runs}
    statuses={runStatuses}
    busy={historyBusy}
    onDelete={(run) => deleteRun(run)}
  />
</main>
