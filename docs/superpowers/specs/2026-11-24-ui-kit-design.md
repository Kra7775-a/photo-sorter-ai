# Дизайн: UI-kit на bits-ui и токенах

Дата: 2026-11-24
Статус: черновик на одобрение

## Зачем

NuxtUI-подобный слой поверх headless-примитивов bits-ui, но полностью на существующей дизайн-системе OKLCH из `src/app.css`. Это подготовка к миграции `App.svelte`: сейчас компоненты используют ad-hoc классы, kit даст единые варианты и состояния.

## Цели

- Компоненты `src/lib/ui/*` с вариантами (`variant`, `size`, `tone`) и едиными состояниями focus/hover/disabled на семантических токенах.
- Основа — bits-ui (`Button`, `Switch`, `Tabs`, `Dialog`, `Separator`) для доступности и клавиатуры; нативные `input/textarea` оборачиваются с теми же токенами.
- `tailwind-variants` (уже в зависимостях) для вариантов без ручного concatenation.
- Рецепты `tv()` и их типы лежат рядом с компонентом в его `<script module lang="ts">` (не в общем `variants.ts`).
- Импорт компонентов напрямую из их `.svelte`-файлов; барреля `index.ts` нет по просьбе пользователя. Примеры — в `docs/ui-kit.md`.
- Никаких сырых цветов/hex; только `text-ink`, `bg-panel`, `border-line`, `bg-accent`, `text-on-accent`, `bg-danger-soft`, `text-danger`, `ring-focus`.

## Не-цели

- Миграция текущих экранов на kit (отдельный этап после одобрения kit'а).
- Новая тема/палитра.
- Замена Svelte 5 runes или oxfmt/oxlint.

## Состав (первый-release)

| Компонент | База bits-ui | Варианты |
| --- | --- | --- |
| `Button.svelte` | `Button.Root` | solid / soft / ghost / outline, sm/md/lg, tone accent/danger, disabled, loading (aria-busy) |
| `Switch.svelte` | `Switch.Root` | checked (bindable), disabled, label, description |
| `Tabs.svelte` | `Tabs.Root/List/Trigger/Content` | список табов через `$props()` |
| `Dialog.svelte` | `Dialog.Root/Trigger/Portal/Overlay/Content/Title/Description/Close` | title/description snippets, size sm/md/lg |
| `TextField.svelte` | нативный `input` | label, hint, error, disabled, type |
| `Textarea.svelte` | нативный `textarea` | label, hint, error, rows |
| `Card.svelte` | `<section>` | padding none/sm/md, bordered |
| `Badge.svelte` | `<span>` | tone neutral/accent/danger, size |
| `Alert.svelte` | `<div role=alert|status>` | tone danger/accent/info |

## Подход

1. Каждый компонент — отдельный `.svelte` с `$props()`, `tv()` из tailwind-variants для классов, русские дефолтные строки только если нужны.
2. `src/lib/ui/index.ts` экспортирует компоненты и типы вариантов.
3. `docs/ui-kit.md` — короткая таблица + примеры использования на русском.
4. Проверки: `svelte-autofixer` на всех `.svelte`, `bun run validate`, браузерный smoke с демонстрационным рендером (без приложения) — либо через временную страницу, либо проверка build.

## Что остаётся строителю

- Точные сигнатуры `$props()` и названия вариантов.
- Покрытие browser smoke и финальный commit.
