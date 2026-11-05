# Мини-CRM «Объекты и задачи»

Stage 1 — Foundation принят. Stage 2 — Database Schema подготовлен: четыре
таблицы, ограничения, индексы и закрытый RLS в версионированной SQL-миграции.
Приложение показывает заглушки: подключения БД, авторизации, CRUD и workflow
ещё нет. Supabase SDK и ключи подключения для запуска фронтенда не требуются.

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
  app/           # оболочка, маршруты, стили и тесты маршрутизации
  components/ui/ # исходники базовых компонентов shadcn/ui
  pages/         # заглушки экранов
  shared/ui/     # общий компонент заглушки
  test/          # настройка jsdom и Testing Library
  main.tsx       # точка входа и BrowserRouter
supabase/
  migrations/    # версия схемы Stage 2
  tests/         # SQL-проверки и изолированный bootstrap
scripts/
  check-schema.sh # одноразовый локальный PostgreSQL-кластер для SQL-проверок
docs/
  adr/           # архитектурные решения
  c1.md          # контекст
  c2.md          # контейнеры
  erd.md         # реализованная схема Stage 2
  smoke-checklist.md
  foundation-report.md
  stage2-report.md
```

## Маршруты

| URL | Заглушка |
| --- | --- |
| `/` | переход на `/objects` |
| `/login` | вход |
| `/objects` | список объектов |
| `/objects/:objectId` | карточка объекта |
| `/tasks/:taskId` | карточка задачи |
| `/my-tasks` | мои задачи |
| любой другой | 404 со ссылкой к объектам |

В Foundation все маршруты открыты и меню одинаково для всех: пользователей,
сессий и данных ещё нет. Тесты проверяют маршрутизацию, параметры адреса,
навигацию и восстановление со страницы 404; проверки прав БД появятся при её реализации.

## Архитектура и допущения

Документы приведены к архитектуре, предоставленной пользователем:
[ADR-001](docs/adr/ADR-001.md), [ADR-002](docs/adr/ADR-002.md),
[C1](docs/c1.md), [C2](docs/c2.md), [ERD](docs/erd.md).
Целевая схема: React SPA + TanStack Query → Supabase Auth / PostgREST →
PostgreSQL с RLS; критические изменения через защищённые SQL-функции.
TanStack Query будет подключён вместе с API, в Foundation запросов нет.
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
подключения к существующим базам. Проверяет миграции с нуля и SQL-ограничения,
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
