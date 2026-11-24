# Дизайн: разделить App.svelte на оркестратор и компоненты

Дата: 2026-11-23
Статус: выбран подход 3 (одобрен пользователем)

## Зачем

`src/App.svelte` вырос до ~600 строк: в нём смешаны классификация, работа с ZIP, загрузка модели,
синхронизация, локальная история и разметка. Это мешает и поддержке, и будущему UI-kit на bits-ui.

## Цели

- `App.svelte` становится тонким: состояние приходит из оркестратора, разметка — из компонентов.
- Вся бизнес-логика фото и ZIP лежит в тестируемом чистом модуле, без Svelte-рантайма.
- Поведение, контракт ZIP и нулевой `/api`-трафик при выключенной синхронизации не меняются.
- Подготовить почву для UI-kit: компоненты становятся маленькими оболочками с `$props()`.

## Не-цели

- UI-kit на bits-ui и миграция на него (отдельный этап после этой резки).
- Изменение ARCHIVE/report контракта, engine/worker, sync-протокола.
- Простое перемещение `AccountPanel`/`HistoryPanel` — они уже отдельные.

## Подход

1. **Оркестратор `src/lib/sorter/controller.ts`** по образцу `sync/controller.ts`:
   - зависимости внедряются: `createEngine`, `sortArchive`, `URL.createObjectURL/revokeObjectURL`, `now`, `uuid`;
   - состояние (`items`, `pending`, `failure`, `progress`, `archiveProgress`, `archiveResult`, флаги)
     живёт внутри, наружу отдаётся снимок через `onSnapshot`;
   - методы: `classifyFiles(files, labels)`, `sortArchiveFile(file, labels)`, `dispose()`;
   - тестируется с фейковым engine/sortArchive, including cleanup object URLs and label snapshot.
2. **Презентационные компоненты** в `src/lib/components/`:
   - `CategoriesField.svelte` — textarea категорий;
   - `SourcePicker.svelte` — оба file input;
   - `ProgressPanel.svelte` — progressbar (модель/архив);
   - `ArchiveResultCard.svelte` — результат и отчёт;
   - `PhotoList.svelte` — список фото и score-чипы.
   Все — `$props()`, русские строки, токены из `app.css`, keyed `{#each}`.
3. **`App.svelte`** — только состояние снимка + wiring: auth/sync-часть остаётся как есть, но рендер
   delegation в компоненты; цель ~100–150 строк.

## Что остаётся строителю

- Точные props-интерфейсы компонентов, порядок снимка и тесты.
- Проверка в браузере: загрузка фото, ZIP-прогон, обе темы, отсутствие `/api` при выключенном sync.
