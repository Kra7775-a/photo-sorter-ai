# UI kit

A set of components in `src/lib/ui/` built on the headless primitives of [bits-ui](https://bits-ui.com) and the semantic OKLCH tokens from `src/app.css`. There is no barrel file: import a component directly from its `.svelte` file.

## Rules

- Semantic tokens only (`text-ink`, `bg-panel`, `bg-accent`, `border-line`, `ring-focus`, …). No hex values or raw Tailwind colors.
- **Shape lock:** actions and inputs use `rounded-lg` (8px), cards/dialogs use `rounded-xl` (12px), chips/badges/progress use `rounded-full`. No other radii.
- Each component keeps its `tv()` recipe and variant types in its own `<script module>`.
- Svelte 5 runes, `$props()`, `$bindable()` for controlled state.

## Components

| File               | Provides                              | Variants                                                              |
| ------------------ | ------------------------------------- | --------------------------------------------------------------------- |
| `Button.svelte`    | `Button.Root`, button or link         | `variant`: solid/soft/ghost/outline; `size`: sm/md/lg; `tone`: accent/danger; `loading` |
| `Switch.svelte`    | `Switch.Root` with an accessible label | `checked` (bindable), `disabled`, `label`, `description`               |
| `TextField.svelte` | input with label/hint/error           | `type`, `disabled`, `aria-invalid` on error                            |
| `Textarea.svelte`  | textarea with label/hint/error        | `rows`, `disabled`                                                     |
| `Tabs.svelte`      | `Tabs.Root/List/Trigger/Content`      | `tabs`, `value` (bindable), `children`                                 |
| `Dialog.svelte`    | `Dialog.Root/…/Portal/Overlay/Content` | `size`: sm/md/lg, `open` (bindable), snippets                         |
| `Badge.svelte`     | compact label                         | `tone`: neutral/accent/danger; `size`: sm/md                           |
| `Card.svelte`      | container card                        | `padding`: none/sm/md                                                  |
| `Alert.svelte`     | notification                          | `tone`: danger/accent/info; `role`: alert/status                       |

## Examples

```svelte
<script lang="ts">
  import Button from "./lib/ui/Button.svelte";
  import Switch from "./lib/ui/Switch.svelte";
  import TextField from "./lib/ui/TextField.svelte";
  import Tabs from "./lib/ui/Tabs.svelte";
  import Dialog from "./lib/ui/Dialog.svelte";

  let sync = $state(false);
  let email = $state("");
  let tab = $state("files");
  let open = $state(false);
</script>

<Button variant="solid" tone="accent" onclick={() => (open = true)}>
  Open
</Button>
<Button variant="soft" tone="danger">Delete</Button>
<Button href="/docs" variant="ghost">Documentation</Button>

<Switch bind:checked={sync} label="Sync" description="Metadata only" />
<TextField bind:value={email} label="Email" error={email === "" ? "Enter email" : undefined} />

<Tabs
  tabs={[
    { value: "files", label: "Files" },
    { value: "history", label: "History" },
  ]}
  bind:value={tab}
>
  <p>Contents of the "{tab}" tab</p>
</Tabs>

<Dialog bind:open>
  {#snippet title()}Confirmation{/snippet}
  {#snippet description()}This action cannot be undone.{/snippet}
  <p>Dialog contents</p>
</Dialog>
```
