<script lang="ts">
  import type { RunStatus } from "../sync/controller";
  import type { SyncRun } from "../sync/types";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import Card from "../ui/Card.svelte";
  import RunCounts from "./RunCounts.svelte";

  type Props = {
    runs: SyncRun[];
    statuses: Record<string, RunStatus>;
    busy: boolean;
    onDelete: (run: SyncRun) => Promise<void>;
    onDetails: (run: SyncRun) => Promise<void>;
  };

  let { runs, statuses, busy, onDelete, onDetails }: Props = $props();

  const STATUS: Record<RunStatus, { text: string; tone: "neutral" | "accent" | "danger" }> = {
    local: { text: "local", tone: "neutral" },
    pending: { text: "queued", tone: "accent" },
    synced: { text: "synced", tone: "accent" },
    error: { text: "error", tone: "danger" },
  };

  const ordered = $derived([...runs].sort((left, right) => right.createdAt - left.createdAt));
  let expanded = $state<Set<string>>(new Set());

  async function toggle(id: string): Promise<void> {
    const next = new Set(expanded);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      const run = runs.find((item) => item.clientRunId === id);

      if (run !== undefined) {
        await onDetails(run);
      }
    }
    expanded = next;
  }

  function statusOf(run: SyncRun): RunStatus {
    return statuses[run.clientRunId] ?? "local";
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString("en-US");
  }
</script>

<Card padding="sm">
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink">Sorting history</h2>
      <span class="text-xs text-ink-muted">runs: {runs.length}</span>
    </div>

    <p class="text-xs text-ink-muted">
      Only the report is stored here: file names and categories. Photos are not saved and cannot be
      restored from history.
    </p>

    {#if ordered.length === 0}
      <p class="text-sm text-ink-muted">No saved runs yet.</p>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each ordered as run (run.clientRunId)}
          {@const status = statusOf(run)}
          <li>
            <Card padding="sm">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onclick={() => void toggle(run.clientRunId)}
                  aria-expanded={expanded.has(run.clientRunId)}
                  class="flex min-w-0 flex-col gap-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span class="truncate text-sm font-medium text-ink">{run.sourceName}</span>
                  <span class="text-xs text-ink-muted">{formatDate(run.createdAt)}</span>
                </button>

                <div class="flex items-center gap-3">
                  <Badge tone={STATUS[status].tone}>{STATUS[status].text}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => onDelete(run)}
                    disabled={busy}
                    class="min-h-6 text-ink-muted underline hover:text-danger"
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <p class="mt-2 text-xs text-ink-muted">
                <RunCounts counts={run.counts} />
              </p>

              {#if expanded.has(run.clientRunId)}
                <div class="mt-2 overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="text-ink-muted">
                        <th class="pr-2 pb-1 font-medium">File</th>
                        <th class="pr-2 pb-1 font-medium">Category</th>
                        <th class="pr-2 pb-1 font-medium">Confidence</th>
                        <th class="pb-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each run.rows as row (row.source)}
                        <tr class="border-t border-line align-top">
                          <td class="py-1 pr-2 break-all text-ink">{row.source}</td>
                          <td class="py-1 pr-2">{row.category}</td>
                          <td class="py-1 pr-2">
                            {row.score === null ? "—" : `${Math.round(row.score * 100)}%`}
                          </td>
                          <td class="py-1">
                            {row.status === "sorted"
                              ? "sorted"
                              : row.status === "skipped"
                                ? "skipped"
                                : "error"}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if run.rows.length === 0}
                    <p class="py-1 text-xs text-ink-muted">Row details unavailable.</p>
                  {/if}
                </div>
              {/if}
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Card>
