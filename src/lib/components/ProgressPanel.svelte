<script lang="ts">
  type Props = {
    percent: number;
    label: string;
    valueNow: number;
    caption?: string;
  };

  let { percent, label, valueNow, caption }: Props = $props();
</script>

<div class="flex flex-col gap-1">
  <div
    class="h-1 w-full overflow-hidden rounded-full bg-line"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={valueNow}
  >
    <div class="h-full bg-accent" style:width={`${percent}%`}></div>
  </div>
  {#if caption}
    <span class="text-xs text-ink-muted">{caption}</span>
  {/if}
</div>
