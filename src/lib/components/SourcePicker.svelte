<script lang="ts">
  import Badge from "../ui/Badge.svelte";
  import Card from "../ui/Card.svelte";

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

<Card padding="sm">
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium text-ink">Individual photos</span>
      <input
        type="file"
        accept="image/*"
        multiple
        class={fileInputClass}
        {disabled}
        onchange={pickPhotos}
      />
    </label>

    <div class="flex flex-col gap-1 border-t border-line pt-3">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium text-ink">Or a ZIP archive</span>
        <span class="text-xs text-ink-muted">
          Photos are classified and returned in a new archive, sorted into category folders. A
          report.csv with the results is added to the root.
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
      <Badge tone="accent" live="polite">processing: {pending}</Badge>
    {/if}
  </div>
</Card>
