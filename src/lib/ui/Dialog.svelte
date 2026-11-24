<script module lang="ts">
  import { tv, type VariantProps } from "tailwind-variants";

  export const dialogContentVariants = tv({
    base: "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-panel p-6 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-2xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  });

  export type DialogVariants = VariantProps<typeof dialogContentVariants>;
  export type DialogSize = NonNullable<DialogVariants["size"]>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { Dialog as DialogUI } from "bits-ui";

  type Props = {
    open?: boolean;
    title: Snippet;
    description?: Snippet;
    children?: Snippet;
    size?: DialogSize;
    trigger?: Snippet;
  };

  let {
    open = $bindable(false),
    title,
    description,
    children,
    size = "md",
    trigger,
  }: Props = $props();
</script>

<DialogUI.Root bind:open>
  {#if trigger}
    <DialogUI.Trigger
      class="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-colors outline-none hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {@render trigger()}
    </DialogUI.Trigger>
  {/if}

  <DialogUI.Portal>
    <DialogUI.Overlay class="fixed inset-0 z-50 bg-canvas/80" />
    <DialogUI.Content class={dialogContentVariants({ size })}>
      <DialogUI.Title class="text-lg font-semibold text-ink">
        {@render title()}
      </DialogUI.Title>

      {#if description}
        <DialogUI.Description class="mt-1 text-sm text-ink-muted">
          {@render description()}
        </DialogUI.Description>
      {/if}

      {#if children}
        <div class="mt-4">
          {@render children()}
        </div>
      {/if}

      <DialogUI.Close
        class="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors outline-none hover:bg-accent-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        aria-label="Закрыть"
      >
        <span aria-hidden="true">×</span>
      </DialogUI.Close>
    </DialogUI.Content>
  </DialogUI.Portal>
</DialogUI.Root>
