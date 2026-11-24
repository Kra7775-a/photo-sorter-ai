<script lang="ts">
  import type { SorterItem } from "../sorter/controller";

  type Props = {
    items: SorterItem[];
  };

  let { items }: Props = $props();
</script>

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
