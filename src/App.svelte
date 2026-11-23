<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { createAuthClient } from "better-auth/client";

  import { sortArchive, type ArchiveProgress } from "./lib/archive/sort";
  import AccountPanel from "./lib/components/AccountPanel.svelte";
  import HistoryPanel from "./lib/components/HistoryPanel.svelte";
  import { createEngine } from "./lib/model/engine";
  import type { Score } from "./lib/model/protocol";
  import { createSyncClient } from "./lib/sync/client";
  import { createSyncController, type RunStatus, type SyncController } from "./lib/sync/controller";
  import { openStore } from "./lib/sync/store";
  import type { SyncRun, SyncSettings } from "./lib/sync/types";

  type Item = {
    id: number;
    ms: number;
    name: string;
    scores: Score[];
    url: string;
  };

  type ArchiveResult = {
    url: string;
    name: string;
    counts: { sorted: number; skipped: number; errors: number };
    failures: { source: string; error: string }[];
  };

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
  const authClient = createAuthClient();
  const syncClient = createSyncClient({ baseUrl: window.location.origin });

  let labelsText = $state(DEFAULT_LABELS.join("\n"));
  let items = $state<Item[]>([]);
  let progress = $state<{ loaded: number; total: number } | null>(null);
  let pending = $state(0);
  let failure = $state<string | null>(null);
  let archiveProgress = $state<ArchiveProgress | null>(null);
  let archiveResult = $state<ArchiveResult | null>(null);
  let archiveBusy = $state(false);
  let sessionEmail = $state<string | null>(null);
  let syncEnabled = $state(false);
  let authBusy = $state(false);
  let authError = $state<string | null>(null);
  let syncNotice = $state<string | null>(null);
  let runs = $state<SyncRun[]>([]);
  let runStatuses = $state<Record<string, RunStatus>>({});
  let historyBusy = $state(false);
  let controller: SyncController | null = null;
  let counter = 0;
  let destroyed = false;

  const engine = createEngine({
    onProgress: (next) => {
      progress = next;
    },
  });

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

  const percent = $derived(
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : 0,
  );

  const loadingModel = $derived(
    pending > 0 && progress !== null && progress.loaded < progress.total,
  );

  const archivePercent = $derived(
    archiveProgress && archiveProgress.total > 0
      ? Math.min(100, Math.round((archiveProgress.done / archiveProgress.total) * 100))
      : 0,
  );

  const busy = $derived(archiveBusy || pending > 0);

  // File inputs share one look: native picker button themed via `file:` variants.
  const fileInputClass =
    "rounded-lg text-sm text-ink-muted outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-accent-line focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60";

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

    for (const item of items) {
      URL.revokeObjectURL(item.url);
    }

    if (archiveResult) {
      URL.revokeObjectURL(archiveResult.url);
    }
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

  async function deleteRun(run: SyncRun): Promise<void> {
    historyBusy = true;

    try {
      await controller?.deleteRun(run);
    } finally {
      historyBusy = false;
    }
  }

  /**
   * Processes a list of files for classification against current labels.
   * @param files - Array of files to classify.
   * @returns Promise that resolves when all files are processed.
   */
  async function handleFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    if (labels.length === 0) {
      failure = "Добавьте хотя бы одну категорию";
      return;
    }

    failure = null;
    pending += files.length;

    // Keep one batch on one label set even if the textarea changes mid-way.
    const activeLabels = [...labels];

    for (const file of files) {
      try {
        const result = await engine.classify(file, activeLabels);

        counter += 1;
        items.unshift({
          id: counter,
          ms: result.ms,
          name: file.name,
          scores: result.scores,
          url: URL.createObjectURL(file),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        failure = `${file.name}: ${message}`;
      } finally {
        pending -= 1;
      }
    }
  }

  /**
   * Handles file input change events for individual photo uploads.
   * @param event - The input change event.
   */
  function handleFileInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    // Reset so picking the same file again still fires `change`.
    input.value = "";

    void handleFiles(files);
  }

  /**
   * Handles the processing of a ZIP archive, including classification and reporting.
   * @param file - The ZIP file to process.
   * @returns Promise that resolves when the archive processing is complete.
   */
  async function handleArchive(file: File): Promise<void> {
    if (archiveBusy) {
      return;
    }

    if (labels.length === 0) {
      failure = "Добавьте хотя бы одну категорию";
      return;
    }

    failure = null;
    archiveBusy = true;
    archiveProgress = { done: 0, total: 0, current: file.name };

    if (archiveResult) {
      URL.revokeObjectURL(archiveResult.url);
      archiveResult = null;
    }

    // One archive is processed with the labels it started with.
    const activeLabels = [...labels];

    try {
      const result = await sortArchive(file, activeLabels, engine.classify, {
        onProgress: (next) => {
          archiveProgress = next;
        },
      });

      if (destroyed) {
        return;
      }

      archiveResult = {
        counts: result.counts,
        failures: result.report
          .filter((row) => row.status === "error")
          .map((row) => ({ error: row.error, source: row.source })),
        name: result.fileName,
        url: URL.createObjectURL(result.blob),
      };

      // The report always lives locally; only the outbox destination depends on
      // being logged in with sync explicitly enabled.
      const run: SyncRun = {
        clientRunId: crypto.randomUUID(),
        sourceName: result.fileName,
        createdAt: Date.now(),
        counts: result.counts,
        rows: result.report,
      };

      await controller?.recordRun(run);
    } catch (error) {
      if (!destroyed) {
        const message = error instanceof Error ? error.message : String(error);

        failure = `${file.name}: ${message}`;
      }
    } finally {
      archiveBusy = false;
      archiveProgress = null;
    }
  }

  /**
   * Handles file input change events for ZIP archive uploads.
   * @param event - The input change event.
   */
  function handleArchiveInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    // Allow picking the same archive again after a run.
    input.value = "";

    if (file) {
      void handleArchive(file);
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

  <label class="flex flex-col gap-2">
    <span class="text-sm font-medium text-ink">Категории — по одной на строку</span>
    <span class="text-xs text-ink-muted">
      только английский: текстовый энкодер MobileCLIP англоязычный, русские слова дают случайные
      результаты
    </span>
    <textarea
      bind:value={labelsText}
      onchange={persistLabels}
      class="min-h-40 rounded-lg border border-line bg-panel p-3 font-mono text-sm text-ink transition outline-none focus-visible:border-accent-line focus-visible:ring-2 focus-visible:ring-focus"
    ></textarea>
  </label>

  <div class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
    <div class="flex flex-col gap-1">
      <span class="text-sm font-medium text-ink">Отдельные фотографии</span>
      <input
        type="file"
        accept="image/*"
        multiple
        class={fileInputClass}
        disabled={busy}
        onchange={handleFileInput}
      />
    </div>

    <div class="flex flex-col gap-1 border-t border-line pt-3">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium text-ink">Или ZIP-архив</span>
        <span class="text-xs text-ink-muted">
          Фото пройдут классификацию и вернутся в новом архиве, разложенные по папкам категорий. В
          корень добавится report.csv с результатами.
        </span>
        <input
          type="file"
          accept=".zip,application/zip"
          class={fileInputClass}
          disabled={busy}
          onchange={handleArchiveInput}
        />
      </label>
    </div>

    {#if pending > 0}
      <span class="text-sm text-ink-muted" aria-live="polite">в работе: {pending}</span>
    {/if}
  </div>

  {#if archiveProgress}
    <div class="flex flex-col gap-1">
      <div
        class="h-1 w-full overflow-hidden rounded bg-line"
        role="progressbar"
        aria-label="Сортировка архива"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={archivePercent}
      >
        <div class="h-full bg-accent" style:width={`${archivePercent}%`}></div>
      </div>
      <span class="text-xs text-ink-muted">
        {archiveProgress.done} / {archiveProgress.total || "…"}
        · {archiveProgress.current || "читаю архив…"}
      </span>
    </div>
  {/if}

  {#if archiveResult}
    <div
      class="flex flex-col gap-2 rounded-xl border border-accent-line bg-accent-soft p-4"
      aria-live="polite"
    >
      <div class="flex flex-wrap items-center gap-3">
        <a
          href={archiveResult.url}
          download={archiveResult.name}
          class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus"
        >
          Скачать {archiveResult.name}
        </a>
        <span class="text-xs text-ink-muted">
          отсортировано: {archiveResult.counts.sorted} · пропущено: {archiveResult.counts.skipped} · ошибок:
          {archiveResult.counts.errors}
        </span>
      </div>

      {#if archiveResult.failures.length > 0}
        <details class="text-xs">
          <summary class="cursor-pointer text-ink-muted">Файлы с ошибками</summary>
          <ul class="mt-2 flex flex-col gap-1">
            {#each archiveResult.failures as issue (issue.source)}
              <li class="break-all">
                <span class="font-medium text-ink">{issue.source}</span> — {issue.error}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  {/if}

  {#if loadingModel}
    <div class="flex flex-col gap-1">
      <div
        class="h-1 w-full overflow-hidden rounded bg-line"
        role="progressbar"
        aria-label="Загрузка модели"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div class="h-full bg-accent" style:width={`${percent}%`}></div>
      </div>
      <span class="text-xs text-ink-muted">модель: {percent}%</span>
    </div>
  {/if}

  {#if failure}
    <p class="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
      {failure}
    </p>
  {/if}

  {#if items.length === 0 && pending === 0 && !failure && !archiveResult && !archiveProgress}
    <p class="text-sm text-ink-muted">
      Выберите фотографии или ZIP-архив — при первом запуске модель скачает ~145 МБ.
    </p>
  {/if}

  <ul class="flex flex-col gap-3">
    {#each items as item (item.id)}
      <li class="flex items-center gap-4 rounded-xl border border-line bg-panel p-3">
        <img
          src={item.url}
          alt=""
          class="size-16 rounded-lg object-cover"
          loading="lazy"
          decoding="async"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-sm font-medium text-ink">{item.name}</span>
          <span class="text-xs text-ink-muted">{item.ms} мс</span>
          <div class="flex flex-wrap gap-2">
            {#each item.scores as score (score.label)}
              <span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-ink">
                {score.label} · {Math.round(score.score * 100)}%
              </span>
            {/each}
          </div>
        </div>
      </li>
    {/each}
  </ul>

  <HistoryPanel
    {runs}
    statuses={runStatuses}
    busy={historyBusy}
    onDelete={(run) => deleteRun(run)}
  />
</main>
