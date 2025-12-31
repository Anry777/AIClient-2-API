
---

## ⚠️ Важные замечания

### /v1/responses endpoint

**СТАТУС: ❌ НЕ РАБОТАЕТ - ЭКСПЕРИМЕНТАЛЬНЫЙ**

Этот endpoint находится в разработке и не должен использоваться в продакшене.

**Проблема:**
- Конвертация OpenAI Responses формата в Gemini/Antigravity формат неработает
- Возникает ошибка: "at least one contents field is required"

**Используйте вместо этого:**
- ✅ `/v1/chat/completions` (OpenAI формат) - полностью функционален
- ✅ `/v1/messages` (Claude формат) - полностью функционален

**Почему /v1/responses существует:**
- Это experimental event-driven формат от OpenAI
- Поддерживается для других провайдеров (openai-custom)
- Для gemini-antigravity требуется отдельная реализация конвертации

**Примеры запросов:**

```bash
# ✅ Используйте OpenAI Chat Completions
POST /gemini-antigravity/v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}

# ✅ Или Claude Messages API
POST /gemini-antigravity/v1/messages
{
  "model": "claude-opus-4-5-thinking",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "Hello"}]
}

# ❌ НЕ используйте /v1/responses с gemini-antigravity
POST /gemini-antigravity/v1/responses
{
  "model": "gemini-2.5-flash",
  "input": "Hello",
  "stream": false
}
# ВЕРНЁТ: Error 400 - "at least one contents field is required"
```
