<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex items-center rounded-full border font-medium",
    variants: {
      tone: {
        neutral: "border-line bg-panel text-ink-muted",
        accent: "border-accent-line bg-accent-soft text-ink",
        danger: "border-danger bg-danger-soft text-danger",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "sm",
    },
  });

  export type BadgeVariants = VariantProps<typeof badgeVariants>;
  export type BadgeTone = NonNullable<BadgeVariants["tone"]>;
  export type BadgeSize = NonNullable<BadgeVariants["size"]>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = BadgeVariants & {
    children?: Snippet;
  };

  let { tone = "neutral", size = "sm", children }: Props = $props();
</script>

<span class={badgeVariants({ tone, size })}>
  {@render children?.()}
</span>
