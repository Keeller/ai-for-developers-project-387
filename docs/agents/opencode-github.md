# OpenCode в GitHub Actions

Интерактивный агент настроен в `.github/workflows/opencode.yml`. Он читает
корневой `AGENTS.md` и отвечает в GitHub от имени приложения OpenCode Agent.

## Как запускается workflow

- `issue_comment` с `types: [created]` запускает workflow после создания
  комментария в issue или обсуждении pull request.
- `pull_request_review_comment` с `types: [created]` запускает workflow после
  создания комментария к строке в diff.
- Условие job пропускает работу дальше, только если текст комментария содержит
  `/opencode` или `/oc`.
- Параметр `mentions: /opencode,/oc` передаёт действующие команды самому
  OpenCode Action.

Редактирование и удаление старых комментариев агент не запускают.

## Права и учётные данные

Workflow получает только `id-token: write`. OIDC-токен обменивается на токен
установленного GitHub App, поэтому токен раннера не сохраняется в рабочей копии:
`actions/checkout` использует `persist-credentials: false`.

Модель `ollama/kimi-k2.7-code` работает через Ollama Cloud. Настройки провайдера
лежат в корневом `opencode.jsonc`, а ключ передаётся только через секрет
репозитория `OLLAMA_API_KEY`. Значение секрета никогда не записывается в файлы
или историю Git. Публикация сессии отключена параметром `share: false`.

## Ручная проверка

1. Создать issue с описанием задачи.
2. Добавить комментарий `/oc explain this issue`.
3. Открыть **Actions → OpenCode agent** и дождаться завершения запуска.
4. Убедиться, что OpenCode Agent ответил в issue.

Время выполнения и журнал агента доступны в шаге **Run OpenCode** выбранного
запуска.
