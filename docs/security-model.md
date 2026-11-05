# Модель безопасности

Документ описывает код и шесть [миграций](../supabase/migrations), а не результаты
нового аудита. Модель предназначена для пользователей приложения, не администратора БД.

## Аутентификация и сессия

- Supabase Auth проверяет email/password и выдаёт JWT — подписанный токен
  пользователя. SDK передаёт JWT PostgREST; `auth.uid()` получает его UUID
  из серверного контекста запроса.
- Один [AuthProvider](../src/app/providers/AuthProvider.tsx) восстанавливает сессию,
  слушает изменения Auth и загружает профиль. Подписка очищается, устаревшие
  запросы профиля отменяются. До завершения загрузки защищённые экраны не открываются.
- Supabase SDK использует persistSession/autoRefreshToken и хранит сессию в браузере.
  Роль берётся из `profiles`, не из email или редактируемых `user_metadata`.
  Отсутствие профиля блокирует защищённые экраны.
- Выход использует `signOut({ scope: 'local' })`: это не глобальный выход со всех
  устройств и не гарантия мгновенного отзыва уже выпущенного access JWT. Клиент
  закрывает маршруты и очищает кеш бизнес-данных текущей сессии.
- В [config.toml](../supabase/config.toml) `[auth].enable_signup = false`,
  `enable_anonymous_sign_ins = false`. Для Cloud отдельно запретите публичную
  регистрацию и анонимные входы в настройках Authentication. Локальный TOML
  не подтверждает облачные настройки. Создание аккаунтов администратором допустимо.

## Ключи и локальные административные инструменты

В браузере только `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
[Клиент](../src/shared/api/supabase.ts) принимает publishable либо legacy anon-ключ
и сообщает об отсутствующей/ошибочной конфигурации. Эти ключи публичные; права
ограничиваются JWT, grants и RLS, а не сокрытием публичного ключа.

Service_role/secret-ключи запрещены в `VITE_*`, исходниках, Git и сборке.
[Seed](../scripts/seed-auth-users.mjs) получает административный ключ из локального
CLI status; проверяет localhost, HTTP и порт из конфигурации, не принимает URL Cloud.
Ключи не записываются в файл аккаунтов. Случайные пароли — в игнорируемом
`.local/auth-users.json` с правами владельца. Скрипт не импортируется React
и не запускается автоматически вместе с frontend.

## Авторизация: таблицы, grants и RLS

`profiles.id` ссылается на `auth.users.id`; `role` ограничена CHECK значениями
`manager`/`executor`. Профили создаются административно. RLS включён на четырёх
прикладных таблицах; FORCE RLS не включён.

Привилегии выдаются PostgreSQL-роли `authenticated`, а прикладную роль конкретного
пользователя policies проверяют через `profiles`:

| Таблица | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `profiles` | свои `id/role` | нет | нет | нет |
| `objects` | manager — всё; executor — объекты со своими задачами | manager, `name/address` | manager, `name/address` | manager |
| `tasks` | manager — всё; executor — назначенные | только через RPC | manager, `title/description` | manager |
| `task_status_history` | manager — всё; executor — история назначенной задачи | внутри SQL-функций | нет | нет напрямую |

У anon/PUBLIC нет прикладных табличных прав. Клиент не обновляет напрямую
`tasks.status/assignee_id/author_id/object_id/id/created_at`, у объектов —
`id/created_at`. Исполнитель не редактирует даже разрешённые для UPDATE столбцы:
RLS допускает UPDATE только manager. Роль собственного профиля клиент не меняет.

Policies: `profiles_select_own`; `objects_select_visible`, `objects_insert_manager`,
`objects_update_manager`, `objects_delete_manager`; `tasks_select_visible`,
`tasks_update_manager`, `tasks_delete_manager`; `history_select_visible_task`.
Зависимости ацикличны: `objects → tasks → profiles`,
`task_status_history → tasks → profiles`. Policy задач не читает объекты/историю.
История видна, только если строка задачи видна через tasks RLS.

## Защищённые SQL RPC

Все шесть функций — SECURITY DEFINER, `SET search_path = ''`, квалифицированные
имена объектов, без динамического SQL. PUBLIC/anon не имеют EXECUTE;
authenticated имеет EXECUTE с внутренней проверкой доступа.

У пяти функций явно задан owner postgres. `list_executors` наследует владельца
от роли, применившей миграцию; в стандартном процессе это postgres.
Перед публикацией проверьте фактических владельцев и ACL **всех шести функций**.

| Сигнатура | Результат и проверки |
| --- | --- |
| `create_task(p_object_id uuid, p_assignee_id uuid, p_title text, p_description text DEFAULT NULL)` | `public.tasks`; manager; executor с FOR SHARE; сервер задаёт автора, new, UUID/дату и первичную историю |
| `list_executors()` | `(id uuid, email text)`; только manager; только профили executor |
| `transition_task(p_task_id uuid, p_target_status text, p_comment text DEFAULT NULL)` | `public.tasks`; профиль, назначение, FOR UPDATE, пара статусов, комментарий возврата |
| `reassign_task(p_task_id uuid, p_assignee_id uuid)` | `public.tasks`; manager; FOR UPDATE задачи; executor/FOR SHARE профиля; любой статус; прежний исполнитель — no-op |
| `read_task_history(p_task_id uuid)` | история + `actor_email`; manager либо текущий назначенный executor; без профиля/доступа — пустой набор |
| `read_task(p_task_id uuid)` | задача + `author_email/assignee_email`; та же явная проверка; без доступа — пустой набор |

SECURITY DEFINER исполняется с правами владельца и может обходить RLS. Поэтому
read-RPC **сами** фильтруют задачу по `auth.uid()`/`profiles` и назначению.
Они не открывают общий каталог Auth: email возвращается только в контексте
доступной задачи/истории. Изменений данных эти две функции не выполняют.

### Переходы и конкурентные команды

Разрешены `new → in_progress`, `in_progress → in_review`, `rework → in_progress`
для назначенного executor и `in_review → accepted/rework` для manager.
Manager не подменяет executor; `accepted` терминальный. Комментарий возврата
проверяется на непробельный символ, включая запрет строк только из табов/переводов строк.

Переход и переназначение блокируют одну строку задачи `FOR UPDATE` и проверяют
состояние после ожидания. Неверный переход отклоняется с `40001`, недостаточные
права — `42501`, пустой комментарий — `22023`. Ошибка не сохраняет частичных изменений.

Переназначение сохраняет статус/историю, в том числе в `accepted`. Старый executor
теряет доступ при новых запросах, новый получает всю историю. Уже загруженные
данные дистанционно не стираются — Realtime нет. UI перечитывает CRM-query keys
после успеха/ошибки; не показывает оптимистичный статус и не повторяет команды автоматически.

## История и удаление

Записи создают `create_task` (`NULL → new`) и `transition_task` в той же транзакции,
что задачу/статус. `actor_id = auth.uid()`, время — `clock_timestamp()`; браузер
не принимает решения об этих полях. Порядок чтения — `created_at ASC, id ASC`.
Задачи до Stage 5 не получили фиктивного начального события.

Прямые INSERT/UPDATE/DELETE/TRUNCATE истории клиенту не выданы. Manager может
удалить задачу/объект; FK CASCADE удаляют связанную историю без прямого DELETE-grant
на неё. Это согласованное удаление, а не произвольное исправление событий.
Ссылки на пользователей/профили используют RESTRICT, каскада аккаунтов нет.

## Границы защиты и проверка

Владелец таблиц, администратор БД и service_role — доверенный административный
контур за пределами обычных пользовательских прав. Они способны менять роли,
данные и историю; RLS не ограничивает их как обычного пользователя.
Защита административного доступа, браузера, HTTPS, резервных копий и настроек
Cloud требует отдельной эксплуатационной проверки. Абсолютная безопасность не заявляется.

Реальные JWT-проверки: [Auth](../scripts/test-auth-api.mjs),
[CRUD](../scripts/test-crud-api.mjs), [Workflow](../scripts/test-workflow-api.mjs).
Admin используется для fixtures, каталогов и проверки результата, не вместо
обычного пользователя. Последние тесты email ещё не подтверждены свежим прогоном.
Команды: [README](../README.md).
