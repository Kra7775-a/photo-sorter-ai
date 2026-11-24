<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const textFieldVariants = tv({
    base: "h-10 w-full rounded-lg border bg-panel px-3 text-sm text-ink transition-colors outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60",
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

  export type TextFieldVariants = VariantProps<typeof textFieldVariants>;
</script>

<script lang="ts">
  type Props = {
    value?: string;
    label?: string;
    hint?: string;
    error?: string;
    disabled?: boolean;
    type?: string;
    placeholder?: string;
    id?: string;
  };

  let {
    value = $bindable(""),
    label,
    hint,
    error,
    disabled = false,
    type = "text",
    placeholder,
    id,
  }: Props = $props();

  const uid = $props.id();
  const inputId = $derived(id ?? uid);
  const hintId = $derived(`${inputId}-hint`);
  const errorId = $derived(`${inputId}-error`);
  const describedBy = $derived(
    [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined,
  );
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <label for={inputId} class="text-sm font-medium text-ink">{label}</label>
  {/if}

  <input
    id={inputId}
    {type}
    {placeholder}
    {disabled}
    bind:value
    class={textFieldVariants({ invalid: Boolean(error) })}
    aria-invalid={error ? "true" : undefined}
    aria-describedby={describedBy}
    aria-label={label ? undefined : "Поле ввода"}
  />

  {#if hint}
    <p id={hintId} class="text-xs text-ink-muted">{hint}</p>
  {/if}

  {#if error}
    <p id={errorId} class="text-xs text-danger">{error}</p>
  {/if}
</div>
