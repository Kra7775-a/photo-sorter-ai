<script lang="ts">
  import type { ArchiveView } from "../sorter/controller";

  type Props = {
    result: ArchiveView;
  };

  let { result }: Props = $props();
</script>

<div
  class="flex flex-col gap-2 rounded-xl border border-accent-line bg-accent-soft p-4"
  aria-live="polite"
>
  <div class="flex flex-wrap items-center gap-3">
    <a
      href={result.url}
      download={result.name}
      class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent transition outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus"
    >
      Скачать {result.name}
    </a>
    <span class="text-xs text-ink-muted">
      отсортировано: {result.counts.sorted} · пропущено: {result.counts.skipped} · ошибок:
      {result.counts.errors}
    </span>
  </div>

  {#if result.failures.length > 0}
    <details class="text-xs">
      <summary class="cursor-pointer text-ink-muted">Файлы с ошибками</summary>
      <ul class="mt-2 flex flex-col gap-1">
        {#each result.failures as issue (issue.source)}
          <li class="break-all">
            <span class="font-medium text-ink">{issue.source}</span> — {issue.error}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>
