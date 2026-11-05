# Отчёт об этапе 1 — Foundation

Дата: 2026-11-05.

## Реализовано

Создан React + TypeScript + Vite проект с React Router, пятью экранами-заглушками,
общей оболочкой и 404. Настроены строгий TypeScript, ESLint, Vitest, jsdom и
Testing Library. Удалены демонстрационные ресурсы Vite. Добавлены инструкции
проекта, архитектурные документы и место для будущих SQL-миграций.

## Созданные файлы

Проект был пустым; все перечисленные файлы новые.

- Корень: `.gitignore`, `.nvmrc`, `AGENTS.md`, `README.md`, `index.html`,
  `package.json`, `package-lock.json`, `eslint.config.js`, `vite.config.ts`,
  `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`.
- Вход: `src/main.tsx`.
- Оболочка: `src/app/App.tsx`, `src/app/styles.css`, `src/app/App.test.tsx`.
- Экраны: `src/pages/LoginPage.tsx`, `src/pages/ObjectsPage.tsx`,
  `src/pages/ObjectPage.tsx`, `src/pages/TaskPage.tsx`,
  `src/pages/MyTasksPage.tsx`, `src/pages/NotFoundPage.tsx`.
- Общий UI: `src/shared/ui/Placeholder.tsx`.
- Тестовая среда: `src/test/setup.ts`.
- Миграции: `supabase/migrations/.gitkeep` (SQL пока нет).
- Документы: `docs/adr/ADR-001.md`, `docs/adr/ADR-002.md`, `docs/c1.md`,
  `docs/c2.md`, `docs/erd.md`, `docs/smoke-checklist.md`, `docs/foundation-report.md`.

## Выполненные команды и результаты

- `npm create vite@latest . -- --template react-ts` — проект создан.
- Установка React Router и dev-зависимостей через `npm install` — завершена,
  `package-lock.json` создан.
- Первый `npm run check` выявил ошибку типов в тестах: неподдерживаемая опция
  `exact` в `getByRole`. Опция удалена, строковое имя уже задаёт точное совпадение.
- Повторный `npm run check` — **успешно**, включая все команды ниже:
  - `npm run typecheck` — успешно;
  - `npm run lint` — успешно, без предупреждений;
  - `npm run test` — 11 тестов, 1 файл, все прошли;
  - `npm run build` — успешно, production-артефакты в `dist/`.
- `npm audit --json` — exit 1: 10 moderate-предупреждений в цепочке
  dev-зависимостей ESLint / typescript-eslint / minimatch. Корневая advisory:
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  Автоматические принудительные смены major-версий и overrides не применялись.
- `npm audit --omit=dev` — exit 0, **0 уязвимостей production-зависимостей**.
- `npm run preview -- --host 127.0.0.1` — локальный preview запущен для браузерной
  проверки. Первый запуск в sandbox получил EPERM при открытии порта; после
  разрешённого повторного запуска сервер работал. Публикация не выполнялась.

В браузере на production preview подтверждены: переход `/ → /objects`,
навигация к «Моим задачам» и «Входу», прямой URL объекта, прямой URL задачи
с обновлением страницы, 404 и возврат к объектам. Карточка объекта визуально
проверена на ширине 1280 px. Полный ручной checklist, включая мобильную ширину,
клавиатуру и DevTools Network/Console, не выполнялся; он приложен отдельно.

## Smoke checklist

Подробные шаги: [smoke-checklist.md](smoke-checklist.md).
Для самостоятельной проверки: `npm ci`, `npm run check`, `npm run dev`; открыть
пять маршрутов, проверить навигацию, перезагрузку карточек и неизвестный URL.

## Ограничения и решения, ожидающие подтверждения

- Архитектура предоставлена пользователем после первой сдачи Foundation.
  ADR/C1/C2/ERD и README приведены к ней. Статус ADR-001 оставлен Proposed,
  как в исходном документе; дополнительные детали ERD явно отмечены.
- Реальная БД, Auth, RLS, CRUD, переходы статусов, история и тестовые аккаунты
  не реализованы: это границы этапа 1. Документы описывают будущую защиту,
  но не доказывают её работу.
- Все заглушки открыты, ролевой интерфейс появится вместе с авторизацией.
- Есть указанные предупреждения audit в dev-зависимостях; потребуются совместимые
  исправленные версии инструментов. Проверки проекта при этом проходят.
- Деплой, GitHub-репозиторий и коммиты не выполнялись.

Этап завершён. Последующие этапы требуют отдельного одобрения пользователя.

## Уточнение Foundation по предоставленной архитектуре

Изменены только документы: `docs/adr/ADR-001.md`, `docs/adr/ADR-002.md`,
`docs/c1.md`, `docs/c2.md`, `docs/erd.md`, `README.md` и этот отчёт.

- Зафиксированы Data API для чтения/разрешённого CRUD и защищённые SQL-функции
  для критических изменений, включая статусы и переназначение.
- В C2 включён TanStack Query как целевой инструмент работы с серверными данными;
  подключение зависимости и QueryClient отложено до появления API.
- В ERD роли и статусы имеют тип text, время истории — created_at;
  display_name удалён. Поля title/description/created_at задачи сохранены по ТЗ.
- В ADR-002 выделены согласованные hard delete и переназначение без смены статуса.
- Дополнения к исходной схеме и ещё не утверждённые детали помечены отдельно.

Проверки после уточнения: результаты повторного `npm run check` приведены ниже.
Smoke: использовать прежний checklist; документы не меняют работу экранов.
Повторная браузерная проверка для этого изменения не выполнялась.

Повторный `npm run check` после обновления документов — exit 0:
typecheck и ESLint без ошибок, Vitest — 11/11, production build успешно.
`git diff --check` — exit 0 (все новые файлы пока untracked, поэтому команда
не проверяет их содержимое как tracked diff). Audit повторно не запускался:
зависимости и lock-файл не менялись, ранее найденные dev-предупреждения остаются.
