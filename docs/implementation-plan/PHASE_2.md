# Phase 2: Signature Caching System (Enhancement)

## Обзор

**Цель**: Доработать Phase 1 для полноценной работы с кешированием подписей.

**Статус**: В Phase 1 уже создан `signature-cache.js`, но нужно улучшить интеграцию и добавить поддержку при чтении подписей из cache.

---

## Задачи Phase 2

### Задача 2.1: Добавить чтение из cache при формировании запросов

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Внутри функции `geminiToAntigravity` (примерно строка 109) добавить ПОСЛЕ обработки thinkingConfig:

```javascript
// ВНУТРИ функции geminiToAntigravity, ПОСЛЕ обработки thinkingConfig:

// Attach cached signature if available
if (template.request.generationConfig &&
    template.request.generationConfig.thinkingConfig &&
    template.request.generationConfig.thinkingConfig.include_thoughts) {

    const conversationKey = ThinkingUtils.extractConversationKey(payload);
    const sessionId = ThinkingUtils.buildSignatureSessionKey(PLUGIN_SESSION_ID, modelName, conversationKey, template.project);

    // Try to get cached signature
    const cachedSignature = this.signatureCache?.get(
        PLUGIN_SESSION_ID,
        modelName,
        conversationKey,
        "Warmup request for thinking signature."
    );

    if (cachedSignature) {
        console.log(`[Antigravity] Using cached signature for ${sessionId}`);

        // Add signature to request
        if (!template.request.generationConfig.thinkingConfig.signature) {
            template.request.generationConfig.thinkingConfig.signature = cachedSignature;
        }
    } else {
        console.log(`[Antigravity] No cached signature for ${sessionId} (warmup should have been called)`);
    }
}
```

---

### Задача 2.2: Добавить сохранение подписей из ответов SSE

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Внутри метода `async *generateContentStream(model, requestBody)` (примерно строка 765), найти место где обрабатываются SSE чанки, и добавить сохранение подписей:

```javascript
// ВНУТРИ async *generateContentStream, ВНУТРИ цикла обработки stream:

// Найдите цикл:
for await (const chunk of stream) {
    const response = toGeminiApiResponse(chunk.response);

    // NEW: Extract and cache signature from response
    if (this.thinkingConfig.enable_signature_cache) {
        const signature = ThinkingUtils.extractSignatureFromSseChunk(chunk.response);

        if (signature) {
            const conversationKey = ThinkingUtils.extractConversationKey(requestBody);
            const sessionId = ThinkingUtils.buildSignatureSessionKey(PLUGIN_SESSION_ID, model, conversationKey, this.projectId);

            // Extract thinking text from chunk
            let thinkingText = "Unknown thinking content";
            if (chunk.response?.candidates?.[0]?.content?.parts) {
                const thinkingParts = chunk.response.candidates[0].content.parts.filter(p =>
                    p.type === 'thinking' || p.thought === true
                );
                if (thinkingParts.length > 0) {
                    thinkingText = thinkingParts.map(p => p.text || "").join(" ");
                }
            }

            this.signatureCache.cache(
                PLUGIN_SESSION_ID,
                model,
                conversationKey,
                thinkingText.substring(0, 500), // First 500 chars as key
                signature
            );

            console.log(`[Antigravity] Cached signature from response for ${sessionId}`);
        }
    }

    yield response;
}
```

---

### Задача 2.3: Добавить cleanup expired signatures при старте

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Внутри метода `async initialize()` (примерно строка 266) добавить после инициализации signatureCache:

```javascript
// ВНУТРИ async initialize(), ПОСЛЕ инициализации signatureCache:

// NEW: Cleanup expired signatures on startup
if (this.thinkingConfig.enable_signature_cache) {
    this.signatureCache.cleanupExpired();
}
```

---

### Задача 2.4: Добавить graceful shutdown для записи cache на диск

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

Добавить новый метод в класс `AntigravityApiService`:

```javascript
// ВНУТРИ класса AntigravityApiService, ПОСЛЕ метода isExpiryDateNear():

/**
 * Gracefully shutdown - flush cache to disk
 */
async shutdown() {
    console.log('[Antigravity] Shutting down...');
    if (this.signatureCache) {
        await this.signatureCache.flushToDisk();
    }
}
```

Затем добавить обработчик SIGTERM/SIGINT (в конец файла, вне класса):

```javascript
// В КОНЕЦ файла (вне класса):

// Handle graceful shutdown
let antigravityInstance = null;

process.on('SIGTERM', async () => {
    if (antigravityInstance) {
        await antigravityInstance.shutdown();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    if (antigravityInstance) {
        await antigravityInstance.shutdown();
    }
    process.exit(0);
});

// Export instance reference for shutdown handling
export function setAntigravityInstance(instance) {
    antigravityInstance = instance;
}
```

---

### Задача 2.5: Создать Unit тесты для signature cache

**Файл**: `E:\1C\AIClient-2-API\src\gemini/tests/signature-cache.test.js`

```javascript
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { SignatureCache } from '../signature-cache.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs
jest.mock('fs/promises');

describe('SignatureCache', () => {
    let cache;

    beforeEach(() => {
        jest.clearAllMocks();

        cache = new SignatureCache({
            memory_ttl_seconds: 3600,
            disk_ttl_seconds: 172800,
            write_interval_seconds: 60,
            debug_thinking: false,
        });
    });

    describe('buildKey', () => {
        test('should build key with all components', () => {
            const key = cache.buildKey('session-123', 'claude-opus-4-5-thinking', 'conv-456', 'test text');
            expect(key).toContain('session-123');
            expect(key).toContain('claude-opus-4-5-thinking');
            expect(key).toContain('conv-456');
        });

        test('should use default conversation key if not provided', () => {
            const key = cache.buildKey('session-123', 'claude-opus-4-5-thinking', null, 'test text');
            expect(key).toContain('default');
        });
    });

    describe('cache and get', () => {
        test('should cache and retrieve signature', () => {
            const sessionId = '-test-session';
            const model = 'claude-opus-4-5-thinking';
            const text = 'test thinking content';
            const signature = 'signature-' + 'a'.repeat(50);

            cache.cache(sessionId, model, 'default', text, signature);

            const retrieved = cache.get(sessionId, model, 'default', text);
            expect(retrieved).toBe(signature);
        });

        test('should return null for non-existent key', () => {
            const result = cache.get('non-existent', 'model', 'default', 'text');
            expect(result).toBeNull();
        });

        test('should cache multiple signatures', () => {
            const signature1 = 'sig1-' + 'a'.repeat(50);
            const signature2 = 'sig2-' + 'b'.repeat(50);

            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', signature1);
            cache.cache('session-1', 'model-1', 'conv-1', 'text-2', signature2);

            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-1')).toBe(signature1);
            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-2')).toBe(signature2);
        });
    });

    describe('TTL expiration', () => {
        test('should expire entries after memory TTL', () => {
            const sessionId = '-test-session';
            const model = 'claude-opus-4-5-thinking';
            const text = 'test thinking content';
            const signature = 'signature-' + 'a'.repeat(50);

            // Mock Date.now to return old timestamp
            const originalDateNow = Date.now;
            Date.now = jest.fn(() => Date.parse('2024-01-01'));

            cache.cache(sessionId, model, 'default', text, signature);

            // Restore Date.now
            Date.now = originalDateNow;

            // Try to get (should be expired)
            const retrieved = cache.get(sessionId, model, 'default', text);
            // After more than TTL seconds, should return null
            expect(retrieved).toBeNull();
        });
    });

    describe('disk persistence', () => {
        test('should schedule disk write', async () => {
            const writeInterval = 100; // Short interval for testing

            cache = new SignatureCache({
                memory_ttl_seconds: 3600,
                disk_ttl_seconds: 172800,
                write_interval_seconds: writeInterval / 1000,
            });

            const signature = 'sig-' + 'a'.repeat(50);
            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', signature);

            // Wait for scheduled write
            await new Promise(resolve => setTimeout(resolve, writeInterval + 100));

            expect(fs.writeFile).toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        test('should clear all cache entries', () => {
            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', 'sig1');
            cache.cache('session-2', 'model-2', 'conv-2', 'text-2', 'sig2');

            cache.clear();

            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-1')).toBeNull();
            expect(cache.get('session-2', 'model-2', 'conv-2', 'text-2')).toBeNull();
        });
    });

    describe('cleanupExpired', () => {
        test('should remove expired entries', () => {
            const originalDateNow = Date.now;

            // Cache entry with current timestamp
            Date.now = jest.fn(() => Date.parse('2024-01-01'));
            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', 'sig1');

            // Cache entry with old timestamp (expired)
            Date.now = jest.fn(() => Date.parse('2023-01-01'));
            cache.cache('session-2', 'model-2', 'conv-2', 'text-2', 'sig2');

            // Restore Date.now
            Date.now = originalDateNow;

            cache.cleanupExpired();

            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-1')).toBe('sig1');
            expect(cache.get('session-2', 'model-2', 'conv-2', 'text-2')).toBeNull();
        });
    });
});
```

---

## Тестирование Phase 2

### Тест 1: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/antigravity-core.js
```

**Ожидание**: Нет ошибок синтаксиса.

---

### Тест 2: Запуск сервиса

```bash
cd E:\1C\AIClient-2-API
npm start
```

**Ожидание**: Сервис запускается без ошибок.

---

### Тест 3: Unit тесты

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/signature-cache.test.js
```

**Ожидание**: Все тесты проходят.

---

### Тест 4: Ручное тестирование кеширования

Отправить два запроса с одним и тем же conversation ID:

**Запрос 1**:
```bash
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "conversationId": "test-conversation-1",
      "contents": [{"role": "user", "parts": [{"text": "Hello"}]}]
    }
  }'
```

**Запрос 2** (сразу после первого):
```bash
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "conversationId": "test-conversation-1",
      "contents": [{"role": "user", "parts": [{"text": "Continue"}]}]
    }
  }'
```

**Проверка логов** (второй запрос):
- `[Antigravity] Using cached signature for ...`
- `[SignatureCache] Memory hit for ...`

**Ожидание**: Второй запрос использует кешированную подпись.

---

### Тест 5: Проверка дискового кеша

```bash
# Запустить сервис
cd E:\1C\AIClient-2-API
npm start

# Остановить сервис (Ctrl+C)
# Проверить наличие файла кеша
cat E:\1C\AIClient-2-API\data\signature-cache\cache.json
```

**Ожидание**: Файл содержит JSON с записями кеша.

---

## Критерии успеха Phase 2

- ✅ Подписи читаются из cache при формировании запросов
- ✅ Подписи сохраняются из SSE ответов
- ✅ Expired entries очищаются при старте
- ✅ Graceful shutdown записывает cache на диск
- ✅ Unit тесты проходят
- ✅ Ручное тестирование показывает работу кеширования
- ✅ Дисковый кеш создается и читается корректно

---

## Следующий шаг

Если Phase 2 успешно протестирован - переходите к `PHASE_3.md`

---

## Отладка

### Проблема: Кеширование не работает

**Проверка**:
1. Включить debug лог: `src/gemini/config.js` → `debug_thinking: true`
2. Проверить логи на `[SignatureCache] Cached signature...`
3. Проверить ключи cache (они должны быть уникальными)

### Проблема: Graceful shutdown не работает

**Проверка**:
1. Убедитесь, что `setAntigravityInstance` вызывается при создании сервиса
2. Проверьте логи на `[Antigravity] Shutting down...`

---

## Rollback

Если что-то пошло не так - восстановите изменения:

```bash
git checkout src/gemini/antigravity-core.js
rm src/gemini/tests/signature-cache.test.js
```

---

## Улучшения (опционально)

- [ ] Добавить метрики cache hit rate
- [ ] Добавить автоматическую очистку старых файлов кеша
- [ ] Добавить поддержку шифрования подписей на диске
