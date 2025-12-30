# Phase 6: Enhanced Error Handling

## Обзор

**Цель**: Расширить обработку ошибок и добавить retry логику для recoverable errors.

**Новые возможности**:
1. Retry для `thinking_block_order` ошибок
2. Retry для `tool_result_missing` ошибок
3. Retry для `thinking_disabled_violation` ошибок
4. Automatic retry с backoff для временных ошибок
5. Empty response retry (пустые ответы от Antigravity)

---

## Задачи Phase 6

### Задача 6.1: Расширить callApi для retry логики

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

#### 6.1.1 Добавить параметры retry для recoverable errors

Найти `async callApi(method, body, isRetry = false, retryCount = 0, baseURLIndex = 0)` (примерно строка 567) и изменить:

```javascript
// ВНУТРИ async callApi(method, body, isRetry = false, retryCount = 0, baseURLIndex = 0):

// Добавить в начало метода:
const RECOVERABLE_ERROR_RETRIES = 3;

// Добавить после существующей retry логики (перед throw error):

// NEW: Handle recoverable thinking/tool errors
if (error.response?.status >= 400 && error.response?.status < 500) {
    const errorType = ErrorHandler.detectErrorType(error);

    if (errorType && retryCount < RECOVERABLE_ERROR_RETRIES) {
        console.log(`[Antigravity API] Recoverable error (${errorType}) detected. Retrying (${retryCount + 1}/${RECOVERABLE_ERROR_RETRIES})...`);

        // Apply recovery based on error type
        let recoveredBody = { ...body };

        if (errorType === ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER ||
            errorType === ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION) {

            // Strip thinking blocks
            if (recoveredBody.request?.generationConfig?.thinkingConfig) {
                delete recoveredBody.request.generationConfig.thinkingConfig;
            }

            console.log(`[Antigravity API] Stripped thinking config for retry`);
        }

        // Delay and retry
        const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.callApi(method, recoveredBody, true, retryCount + 1, baseURLIndex);
    }
}

// ... existing throw error ...
```

---

### Задача 6.2: Расширить streamApi для retry логики

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Найти `async *streamApi(method, body, isRetry = false, retryCount = 0, baseURLIndex = 0)` (примерно строка 636) и добавить аналогичную логику:

```javascript
// ВНУТРИ async *streamApi, добавить в catch блок:

// NEW: Handle recoverable thinking/tool errors
if (error.response?.status >= 400 && error.response?.status < 500) {
    const errorType = ErrorHandler.detectErrorType(error);

    if (errorType && retryCount < 3) {
        console.log(`[Antigravity Stream] Recoverable error (${errorType}) detected. Retrying (${retryCount + 1}/3)...`);

        // Apply recovery
        let recoveredBody = { ...body };

        if (errorType === ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER ||
            errorType === ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION) {

            if (recoveredBody.request?.generationConfig?.thinkingConfig) {
                delete recoveredBody.request.generationConfig.thinkingConfig;
            }

            console.log(`[Antigravity Stream] Stripped thinking config for retry`);
        }

        // Delay and retry
        const delay = 1000 * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));

        yield* this.streamApi(method, recoveredBody, true, retryCount + 1, baseURLIndex);
        return;
    }
}
```

---

### Задача 6.3: Добавить Empty Response Retry

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

#### 6.3.1 Обновить config

```javascript
// В src/gemini/config.js добавить в DEFAULT_CONFIG:

export const DEFAULT_CONFIG = {
    // ... existing config ...

    // Empty Response Retry
    empty_response_max_attempts: 4,
    empty_response_retry_delay_ms: 2000,
};
```

#### 6.3.2 Добавить empty response retry в generateContentStream

```javascript
// ВНУТРИ async *generateContentStream(model, requestBody), перед основным запросом:

// NEW: Track empty response attempts
const emptyResponseKey = `${model}:${Date.now()}`;

// После обработки stream (перед yield каждого chunk):

// Добавить после существующего кода обработки stream:
for await (const chunk of stream) {
    const response = toGeminiApiResponse(chunk.response);

    // ... existing code for caching signature ...

    // NEW: Check for empty response
    const isEmpty = !response?.candidates || response.candidates.length === 0 ||
        (response.candidates[0] && (!response.candidates[0].content || !response.candidates[0].content?.parts));

    if (isEmpty && this.thinkingConfig.empty_response_max_attempts > 0) {
        const attemptKey = `${emptyResponseKey}:${retryCount || 0}`;

        if (!this.emptyResponseAttempts) {
            this.emptyResponseAttempts = new Map();
        }

        const currentAttempts = (this.emptyResponseAttempts.get(attemptKey) || 0) + 1;

        if (currentAttempts <= this.thinkingConfig.empty_response_max_attempts) {
            this.emptyResponseAttempts.set(attemptKey, currentAttempts);

            console.warn(`[Antigravity] Empty response detected (attempt ${currentAttempts}/${this.thinkingConfig.empty_response_max_attempts}). Retrying in ${this.thinkingConfig.empty_response_retry_delay_ms}ms...`);

            // Delay and retry
            await new Promise(resolve => setTimeout(resolve, this.thinkingConfig.empty_response_retry_delay_ms));

            // Retry entire request
            const newStream = this.streamApi('streamGenerateContent', payload);
            for await (const retryChunk of newStream) {
                yield toGeminiApiResponse(retryChunk.response);
            }
            return;
        }
    }

    yield response;
}
```

---

### Задача 6.4: Добавить логирование retry attempts

**Файл**: `E:\1C\AIClient-2-API\src\gemini/antigravity-core.js`

Добавить в класс AntigravityApiService новые свойства:

```javascript
// В constructor добавить:
this.retryStats = {
    total: 0,
    thinkingRecovery: 0,
    toolRecovery: 0,
    emptyResponse: 0,
    rateLimit: 0,
};

// В callApi и streamApi, когда происходит retry, увеличивать счетчики:
// В месте где detect recoverable error:
this.retryStats.total++;
if (errorType === ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER ||
    errorType === ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION) {
    this.retryStats.thinkingRecovery++;
}
```

Добавить метод для логирования статистики:

```javascript
// ВНУТРИ класса AntigravityApiService:

/**
 * Log retry statistics
 */
logRetryStats() {
    console.log('[Antigravity] Retry Statistics:', JSON.stringify(this.retryStats, null, 2));
}
```

---

### Задача 6.5: Создать тесты для error handling

**Файл**: `E:\1C\AIClient-2-API\src\gemini/tests/error-handler.test.js`

```javascript
import { describe, test, expect } from '@jest/globals';
import { detectErrorType, isRecoverableError, getRecoveryMessage, ERROR_TYPES } from '../error-handler.js';

describe('Error Handler', () => {
    describe('detectErrorType', () => {
        test('should detect thinking_block_order error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking blocks must be in the first block position'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_BLOCK_ORDER);
        });

        test('should detect tool_result_missing error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'tool_use without corresponding tool_result'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.TOOL_RESULT_MISSING);
        });

        test('should detect thinking_disabled_violation error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking is disabled and cannot contain thinking blocks'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_DISABLED_VIOLATION);
        });

        test('should return null for non-recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'something went wrong'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBeNull();
        });
    });

    describe('isRecoverableError', () => {
        test('should return true for recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking blocks must be in the first block position'
                        }
                    }
                }
            };

            expect(isRecoverableError(error)).toBe(true);
        });

        test('should return false for non-recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'something went wrong'
                        }
                    }
                }
            };

            expect(isRecoverableError(error)).toBe(false);
        });
    });

    describe('getRecoveryMessage', () => {
        test('should return appropriate message for thinking_block_order', () => {
            const message = getRecoveryMessage(ERROR_TYPES.THINKING_BLOCK_ORDER);

            expect(message).toContain('Recovering thinking block order');
        });

        test('should return appropriate message for tool_result_missing', () => {
            const message = getRecoveryMessage(ERROR_TYPES.TOOL_RESULT_MISSING);

            expect(message).toContain('Injecting cancelled tool results');
        });

        test('should return appropriate message for thinking_disabled_violation', () => {
            const message = getRecoveryMessage(ERROR_TYPES.THINKING_DISABLED_VIOLATION);

            expect(message).toContain('Stripping thinking blocks');
        });

        test('should return default message for unknown error type', () => {
            const message = getRecoveryMessage('unknown');

            expect(message).toContain('Attempting to recover');
        });
    });
});
```

---

## Тестирование Phase 6

### Тест 1: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/antigravity-core.js
node -c src/gemini/error-handler.js
```

**Ожидание**: Нет ошибок синтаксиса.

---

### Тест 2: Запуск сервиса

```bash
cd E:\1C\AIClient-2-API
npm start
```

**Проверка логов**: Нет ошибок при старте.

---

### Тест 3: Unit тесты

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/error-handler.test.js
```

**Ожидание**: Все тесты проходят.

---

### Тест 4: Ручное тестирование retry

Создать сценарий, где возникает recoverable error:

```bash
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "contents": [{"role": "user", "parts": [{"text": "Hello"}]}],
      "generationConfig": {
        "thinkingConfig": {
          "include_thoughts": true,
          "thinking_budget": 16000
        }
      }
    }
  }'
```

**Проверка логов при ошибке**:
- `[Antigravity API] Recoverable error (thinking_block_order) detected. Retrying (1/3)...`
- `[Antigravity API] Stripped thinking config for retry`

---

### Тест 5: Проверка статистики retry

Добавить логирование статистики в конце обработки запроса (можно временно добавить код для теста):

```javascript
// После завершения request processing:
service.logRetryStats();
```

---

## Критерии успеха Phase 6

- ✅ `error-handler.js` расширен (создан в Phase 4)
- ✅ Retry логика интегрирована в `callApi` и `streamApi`
- ✅ Empty response retry реализован
- ✅ Unit тесты для error handling проходят
- ✅ Логи показывают retry attempts
- ✅ Статистика retry работает

---

## Следующий шаг

Если Phase 6 успешно протестирован - переходите к `PHASE_7.md`

---

## Отладка

### Проблема: Retry не работает

**Проверка**:
1. Убедитесь, что `detectErrorType` возвращает правильный тип
2. Проверьте логи на `Recoverable error detected`
3. Убедитесь, что retryCount увеличивается

### Проблема: Infinite retry loop

**Проверка**:
1. Проверьте лимит retry attempts
2. Убедитесь, что recovery код действительно изменяет requestBody

---

## Rollback

Если что-то пошло не так - восстановите изменения:

```bash
git checkout src/gemini/antigravity-core.js
git checkout src/gemini/config.js
rm src/gemini/tests/error-handler.test.js
```

---

## Улучшения (опционально)

- [ ] Добавить retry для rate limit errors
- [ ] Добавить retry для network errors
- [ ] Добавить адаптивный backoff (Jittered)
- [ ] Добавить Circuit Breaker pattern
