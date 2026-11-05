# Stage 3A — Authentication & Session Management

Дата: 2026-11-05. Stage 3B не реализован. Ручные смоуки выполняет пользователь.

## Реализовано и архитектура

- Официальный `@supabase/supabase-js`, единый экземпляр в shared/api/supabase.ts.
  Публичные настройки берутся из VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY.
  Поддержан publishable и legacy anon-ключ; secret/service_role отклоняется.
  Отсутствующая/неверная конфигурация даёт сообщение, а не пустую страницу.
- Supabase SDK отвечает за хранение/восстановление сессии и обновление токена.
  Собственного localStorage-хранилища ролей нет. Сетевые fetch ограничены 15 секундами.
- Один AuthProvider хранит состояние loading/anonymous/authenticated/error,
  сессию и её профиль. Пользователь берётся из session.user; отдельного хранилища нет.
- Подписка onAuthStateChange создаётся при монтировании и снимается cleanup.
  В callback нет запросов к Supabase: загрузка профиля отложена на следующий task.
  AbortController, флаг жизненного цикла и ревизия запроса исключают применение
  устаревшего профиля после смены пользователя/выхода/размонтирования.
- После входа через signInWithPassword профиль читается из public.profiles,
  роль валидируется. Email и редактируемые user_metadata не определяют права.
  Отсутствие профиля/ошибка блокируют защищённые маршруты с повтором и выходом.
- Общий route gate закрывает четыре бизнес-маршрута. До завершения восстановления
  и загрузки профиля показывается loading, ложного редиректа нет.
  Manager попадает на /objects, executor — /my-tasks; /login для вошедшего
  перенаправляет домой. Публичная 404 не содержит данных.
- Выход вызывает auth.signOut({scope: 'local'}): очищает текущую браузерную
  сессию и блокирует защищённые экраны. Сессии на других устройствах не завершаются.
  Ошибка выхода также блокирует экраны и позволяет повторить выход.
- Форма на существующих Input/Label/Button, role badge и выход в оболочке.
  Бизнес-экраны остаются заглушками. Redux/MobX/TanStack Query не добавлялись:
  кеш бизнес-данных в этот этап не входит.

## Миграция и policy

`supabase/migrations/20261105010000_allow_own_profile_read.sql`:

```sql
alter table public.profiles enable row level security;
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select (id, role) on table public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
```

Читаются только id/role собственного профиля. INSERT/UPDATE/DELETE отсутствуют.
На objects/tasks/task_status_history не добавлены policies, grants или изменения
схемы. Нет SECURITY DEFINER, функций RPC и workflow. Route guard отвечает за UI;
реальные ограничения действуют в PostgreSQL при прямом обращении к API.

`[auth] enable_signup = false` отключает регистрацию локально. Настройку Cloud
нужно отдельно применить в Auth → User Signups → Allow new users to sign up (off).
Локальный config не изменяет Cloud автоматически. Регистрация, reset password,
OAuth, MFA, CRUD и история не реализованы.

## Изменённые файлы

- `.gitignore`, `.env.example`: публичная конфигурация и исключение .local.
- `package.json`, `package-lock.json`: SDK и команды аккаунтов/API-проверок.
- `eslint.config.js`: lint для Node-скриптов .mjs.
- `src/shared/api/supabase.ts`, `src/shared/api/supabase.test.ts`.
- `src/app/providers/AuthProvider.tsx`.
- `src/features/auth/model/auth-context.ts`.
- `src/features/auth/api/profile.ts`.
- `src/features/auth/ui/AuthGate.tsx`.
- `src/app/App.tsx`, `src/app/App.test.tsx`, `src/main.tsx`.
- `src/pages/LoginPage.tsx`.
- `supabase/config.toml`: регистрация выключена, автоматический seed выключен;
  аккаунты создаются отдельной административной командой.
- `supabase/migrations/20261105010000_allow_own_profile_read.sql`.
- `scripts/lib/local-supabase.mjs`, `scripts/seed-auth-users.mjs`.
- `scripts/test-auth-api.mjs`, `scripts/test-auth-isolated.mjs`.
- `scripts/check-schema.sh`: исторические 173 проверки закреплены за миграцией
  Stage 2, так как их bootstrap не реализует auth.uid и ожидает отсутствие policies.
  Полная цепочка миграций Stage 3A проверяется настоящим Supabase, не заглушкой Auth.
- `README.md`, `docs/c2.md`, `docs/erd.md`, `docs/stage3a-report.md`.

Приложенный read-only снимок file_check-schema.sh изучен и не изменялся.

## Автоматические проверки — фактические результаты

| Команда | Результат |
| --- | --- |
| `npm install @supabase/supabase-js` | Успешно; npm сообщает прежние 10 moderate-предупреждений dev-цепочки |
| `npm run check` | exit 0: typecheck, ESLint, 27 Vitest-тестов, build |
| `npm run test:auth-isolated` | exit 0: отдельный Supabase, db reset с нуля, 83 настоящие API-проверки, остановка/удаление тестовой БД |
| `bash scripts/check-schema.sh` | exit 0: 173 исторические SQL-проверки на PostgreSQL 14.15 |

Первый lint выявил неиспользуемый аргумент в fake client и отсутствие cause
у ошибки тестового runner; оба исправлены. Первый прогон Vitest выявил конфликт
ролей status у индикатора и тестового output; тестовый индикатор URL заменён
на span. Повторный полный `npm run check` прошёл.

Vitest проверяет вход, неверные credentials, сетевую ошибку, восстановление сессии,
все защищённые маршруты, домашние маршруты обеих ролей, отсутствие раннего
редиректа, missing/invalid profile, retry, выход, внешний SIGNED_OUT, устаревший
ответ профиля после выхода, unsubscribe, ошибку инициализации и конфигурацию ключей.

API-проверки используют настоящий Auth, PostgREST и JWT трёх аккаунтов, а не
имитацию через SQL SET ROLE. Проверены:

- закрытая регистрация и неверный пароль;
- вход всех трёх аккаунтов, чтение своей роли;
- невозможность получить чужой профиль через фильтр и общий список;
- запрет создания/удаления профиля и изменения своей роли;
- изменение user_metadata.role не меняет роль profiles;
- SELECT/INSERT/UPDATE/DELETE всех трёх бизнес-таблиц запрещены каждой роли;
- очистка SDK-сессии при выходе и запрет чтения profiles без неё;
- анонимное чтение всех четырёх таблиц запрещено;
- контроль неизменности ролей административным чтением;
- повторное создание аккаунтов сохраняет ID и сохранённые пароли.

Изолированный проект: mini-crm-stage3a-isolated, порты 5632x. Для него выполнен
`npx --no-install supabase db reset --yes --workdir <isolated-workdir>` (CLI 3,
локальная цель по умолчанию, без remote-флагов). Основной CRM_Superbased
и его данные не изменялись. По окончании только тестовый проект остановлен
с --no-backup. Ключи из stdout CLI намеренно не печатались.

## Запуск аккаунтов локально

1. Для уже запущенного стека выполнить `npx supabase stop`, затем
   `npx supabase start`, чтобы применить закрытую регистрацию.
2. `npx supabase migration up` применяет недостающие локальные миграции без reset.
   На одноразовой dev-базе вместо этого можно `npx supabase db reset`, учитывая
   удаление её данных. Никогда не передавать remote-флаги для этого сценария.
3. `npm run auth:seed` создаёт три аккаунта и соответствующие profiles.
4. Логины: manager@mini-crm.test, executor-a@mini-crm.test, executor-b@mini-crm.test.
   Пароли получить локально из `.local/auth-users.json`, права 0600.
5. Перенести публичные строки из `.local/frontend.env` в `.env.local`.
   Административного ключа в этом файле нет. Затем запустить `npm run dev`.

Скрипт использует штатный Auth Admin API, берёт ключи только из локального
CLI status и проверяет loopback HTTP/порт config.toml. URL и admin key через
env не принимает, Cloud использовать не может. SUPABASE_LOCAL_WORKDIR выбирает
только локальный рабочий каталог CLI (нужен также изолированным тестам).
Пароли случайные, в Git/вывод не попадают. При повторе ID и сохранённые пароли
остаются; после db reset пользователи создаются заново. Если локальный файл
паролей утрачен, скрипт обновит пароли этих трёх тестовых аккаунтов.
Скрипты не импортируются фронтендом и не запускаются при старте приложения.

## Ручной smoke checklist — выполняет пользователь

1. Без .env.local открыть приложение: понятная ошибка конфигурации.
2. Настроить публичные переменные, подготовить аккаунты по инструкции выше.
3. Без сессии открыть /objects, /objects/demo, /tasks/demo, /my-tasks:
   каждый маршрут ведёт на /login. При throttling сначала виден loading.
4. Ввести неверный пароль: ошибка, кнопка снова доступна; формы регистрации нет.
5. Войти manager: /objects, роль «Постановщик». Открыть /login повторно:
   форма не показывается, переход на /objects.
6. Открыть карточку /tasks/demo и обновить: после loading тот же маршрут,
   промежуточного показа формы входа нет.
7. Выйти: /login; «Назад» или прямой защищённый URL не возвращают доступ.
8. Войти executor A и B по очереди: /my-tasks, роль «Исполнитель».
9. Только в локальной dev-базе временно удалить профиль тестового пользователя
   без задач; после повторного входа показывается ошибка missing profile,
   защищённые экраны недоступны, выход работает. Восстановить через auth:seed.
10. Отключить сеть при входе или загрузке профиля: понятная ошибка, затем
    повтор после восстановления сети. При SDK retry возможна задержка.
11. Проверить Tab/Enter и ширины 375/1280 px: форма читаема, кнопки доступны,
    сообщения об ошибке не ломают ширину. В Console нет ошибок приложения.
12. Вторая вкладка: выход в первой приводит к потере сессии во второй через SDK.
13. Проверить реальные права командой `npm run test:auth-isolated` либо
    `npm run test:auth-api` на текущей dev-базе. Последняя команда меняет metadata
    тестовых аккаунтов для проверки невозможности повысить роль.

Ручные UI/браузерные смоуки агент не запускал.

## Ограничения и риски

- Бизнес-таблицы специально закрыты даже для manager: их доступ — Stage 3B.
- Cloud-настройка регистрации не применяется локальным config автоматически.
- Роль в UI перечитывается при auth-событиях/повторе, без realtime-подписки
  на profiles; права данных всегда проверяются текущим состоянием PostgreSQL.
- SDK хранит токены в браузерном хранилище; отдельной серверной cookie-сессии
  и backend нет. Local signOut не отзывает уже выданный access JWT немедленно:
  стандартный JWT может действовать до истечения срока; токен удаляется из SDK.
- Изолированная проверка требует Docker и свободных 5632x; параллельные запуски
  одного тестового проекта не поддерживаются. Локальные файлы паролей секретны,
  хотя и исключены из Git. Основной локальный проект агент не мигрировал/не засевал.
- Production build прошёл с предупреждением Vite о chunk 519.39 KB (gzip 154.14 KB).
  Лимит не подавлялся; code splitting вне необходимого объёма этого этапа.
- В npm сохраняются 10 moderate-предупреждений, существовавших в dev-зависимостях;
  принудительных обновлений/отдельного audit в этом этапе нет.
- Браузерный ручной smoke и Cloud-проверки остаются пользователю. Коммитов,
  деплоя и перехода к Stage 3B нет.

## Документация решений

- [Supabase onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
