# API Testing Guide - All Request Variations

Этот документ описывает все возможные варианты запросов к AIClient-2-API сервису для IDE/CLI клиентов.

## Таблица провайдеров и поддерживаемых протоколов

| Провайдер | Эндпоинт 1 (OpenAI Chat) | Эндпоинт 2 (Claude Messages) | Эндпоинт 3 (OpenAI Responses) |
|-----------|------------------------------|--------------------------------|----------------------------------|
| `gemini-cli-oauth` | `/v1/chat/completions` | ❌ Не поддерживается | ❌ Не поддерживается |
| `gemini-antigravity` | `/v1/chat/completions` | `/v1/messages` | ❌ Не поддерживается |
| `openai-custom` | `/v1/chat/completions` | ❌ Не поддерживается | `/v1/responses` |
| `openaiResponses-custom` | `/v1/chat/completions` | ❌ Не поддерживается | `/v1/responses` |
| `claude-custom` | `/v1/chat/completions` | `/v1/messages` | ❌ Не поддерживается |
| `claude-kiro-oauth` | `/v1/chat/completions` | `/v1/messages` | ❌ Не поддерживается |
| `openai-qwen-oauth` | `/v1/chat/completions` | ❌ Не поддерживается | ❌ Не поддерживается |
| `ollama` | `/v1/chat/completions` | ❌ Не поддерживается | ❌ Не поддерживается |

---

## 1. Список моделей

### GET `/v1/models`
```bash
curl -X GET http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET `/{provider}/v1/models` (provider-specific)
```bash
curl -X GET http://localhost:3001/gemini-antigravity/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### GET `/v1/models` с Model-Provider header
```bash
curl -X GET http://localhost:3001/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Model-Provider: gemini-antigravity"
```

**Ожидаемый ответ:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "gemini-2.5-flash",
      "object": "model",
      "created": 1767182335,
      "owned_by": "google"
    }
  ]
}
```

---

## 2. OpenAI Chat Completions API (`/v1/chat/completions`)

### 2.1. Базовый запрос (без streaming)

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": false
}
```

### 2.2. Streaming запрос

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Count from 1 to 5"
    }
  ],
  "stream": true
}
```

**Streaming ответ:**
```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"1"}}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":", 2"}}]}
...
data: {"id":"chatcmpl-xxx","choices":[{"finish_reason":"stop"}]}
```

### 2.3. Multi-turn conversation

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant"
    },
    {
      "role": "user",
      "content": "What is the capital of France?"
    },
    {
      "role": "assistant",
      "content": "The capital of France is Paris"
    },
    {
      "role": "user",
      "content": "And what about Germany?"
    }
  ]
}
```

### 2.4. Системный промпт

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful math tutor. Always explain step by step."
    },
    {
      "role": "user",
      "content": "What is 15 + 27?"
    }
  ]
}
```

### 2.5. С параметрами генерации

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Tell me a short joke"
    }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 100,
  "presence_penalty": 0.0,
  "frequency_penalty": 0.0
}
```

### 2.6. С Tools (инструментами)

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Tokyo?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "The city and state, e.g. San Francisco, CA"
            }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**Tool call ответ:**
```json
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\":\"Tokyo\"}"
        }
      }]
    }
  }]
}
```

### 2.7. Tool Response (многоходовой диалог с tools)

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Tokyo?"
    },
    {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_123",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\":\"Tokyo\"}"
        }
      }]
    },
    {
      "role": "tool",
      "tool_call_id": "call_123",
      "name": "get_weather",
      "content": "{\"temp\": 22, \"condition\": \"sunny\"}"
    }
  ]
}
```

### 2.8. С изображениями

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg"
          }
        }
      ]
    }
  ]
}
```

### 2.9. С base64 изображениями

```json
POST /v1/chat/completions
{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe this image"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..."
          }
        }
      ]
    }
  ]
}
```

### 2.10. Thinking модели (размышления)

```json
POST /v1/chat/completions
{
  "model": "claude-opus-4-5-thinking",
  "messages": [
    {
      "role": "user",
      "content": "Explain step by step: why is 7+5=12?"
    }
  ],
  "stream": false
}
```

**Thinking ответ:**
```json
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "# Why 7 + 5 = 12\n\n**Step 1:** Add the ones place\n- 7 + 5 = 12\n\n..."
    }
  }],
  "usage": {
    "prompt_tokens": 49,
    "completion_tokens": 414,
    "total_tokens": 463,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

### 2.11. Provider-specific через path

```bash
# gemini-antigravity provider
curl -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions

# claude-custom provider
curl -X POST http://localhost:3001/claude-custom/v1/chat/completions

# openai-custom provider
curl -X POST http://localhost:3001/openai-custom/v1/chat/completions
```

### 2.12. Provider-specific через header

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Model-Provider: gemini-antigravity"
```

---

## 3. Claude Messages API (`/v1/messages`)

**Поддерживается:** `gemini-antigravity`, `claude-custom`, `claude-kiro-oauth`

### 3.1. Базовый запрос

```json
POST /v1/messages
{
  "model": "claude-opus-4-5-thinking",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ]
}
```

**Ожидаемый ответ:**
```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'm doing well, thank you! How can I help you today?"
    }
  ],
  "model": "claude-opus-4-5-thinking",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

### 3.2. Streaming запрос

```json
POST /v1/messages
{
  "model": "gemini-2.5-flash",
  "max_tokens": 1024,
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "Count from 1 to 5"
    }
  ]
}
```

**Streaming ответ:**
```
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":", 2"}}

event: message_stop
data: {"type":"message_stop","stop_reason":"end_turn"}
```

### 3.3. Multi-turn conversation

```json
POST /v1/messages
{
  "model": "gemini-2.5-flash",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "What is 2+2?"
    },
    {
      "role": "assistant",
      "content": "2 + 2 = 4"
    },
    {
      "role": "user",
      "content": "And what about 3+3?"
    }
  ]
}
```

### 3.4. Системный промпт

```json
POST /v1/messages
{
  "model": "gemini-2.5-flash",
  "max_tokens": 1024,
  "system": "You are a helpful math tutor. Always explain step by step.",
  "messages": [
    {
      "role": "user",
      "content": "What is 15 + 27?"
    }
  ]
}
```

### 3.5. С Tools

```json
POST /v1/messages
{
  "model": "claude-opus-4-5-thinking",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state"
          }
        },
        "required": ["location"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Tokyo?"
    }
  ]
}
```

### 3.6. Tool Response

```json
POST /v1/messages
{
  "model": "gemini-2.5-flash",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Tokyo?"
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "tool_use",
          "id": "toolu_xxx",
          "name": "get_weather",
          "input": {"location": "Tokyo"}
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_xxx",
          "content": "{\"temp\": 22, \"condition\": \"sunny\"}"
        }
      ]
    }
  ]
}
```

### 3.7. С изображениями

```json
POST /v1/messages
{
  "model": "gemini-2.5-flash",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRgABAQEAYABgAAD..."
          }
        }
      ]
    }
  ]
}
```

### 3.8. Thinking модели

```json
POST /v1/messages
{
  "model": "claude-opus-4-5-thinking",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Explain step by step: why is 7+5=12?"
    }
  ]
}
```

### 3.9. Provider-specific через path

```bash
# gemini-antigravity provider
curl -X POST http://localhost:3001/gemini-antigravity/v1/messages

# claude-custom provider
curl -X POST http://localhost:3001/claude-custom/v1/messages

# claude-kiro-oauth provider
curl -X POST http://localhost:3001/claude-kiro-oauth/v1/messages
```

---

## 4. OpenAI Responses API (`/v1/responses`)

**Поддерживается:** `openai-custom`, `openaiResponses-custom`

### 4.1. Базовый запрос

```json
POST /v1/responses
{
  "model": "gpt-4",
  "input": "Hello, how are you?"
}
```

### 4.2. Streaming запрос

```json
POST /v1/responses
{
  "model": "gpt-4",
  "input": "Count from 1 to 5",
  "stream": true
}
```

---

## 5. Ollama API

### 5.1. Generate endpoint

```json
POST /api/generate
{
  "model": "llama2",
  "prompt": "Hello, how are you?",
  "stream": false
}
```

### 5.2. Chat endpoint

```json
POST /api/chat
{
  "model": "llama2",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ]
}
```

### 5.3. Show endpoint

```json
POST /api/show
{
  "name": "llama2"
}
```

---

## 6. Health Check

### GET `/health`
```bash
curl -X GET http://localhost:3001/health
```

**Ожидаемый ответ:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-31T12:00:00.000Z",
  "provider": "gemini-cli-oauth"
}
```

---

## 7. Ошибки и обработка

### 7.1. Неверный API ключ
```json
{
  "error": {
    "message": "Unauthorized: API key is invalid or missing."
  }
}
```
**HTTP Status:** 401

### 7.2. Неверная модель
```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Requested entity was not found."
  }
}
```
**HTTP Status:** 404

### 7.3. Ошибка сервера
```json
{
  "error": {
    "message": "Server error occurred. This is usually temporary.",
    "code": 500,
    "suggestions": [
      "The request has been automatically retried",
      "If issue persists, try again in a few minutes",
      "Check service status for outages"
    ]
  }
}
```
**HTTP Status:** 500

### 7.4. Rate limiting
```json
{
  "error": {
    "message": "Too many requests. Rate limit exceeded.",
    "code": 429,
    "suggestions": [
      "The request has been automatically retried with exponential backoff",
      "If the issue persists, try reducing the request frequency"
    ]
  }
}
```
**HTTP Status:** 429

---

## 8. Authentication

### 8.1. Через Bearer token (заголовок Authorization)
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 8.2. Через query параметр (не рекомендуется)
```bash
curl -X POST "http://localhost:3001/v1/chat/completions?api_key=YOUR_API_KEY"
```

---

## 9. CORS

Сервер поддерживает CORS для фронтенда.

### Pre-flight запрос
```bash
curl -X OPTIONS http://localhost:3001/v1/chat/completions \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"
```

**Ответ:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, x-goog-api-key, Model-Provider
```

---

## 10. Параметры запросов

### 10.1. OpenAI Chat Completions параметры

| Параметр | Тип | Обязательный | Описание |
|-----------|------|---------------|-----------|
| `model` | string | Да | Имя модели |
| `messages` | array | Да | Массив сообщений |
| `stream` | boolean | Нет | Streaming режим |
| `temperature` | number | Нет | 0.0 - 2.0, default: 1.0 |
| `top_p` | number | Нет | 0.0 - 1.0, default: 1.0 |
| `max_tokens` | integer | Нет | Макс. кол-во токенов |
| `presence_penalty` | number | Нет | -2.0 - 2.0 |
| `frequency_penalty` | number | Нет | -2.0 - 2.0 |
| `tools` | array | Нет | Массив инструментов |
| `tool_choice` | string/object | Нет | "auto", "none", {"type": "function", "function": {"name": "func"}} |

### 10.2. Claude Messages параметры

| Параметр | Тип | Обязательный | Описание |
|-----------|------|---------------|-----------|
| `model` | string | Да | Имя модели |
| `messages` | array | Да | Массив сообщений |
| `max_tokens` | integer | Да | Макс. кол-во токенов |
| `system` | string | Нет | Системный промпт |
| `stream` | boolean | Нет | Streaming режим |
| `tools` | array | Нет | Массив инструментов |
| `tool_choice` | object | Нет | Инструмент выбора |
| `temperature` | number | Нет | 0.0 - 1.0 |
| `top_p` | number | Нет | 0.0 - 1.0 |
| `top_k` | integer | Нет | 0 - 40 |

---

## 11. Streaming

### 11.1. Server-Sent Events (SSE)

Формат SSE:
```
data: {...}\n\n
event: event_name\n
data: {...}\n\n
```

### 11.2. OpenAI Chat Completions streaming

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"finish_reason":"stop"}]}
```

### 11.3. Claude Messages streaming

```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: message_stop
data: {"type":"message_stop","stop_reason":"end_turn"}
```

---

## 12. Конвертация форматов

Сервер автоматически конвертирует между форматами:

### 12.1. OpenAI → Claude
- `messages.system` → `system`
- `messages[].content` (string) → `messages[].content` (string)
- `messages[].content` (array) → `messages[].content` (array)
- `tools[].type.function` → `tools[].input_schema`

### 12.2. OpenAI → Gemini/Antigravity
- `messages[].role` → `contents[].role` ("assistant" → "model")
- `tools[].type.function` → `tools[].functionDeclarations`
- `system` → `systemInstruction`

### 12.3. Claude → OpenAI
- `system` → `messages[0].role=system`
- `tools[].input_schema` → `tools[].type.function`

---

## 13. Примеры полных сценариев

### 13.1. Математический помощник с multi-turn диалогом

```bash
# Шаг 1: Первый вопрос
curl -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "What is 15 + 27?"}
    ]
  }'

# Шаг 2: Следующий вопрос в контексте
curl -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "What is 15 + 27?"},
      {"role": "assistant", "content": "42"},
      {"role": "user", "content": "And what about 15 * 3?"}
    ]
  }'
```

### 13.2. Weather assistant с tools

```bash
# Шаг 1: Запрос с tool call
curl -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "What'\''s the weather in Tokyo?"}
    ],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          },
          "required": ["location"]
        }
      }
    }]
  }'

# Шаг 2: Tool result
curl -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "What'\''s the weather in Tokyo?"},
      {"role": "assistant", "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {"name": "get_weather", "arguments": "{\"location\":\"Tokyo\"}"}
      }]},
      {"role": "tool", "tool_call_id": "call_xxx", "name": "get_weather", "content": "{\"temp\": 22}"}
    ]
  }'
```

### 13.3. Thinking модель с пошаговым объяснением

```bash
curl -X POST http://localhost:3001/gemini-antigravity/v1/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-5-thinking",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain why 7+5=12 step by step"}
    ]
  }'
```

---

## 14. Тестирование IDE/CLI клиентов

### 14.1. Автоматизированные тесты

Создайте тестовый скрипт:

```javascript
// test-client.js
const tests = [
  {
    name: "Basic Chat",
    endpoint: "/v1/chat/completions",
    request: {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hello" }]
    }
  },
  {
    name: "Streaming",
    endpoint: "/v1/chat/completions",
    request: {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Count 1-5" }],
      stream: true
    }
  },
  {
    name: "Claude Messages API",
    endpoint: "/v1/messages",
    request: {
      model: "gemini-2.5-flash",
      max_tokens: 256,
      messages: [{ role: "user", content: "Hi" }]
    }
  },
  {
    name: "With Tools",
    endpoint: "/v1/chat/completions",
    request: {
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Test" }],
      tools: [{
        type: "function",
        function: {
          name: "test_func",
          description: "Test",
          parameters: { type: "object", properties: {} }
        }
      }]
    }
  },
  {
    name: "Thinking Model",
    endpoint: "/v1/messages",
    request: {
      model: "claude-opus-4-5-thinking",
      max_tokens: 512,
      messages: [{ role: "user", content: "Think: 2+2" }]
    }
  }
];

for (const test of tests) {
  console.log(`Running: ${test.name}`);
  const response = await fetch(`http://localhost:3001${test.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_API_KEY"
    },
    body: JSON.stringify(test.request)
  });
  console.log(`Status: ${response.status}`);
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
```

### 14.2. Ручное тестирование через curl

```bash
#!/bin/bash
# test-all.sh

echo "=== Testing OpenAI Chat Completions ==="
curl -s -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer 123456" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}]}'

echo -e "\n=== Testing Claude Messages ==="
curl -s -X POST http://localhost:3001/gemini-antigravity/v1/messages \
  -H "Authorization: Bearer 123456" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","max_tokens":256,"messages":[{"role":"user","content":"Hi"}]}'

echo -e "\n=== Testing Models List ==="
curl -s -X GET http://localhost:3001/gemini-antigravity/v1/models \
  -H "Authorization: Bearer 123456"

echo -e "\n=== Testing Tools ==="
curl -s -X POST http://localhost:3001/gemini-antigravity/v1/chat/completions \
  -H "Authorization: Bearer 123456" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"gemini-2.5-flash",
    "messages":[{"role":"user","content":"Test"}],
    "tools":[{
      "type":"function",
      "function":{
        "name":"test",
        "description":"Test",
        "parameters":{"type":"object","properties":{}}
      }
    }]
  }'

echo -e "\n=== Testing Thinking Model ==="
curl -s -X POST http://localhost:3001/gemini-antigravity/v1/messages \
  -H "Authorization: Bearer 123456" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5-thinking","max_tokens":512,"messages":[{"role":"user","content":"Think: 2+2"}]}'

echo -e "\n=== All tests completed! ==="
```

---

## 15. Советы для IDE/CLI разработчиков

### 15.1. Всегда проверяйте health endpoint
```bash
# Перед началом работы
curl http://localhost:3001/health
```

### 15.2. Используйте Model-Provider header для динамического выбора провайдера
```bash
# Не нужно жёстко кодировать путь
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Model-Provider: gemini-antigravity"
```

### 15.3. Всегда включайте stream=true для интерактивных интерфейсов
```bash
# Для CLI и IDE с live output
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","stream":true,...}'
```

### 15.4. Обрабатывайте SSE корректно
```javascript
const eventSource = new EventSource(url);

eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }

  const data = JSON.parse(event.data);
  // Process data
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};
```

### 15.5. Обрабатывайте retry logic для errors 429, 500, 503
```javascript
async function makeRequest(request, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, request);
      if (response.ok) return response;
      
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await sleep(delay);
        continue;
      }
      
      throw new Error(`Request failed: ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

---

## 16. Полный список эндпоинтов

| Метод | Путь | Описание |
|--------|-------|-----------|
| GET | `/health` | Health check |
| GET | `/v1/models` | Список моделей (default provider) |
| GET | `/{provider}/v1/models` | Список моделей (specific provider) |
| POST | `/v1/chat/completions` | OpenAI Chat Completions |
| POST | `/{provider}/v1/chat/completions` | OpenAI Chat (specific provider) |
| POST | `/v1/messages` | Claude Messages API |
| POST | `/{provider}/v1/messages` | Claude Messages (specific provider) |
| POST | `/v1/responses` | OpenAI Responses API |
| POST | `/{provider}/v1/responses` | OpenAI Responses (specific provider) |
| POST | `/ollama/api/generate` | Ollama Generate |
| POST | `/ollama/api/chat` | Ollama Chat |
| POST | `/ollama/api/show` | Ollama Show Model |

---

## 17. Поддерживаемые модели по провайдерам

### gemini-antigravity
- `claude-opus-4-5-thinking`
- `gemini-claude-sonnet-4-5-thinking`
- `gemini-claude-sonnet-4-5`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-2.5-pro`
- `gemini-3-pro-preview`
- `gemini-3-flash`
- `gemini-2.5-computer-use-preview-10-2025`
- `gpt-oss-120b-medium`

### gemini-cli-oauth
- `gemini-2.5-flash`
- `gemini-2.5-pro`
- `gemini-3-pro-preview`
- и другие Gemini модели

### claude-custom, claude-kiro-oauth
- `claude-3-5-sonnet`
- `claude-3-5-opus`
- `claude-3-5-haiku`
- и другие Claude модели

### openai-custom, openaiResponses-custom
- `gpt-4`
- `gpt-4-turbo`
- `gpt-3.5-turbo`
- и другие OpenAI модели

### openai-qwen-oauth
- `qwen3-coder-flash`
- `qwen3-72b-chat`
- и другие Qwen модели

---

## 18. Ограничения и квоты

### 18.1. Rate Limiting
Сервер автоматически ретраит запросы при 429 ошибках с экспоненциальным backoff.

### 18.2. Max Tokens
Максимум зависит от модели, обычно 8k - 128k токенов.

### 18.3. Concurrent Requests
Поддерживаются параллельные запросы, количество ограничено только бэкендом.

---

## 19. UI endpoints

### 19.1. Статические файлы
- `GET /` - Web UI
- `GET /index.html` - Главная страница
- `GET /app/*` - UI приложение
- `GET /static/*` - Статические ресурсы

### 19.2. UI API endpoints
- `GET /ui/config` - Получить конфигурацию UI
- `POST /ui/config` - Обновить конфигурацию UI
- `GET /ui/providers` - Список провайдеров
- `GET /ui/models` - Модели для провайдера
- и другие UI-специфичные endpoints

---

## Заключение

Этот документ описывает все возможные варианты запросов к AIClient-2-API сервису. Для интеграции с IDE/CLI рекомендуйте:

1. Всегда проверять `/health` перед запросами
2. Использовать `Model-Provider` header для выбора провайдера
3. Включать `stream: true` для интерактивных интерфейсов
4. Обрабатывать SSE правильно для streaming
5. Реализовать retry logic для transient errors
6. Использовать правильный формат запроса в зависимости от endpoint

Для вопросов и багрепортов используйте GitHub Issues.
