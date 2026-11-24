<script lang="ts">
  import { Switch as SwitchUI } from "bits-ui";

  type Props = {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    description?: string;
    id?: string;
  };

  let { checked = $bindable(false), disabled = false, label, description, id }: Props = $props();

  const uid = $props.id();
  const rootId = $derived(id ?? uid);
  const labelId = $derived(`${rootId}-label`);
  const descriptionId = $derived(`${rootId}-description`);
</script>

<div class="flex items-center justify-between gap-4">
  {#if label || description}
    <div class="flex flex-col gap-0.5">
      {#if label}
        <span id={labelId} class="text-sm font-medium text-ink">{label}</span>
      {/if}
      {#if description}
        <span id={descriptionId} class="text-xs text-ink-muted">{description}</span>
      {/if}
    </div>
  {/if}

  <SwitchUI.Root
    bind:checked
    {disabled}
    id={rootId}
    class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line bg-line transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    aria-labelledby={label ? labelId : undefined}
    aria-describedby={description ? descriptionId : undefined}
    aria-label={label ? undefined : "Переключатель"}
  >
    <SwitchUI.Thumb
      class="pointer-events-none block size-4 rounded-full bg-panel shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
    />
  </SwitchUI.Root>
</div>
