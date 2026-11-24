<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const cardVariants = tv({
    base: "rounded-xl border border-line bg-panel",
    variants: {
      padding: {
        none: "",
        sm: "p-3",
        md: "p-5",
      },
    },
    defaultVariants: {
      padding: "md",
    },
  });

  export type CardVariants = VariantProps<typeof cardVariants>;
  export type CardPadding = NonNullable<CardVariants["padding"]>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = CardVariants & {
    children?: Snippet;
  };

  let { padding = "md", children }: Props = $props();
</script>

<section class={cardVariants({ padding })}>
  {@render children?.()}
</section>
