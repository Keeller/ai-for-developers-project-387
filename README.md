# Календарь звонков — командный GitHub-процесс

[![CI](https://github.com/Keeller/ai-for-developers-project-387/actions/workflows/ci.yml/badge.svg)](https://github.com/Keeller/ai-for-developers-project-387/actions/workflows/ci.yml)
[![hexlet-check](https://github.com/Keeller/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/Keeller/ai-for-developers-project-387/actions)

Учебный сервис, в котором Владелец календаря публикует Типы событий и
Доступность, а Гость выбирает свободный Слот и создаёт Бронирование.

## План развития

Следующие пользовательские запросы и наблюдаемые дефекты собраны в
[`product/development-plan.md`](product/development-plan.md). Они намеренно
описывают проблему без заранее выбранного технического решения.

## Опубликованное приложение

- Production: <https://calendar-booking-production-382e.up.railway.app>
- Health endpoint: <https://calendar-booking-production-382e.up.railway.app/api/health>

Приложение развёрнуто в Railway из корневого `Dockerfile` и использует
постоянную PostgreSQL-базу.

Проектная конфигурация Railway MCP хранится без секретов в
`.codex/config.toml`. При первом использовании Codex запрашивает OAuth-доступ к
Railway; токены в репозиторий не записываются.

## Стек

- Node.js 24 и npm workspaces
- Fastify и TypeScript — backend
- React, Vite и Mantine — frontend
- PostgreSQL — постоянное хранение и атомарная защита Слотов
- Vitest и Playwright — тесты
- ESLint и Prettier — статические проверки
- GitHub Actions и release-please — CI и релизы
- Docker — единый production-образ frontend и backend
- TypeSpec, OpenAPI и Hey API — единый контракт frontend/backend

## Установка

```bash
git clone https://github.com/Keeller/ai-for-developers-project-387.git
cd ai-for-developers-project-387
npm ci
```

## Локальный запуск

Для режима разработки сначала запустите отдельную PostgreSQL:

```bash
docker run --detach --rm --name calendar-booking-dev-db \
  --publish 127.0.0.1:55432:5432 \
  --env POSTGRES_DB=calendar_booking \
  --env POSTGRES_USER=calendar_booking \
  --env POSTGRES_PASSWORD=calendar_booking \
  postgres:17-alpine

DATABASE_URL=postgres://calendar_booking:calendar_booking@127.0.0.1:55432/calendar_booking npm run dev
```

После запуска доступны:

- frontend — <http://localhost:5173>;
- проверка backend — <http://127.0.0.1:3000/api/health>.

Vite перенаправляет запросы frontend с префиксом `/api` на локальный Fastify.
Предметные маршруты требуют `DATABASE_URL`; без него доступна только
проверка работоспособности. Порт backend можно изменить переменной `PORT`,
адрес — переменной `HOST`.

## Запуск в Docker

Production-образ собирает оба приложения и запускает один Fastify-процесс,
который отдаёт API и статические файлы frontend. Команда запуска поднимает
также PostgreSQL с именованным Docker volume:

```bash
npm run docker:build
npm run docker:run
```

После запуска приложение доступно на <http://localhost:3000>, health endpoint —
на <http://localhost:3000/api/health>. Собрать и запустить весь стек одной командой можно так:

```bash
docker compose up --build
```

Контейнер запускается от непривилегированного пользователя и содержит встроенную
проверку работоспособности. Именованный volume сохраняет данные между
перезапусками. Переменные `HOST` и `PORT` внутри готового образа по умолчанию равны
`0.0.0.0` и `3000`. Проверка работоспособности использует фактическое значение
`PORT`. Для запуска Compose на другом порту передайте, например,
`APP_PORT=3101 docker compose up --build`: переменная задаст и порт контейнера,
и опубликованный порт хоста.

## Проверки

HTTP integration-тесты сбрасывают схему отдельной тестовой PostgreSQL, поэтому
не указывайте им базу разработки. По умолчанию они ожидают базу на порту `55433`:

```bash
docker run --detach --rm --name calendar-booking-test-db \
  --publish 127.0.0.1:55433:5432 \
  --env POSTGRES_DB=calendar_booking_test \
  --env POSTGRES_USER=calendar \
  --env POSTGRES_PASSWORD=test \
  postgres:17-alpine
```

Другой адрес можно передать через `TEST_DATABASE_URL`.

```bash
npm test              # unit, UI и HTTP/PostgreSQL integration-тесты
npm run test:e2e      # локальный Playwright на production-сборке
npm run test:coverage # тесты и обязательный минимум 80% покрытия строк
npm run lint          # ESLint
npm run format:check  # Prettier без изменения файлов
npm run build         # production-сборка обоих приложений
npm run check         # все проверки последовательно
```

Если порт `3000` уже занят локальным приложением, изолированный браузерный
прогон можно запустить с другим портом, например
`PLAYWRIGHT_PORT=3102 npm run test:e2e`.

Матрица из 12 браузерных сценариев описана в
`docs/testing/booking-e2e-cases.md`. В GitHub Actions она выполняется отдельным
гейтом в Chromium с реальным API и PostgreSQL; при падении сохраняются HTML-отчёт
и Playwright trace.

## API-контракт

HTTP-интерфейс проектируется до реализации в
`packages/api-contract/main.tsp`. Одна команда последовательно генерирует
OpenAPI, Fetch SDK для frontend и типобезопасные Fastify-обработчики для
backend:

```bash
npm run contract:generate
npm run contract:check
```

Результаты находятся в `packages/api-contract/generated/openapi.yaml`,
`apps/web/src/api/generated` и `apps/api/src/generated`. Frontend импортирует
SDK только через `apps/web/src/api/client.ts`. Fastify получает интерфейс
обработчиков из сгенерированного кода, а маршруты и проверку запросов строит из
того же OpenAPI-файла через `fastify-openapi-glue`. Сгенерированные файлы
коммитятся, но вручную не редактируются.

GitHub Actions выполняет `npm run check` с PostgreSQL, собирает production-стек и
проверяет frontend, `/api/health` и сохранность данных после рестарта на каждый push и
pull request.

## Отчёты качества

```bash
npm run report
```

Команда собирает неблокирующие отчёты type-aware ESLint и SonarJS, Knip,
jscpd и Vitest Coverage в каталог `reports`. Основная точка входа —
`reports/README.md`; подробные HTML-отчёты создаются для покрытия и
дублирования кода.

На GitHub каждый CI-прогон прикрепляет каталог как artifact
`quality-reports`. Найденные проблемы пока не влияют на итог CI и служат только
для наблюдения; обязательными остаются проверки `npm run check`.

## Релизы

Сообщения коммитов следуют [Conventional Commits](https://www.conventionalcommits.org/):
например, `feat: add booking page` или `fix: validate slot duration`.
После изменений в `main` release-please поддерживает release PR с версией и
`CHANGELOG.md`.

Для стандартного `GITHUB_TOKEN` в настройках репозитория должны быть включены
права Actions на запись и создание pull request.

## Агент в GitHub

OpenCode Agent запускается в GitHub Actions по новым комментариям с командами
`/opencode` или `/oc`. События, фильтр, минимальные права, модель и порядок
ручной проверки описаны в
[`docs/agents/opencode-github.md`](docs/agents/opencode-github.md).

## Документы продукта

- [Исследование пользовательских сценариев](product/research.md)
- [Business Requirements Document](product/brd.md)

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл
`.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его,
ни репозиторий.

</details>

Учебный проект [Хекслета](https://ru.hexlet.io/programs/ai-for-developers).
