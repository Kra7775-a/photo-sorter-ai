<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    variants: {
      variant: {
        solid: "",
        soft: "",
        ghost: "",
        outline: "",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
      },
      tone: {
        accent: "",
        danger: "",
      },
    },
    compoundVariants: [
      {
        variant: "solid",
        tone: "accent",
        class: "bg-accent text-on-accent hover:bg-accent-strong",
      },
      { variant: "solid", tone: "danger", class: "bg-danger text-on-accent hover:opacity-90" },
      { variant: "soft", tone: "accent", class: "bg-accent-soft text-ink hover:bg-accent-line" },
      { variant: "soft", tone: "danger", class: "bg-danger-soft text-danger hover:opacity-80" },
      { variant: "ghost", tone: "accent", class: "text-accent hover:bg-accent-soft" },
      { variant: "ghost", tone: "danger", class: "text-danger hover:bg-danger-soft" },
      {
        variant: "outline",
        tone: "accent",
        class: "border border-accent-line text-accent hover:bg-accent-soft",
      },
      {
        variant: "outline",
        tone: "danger",
        class: "border border-danger text-danger hover:bg-danger-soft",
      },
    ],
    defaultVariants: {
      variant: "solid",
      size: "md",
      tone: "accent",
    },
  });

  export type ButtonVariants = VariantProps<typeof buttonVariants>;
  export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
  export type ButtonSize = NonNullable<ButtonVariants["size"]>;
  export type ButtonTone = NonNullable<ButtonVariants["tone"]>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button as ButtonUI } from "bits-ui";

  type Props = ButtonVariants & {
    href?: string;
    download?: string;
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  };

  let {
    variant = "solid",
    size = "md",
    tone = "accent",
    href,
    download,
    disabled = false,
    loading = false,
    type = "button",
    class: className = "",
    onclick,
    children,
  }: Props = $props();

  const classes = $derived(`${buttonVariants({ variant, size, tone })} ${className}`);

  // bits-ui switches to an anchor when `href` is set: `type` is invalid there.
  const rootProps = $derived(
    href
      ? { href, download, disabled, onclick, "aria-busy": loading || undefined }
      : { type, disabled, onclick, "aria-busy": loading || undefined },
  );
</script>

<ButtonUI.Root {...rootProps} class={classes}>
  {@render children?.()}
</ButtonUI.Root>
