# Stage 3B + 4 — Authorization, Objects & Tasks CRUD

Дата: 2026-11-05. Этап ограничен бизнес-доступом и CRUD.

## Реализовано

- Объекты: список, карточка, создание, редактирование названия/адреса и удаление
  постановщиком с явным подтверждением; список задач внутри объекта.
- Задачи: создание внутри объекта с выбором executor по email, карточка,
  изменение названия/описания и удаление с подтверждением. Статус, автор,
  исполнитель и время отображаются без действий workflow.
- Executor получает «Мои задачи» и видимые объекты; действия изменения не показываются.
  Прямые API-запросы ограничиваются PostgreSQL независимо от кнопок.
- TanStack Query для чтения и мутаций, загрузка/ошибка с повтором/пустой список.
  После успешной записи инвалидируются crm-ключи. QueryClient отдельный для
  сессии id/роль, без persist; при выходе запросы отменяются и кеш очищается.
  Данные предыдущего пользователя не используются после нового входа.
- Сохранены Router, AuthProvider и публичный SDK-клиент. Изменение LoginPage —
  только замена deprecated FormEvent на SubmitEvent по замечанию пользователя;
  тот же актуальный тип используется в обеих новых формах.

## SQL и привилегии

Миграция: `supabase/migrations/20261105020000_business_crud_access.sql`.
Существующие таблицы, FK, CHECK и данные не меняются.

| Таблица/операция | authenticated | Ограничение |
| --- | --- | --- |
| objects SELECT | grant | manager — все; executor — объекты со своей задачей |
| objects INSERT | name/address | только manager, UUID/created_at по умолчанию БД |
| objects UPDATE | name/address | только manager |
| objects DELETE | grant | только manager, CASCADE задач и истории |
| tasks SELECT | grant | manager — все; executor — только assignee_id=auth.uid() |
| tasks INSERT | отсутствует | только защищённый create_task RPC |
| tasks UPDATE | title/description | только manager, без служебных полей |
| tasks DELETE | grant | только manager |
| profiles | без изменений | существующая policy чтения себя |
| task_status_history | без изменений | прямые клиентские операции по-прежнему закрыты |

Семь новых policies:

- `tasks_select_visible`, `tasks_update_manager`, `tasks_delete_manager`;
- `objects_select_visible`, `objects_insert_manager`,
  `objects_update_manager`, `objects_delete_manager`.

Проверка роли — EXISTS собственной строки profiles, не email/JWT metadata.
Зависимости policies ацикличны: objects → tasks → profiles; задачи в своих
policies не читают objects. RLS не выключается. PUBLIC/anon не получают прав.
Grant DELETE/UPDATE для authenticated не даёт executor разрешение на строки:
это ограничивается manager-policy. Такие запросы могут вернуть 200 с пустым
списком вместо ошибки; интеграционные проверки учитывают оба варианта отказа.

Две SQL-функции SECURITY DEFINER с `SET search_path = ''`, полными именами
таблиц, без dynamic SQL, EXECUTE только authenticated и проверкой caller/роли:

1. `create_task(uuid, uuid, text, text)` проверяет manager, проверяет executor
   с FOR SHARE на строке профиля, создаёт new и author_id=auth.uid(). Параметров
   author/status/id/time нет, прямой INSERT не предоставлен. Это создание,
   не RPC перехода статуса. Из браузера невозможно подменить служебные поля.
2. `list_executors()` выдаёт только manager список UUID/email исполнителей для
   назначения, не расширяя profiles-policy и не открывая каталог Auth для executor.

Столбцы tasks.status/author_id/assignee_id/object_id/id/created_at не имеют
UPDATE-grant. Назначение существующей задачи, переходы и история не реализованы.
Владелец БД/service-role остаётся административным контуром вне браузера.

## Изменённые файлы

- `supabase/migrations/20261105020000_business_crud_access.sql`.
- `package.json`, `package-lock.json`: TanStack Query и команды CRUD-проверок.
- `src/app/App.tsx`: QueryProvider внутри защищённых маршрутов, удалена устаревшая
  пометка о закрытых бизнес-экранах.
- `src/app/providers/CrmQueryProvider.tsx`: сессионный QueryClient и очистка.
- `src/features/crm/api.ts`: типы, Data API, разрешённые payload и RPC создания.
- `src/features/crm/query.ts`: identity и инвалидация после мутации.
- `src/features/crm/status.ts`: отображаемые названия существующих статусов.
- `src/features/crm/ui/QueryFeedback.tsx`, `TaskList.tsx`, `ObjectEditor.tsx`,
  `TaskEditor.tsx`, `DeleteAction.tsx`: состояния, списки и доменные формы.
- `src/pages/ObjectsPage.tsx`, `ObjectPage.tsx`, `TaskPage.tsx`, `MyTasksPage.tsx`.
- `src/pages/LoginPage.tsx`: корректировка типа submit-события.
- `src/app/App.test.tsx`: Auth-регрессия с mock бизнес-API, CRUD и кеш.
- `scripts/test-crud-api.mjs`: реальные запросы manager/A/B/anon и очистка fixtures.
- `scripts/test-auth-isolated.mjs`: режим --crud на отдельном проекте/портах,
  исторический режим сохраняет только миграции до Stage 3A.
- `scripts/test-auth-api.mjs`: all-business-closed проверки только для Stage 3A
  baseline; на актуальной схеме остаются Auth/profile-проверки.
- `README.md`, `docs/c2.md`, `docs/erd.md`, `docs/stage3b-4-report.md`.

## Результаты проверок

| Команда | Фактический результат |
| --- | --- |
| `npm install @tanstack/react-query` | Успешно; npm сообщил прежние 10 moderate warnings |
| `npm run check` | exit 0: typecheck, lint, 32 Vitest-теста, production build |
| `npm run test:crud-isolated` | exit 0: все миграции с нуля, 87 реальных JWT/API-проверок |
| `npm run test:auth-isolated` | exit 0: 83 исторические Auth/API-проверки Stage 3A |
| `npm run lint` после изменения runner | Успешно, без замечаний |

Первый typecheck обнаружил abortSignal после maybeSingle: порядок исправлен.
ESLint потребовал разделить React-компонент QueryProvider и хуки; правило
не отключалось. Финальный полный прогон прошёл.

CRUD-проверки покрыли все 12 требований задания и дополнительно: серверный
status/author при создании, отсутствующего executor/объект, пустые строки,
manager/executor directory, неизменность profiles self-only, подмену metadata,
все защищённые PATCH-колонки, запреты I/U/D истории, сохранение несвязанной задачи,
потерю видимости объекта после удаления последней назначенной задачи.
История для проверки CASCADE внесена только административным fixture-кодом;
новая бизнес-функция истории не добавлена.

React-тесты проверяют создание объекта и инвалидацию, обязательное подтверждение
удаления/отмену, отсутствие CRUD-кнопок executor, StrictMode, очистку данных
manager при новом входе executor, а также прежние сценарии сессии и маршрутов.

Полный новый SQL-стек проверен через Supabase Auth + PostgREST с настоящими JWT
на отдельном `mini-crm-crud-isolated` (порты 5732x). Reset выполнялся только там.
Auth-baseline проверен отдельно на `mini-crm-stage3a-isolated` (5632x).
Оба тестовых проекта остановлены с удалением своих БД. Основной CRM_Superbased
не мигрировался, его данные не изменялись. Ключи/пароли не выводились и не записаны
в исходники. Ручной браузерный smoke агент не выполнял.

## Короткий ручной smoke checklist — пользователь, 5 сценариев

1. Применить `npx supabase migration up` в своём локальном проекте, войти manager:
   создать объект, изменить название/адрес; список и карточка показывают изменения.
2. Внутри объекта создать задачу для executor A; проверить new, текущего автора,
   выбранного исполнителя; изменить название/описание, увидеть обновлённые данные.
3. Войти A: задача видна в «Моих задачах» и внутри объекта, CRUD-кнопок и кнопок
   смены статуса нет. Войти B: задача A и объект без задач B недоступны по прямым URL.
4. Войти manager: отменить удаление задачи, убедиться, что она осталась; подтвердить
   удаление, затем удалить объект с задачами — списки обновляются, возврат работает.
5. Проверить пустой список и ошибку сети с повтором; выйти и войти другой ролью —
   старые данные не появляются, форма и подтверждения читаемы на мобильной ширине.

## Известные ограничения

- Переназначение, workflow, RPC переходов и история в UI сознательно отсутствуют.
  Новые задачи всегда new, существующие статусы показываются без кнопок переходов.
- Автор/исполнитель в карточке показаны UUID с «вы» для текущего пользователя;
  email доступен manager в выпадающем выборе, отдельного справочника авторов нет.
- Нет пагинации, фильтров, realtime-синхронизации с чужими браузерами и разрешения
  конфликтов редактирования. Обновление — после своих мутаций, повтором/фокусом
  страницы или перезагрузкой. Действует лимит строк Data API.
- Повторные INSERT при потере ответа не имеют idempotency key; mutation retry
  по умолчанию выключен. Параллельное редактирование — last write wins.
- Build прошёл с предупреждением Vite о chunk 665.42 KB (gzip 199.39 KB).
  Лимит не подавлялся, косметический code splitting в этот проход не добавлялся.
- Прежние 10 moderate warnings зависимостей остаются; force-update не выполнялся.
- SQL/React/API-проверки не заменяют ручной UI-smoke, его выполняет пользователь.
- Деплоя, коммита и перехода к workflow нет.

Источники технических решений:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[функции и привилегии](https://supabase.com/docs/guides/database/functions),
[TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).
