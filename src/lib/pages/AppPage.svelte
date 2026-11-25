<script lang="ts">
  import { getAppContext } from "../app/context";
  import AppHeader from "../components/AppHeader.svelte";
  import ArchiveResultCard from "../components/ArchiveResultCard.svelte";
  import CategoriesField from "../components/CategoriesField.svelte";
  import HistoryPanel from "../components/HistoryPanel.svelte";
  import PhotoList from "../components/PhotoList.svelte";
  import ProgressPanel from "../components/ProgressPanel.svelte";
  import SourcePicker from "../components/SourcePicker.svelte";
  import Alert from "../ui/Alert.svelte";
  import Card from "../ui/Card.svelte";

  const { app, view: readView } = getAppContext();
  let view = $derived(readView());
</script>

<svelte:head>
  <title>Sorter — AI Photo Sorter</title>
</svelte:head>

<AppHeader />

<main class="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
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
  <section id="history" class="scroll-mt-6">
    <HistoryPanel
      runs={view.runs}
      statuses={view.runStatuses}
      busy={view.historyBusy}
      onDelete={(run) => app.deleteRun(run)}
      onDetails={(run) => app.loadDetails(run)}
    />
  </section>
</main>
