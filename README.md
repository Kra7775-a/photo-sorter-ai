# AI Photo Sorter

Браузерный сортировщик фотографий по категориям. Модель работает локально: изображения
не покидают устройство. Сервер не обязателен — он нужен только для аккаунтов и
синхронизации метаданных между устройствами.

## Стек

- Svelte 5 (runes) + TypeScript + Vite
- Tailwind CSS v4
- [Transformers.js](https://github.com/huggingface/transformers.js) + ONNX Runtime Web (WASM)
- MobileCLIP-B `Xenova/mobileclip_b`, int8 (~145 МБ)
- Web Worker для инференса
+- ZIP без сервера: `@zip.js/zip.js` читает архив, `client-zip` собирает новый
- PWA (vite-plugin-pwa): офлайн-оболочка, установка на устройство
- Bun, oxlint, oxfmt, svelte-check, `bun test`

## Запуск

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # production-сборка в dist/
bun run preview    # локальный просмотр сборки
bun run test:coverage  # покрытие (text + coverage/lcov.info)
bun run test:mutation  # мутационные тесты (Stryker + Bun, ~6 мин)
```

Полная проверка перед коммитом:

```bash
bun run validate   # format:check + lint + typecheck + check + test + build
```

Bun считает покрытие только по модулям, которые импортируют тесты. `worker.ts`, Svelte-компоненты
и entry points исключены в `bunfig.toml`; проценты в отчёте относятся к модулям с тестами.

Мутационные тесты запускаются через `bun run test:mutation`. Stryker использует неофициальный
раннер `stryker-mutator-bun-runner`; локальный патч в `patches/` адаптирует его к Bun 1.4 (тот
больше не печатает построчные результаты в не-TTY и не понимает старый формат вывода). Отчёт —
`reports/mutation/mutation.html`, порог `break` в `stryker.conf.json` — 60%.

## Как это работает

1. Пользователь задаёт категории (по одной на строку, только по-английски).
2. Worker лениво загружает две башни MobileCLIP: текстовую и визуальную.
3. Метки превращаются в промпты `a photo of <label>` и кэшируются по набору.
4. Эмбеддинг фото сравнивается с эмбеддингами меток, softmax даёт вероятности,
   UI показывает топ-3.
5. Первый запуск скачивает ~145 МБ (кэшируется браузером), дальше инференс занимает
   сотни миллисекунд на WASM.

### ZIP-архивы

Можно выбрать не отдельные фото, а `.zip`. Архив читается по одному файлу за раз
(без распаковки всего в память), каждое изображение классифицируется, после чего
собирается новый архив `*-sorted.zip`:

- фото раскладываются по папкам с названием категории (`people/`, `nature/`, …);
- берётся только имя файла, исходные каталоги архива не сохраняются;
- одинаковые имена получают суффикс ` (2)`, ` (3)`;
- `report.csv` в корне содержит источник, категорию, уверенность и статус
  (`sorted` / `skipped` / `error`);
- не-изображения и файлы с ошибкой декодирования не копируются, но попадают в отчёт;
- HEIC/TIFF пропускаются: браузер не умеет их декодировать.

### Почему английские метки

Текстовый энкодер MobileCLIP англоязычный. Русские слова дают почти случайные результаты
(фото кота уходит в «природу» вместо «животных»). Шаблон `a photo of ` заметно улучшает
короткие метки вроде `cat`.

## Структура

```
src/
  App.svelte              тонкий слой: auth/sync + композиция компонентов
  app.css                 Tailwind и семантические OKLCH-токены
  main.ts                 точка входа
- `lib/ui/`                UI-kit на bits-ui + OKLCH-токенах (см. `docs/ui-kit.md`)
  lib/sorter/
    controller.ts         оркестратор фото/ZIP с внедрёнными зависимостями + тесты
  lib/components/
    AccountPanel.svelte   вход/регистрация, opt-in синхронизации
    CategoriesField.svelte, SourcePicker.svelte, ProgressPanel.svelte,
    ArchiveResultCard.svelte, PhotoList.svelte, HistoryPanel.svelte
  lib/sync/
    controller.ts         offline-first синхронизация (IndexedDB → сеть) + тесты
    client.ts, store.ts, merge.ts, types.ts
  lib/model/
    protocol.ts           типы сообщений main ↔ worker
    engine.ts             клиент worker'а, сопоставление запросов по id
    worker.ts             загрузка модели, эмбеддинги, softmax
    ranking.ts            чистая сортировка/срез результатов + тесты
  lib/archive/
    naming.ts             безопасные имена, дедупликация, report.csv + тесты
    sort.ts               чтение ZIP → классификация → новый ZIP + тесты
```

## Деплой

Статическая сборка (`dist/`) работает сама по себе: Cloudflare Pages, Vercel или любой CDN.
Модель на этих площадках не хостится (у Cloudflare Pages лимит 25 МиБ на файл), она
скачивается с Hugging Face Hub и кэшируется в браузере. Если нужен свой CDN, положите файлы
модели в R2/S3 и переопределите `env.remoteHost` в worker'е. Без сервера синхронизация
недоступна, но сортировка работает полностью.

## Сервер и синхронизация

Сервер — один процесс Bun: отдаёт `dist/` и обрабатывает `/api` (аккаунты, прогоны,
настройки). Сначала соберите фронтенд (`bun run build`), затем задайте переменные окружения:

| Переменная           | Назначение                                   | По умолчанию                  |
| -------------------- | -------------------------------------------- | ----------------------------- |
| `SYNC_MASTER_KEY`    | обязательно, base64 32 случайных байт         | —                             |
| `BETTER_AUTH_SECRET` | обязательно, секрет для сессий                | —                             |
| `SYNC_DB_PATH`       | путь к SQLite-файлу                           | `sync.db`                     |
| `PORT`               | порт HTTP-сервера                             | `3001`                        |
| `BETTER_AUTH_URL`    | публичный URL (для cookie и ссылок better-auth) | `http://localhost:$PORT`      |

```bash
bun run keygen   # печатает ключ: скопируйте его в SYNC_MASTER_KEY
SYNC_MASTER_KEY=<ключ> BETTER_AUTH_SECRET=<секрет> bun run start
```

Ротация мастер-ключа: сгенерируйте новый `SYNC_MASTER_KEY`, затем
`OLD_SYNC_MASTER_KEY=<старый> SYNC_MASTER_KEY=<новый> bun run rewrap` — перешифрует ключи
пользователей без потери данных.

Для разработки есть `bun run dev:server` (watch-режим). Секреты хранятся только в окружении,
в репозиторий они не попадают; потеря `SYNC_MASTER_KEY` означает потерю доступа к зашифрованным
данным.

Приватность: «Фотографии не покидают устройство. Названия файлов и категории сохраняются
на сервере в зашифрованном виде; оператор сервера имеет к ним доступ. Синхронизация
выключена, пока вы не включите её сами.»

## Self-host

Тот же процесс можно поднять локально командами выше или контейнером (Dockerfile копирует
готовую `dist/` и `server/`):

```bash
bun run build
docker build -t photo-sorter-ai .
docker run -p 3001:3001 \
  -e SYNC_MASTER_KEY=<ключ> \
  -e BETTER_AUTH_SECRET=<секрет> \
  -e BETTER_AUTH_URL=http://localhost:3001 \
  -e SYNC_DB_PATH=/app/data/sync.db \
  -v "$PWD/data:/app/data" \
  photo-sorter-ai
```

Бэкап — файл `SYNC_DB_PATH` плюс надёжно сохранённый `SYNC_MASTER_KEY`; без ключа бэкап
не расшифровать. Статику без сервера тоже можно раздавать отдельно — тогда синхронизация
просто недоступна.

## Облако

Используйте тот же образ/процесс: один Bun-сервер отдаёт статику и `/api`, перед ним
TLS-прокси (Caddy, Nginx, Cloudflare Tunnel). Укажите `BETTER_AUTH_URL` с публичным `https`-адресом,
положите SQLite на постоянный том и настройте бэкап вместе с ключами.
