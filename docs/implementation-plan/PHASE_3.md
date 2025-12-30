# Phase 3: Stable Session ID

## Обзор

**Цель**: Обеспечить использование стабильного sessionId для multi-turn conversations вместо случайного для каждого запроса.

**Почему это нужно**: Antigravity API использует sessionId для связи сообщений в conversation. Если sessionId меняется каждый раз, подписи из cache не будут работать.

**Текущая проблема**: В `generateSessionID()` (строка 89-92) генерируется случайный ID каждый раз:

```javascript
function generateSessionID() {
    const n = Math.floor(Math.random() * 9000000000000000000);
    return '-' + n.toString();
}
```

**Решение**: Использовать стабильный `PLUGIN_SESSION_ID` для всех запросов в lifetime процесса.

---

## Задачи Phase 3

### Задача 3.1: Удалить случайную генерацию sessionId в generateContentStream

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Найти функцию `geminiToAntigravity` (примерно строка 109) и заменить строку, устанавливающую `sessionId`:

```javascript
// ВНУТРИ функции geminiToAntigravity, найти строку:
template.request.sessionId = generateSessionID();

// ЗАМЕНИТЬ НА:
template.request.sessionId = PLUGIN_SESSION_ID;
```

---

### Задача 3.2: Проверить использование generateSessionID в других местах

**Действия**:

```bash
cd E:\1C\AIClient-2-API
grep -n "generateSessionID" src/gemini/antigravity-core.js
```

**Ожидание**: Нет других использований кроме `geminiToAntigravity`.

Если есть другие использования - заменить их на `PLUGIN_SESSION_ID`.

---

### Задача 3.3: Убедиться, что PLUGIN_SESSION_ID объявлен глобально

**Файл**: `E:\1C\AIClient-2-API\src\gemini/antigravity-core.js`

Проверьте, что в начале файла (после импортов) есть:

```javascript
// Должно быть добавлено в Phase 1:
const PLUGIN_SESSION_ID = `-${uuidv4()}`;
```

Если нет - добавьте.

---

### Задача 3.4: Добавить логирование стабильности sessionId

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

В методе `async initialize()` (примерно строка 266) добавить:

```javascript
// ВНУТРИ async initialize(), ПОСЛЕ инициализации signatureCache:

// NEW: Log stable session ID
console.log(`[Antigravity] Using stable session ID: ${PLUGIN_SESSION_ID}`);
console.log(`[Antigravity] Session ID will remain constant across all requests in this process`);
```

---

### Задача 3.5: Создать тест для стабильности sessionId

**Файл**: `E:\1C\AIClient-2-API\src/gemini/tests/stable-session-id.test.js`

```javascript
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AntigravityApiService } from '../antigravity-core.js';

// Mock dependencies
jest.mock('google-auth-library');

describe('Stable Session ID', () => {
    let service;

    beforeEach(() => {
        service = new AntigravityApiService({
            HOST: 'localhost',
            PROJECT_ID: 'test-project',
        });
    });

    test('should use same session ID across multiple requests', async () => {
        await service.initialize();

        const requestBody1 = {
            request: {
                contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                generationConfig: { thinkingConfig: { include_thoughts: true } }
            }
        };

        const requestBody2 = {
            request: {
                contents: [{ role: 'user', parts: [{ text: 'World' }] }],
                generationConfig: { thinkingConfig: { include_thoughts: true } }
            }
        };

        // Get transformed requests
        const transformed1 = service.geminiToAntigravity('test-model', { ...requestBody1 }, 'test-project');
        const transformed2 = service.geminiToAntigravity('test-model', { ...requestBody2 }, 'test-project');

        // Check session IDs are the same
        expect(transformed1.request.sessionId).toBe(transformed2.request.sessionId);
        expect(transformed1.request.sessionId).toMatch(/^-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
    });

    test('should use UUID-based session ID format', async () => {
        await service.initialize();

        const requestBody = {
            request: {
                contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
            }
        };

        const transformed = service.geminiToAntigravity('test-model', { ...requestBody }, 'test-project');

        // Should be UUID with leading dash
        expect(transformed.request.sessionId).toMatch(/^-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/);
    });
});
```

---

## Тестирование Phase 3

### Тест 1: Проверка отсутствия generateSessionID

```bash
cd E:\1C\AIClient-2-API
grep -n "generateSessionID" src/gemini/antigravity-core.js
```

**Ожидание**: Нет результатов (или только комментарий).

---

### Тест 2: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/antigravity-core.js
```

**Ожидание**: Нет ошибок синтаксиса.

---

### Тест 3: Запуск сервиса

```bash
cd E:\1C\AIClient-2-API
npm start
```

**Проверка логов**:
- `[Antigravity] Using stable session ID: -<uuid>`
- `[Antigravity] Session ID will remain constant across all requests in this process`

---

### Тест 4: Unit тесты

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/stable-session-id.test.js
```

**Ожидание**: Все тесты проходят.

---

### Тест 5: Ручное тестирование multi-turn conversation

Отправить несколько запросов подряд:

```bash
# Запрос 1
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "conversationId": "test-conv-1",
      "contents": [{"role": "user", "parts": [{"text": "Message 1"}]}]
    }
  }'

# Запрос 2 (сразу после)
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "conversationId": "test-conv-1",
      "contents": [{"role": "user", "parts": [{"text": "Message 2"}]}]
    }
  }'

# Запрос 3
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "conversationId": "test-conv-1",
      "contents": [{"role": "user", "parts": [{"text": "Message 3"}]}]
    }
  }'
```

**Проверка**: Все три запроса используют один и тот же sessionId (проверить в логах или отладчика).

---

## Критерии успеха Phase 3

- ✅ Функция `generateSessionID` не используется (или используется только в комментариях)
- ✅ `PLUGIN_SESSION_ID` объявлен и используется
- ✅ Логи показывают стабильный session ID
- ✅ Unit тесты проходят
- ✅ Multi-turn conversation работает корректно
- ✅ Session ID не меняется между запросами

---

## Следующий шаг

Если Phase 3 успешно протестирован - переходите к `PHASE_4.md`

---

## Отладка

### Проблема: Session ID всё ещё меняется

**Проверка**:
1. Убедитесь, что все использования `generateSessionID()` заменены на `PLUGIN_SESSION_ID`
2. Проверьте, что `PLUGIN_SESSION_ID` объявлен как `const` (не `let`)

### Проблема: Session ID имеет неправильный формат

**Проверка**:
1. Убедитесь, что `uuidv4()` импортирован: `import { v4 as uuidv4 } from 'uuid';`
2. Проверьте, что формат `PLUGIN_SESSION_ID = '-' + uuidv4()` или `PLUGIN_SESSION_ID = \`-${uuidv4()}\``

---

## Rollback

Если что-то пошло не так - восстановите изменения:

```bash
git checkout src/gemini/antigravity-core.js
rm src/gemini/tests/stable-session-id.test.js
```

---

## Улучшения (опционально)

- [ ] Добавить возможность перезагрузки sessionId через API endpoint
- [ ] Добавить логирование когда создается новый процесс (новый sessionId)
- [ ] Добавить поддержку нескольких стабильных session IDs для разных conversations
