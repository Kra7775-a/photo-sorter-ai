# Metadata Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Аккаунты и opt-in синхронизация метаданных сортировок (не фото) между устройствами, с шифрованием at rest, в облаке и self-host.

**Architecture:** Bun-сервер (`server/`, Hono + better-auth + `bun:sqlite`) отдаёт статику и `/api`; отчёт каждого прогона хранится одним AES-256-GCM-блобом (конверт: мастер-ключ из env, per-user ключ данных). Клиент остаётся offline-first: IndexedDB + outbox, синхронизация только после явного включения и входа.

**Tech Stack:** Bun, Hono, better-auth (`database: new Database()` из `bun:sqlite`), `node:crypto` (aes-256-gcm), Svelte 5 runes, Tailwind v4 токены, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-11-23-metadata-sync-design.md`

## Global Constraints

- Bun только; `bunfig.toml` `exact = true` — точные версии, не диапазоны.
- `bun run validate` (format:check → lint → typecheck → check → test → build) — gate перед завершением каждой задачи.
- Svelte 5 runes только; цвета — семантические токены `src/app.css`; oxfmt/oxlint, не Prettier/ESLint.
- `@huggingface/transformers` импортируется только в `src/lib/model/worker.ts`; ZIP-контракт и потоковая обработка не меняются.
- `src/` не импортирует `server/` и наоборот; сервер не попадает в браузерный бандл.
- Код/идентификаторы/комментарии — английские; строки UI — русские.
- Покрытие 90% lines/functions по модулям, импортируемым тестами; новые чистые модули (`server/crypto.ts`, `server/db.ts`, `src/lib/sync/merge.ts`, `src/lib/sync/client.ts`) требуют тестов.
- Фото никогда не отправляются на сервер; без включённой синхронизации клиент не делает ни одного запроса к `/api`.
- Секреты только из env (`SYNC_MASTER_KEY`, `BETTER_AUTH_SECRET`); в репозиторий не коммитятся.

## Review Focus

1. **Чужой id прогона:** пользователь B запрашивает прогон A → 404, никаких данных (тест в Task 4).
2. **Повреждённый шифротекст:** изменённый ct/nonce/aad → `open` бросает ошибку, не возвращает мусор (Task 2).
3. **Повторная отправка после офлайна:** один `clientRunId` → одна строка на сервере, идемпотентный ответ (Task 4, Task 7).
4. **Синхронизация выключена / нет сессии:** ни одного fetch к `/api` (Task 9, browser + spy-тест).
5. **Нет `SYNC_MASTER_KEY` при старте:** сервер падает с понятной ошибкой, а не работает с открытыми данными (Task 1).

---

### Task 1: Каркас сервера, конфиг и миграции

**Files:**
- Create: `server/config.ts`, `server/db.ts`, `server/index.ts`, `server/db.test.ts`
- Modify: `package.json` (deps `hono`, `better-auth`; scripts `dev:server`, `start`, `keygen`)

**Interfaces:**
- Produces: `loadConfig(env: Record<string, string | undefined>): Config` где `Config = { masterKey: Uint8Array; authSecret: string; dbPath: string; port: number; baseUrl: string }`; бросает `Error` без `SYNC_MASTER_KEY`/`BETTER_AUTH_SECRET`.
- Produces: `openDb(path: string): Database` (из `bun:sqlite`), `migrate(db: Database): void` — идемпотентно, версия в `PRAGMA user_version`.
- Produces: `createApp(deps: { db: Database; config: Config }): Hono` — пока только `GET /api/health`.
- Таблицы приложения: `user_keys(user_id TEXT PRIMARY KEY, wrapped_key TEXT NOT NULL, key_version INTEGER NOT NULL)`, `sort_runs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_run_id TEXT NOT NULL, source_name TEXT NOT NULL, created_at INTEGER NOT NULL, counts_json TEXT NOT NULL, payload TEXT NOT NULL, scheme TEXT NOT NULL, key_version INTEGER NOT NULL, UNIQUE(user_id, client_run_id))`, `settings(user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, scheme TEXT NOT NULL, key_version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`. Таблицы better-auth создаёт сам в Task 3.

- [ ] **Step 1: failing test** `server/db.test.ts`: `migrate` на `:memory:` создаёт три таблицы приложения; повторный `migrate` не бросает и не дублирует; `loadConfig({})` бросает с текстом `SYNC_MASTER_KEY`; валидный env (32-byte base64 key) даёт `masterKey.length === 32`.
- [ ] **Step 2:** `bun test server/db.test.ts` → FAIL (модулей нет).
- [ ] **Step 3:** реализация `config.ts` (base64 decode, проверка длины 32), `db.ts` (список SQL-миграций, `user_version`), `index.ts` (`createApp` + health).
- [ ] **Step 4:** `bun test server/db.test.ts` → PASS; `bun run validate` → green.
- [ ] **Step 5:** commit `feat: server skeleton with config and sqlite migrations`.

### Task 2: Конвертное шифрование

**Files:**
- Create: `server/crypto.ts`, `server/crypto.test.ts`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces: `type SealedBlob = { scheme: "server-v1"; keyVersion: number; nonce: string; ct: string }` (base64);
  `generateDataKey(): Uint8Array` (32 байта);
  `wrapKey(master: Uint8Array, key: Uint8Array): SealedBlob`; `unwrapKey(master: Uint8Array, blob: SealedBlob): Uint8Array`;
  `seal(key: Uint8Array, plaintext: Uint8Array, aad: string): SealedBlob`;
  `open(key: Uint8Array, blob: SealedBlob, aad: string): Uint8Array` — бросает при неверном ключе, aad, nonce или ct.
- Реализация: `node:crypto` `createCipheriv("aes-256-gcm", key, nonce)` + `getAuthTag`, nonce 12 байт random; tag кладётся в конец ct.

- [ ] **Step 1: failing test**: round-trip `seal`/`open` возвращает исходные байты; `open` бросает на (a) изменённый ct, (b) изменённый nonce, (c) другой aad, (d) другой ключ; `wrapKey`/`unwrapKey` round-trip; два `seal` одного plaintext дают разные nonce.
- [ ] **Step 2:** `bun test server/crypto.test.ts` → FAIL.
- [ ] **Step 3:** реализация по сигнатурам выше.
- [ ] **Step 4:** `bun test server/crypto.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: envelope encryption for metadata blobs`.

### Task 3: Аккаунты (better-auth)

**Files:**
- Create: `server/auth.ts`, `server/auth.test.ts`
- Modify: `server/index.ts` (монтирование `/api/auth/*`)

**Interfaces:**
- Consumes: `Config`, `Database` из Task 1.
- Produces: `createAuth(db: Database, config: Config)` — `betterAuth({ database: db, secret: config.authSecret, baseURL: config.baseUrl, emailAndPassword: { enabled: true }, emailVerification: { enabled: false } })`; `createApp` принимает `auth` и отдаёт `auth.handler` на `/api/auth/*`; хелпер `getSession(req: Request): Promise<{ userId: string } | null>`.

- [ ] **Step 1: failing test** (`Bun.serve({ port: 0, fetch: app.fetch })`): sign-up email+password → 200; sign-in → cookie сессии; `GET /api/auth/get-session` с cookie → email пользователя; неверный пароль → 401; без cookie → null-сессия.
- [ ] **Step 2:** `bun test server/auth.test.ts` → FAIL.
- [ ] **Step 3:** реализация `auth.ts`, монтирование в `createApp`.
- [ ] **Step 4:** `bun test server/auth.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: email+password accounts via better-auth`.

### Task 4: API прогонов

**Files:**
- Create: `server/runs.ts`, `server/runs.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `getSession` (Task 3), `seal/open/wrapKey/unwrapKey/generateDataKey` (Task 2), таблицы Task 1.
- Produces: `registerRunRoutes(app: Hono, deps: { db: Database; config: Config; getSession: GetSession }): void`.
  `POST /api/runs` body `{ clientRunId: string; sourceName: string; createdAt: number; counts: { sorted: number; skipped: number; errors: number }; rows: ReportRow[] }` → 201 `{ id }`; повтор с тем же `clientRunId` → 200 тот же `id`.
  `GET /api/runs?since=<ms>` → `{ runs: Array<{ id, clientRunId, sourceName, createdAt, counts }> }` (без rows).
  `GET /api/runs/:id` → `{ ...meta, rows }` (расшифровано). `DELETE /api/runs/:id` → 204.
  Квоты: 1000 прогонов/пользователь, 20 000 rows, 2 МБ сериализованного payload → 413 `{ error: "quota" }`.
  AAD = `${userId}|${runId}|server-v1`; per-user ключ создаётся лениво в `user_keys`.

- [ ] **Step 1: failing test**: без сессии 401; пользователь B получает 404 на id A (list/get/delete); идемпотентность по `clientRunId`; 20 001 rows → 413 и число строк не изменилось; сырой `SELECT payload FROM sort_runs` не содержит подстроки имени файла из rows; get расшифровывает rows обратно.
- [ ] **Step 2:** `bun test server/runs.test.ts` → FAIL.
- [ ] **Step 3:** реализация `runs.ts` + монтирование.
- [ ] **Step 4:** `bun test server/runs.test.ts` → PASS; `bun run validate`.
- [ ] **Step 5:** commit `feat: encrypted sort-run API with quotas and ownership`.

### Task 5: API настроек

**Files:**
- Create: `server/settings.ts`, `server/settings.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces: `registerSettingsRoutes(app, deps)`: `GET /api/settings` → `{ payload: { labels: string[]; syncEnabled?: never }, updatedAt } | null`; `PUT /api/settings` body `{ payload: { labels: string[] }, updatedAt }` → 200; более старый `updatedAt` игнорируется (ответ 200 с текущим). Payload шифруется тем же per-user ключом, AAD = `${userId}|settings|server-v1`.

- [ ] **Step 1: failing test**: put→get round-trip labels; put со старым `updatedAt` не меняет данные; сырой payload не содержит строки метки; без сессии 401.
- [ ] **Step 2:** FAIL. **Step 3:** реализация. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: encrypted user settings with last-write-wins`.

### Task 6: Раздача статики, keygen, деплой

**Files:**
- Create: `server/keygen.ts`, `Dockerfile`, `server/static.test.ts`
- Modify: `server/index.ts`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `createApp` (Tasks 1–5).
- Produces: `bun run start` = `bun server/index.ts` (порт из config, отдаёт `dist/` с SPA-fallback для не-`/api` путей); `bun run keygen` печатает base64 32-byte ключ; `bun run dev:server` = watch.

- [ ] **Step 1: failing test**: `createApp` отдаёт `index.html` на `/` и на `/history` (SPA), `GET /api/health` → 200 json, неизвестный `/api/*` → 404 json.
- [ ] **Step 2:** FAIL. **Step 3:** реализация static + keygen + Dockerfile (`oven/bun`, copy dist + server, CMD start).
- [ ] **Step 4:** PASS; `bun run build && bun run start` вручную: curl `/` и `/api/health`; validate.
- [ ] **Step 5:** README: разделы «Сервер и синхронизация», «Self-host», «Облако», формулировка приватности из спеки. Commit `feat: serve static app from bun server, keygen and deploy docs`.

### Task 7: Клиентская логика слияния

**Files:**
- Create: `src/lib/sync/types.ts`, `src/lib/sync/merge.ts`, `src/lib/sync/merge.test.ts`

**Interfaces:**
- Produces: `type SyncRun = { clientRunId: string; sourceName: string; createdAt: number; counts: Counts; rows: ReportRow[]; serverId?: string }`; `type SyncSettings = { labels: string[]; updatedAt: number }`;
  `mergeRuns(local: SyncRun[], remote: SyncRun[]): SyncRun[]` — дедуп по `clientRunId`, при конфликте побеждает больший `createdAt`, `serverId` сохраняется;
  `mergeSettings(local: SyncSettings | null, remote: SyncSettings | null): SyncSettings | null` — LWW по `updatedAt`;
  `pendingUploads(runs: SyncRun[]): SyncRun[]` — только без `serverId`.
- `ReportRow` импортируется из `src/lib/archive/naming.ts`, `Counts` = `SortArchiveResult["counts"]` из `src/lib/archive/sort.ts` (не дублировать).

- [ ] **Step 1: failing test**: дедуп не плодит дубли; конфликт по createdAt; `serverId` не теряется; LWW настроек в обе стороны и при null; `pendingUploads` исключает синхронизированные.
- [ ] **Step 2:** FAIL. **Step 3:** реализация. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: pure sync merge logic with tests`.

### Task 8: IndexedDB-хранилище и API-клиент

**Files:**
- Create: `src/lib/sync/store.ts`, `src/lib/sync/client.ts`, `src/lib/sync/client.test.ts`

**Interfaces:**
- Consumes: типы Task 7.
- Produces: `openStore(): Promise<SyncStore>` где `SyncStore = { getRuns(): Promise<SyncRun[]>; putRuns(runs: SyncRun[]): Promise<void>; getSettings(): Promise<SyncSettings | null>; putSettings(s: SyncSettings): Promise<void>; getOutbox(): Promise<string[]>; setOutbox(ids: string[]): Promise<void> }` (IndexedDB, одна БД `photo-sorter-sync`, версии миграций).
- Produces: `createSyncClient(opts: { baseUrl: string; fetchImpl?: typeof fetch }): SyncClient` с `pushRun(run)`, `pullRuns(since)`, `deleteRun(serverId)`, `pushSettings(s)`, `pullSettings()`; ретраи 3 попытки exponential backoff только на сетевых ошибках/5xx; 401/413 не ретраятся, бросают типизированную ошибку.
- `store.ts` тонкий (проверяется в браузере, Task 9); вся логика ретраев в `client.ts` и тестируется.

- [ ] **Step 1: failing test** (spyOn fetch): 500 затем 201 → одна успешная отправка после ретрая; 401 → бросает без ретрая; 413 → бросает `QuotaError` без ретрая; сетевая ошибка 3 раза → бросает после 3 попыток.
- [ ] **Step 2:** FAIL. **Step 3:** реализация store + client. **Step 4:** PASS + validate.
- [ ] **Step 5:** commit `feat: indexeddb store and retrying sync client`.

### Task 9: UI — аккаунт, синхронизация, история

**Files:**
- Create: `src/lib/components/AccountPanel.svelte`, `src/lib/components/HistoryPanel.svelte`
- Modify: `src/App.svelte`, `src/lib/sync/store.ts` (если нужны индексы)

**Interfaces:**
- Consumes: Task 7, Task 8; `sortArchive` результат → `SyncRun` (rows из `result.report`, counts из `result.counts`, `clientRunId = crypto.randomUUID()`).
- Produces: компоненты с `$props()`; `AccountPanel` — вход/регистрация/выход, переключатель синхронизации (доступен только с сессией) с текстом приватности из спеки; `HistoryPanel` — список прогонов (дата, источник, счётчики, удаление), раскрытие rows.
- Поведение: без сессии или при выключенном переключателе — ни одного запроса к `/api`; после `sortArchive` прогон пишется в store всегда, в outbox только при включённой синхронизации; labels textarea читается/пишется в settings (LWW); статус синхронизации («синхронизировано / в очереди / ошибка») виден.

- [ ] **Step 1:** реализация компонентов и проводки в `App.svelte` (runes, токены, русские строки, keyed each).
- [ ] **Step 2:** `bun x @sveltejs/mcp svelte-autofixer ./src/App.svelte ./src/lib/components/AccountPanel.svelte ./src/lib/components/HistoryPanel.svelte --svelte-version <из package.json>` → 0 issues.
- [ ] **Step 3:** browser-проверка (dev-сервер + `bun run start`): регистрация → переключатель → прогон ZIP → перезагрузка страницы показывает историю; второй браузерный контекст с тем же аккаунтом видит прогон; offline (devtools) → прогон в очереди, online → уходит; выход → fetch к `/api` нет (network log); выключенный переключатель → запросов нет.
- [ ] **Step 4:** `bun run validate`.
- [ ] **Step 5:** commit `feat: account panel, opt-in sync and run history UI`.

### Task 10: Документация API и финальный gate

**Files:**
- Create: `docs/api.md`
- Modify: `README.md` (ссылка на api.md), `bunfig.toml` (если новые модули нужно включить в покрытие)

**Interfaces:**
- Consumes: фактические роуты Tasks 3–6.

- [ ] **Step 1:** `docs/api.md` по конвенции api-documentation-generator: таблица роутов, auth, примеры curl, коды ошибок (401/404/413), квоты, формат блоба и приватность.
- [ ] **Step 2:** `bun run test:coverage` → порог 90% пройден; `bun run validate` → green.
- [ ] **Step 3:** commit `docs: api reference and coverage gate for sync modules`.
