# UI-kit

Набор компонентов в `src/lib/ui/` поверх headless-примитивов [bits-ui](https://bits-ui.com) и семантических OKLCH-токенов из `src/app.css`. Барреля нет: импортируй компонент напрямую из его `.svelte`-файла.

## Правила

- Только семантические токены (`text-ink`, `bg-panel`, `bg-accent`, `border-line`, `ring-focus`, …). Никаких hex и сырых tailwind-цветов.
- **Shape lock:** actions и inputs — `rounded-lg` (8px), cards/dialogs — `rounded-xl` (12px), chips/badges/progress — `rounded-full`. Других радиусов нет.
- Каждый компонент сам содержит `tv()`-рецепт и типы вариантов в своём `<script module>`.
- Svelte 5 runes, `$props()`, `$bindable()` для управляемого состояния.

## Компоненты

| Файл | Что даёт | Варианты |
| --- | --- | --- |
| `Button.svelte` | `Button.Root`, кнопка или ссылка | `variant`: solid/soft/ghost/outline; `size`: sm/md/lg; `tone`: accent/danger; `loading` |
| `Switch.svelte` | `Switch.Root` с доступной подписью | `checked` (bindable), `disabled`, `label`, `description` |
| `TextField.svelte` | input с label/hint/error | `type`, `disabled`, `aria-invalid` при ошибке |
| `Textarea.svelte` | textarea с label/hint/error | `rows`, `disabled` |
| `Tabs.svelte` | `Tabs.Root/List/Trigger/Content` | `tabs`, `value` (bindable), `children` |
| `Dialog.svelte` | `Dialog.Root/…/Portal/Overlay/Content` | `size`: sm/md/lg, `open` (bindable), snippets |
| `Badge.svelte` | компактная метка | `tone`: neutral/accent/danger; `size`: sm/md |
| `Card.svelte` | карточка-контейнер | `padding`: none/sm/md |
| `Alert.svelte` | уведомление | `tone`: danger/accent/info; `role`: alert/status |

## Примеры

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
  Открыть
</Button>
<Button variant="soft" tone="danger">Удалить</Button>
<Button href="/docs" variant="ghost">Документация</Button>

<Switch bind:checked={sync} label="Синхронизация" description="Только метаданные" />
<TextField bind:value={email} label="Email" error={email === "" ? "Введите email" : undefined} />

<Tabs
  tabs={[
    { value: "files", label: "Файлы" },
    { value: "history", label: "История" },
  ]}
  bind:value={tab}
>
  <p>Содержимое вкладки «{tab}»</p>
</Tabs>

<Dialog bind:open>
  {#snippet title()}Подтверждение{/snippet}
  {#snippet description()}Действие нельзя отменить.{/snippet}
  <p>Содержимое диалога</p>
</Dialog>
```
