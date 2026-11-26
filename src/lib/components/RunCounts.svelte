<script lang="ts">
  type Props = {
    counts: { sorted: number; skipped: number; errors: number; review?: number };
  };

  let { counts }: Props = $props();

  const label = $derived(
    `sorted: ${counts.sorted} · skipped: ${counts.skipped} · errors: ${counts.errors}${(counts.review ?? 0) > 0 ? ` · review: ${counts.review}` : ""}`,
  );
</script>

<span class="tabular-nums">{label}</span>
