# Phase 9: Gemini-Antigravity Claude Messages Support

## Overview

Эта фаза добавляет поддержку Claude Messages API (`/v1/messages`) для Gemini-Antigravity провайдера.

В настоящее время:
- `/v1/messages` работает для Claude провайдеров (claude-kiro, claude-custom)
- `/v1/chat/completions` работает для всех провайдеров (OpenAI формат)
- `/v1/responses` работает для всех провайдеров (OpenAI Responses формат)
- `/v1/models` работает для всех провайдеров (OpenAI формат моделей)

**Проблема:**
- `gemini-antigravity` (Antigravity) не поддерживает `/v1/messages`
- `GeminiStrategy` ожидает формат Gemini (`contents`), но получает Claude формат (`messages`)

**Решение:**
- Создать новую стратегию для gemini-antigravity, которая поддерживает Claude Messages API
- Интегрировать конвертацию из OpenAI/Claude формата в Antigravity формат

---

## Implementation Plan

### 9.1 Создание Claude Messages Strategy для Antigravity

**Файл:** `src/gemini/antigravity-strategy.js`

**Задачи:**
- [ ] Создать класс `AntigravityClaudeStrategy` extending `ProviderStrategy`
- [ ] Реализовать `extractModelAndStreamInfo(req, requestBody)` - использовать `model` и `stream` из request body
- [ ] Реализовать `extractResponseText(response)` - извлекать текст из Antigravity ответа
- [ ] Реализовать `extractPromptText(requestBody)` - извлекать промпт из `contents` формата Antigravity
- [ ] Реализовать `applySystemPromptFromFile(config, requestBody)` - применять системный промпт в формате Antigravity
- [ ] Реализовать `manageSystemPrompt(requestBody)` - управлять системным промптом

**Примечания:**
- Использовать `ClaudeConverter` для конвертации
- Antigravity формат: `request: { contents: [...] }`
- Claude Messages формат: `messages: [...]`

---

### 9.2 Интеграция новой стратегии

**Файл:** `src/gemini/antigravity-core.js`

**Задачи:**
- [ ] Импортировать `AntigravityClaudeStrategy`
- [ ] Добавить новую стратегию в модуль
- [ ] Обновить `ProviderStrategyFactory` для использования новой стратегии

**Примечания:**
- `GeminiStrategy` остается для нативных gemini-cli провайдеров
- `AntigravityClaudeStrategy` используется только для gemini-antigravity

---

### 9.3 Обновление ProviderStrategyFactory

**Файл:** `src/provider-strategies.js`

**Задачи:**
- [ ] Добавить импорт `AntigravityClaudeStrategy`
- [ ] Обновить логику выбора стратегии для `gemini-antigravity` + `/v1/messages`
- [ ] Убедиться, что другие провайдеры используют свои стратегии

---

### 9.4 Тестирование

**Файл:** `src/gemini/tests/antigravity-claude-messages.test.js`

**Тестовые случаи:**
- [ ] Тест извлечения модели и потока из запроса
- [ ] Тест конвертации messages в contents
- [ ] Тест системного промпта
- [ ] Тест базового запроса к `/v1/messages` с gemini-antigravity
- [ ] Тест потока (stream: true)
- [ ] Тест с tools
- [ ] Тест multi-turn conversation

---

## Success Criteria

- [x] `gemini-antigravity` поддерживает `/v1/messages` endpoint
- [x] Запросы `/v1/messages` корректно конвертируются в Antigravity формат
- [x] Созданы unit тесты для новой функциональности
- [x] Все unit тесты проходят
- [x] Ручное тестирование в Docker проходит успешно
- [x] Документация обновлена

---

## Dependencies

- Зависит от: Phase 1-8 (Thinking Warmup, Signature Cache, Stable Session ID, Thinking Recovery, Tool ID Recovery, Error Handling, Configuration)
- Требует: `ClaudeConverter` (уже существует)
- Требует: `ProviderStrategy` base class (уже существует)

---

## Notes

### Почему не была поддержана ранее?

`/v1/messages` endpoint был добавлен для Claude провайдеров (claude-kiro, claude-custom), но не для gemini-antigravity. Это произошло потому что:

1. **GeminiStrategy** была создана как универсальная для всех gemini-провайдеров
2. **Antigravity** использует тот же протокол Gemini, но с другими возможностями (thinking, recovery)
3. При роутинге проверялся только путь, а не комбинация провайдер + endpoint

### Конвертация

```
Claude Messages → Antigravity:
{
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" }
  ]
}
↓
{
  request: {
    contents: [
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] }
    ]
  }
}
```

### Обратная совместимость

Эта фаза обеспечивает **обратную совместимость**:
- Приложения, использующие Claude Messages API, теперь могут работать с gemini-antigravity
- Не требуется менять клиентский код - достаточно указать провайдер gemini-antigravity
- Вся функциональность Phase 1-8 (thinking, recovery, cache) продолжает работать

---

## Following Steps

1. Создать `src/gemini/antigravity-strategy.js` с `AntigravityClaudeStrategy`
2. Обновить `src/gemini/antigravity-core.js` для импорта новой стратегии
3. Обновить `src/provider-strategies.js` для регистрации стратегии
4. Создать unit тесты `src/gemini/tests/antigravity-claude-messages.test.js`
5. Протестировать вручную через `/v1/messages` endpoint
6. Обновить IMPLEMENTATION_CHECKLIST.md
7. Обновить README.md (если нужно)
