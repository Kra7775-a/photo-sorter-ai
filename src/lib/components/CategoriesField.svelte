<script lang="ts">
  import Textarea from "../ui/Textarea.svelte";

  type Props = {
    value: string;
    onChange: (value: string) => void;
  };

  let { value, onChange }: Props = $props();
</script>

<Textarea
  {value}
  label="Categories — one per line"
  hint="English only: MobileCLIP's text encoder understands English, so words in other languages give random results"
  rows={8}
  class="min-h-40 font-mono"
  oninput={onChange}
  onchange={onChange}
/>
