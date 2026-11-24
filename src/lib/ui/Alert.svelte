<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const alertVariants = tv({
    base: "flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm",
    variants: {
      tone: {
        danger: "border-danger bg-danger-soft text-danger",
        accent: "border-accent-line bg-accent-soft text-ink",
        info: "border-line bg-panel text-ink",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  });

  export type AlertVariants = VariantProps<typeof alertVariants>;
  export type AlertTone = NonNullable<AlertVariants["tone"]>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = AlertVariants & {
    role?: "alert" | "status";
    children?: Snippet;
  };

  let { tone = "info", role = "status", children }: Props = $props();
</script>

<div {role} class={alertVariants({ tone })}>
  {@render children?.()}
</div>
