<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { createAuthClient } from "better-auth/client";

  import { createAppController, emptyAppSnapshot, type AppSnapshot } from "./lib/app/controller";
  import { sortArchive } from "./lib/archive/sort";
  import AccountPanel from "./lib/components/AccountPanel.svelte";
  import ArchiveResultCard from "./lib/components/ArchiveResultCard.svelte";
  import CategoriesField from "./lib/components/CategoriesField.svelte";
  import HistoryPanel from "./lib/components/HistoryPanel.svelte";
  import PhotoList from "./lib/components/PhotoList.svelte";
  import ProgressPanel from "./lib/components/ProgressPanel.svelte";
  import SourcePicker from "./lib/components/SourcePicker.svelte";
  import { createEngine } from "./lib/model/engine";
  import { createSyncClient } from "./lib/sync/client";
  import { createSyncController } from "./lib/sync/controller";
  import { openStore } from "./lib/sync/store";
  import Alert from "./lib/ui/Alert.svelte";
  import Card from "./lib/ui/Card.svelte";
  import Icon from "./lib/ui/Icon.svelte";

  let view = $state.raw<AppSnapshot>(emptyAppSnapshot());
  const app = createAppController({
    authClient: createAuthClient(),
    syncClient: createSyncClient({ baseUrl: window.location.origin }),
    createEngine,
    sortArchive,
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    storage: localStorage,
    cookie: () => document.cookie,
    openStore,
    createSyncController,
    onSnapshot: (snapshot) => {
      view = snapshot;
    },
  });
  onMount(() => {
    void app.start();
    return () => app.stop();
  });
  onDestroy(() => {
    app.dispose();
    app.stop();
  });
</script>

<main class="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
  <header class="flex flex-col gap-1">
    <h1 class="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
      <Icon name="brand" size={24} />
      AI Photo Sorter
    </h1>
    <p class="text-sm text-ink-muted">MobileCLIP-B · runs locally, files never leave your device</p>
  </header>
  <AccountPanel
    syncEnabled={view.account.syncEnabled}
    busy={view.account.busy}
    email={view.account.email}
    error={view.account.error}
    onSignIn={(email, password) => app.signIn(email, password)}
    onSignUp={(email, password) => app.signUp(email, password)}
    onSignOut={() => app.signOut()}
    onDeleteAccount={(password) => app.deleteAccount(password)}
    onSyncChange={(next) => void app.setSync(next)}
  />
  {#if view.syncNotice}
    <Alert tone="danger" role="status">{view.syncNotice}</Alert>
  {/if}
  <CategoriesField value={view.labelsText} onChange={(next) => app.updateLabels(next)} />
  <SourcePicker
    disabled={view.sorter.busy}
    pending={view.sorter.pending}
    onFiles={(files) => void app.handleFiles(files)}
    onArchive={(file) => void app.handleArchive(file)}
  />
  {#if view.sorter.archiveProgress}
    <ProgressPanel
      label="Sorting archive"
      percent={view.sorter.archivePercent}
      valueNow={view.sorter.archivePercent}
      caption={`${view.sorter.archiveProgress.done} / ${view.sorter.archiveProgress.total || "…"} · ${view.sorter.archiveProgress.current || "reading archive…"}`}
    />
  {/if}
  {#if view.sorter.archiveResult}
    <ArchiveResultCard result={view.sorter.archiveResult} />
  {/if}
  {#if view.sorter.loadingModel}
    <ProgressPanel
      label="Loading model"
      percent={view.sorter.percent}
      valueNow={view.sorter.percent}
      caption={`model: ${view.sorter.percent}%`}
    />
  {/if}
  {#if view.sorter.failure || view.recordError}
    <Alert tone="danger" role="alert">{view.sorter.failure ?? view.recordError}</Alert>
  {/if}
  {#if view.sorter.items.length === 0 && view.sorter.pending === 0 && !view.sorter.failure && !view.recordError && !view.sorter.archiveResult && !view.sorter.archiveProgress}
    <Card padding="sm">
      <p class="text-sm text-ink-muted">
        Choose photos or a ZIP archive — the model downloads ~145 MB on first run.
      </p>
    </Card>
  {/if}
  <PhotoList items={view.sorter.items} />
  <HistoryPanel
    runs={view.runs}
    statuses={view.runStatuses}
    busy={view.historyBusy}
    onDelete={(run) => app.deleteRun(run)}
    onDetails={(run) => app.loadDetails(run)}
  />
</main>
