<script lang="ts">
  import type { RunStatus } from "../sync/controller";
  import type { SyncRun } from "../sync/types";

  type Props = {
    runs: SyncRun[];
    statuses: Record<string, RunStatus>;
    busy: boolean;
    onDelete: (run: SyncRun) => Promise<void>;
    onDetails: (run: SyncRun) => Promise<void>;
  };

  let { runs, statuses, busy, onDelete, onDetails }: Props = $props();

  const STATUS_TEXT: Record<RunStatus, string> = {
    local: "локально",
    pending: "в очереди",
    synced: "синхронизировано",
    error: "ошибка",
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
    return new Date(timestamp).toLocaleString("ru-RU");
  }
</script>

<section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-sm font-semibold text-ink">История сортировок</h2>
    <span class="text-xs text-ink-muted">прогонов: {runs.length}</span>
  </div>

  <p class="text-xs text-ink-muted">
    Здесь сохраняется только отчёт: названия файлов и категории. Сами фото не сохраняются и из
    истории не восстанавливаются.
  </p>

  {#if ordered.length === 0}
    <p class="text-sm text-ink-muted">Пока нет сохранённых прогонов.</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each ordered as run (run.clientRunId)}
        {@const status = statusOf(run)}
        <li class="rounded-lg border border-line p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <button
              type="button"
              onclick={() => void toggle(run.clientRunId)}
              aria-expanded={expanded.has(run.clientRunId)}
              class="flex min-w-0 flex-col gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span class="truncate text-sm font-medium text-ink">{run.sourceName}</span>
              <span class="text-xs text-ink-muted">{formatDate(run.createdAt)}</span>
            </button>

            <div class="flex items-center gap-3">
              <span class={["text-xs", status === "error" ? "text-danger" : "text-ink-muted"]}>
                {STATUS_TEXT[status]}
              </span>
              <button
                type="button"
                onclick={() => onDelete(run)}
                class="rounded text-xs text-ink-muted underline transition outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
              >
                Удалить
              </button>
            </div>
          </div>

          <p class="mt-2 text-xs text-ink-muted">
            отсортировано: {run.counts.sorted} · пропущено: {run.counts.skipped} · ошибок:
            {run.counts.errors}
          </p>

          {#if expanded.has(run.clientRunId)}
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="text-ink-muted">
                    <th class="pr-2 pb-1 font-medium">Файл</th>
                    <th class="pr-2 pb-1 font-medium">Категория</th>
                    <th class="pr-2 pb-1 font-medium">Уверенность</th>
                    <th class="pb-1 font-medium">Статус</th>
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
                          ? "отсортирован"
                          : row.status === "skipped"
                            ? "пропущен"
                            : "ошибка"}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if run.rows.length === 0}
                <p class="py-1 text-xs text-ink-muted">Подробности строк недоступны.</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
