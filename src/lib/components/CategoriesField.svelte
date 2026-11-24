<script lang="ts">
  type Props = {
    value: string;
    onChange: (value: string) => void;
  };

  let { value, onChange }: Props = $props();
</script>

<label class="flex flex-col gap-2">
  <span class="text-sm font-medium text-ink">Categories — one per line</span>
  <span class="text-xs text-ink-muted">
    English only: MobileCLIP's text encoder understands English, so words in other languages give
    random results
  </span>
  <textarea
    {value}
    oninput={(event) => onChange(event.currentTarget.value)}
    onchange={(event) => onChange(event.currentTarget.value)}
    class="min-h-40 rounded-lg border border-line bg-panel p-3 font-mono text-sm text-ink transition outline-none focus-visible:border-accent-line focus-visible:ring-2 focus-visible:ring-focus"
  ></textarea>
</label>
