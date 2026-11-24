<script lang="ts">
  type Props = {
    counts: { sorted: number; skipped: number; errors: number };
  };

  let { counts }: Props = $props();
</script>

<span class="tabular-nums">
  sorted: {counts.sorted} · skipped: {counts.skipped} · errors: {counts.errors}
</span>
