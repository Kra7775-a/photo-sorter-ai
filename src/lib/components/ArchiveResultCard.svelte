<script lang="ts">
  import type { ArchiveView } from "../sorter/controller";
  import Alert from "../ui/Alert.svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import RunCounts from "./RunCounts.svelte";

  type Props = {
    result: ArchiveView;
  };

  let { result }: Props = $props();
</script>

<Alert tone="accent">
  <div class="flex flex-wrap items-center gap-3">
    <Button href={result.url} download={result.name} size="sm">
      Download {result.name}
    </Button>
    <Badge tone="accent">
      <RunCounts counts={result.counts} />
    </Badge>
  </div>

  {#if result.failures.length > 0}
    <details class="text-xs">
      <summary class="cursor-pointer text-ink-muted">Files with errors</summary>
      <ul class="mt-2 flex flex-col gap-1">
        {#each result.failures as issue (issue.source)}
          <li class="break-all">
            <span class="font-medium text-ink">{issue.source}</span> — {issue.error}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</Alert>
