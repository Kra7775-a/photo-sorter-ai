<script lang="ts">
  import type { SorterItem } from "../sorter/controller";
  import Badge from "../ui/Badge.svelte";
  import Card from "../ui/Card.svelte";

  type Props = {
    items: SorterItem[];
  };

  let { items }: Props = $props();
</script>

<ul class="flex flex-col gap-3">
  {#each items as item (item.id)}
    <li>
      <Card padding="sm">
        <div class="flex items-center gap-4">
          <img
            src={item.url}
            alt=""
            class="size-16 rounded-lg object-cover"
            loading="lazy"
            decoding="async"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="truncate text-sm font-medium text-ink">{item.name}</span>
            <span class="text-xs text-ink-muted">{item.ms} ms</span>
            <div class="flex flex-wrap gap-2">
              {#each item.scores as score (score.label)}
                <Badge tone="accent">
                  {score.label} · {Math.round(score.score * 100)}%
                </Badge>
              {/each}
            </div>
          </div>
        </div>
      </Card>
    </li>
  {/each}
</ul>
