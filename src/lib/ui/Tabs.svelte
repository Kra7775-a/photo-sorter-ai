<script module lang="ts">
  import { tv } from "tailwind-variants";

  export type TabItem = {
    value: string;
    label: string;
  };

  export const tabsVariants = tv({
    base: "flex flex-col gap-2",
  });

  export const tabListVariants = tv({
    base: "inline-flex items-center gap-1 self-start rounded-lg border border-line bg-panel p-1",
  });

  export const tabTriggerVariants = tv({
    base: "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors outline-none hover:bg-accent-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60 data-[state=active]:bg-accent-soft data-[state=active]:text-ink",
  });

  export const tabContentVariants = tv({
    base: "rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  });
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  import { Tabs as TabsUI } from "bits-ui";

  type Props = {
    tabs: TabItem[];
    value?: string;
    children?: Snippet;
  };

  let { tabs, value = $bindable(""), children }: Props = $props();
</script>

<TabsUI.Root bind:value class={tabsVariants()}>
  <TabsUI.List class={tabListVariants()}>
    {#each tabs as tab (tab.value)}
      <TabsUI.Trigger value={tab.value} class={tabTriggerVariants()}>{tab.label}</TabsUI.Trigger>
    {/each}
  </TabsUI.List>

  {#each tabs as tab (tab.value)}
    <TabsUI.Content value={tab.value} class={tabContentVariants()}>
      {#if tab.value === value}
        {@render children?.()}
      {/if}
    </TabsUI.Content>
  {/each}
</TabsUI.Root>
