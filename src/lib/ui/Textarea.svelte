<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const textareaVariants = tv({
    base: "w-full resize-y rounded-lg border bg-panel px-3 py-2 text-sm text-ink transition-colors outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60",
    variants: {
      invalid: {
        true: "border-danger",
        false: "border-line",
      },
    },
    defaultVariants: {
      invalid: false,
    },
  });

  export type TextareaVariants = VariantProps<typeof textareaVariants>;
</script>

<script lang="ts">
  type Props = {
    value?: string;
    label?: string;
    hint?: string;
    error?: string;
    disabled?: boolean;
    placeholder?: string;
    id?: string;
    rows?: number;
  };

  let {
    value = $bindable(""),
    label,
    hint,
    error,
    disabled = false,
    placeholder,
    id,
    rows = 4,
  }: Props = $props();

  const uid = $props.id();
  const textareaId = $derived(id ?? uid);
  const hintId = $derived(`${textareaId}-hint`);
  const errorId = $derived(`${textareaId}-error`);
  const describedBy = $derived(
    [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined,
  );
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <label for={textareaId} class="text-sm font-medium text-ink">{label}</label>
  {/if}

  <textarea
    id={textareaId}
    {rows}
    {placeholder}
    {disabled}
    bind:value
    class={textareaVariants({ invalid: Boolean(error) })}
    aria-invalid={error ? "true" : undefined}
    aria-describedby={describedBy}
    aria-label={label ? undefined : "Input field"}></textarea>

  {#if hint}
    <p id={hintId} class="text-xs text-ink-muted">{hint}</p>
  {/if}

  {#if error}
    <p id={errorId} class="text-xs text-danger">{error}</p>
  {/if}
</div>
