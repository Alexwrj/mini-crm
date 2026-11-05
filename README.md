# Мини-CRM «Объекты и задачи»

Stage 1 и Stage 2 приняты. Stage 3A реализует вход Supabase Auth, восстановление
сессии, чтение собственного профиля и защиту маршрутов. Объекты, задачи и история
остаются заглушками: доступ к их данным закрыт до Stage 3B.

## Запуск

Нужны Node.js 24 (`.nvmrc`) и npm. Версии зависимостей зафиксированы в lock-файле.

```sh
nvm use
npm ci
npm run dev
```

Открыть адрес из вывода Vite (обычно http://localhost:5173).

```sh
npm run typecheck  # строгая проверка TypeScript приложения, тестов и Vite config
npm run lint       # ESLint, предупреждения считаются ошибками
npm test           # Vitest, один прогон
npm run test:watch # Vitest в watch-режиме
npm run build      # TypeScript + production-сборка в dist/
npm run preview    # локальный просмотр готовой сборки
npm run check      # typecheck → lint → tests → build
```

`npm run preview` — локальная проверка, не production-сервер. При будущем размещении
SPA нужно настроить возврат `index.html` для глубоких ссылок. Деплой на этапе 1
не выполняется.

## Структура

```text
src/
  app/           # оболочка, маршруты, AuthProvider и тесты
  components/ui/ # исходники базовых компонентов shadcn/ui
  features/auth/ # API профиля, единый auth context, route gates
  pages/         # вход и заглушки бизнес-экранов
  shared/api/    # единственный браузерный Supabase client
  shared/ui/     # общий компонент заглушки
  test/          # настройка jsdom и Testing Library
  main.tsx       # точка входа и BrowserRouter
supabase/
  migrations/    # Stage 2 schema + Stage 3A own-profile policy
  tests/         # SQL-проверки и изолированный bootstrap
scripts/
  check-schema.sh # историческая схема Stage 2 в отдельном PostgreSQL
  seed-auth-users.mjs # локальный Auth Admin API, вне браузера
  test-auth-api.mjs # настоящие JWT и запросы к локальному API
  test-auth-isolated.mjs # отдельный Supabase, reset, API-проверки, очистка
docs/
  adr/           # архитектурные решения
  c1.md          # контекст
  c2.md          # контейнеры
  erd.md         # реализованная схема Stage 2
  smoke-checklist.md
  foundation-report.md
  stage2-report.md
  stage3a-report.md
```

## Маршруты

| URL | Заглушка |
| --- | --- |
| `/` | manager → `/objects`, executor → `/my-tasks`, без сессии → `/login` |
| `/login` | вход |
| `/objects` | список объектов |
| `/objects/:objectId` | карточка объекта |
| `/tasks/:taskId` | карточка задачи |
| `/my-tasks` | мои задачи |
| любой другой | 404 со ссылкой к объектам |

`/login` публичный; авторизованный пользователь с профилем автоматически попадает
на домашний маршрут своей роли. Четыре бизнес-маршрута защищены общим AuthGate.
Пока сессия и профиль загружаются, редирект не выполняется. Отсутствие профиля
или ошибка загрузки блокируют защищённые экраны; доступны повтор/выход.
404 не содержит данных и остаётся публичным. Route guard — только поведение UI;
доступ к данным определяется PostgreSQL и RLS.

## Архитектура и допущения

Документы приведены к архитектуре, предоставленной пользователем:
[ADR-001](docs/adr/ADR-001.md), [ADR-002](docs/adr/ADR-002.md),
[C1](docs/c1.md), [C2](docs/c2.md), [ERD](docs/erd.md).
Целевая схема: React SPA + TanStack Query → Supabase Auth / PostgREST →
PostgreSQL с RLS; критические изменения через защищённые SQL-функции.
TanStack Query отложен до бизнес-запросов: состояние единственной сессии и её
профиля сейчас управляется AuthProvider без дополнительного кеша/хранилища.
Статус ADR-001 сохранён как Proposed из присланного документа.

Hard delete каскадно удаляет задачи и историю. Переназначение разрешено в любом
статусе, сохраняет статус и историю, передаёт доступ новому исполнителю.
ERD отражает схему Stage 2: текстовые роли/статусы, `created_at` у объектов,
задач и истории, nullable `description`/`comment`/`from_status`.
Дополнительные решения и границы этапа описаны в ERD и отчёте Stage 2.

Не помещать секреты в `VITE_*`: эти значения включаются в клиентскую сборку.
Service role/secret ключи запрещены в клиенте и репозитории. `.env*` исключены
из Git, кроме будущего `.env.example` с несекретными образцами.

Результаты проверок и ограничения: [отчёт Foundation](docs/foundation-report.md).
Ручная проверка: [smoke checklist](docs/smoke-checklist.md).

## Стилизация

Tailwind CSS v4 подключён официальным плагином `@tailwindcss/vite`.
`src/app/globals.css` содержит импорты Tailwind/анимаций, CSS-переменные темы,
сопоставление токенов через `@theme inline` и глобальные правила страницы.
Размеры, отступы, переносы, типографика и состояния ссылок задаются utility-классами
в соответствующих React-компонентах. Цвета сохранены из первоначального UI.

shadcn/ui настроен в `components.json` (new-york, Radix, Lucide). Добавлены Button,
Input, Card, Badge, Table, Dialog, Select, Label в `src/components/ui`.
Card используется существующими заглушками; остальные компоненты подготовлены
без добавления новых форм и действий. Для слияния классов используется `cn` из
официально сгенерированных компонентов; отдельного слоя UI-обёрток нет.
Alias `@/` настроен одинаково в Vite и TypeScript. В ESLint разрешены только
именованные экспорты `buttonVariants`/`badgeVariants` в соответствующих UI-файлах.

Новые компонентные стили размещайте в JSX через Tailwind; меняйте палитру
через переменные темы. Тёмная тема не добавлена. Tailwind Preflight заменяет
ручной reset, старый `src/app/styles.css` удалён.

Отчёт, ограничения проверки и smoke: [UI-рефакторинг](docs/ui-refactor.md).


## Stage 2 — PostgreSQL schema

Миграция: `supabase/migrations/20261105000000_create_crm_schema.sql`.
Требуется PostgreSQL 14+ (включая `gen_random_uuid()`), существующая
`auth.users(id uuid PRIMARY KEY)` и роли `anon`/`authenticated` из Supabase.
Миграция применяется владельцем создаваемых таблиц через обычный механизм
SQL-миграций Supabase. Этот этап не создаёт Supabase-проект и не меняет Auth.

Таблицы: `profiles`, `objects`, `tasks`, `task_status_history`.
Роли/статусы ограничены CHECK; названия и адрес запрещают пустые/пробельные строки.
FK удаления объектов/задач каскадные, ссылки на пользователей/профили — RESTRICT.
RLS включён на всех таблицах без policies, у PUBLIC/anon/authenticated отозваны
все табличные привилегии. До следующих этапов клиентские запросы получают отказ.
Функций, триггеров workflow и публичного API смены статусов нет.

### Изолированная SQL-проверка

Установленные `initdb`, `pg_ctl` и `psql` одной версии PostgreSQL должны быть
доступны в PATH. Запускать обычным пользователем, не root:

```sh
bash scripts/check-schema.sh
```

Скрипт создаёт отдельный временный кластер с Unix socket, без TCP и без
подключения к существующим базам. Проверяет только историческую миграцию Stage 2
с нуля и её SQL-ограничения (она предполагает отсутствие policies),
затем останавливает и удаляет этот кластер. Никакие URL, пароли, service_role
или клиентские изменения для него не нужны.

`supabase/tests/stage2-bootstrap.sql` предназначен **только для пустой одноразовой
среды**: создаёт минимальную заглушку `auth.users` и две PostgreSQL-роли,
моделирует старые автоматические выдачи прав Supabase. Это не Auth и не реальные
аккаунты. Не применять bootstrap в Supabase или рабочей базе.
`stage2-schema.sql` использует синтетические UUID, временные SECURITY INVOKER
помощники и ROLLBACK; функций в прикладной схеме не добавляет.

Проверки выполнены на PostgreSQL 14.15: **173/173**, exit 0. Полный Supabase
Auth/PostgREST и облачный деплой не проверялись. Typecheck/lint/Vitest/build
не запускались на этом этапе согласно вашему запрету на автоматические проверки
фронтенда. Результаты, неоднозначности и ручной checklist:
[отчёт Stage 2](docs/stage2-report.md), [ERD](docs/erd.md).


## Stage 3A — локальный вход и аккаунты

Нужны Docker, Node/npm и установленный из lock-файла Supabase CLI.
Если стек уже работал до изменения Auth-конфига, остановите его командой
`npx supabase stop`, затем запустите заново, чтобы регистрация была отключена.

Для чистой локальной базы без ценных данных:

```sh
npx supabase start
npx supabase db reset
npm run auth:seed
```

`db reset` удаляет данные текущего локального проекта. Для существующей базы
можно применить новые версии через `npx supabase migration up` вместо reset.
Cloud/remote-флаги для локальных команд не использовать.

Скрипт `auth:seed` берёт URL и административный ключ только из локального
`supabase status`, проверяет loopback HTTP и совпадение порта с config.toml.
Произвольный URL/административный ключ через env не принимается. Он создаёт
через штатный Auth Admin API подтверждённые аккаунты и upsert профилей:

| Логин | Роль |
| --- | --- |
| `manager@mini-crm.test` | manager |
| `executor-a@mini-crm.test` | executor |
| `executor-b@mini-crm.test` | executor |

Случайные пароли находятся в **локальном** `.local/auth-users.json` (права 0600),
в Git не попадают и в вывод скрипта не печатаются. Откройте этот файл локально,
чтобы получить пароль соответствующего логина. Повторный запуск сохраняет ID
и сохранённые пароли; после reset создаёт пользователей заново. При утрате файла
паролей скрипт задаёт новые пароли этим трём локальным аккаунтам. Рабочие клиентские
учётные записи с другими адресами он не меняет.

Скрипт также создаёт `.local/frontend.env` **только с публичными** URL и ключом.
Перенесите две строки в `.env.local` (либо скопируйте файл, если текущий .env.local
не нужен), затем `npm run dev`. Образец переменных — `.env.example`:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable или legacy anon-ключ, не secret/service_role.

Административные ключи не записываются в файлы фронтенда. Никогда не помещайте их
в `VITE_*`: такие переменные встраиваются в браузерную сборку. Без публичной
конфигурации приложение показывает понятную ошибку вместо пустого экрана.
После изменения `.env.local` перезапустите Vite.

Локальная открытая регистрация отключена через `[auth] enable_signup = false`.
В Supabase Cloud аналогично отключите **Allow new users to sign up** в настройках
Auth / User Signups. Это настройка сервиса, а не SQL-миграция; локальный config
не отключает регистрацию в Cloud автоматически. Регистрация, reset password,
OAuth и MFA не реализованы.

### Проверки Stage 3A

```sh
npm run check              # typecheck, ESLint, Vitest, build
npm run test:auth-isolated # отдельный Supabase на 5632x, reset и настоящие JWT
```

Вторая команда не трогает основной локальный проект; после выполнения останавливает
только тестовый проект `mini-crm-stage3a-isolated` с удалением его БД. Нужны свободные
порты 56320–56329. Она запускает только Auth, API gateway, PostgREST и PostgreSQL;
конфигурация/синтетические пароли находятся под игнорируемым node_modules/.tmp.
Не запускайте несколько экземпляров этой проверки одновременно.

`npm run test:auth-api` выполняет те же API-проверки на **текущем локальном** проекте,
предварительно создавая три аккаунта. Используйте только в своей dev-среде:
проверки меняют user_metadata тестовых аккаунтов для доказательства, что роль
читается из profiles, и проверяют закрытую регистрацию. `auth:seed`/проверки
не запускаются автоматически при старте приложения.

Выполнено: 27 Vitest-тестов, 83 реальные API-проверки, 173 исторические SQL-проверки;
все прошли. TypeScript, ESLint и build прошли. Подробности, созданная policy,
ограничения и ручной smoke: [отчёт Stage 3A](docs/stage3a-report.md).
