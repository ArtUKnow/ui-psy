# UI-PSY

Фронтенд: React/TypeScript (Vite). Бэкенд: Go API (`server-go/`) и PostgreSQL. Прежний Python-сервер (`server/app.py`, SQLite) больше не является runtime и хранится только как источник миграции и эталон для контрактных тестов.

Go API — это один модульный процесс, а не кластер микросервисов.

## Требования

- Node.js 20.19+ или 22.12+ (на этой машине — `~/.cache/codex-runtimes/.../node/bin/node` 24.x, arm64; системный Node 20.16 работает под Rosetta и выдаёт предупреждение Vite).
- Go 1.25+.
- PostgreSQL 16+ с утилитами `createdb`, `pg_dump`, `pg_restore`, `psql` в `PATH`.
- Python 3.10+ — только для миграции и контрактных тестов.

## Конфигурация

Скопируйте `.env.example` в `.env.local` (файл игнорируется Git, права 0600) и задайте значения. Скрипты запуска читают `.env`, затем `.env.local`; переменные, уже заданные в окружении, не перезаписываются.

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Обязательна. Например, `postgres:///ui_psy?host=/tmp`. |
| `UI_PSY_BACKUP_DIR` | Каталог `pg_dump` (по умолчанию `server-go/backups`). |
| `UI_PSY_BACKUP_INTERVAL` | Период копий, по умолчанию `60s`. Определяет RPO при восстановлении из копии. |
| `UI_PSY_BACKUP_KEEP` | Сколько последних копий хранить; `0` (по умолчанию) — хранить всё. Удаляются только файлы вида `YYYYMMDDTHHMMSS.nnnnnnnnn.dump` в этом каталоге. |
| `UI_PSY_LOG_PATH` | JSON access log (по умолчанию `server-go/logs/server.jsonl`). Токены, пароли, медицинские тексты и query string не пишутся. |
| `UI_PSY_TRUST_PROXY` | `true` только за доверенным reverse proxy, который выставляет `X-Forwarded-Proto`. |
| `GIGACHAT_CREDENTIALS` | Authorization key GigaChat. Без него ИИ-помощник показывает «не настроен». |
| `GIGACHAT_SCOPE`, `GIGACHAT_MODEL`, `GIGACHAT_BASE_URL`, `GIGACHAT_OAUTH_URL` | Параметры провайдера, см. `.env.example`. |
| `GIGACHAT_CA_FILE` | PEM корневого сертификата Минцифры (`server-go/certs/russian_trusted_root_ca.pem`, скачан по ссылке с https://developers.sber.ru/docs/ru/gigachat/certificates). Добавляется к системному хранилищу только внутри приложения; проверка TLS не отключается. |

## Запуск

```sh
npm install
createdb -h /tmp ui_psy
npm run dev -- --host 127.0.0.1 --port 5178   # Vite :5178 + Go API :8178
npm run build && npm run serve                # dist + API на :5178
```

`npm run serve` собирает Go-бинарник `server-go/bin/ui-psy` и запускает его с `--serve-dist`. Схема БД создаётся при старте.

`GET /api/health` возвращает `status`, `aiConfigured` и `lastBackupAgeSeconds`. `aiConfigured: true` означает только наличие настройки, а не подтверждённую связь с GigaChat. Возраст копии больше двух интервалов — сигнал, что резервное копирование не работает.

## Миграция с SQLite

Импорт выполняется только в пустую БД; при непустой целевой таблице Go отказывается импортировать.

```sh
# 1. Остановить Python-сервер, чтобы SQLite не менялась.
# 2. Сохранить исходник (не удалять):
sqlite3 server/data/ui-psy.sqlite3 ".backup server-go/private/legacy-$(date +%Y%m%d%H%M%S).sqlite3"
# 3. Экспорт (read-only, файл 0600, содержит приватные данные):
python3 -I scripts/export_legacy.py server-go/private/legacy-….sqlite3 server-go/private/export.json
# 4. Импорт в пустую БД:
DATABASE_URL=postgres:///ui_psy?host=/tmp server-go/bin/ui-psy --root . --import-json server-go/private/export.json
```

Сохраняются ID, соли и PBKDF2-хеши (прежние пароли работают), сессии и refresh-cookie, документы с версиями, связи врач—пациент, приглашения, планы и сообщения с их ID. `server-go/check_migration.py` проверяет это на синтетическом непустом наборе, созданном через API старого сервера.

## Резервное копирование и восстановление

Сервер каждые `UI_PSY_BACKUP_INTERVAL` выполняет `pg_dump --format=custom` в `UI_PSY_BACKUP_DIR`. Это локальные копии на том же диске: они не защищают от потери машины и не являются production DR. Для реальной эксплуатации нужны вынос копий на другой носитель/хост и WAL-архивация.

Восстановление в новую БД:

```sh
createdb -h /tmp ui_psy_restored
pg_restore --no-owner -h /tmp -d ui_psy_restored server-go/backups/<последний>.dump
DATABASE_URL=postgres:///ui_psy_restored?host=/tmp npm run serve
```

Записи, сделанные после последней копии, при таком восстановлении теряются (окно ≤ интервала копирования). Падение процесса без потери БД данных не теряет: подтверждённые транзакции уже в PostgreSQL.

## GigaChat

`GET /api/ai/status`, `POST /api/ai/chat`. Отправка требует явного согласия пользователя; дневник и история автоматически не передаются. Модель выбирает одну из трёх поддерживающих практик каталога (`grounding`, `breathing`, `values`) с источниками ВОЗ/NHS. Это не открытый медицинский чат; источники берутся из каталога, а не генерируются. Неизвестный ID практики или ошибка провайдера возвращаются как ошибка — имитации ответа нет. Наличие ссылки на источник не доказывает клиническую корректность.

## Проверки

```sh
npm run test:go                                          # go test -race (тестовый HTTP-провайдер, не живой GigaChat)
TEST_DATABASE_URL='postgres:///ui_psy_test?host=/tmp' npm run test:api   # исходные тесты server/test_app.py против Go; очищает ui_psy_test
python3 -I server-go/check_migration.py                  # непустая миграция SQLite → PostgreSQL
python3 -I server-go/check_recovery.py                   # SIGKILL и pg_restore на отдельных БД
cd server-go && go run ./cmd/load --duration 30m --users 500 --out reports/load-…   # нагрузка, отдельная БД
npx playwright test                                      # UI, БД ui_psy_playwright пересоздаётся
npx playwright test -c playwright.go.config.ts           # сценарий дневника на Go-стенде :8518
```

Нагрузочный драйвер помечает прогон `valid:false`, если хост засыпал: на macOS закрытие крышки на батарее приостанавливает машину даже под `caffeinate`.

Результаты замеров и их границы — в `server-go/reports/PROTOCOL.md`.

## Подключение пациента к врачу

Врач на `/doctor` создаёт одноразовый код и QR (действует 24 часа). Пациент на `/connect` сверяет почту врача и подтверждает доступ. Врач видит сводку дневника, результаты тестов и график приёма; разговор с помощником и заметки не передаются. Отключить связь может любая сторона, после этого сервер отклоняет запросы врача. Личность врача сервером не проверяется. Для реальных медицинских данных нужны подтверждение роли специалиста, юридически корректное согласие и защищённое развёртывание за HTTPS.
