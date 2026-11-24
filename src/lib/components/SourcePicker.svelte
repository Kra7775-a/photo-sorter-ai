<script lang="ts">
  type Props = {
    disabled: boolean;
    pending: number;
    onFiles: (files: readonly File[]) => void;
    onArchive: (file: File) => void;
  };

  let { disabled, pending, onFiles, onArchive }: Props = $props();

  // File inputs share one look: native picker button themed via `file:` variants.
  const fileInputClass =
    "rounded-lg text-sm text-ink-muted outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-accent-line focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60";

  function pickPhotos(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    // Reset so picking the same file again still fires `change`.
    input.value = "";
    onFiles(files);
  }

  function pickArchive(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    // Allow picking the same archive again after a run.
    input.value = "";

    if (file) {
      onArchive(file);
    }
  }
</script>

<div class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
  <div class="flex flex-col gap-1">
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium text-ink">Отдельные фотографии</span>
      <input
        type="file"
        accept="image/*"
        multiple
        class={fileInputClass}
        {disabled}
        onchange={pickPhotos}
      />
    </label>
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
        {disabled}
        onchange={pickArchive}
      />
    </label>
  </div>

  {#if pending > 0}
    <span class="text-sm text-ink-muted" aria-live="polite">в работе: {pending}</span>
  {/if}
</div>
