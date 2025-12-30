# Phase 1: Thinking Warmup System

## Обзор

**Цель**: Реализовать предварительный запрос (warmup) для получения подписи thinking-блоков перед основным запросом.

**Почему это нужно**: Antigravity API требует подписи (signature) для thinking-блоков. Без подписи блоки отклоняются, и модели ведут себя так, будто они "не думают".

**Подход**: Перед основным запросом отправить простой warmup-запрос, получить подпись и закешировать её.

---

## Задачи Phase 1

### Задача 1.1: Создать конфигурацию `src/gemini/config.js`

**Файл**: `E:\1C\AIClient-2-API\src\gemini\config.js`

```javascript
/**
 * Configuration for thinking features in Antigravity API
 */

export const DEFAULT_CONFIG = {
    // Thinking Warmup
    enable_thinking_warmup: true,
    thinking_warmup_budget: 16000,

    // Signature Caching
    enable_signature_cache: true,
    signature_cache_memory_ttl_seconds: 3600,
    signature_cache_disk_ttl_seconds: 172800,
    signature_cache_write_interval_seconds: 60,

    // Stable Session ID
    use_stable_session_id: true,

    // Logging
    debug_thinking: false,
};

/**
 * Load configuration from project config or return defaults
 */
export function getConfig() {
    // TODO: Load from config.json if exists
    return DEFAULT_CONFIG;
}
```

**Действия**:
1. Создать файл `src/gemini/config.js`
2. Скопировать код выше

---

### Задача 1.2: Создать утилиты для thinking `src/gemini/thinking-utils.js`

**Файл**: `E:\1C\AIClient-2-API\src\gemini\thinking-utils.js`

```javascript
/**
 * Utility functions for thinking models support
 */

// Thinking models for Antigravity
export const THINKING_MODELS = [
    'claude-opus-4-5-thinking',
    'gemini-claude-sonnet-4-5-thinking',
    'claude-sonnet-4-5-thinking',
];

/**
 * Check if a model is a thinking model
 */
export function isThinkingModel(model) {
    if (!model) return false;
    const lowerModel = model.toLowerCase();
    return THINKING_MODELS.some(thinkingModel => {
        const tModel = thinkingModel.replace('gemini-', '').toLowerCase();
        return lowerModel.includes(tModel);
    });
}

/**
 * Check if request contains tool use
 */
export function hasToolUseInRequest(requestBody) {
    if (!requestBody || !requestBody.request) return false;
    const contents = requestBody.request.contents || [];

    return contents.some(content => {
        if (!content.parts) return false;
        return content.parts.some(part =>
            part.functionCall ||
            part.tool_use ||
            (part.type === 'tool_use') ||
            (part.type === 'functionCall')
        );
    });
}

/**
 * Check if Antigravity format contents have tool use
 */
export function hasAntigravityToolUse(contents) {
    if (!contents || !Array.isArray(contents)) return false;
    return contents.some(content => {
        if (!content.parts) return false;
        return content.parts.some(part => part.functionCall);
    });
}

/**
 * Extract conversation key from request body
 */
export function extractConversationKey(requestBody) {
    if (!requestBody || !requestBody.request) return 'default';
    const request = requestBody.request;

    // Priority fields for conversation ID
    const candidates = [
        request.conversationId,
        request.conversation_id,
        request.thread_id,
        request.threadId,
        request.sessionId,
        request.session_id,
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string') {
            return candidate.trim();
        }
    }

    return 'default';
}

/**
 * Extract signature from SSE chunk
 */
export function extractSignatureFromSseChunk(chunk) {
    if (!chunk || !chunk.candidates || !chunk.candidates[0]) {
        return null;
    }

    const candidate = chunk.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
        return null;
    }

    for (const part of candidate.content.parts) {
        // Format: thoughtSignature
        if (part.thoughtSignature && part.thoughtSignature.length > 50) {
            return part.thoughtSignature;
        }
        // Alternative format: signature in thinking block
        if (part.type === 'thinking' && part.signature && part.signature.length > 50) {
            return part.signature;
        }
    }

    return null;
}

/**
 * Build signature session key
 */
export function buildSignatureSessionKey(sessionId, model, conversationKey, projectKey) {
    const modelKey = typeof model === 'string' && model.trim() ? model.toLowerCase() : 'unknown';
    const projectPart = typeof projectKey === 'string' && projectKey.trim() ? projectKey.trim() : 'default';
    const conversationPart = typeof conversationKey === 'string' && conversationKey.trim() ? conversationKey.trim() : 'default';
    return `${sessionId}:${modelKey}:${projectPart}:${conversationPart}`;
}
```

**Действия**:
1. Создать файл `src/gemini/thinking-utils.js`
2. Скопировать код выше

---

### Задача 1.3: Создать Signature Cache `src/gemini/signature-cache.js`

**Файл**: `E:\1C\AIClient-2-API\src\gemini\signature-cache.js`

```javascript
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'signature-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

/**
 * Signature cache for thinking blocks
 * Supports in-memory and disk-based caching with TTL
 */
export class SignatureCache {
    constructor(config) {
        this.memoryCache = new Map();
        this.diskCache = new Map();
        this.config = config || {};

        // Load from disk on startup
        this.loadFromDisk().catch(err => {
            console.log('[SignatureCache] No existing cache file');
        });
    }

    /**
     * Build cache key: sessionId:model:conversationKey:textHash
     */
    buildKey(sessionId, model, conversationKey, text) {
        const textHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
        return `${sessionId}:${model}:${conversationKey || 'default'}:${textHash}`;
    }

    /**
     * Cache signature
     */
    cache(sessionId, model, conversationKey, text, signature) {
        const key = this.buildKey(sessionId, model, conversationKey, text);
        const timestamp = Date.now();

        // In-memory cache
        this.memoryCache.set(key, { signature, timestamp });

        // Disk cache
        this.diskCache.set(key, { signature, timestamp });

        // Schedule disk write (debounce)
        this.scheduleDiskWrite();

        if (this.config.debug_thinking) {
            console.log(`[SignatureCache] Cached signature for key: ${key.substring(0, 40)}...`);
        }
    }

    /**
     * Get cached signature
     */
    get(sessionId, model, conversationKey, text) {
        const key = this.buildKey(sessionId, model, conversationKey, text);

        // Check memory first
        const memEntry = this.memoryCache.get(key);
        if (memEntry && !this.isExpired(memEntry.timestamp, this.config.memory_ttl_seconds || 3600)) {
            if (this.config.debug_thinking) {
                console.log(`[SignatureCache] Memory hit for key: ${key.substring(0, 40)}...`);
            }
            return memEntry.signature;
        }

        // Check disk
        const diskEntry = this.diskCache.get(key);
        if (diskEntry && !this.isExpired(diskEntry.timestamp, this.config.disk_ttl_seconds || 172800)) {
            // Promote to memory
            this.memoryCache.set(key, diskEntry);

            if (this.config.debug_thinking) {
                console.log(`[SignatureCache] Disk hit for key: ${key.substring(0, 40)}...`);
            }
            return diskEntry.signature;
        }

        if (this.config.debug_thinking) {
            console.log(`[SignatureCache] Cache miss for key: ${key.substring(0, 40)}...`);
        }
        return null;
    }

    /**
     * Check if entry is expired
     */
    isExpired(timestamp, ttlSeconds) {
        const now = Date.now();
        return (now - timestamp) > (ttlSeconds * 1000);
    }

    /**
     * Schedule disk write with debounce
     */
    scheduleDiskWrite() {
        if (this.writeTimer) return;

        const interval = (this.config.write_interval_seconds || 60) * 1000;
        this.writeTimer = setTimeout(async () => {
            await this.flushToDisk();
            this.writeTimer = null;
        }, interval);
    }

    /**
     * Flush cache to disk
     */
    async flushToDisk() {
        try {
            await fs.mkdir(CACHE_DIR, { recursive: true });
            const data = JSON.stringify(Array.from(this.diskCache.entries()));
            await fs.writeFile(CACHE_FILE, data, 'utf8');
            console.log(`[SignatureCache] Flushed ${this.diskCache.size} entries to disk`);
        } catch (error) {
            console.error('[SignatureCache] Failed to write cache to disk:', error.message);
        }
    }

    /**
     * Load cache from disk
     */
    async loadFromDisk() {
        try {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            const entries = JSON.parse(data);
            this.diskCache = new Map(entries);
            console.log(`[SignatureCache] Loaded ${this.diskCache.size} entries from disk`);
        } catch (error) {
            // File doesn't exist or is invalid
            this.diskCache = new Map();
        }
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.memoryCache.clear();
        this.diskCache.clear();
        console.log('[SignatureCache] Cache cleared');
    }

    /**
     * Cleanup expired entries
     */
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        // Cleanup memory
        for (const [key, entry] of this.memoryCache.entries()) {
            if (this.isExpired(entry.timestamp, this.config.memory_ttl_seconds || 3600)) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }

        // Cleanup disk
        for (const [key, entry] of this.diskCache.entries()) {
            if (this.isExpired(entry.timestamp, this.config.disk_ttl_seconds || 172800)) {
                this.diskCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[SignatureCache] Cleaned up ${cleaned} expired entries`);
            this.flushToDisk();
        }
    }
}
```

**Действия**:
1. Создать файл `src/gemini/signature-cache.js`
2. Скопировать код выше

---

### Задача 1.4: Модифицировать `src/gemini/antigravity-core.js`

#### 1.4.1 Добавить импорты и константы (в начало файла, после существующих импортов)

Добавить этот код после строки 11 (после `import { getProviderModels } from '../provider-models.js';`):

```javascript
import { v4 as uuidv4 } from 'uuid';
import { SignatureCache } from './signature-cache.js';
import * as ThinkingUtils from './thinking-utils.js';
import * as ThinkingConfig from './config.js';

// Stable Session ID (вместо generateSessionID)
const PLUGIN_SESSION_ID = `-${uuidv4()}`;

// Constants for warmup
const DEFAULT_THINKING_BUDGET = 16000;
const WARMUP_MAX_ATTEMPTS = 2;
const warmupAttemptedSessionIds = new Set();
const warmupSucceededSessionIds = new Set();
```

#### 1.4.2 Добавить свойства в класс AntigravityApiService

Найти `constructor(config)` (примерно строка 239) и добавить после `this.projectId = config.PROJECT_ID;`:

```javascript
this.projectId = config.PROJECT_ID;

// NEW: Thinking support
this.signatureCache = null;
this.thinkingConfig = ThinkingConfig.getConfig();
```

Затем найти `async initialize()` (примерно строка 266) и добавить в начало метода:

```javascript
async initialize() {
    if (this.isInitialized) return;
    console.log('[Antigravity] Initializing Antigravity API Service...');

    // NEW: Initialize signature cache
    this.signatureCache = new SignatureCache({
        memory_ttl_seconds: this.thinkingConfig.signature_cache_memory_ttl_seconds,
        disk_ttl_seconds: this.thinkingConfig.signature_cache_disk_ttl_seconds,
        write_interval_seconds: this.thinkingConfig.signature_cache_write_interval_seconds,
        debug_thinking: this.thinkingConfig.debug_thinking,
    });

    // ... existing code continues ...
```

#### 1.4.3 Добавить функцию buildThinkingWarmupBody

Найти место перед `export class AntigravityApiService` (примерно строка 210) и добавить:

```javascript
/**
 * Build warmup request body for thinking signature
 */
function buildThinkingWarmupBody(modelName, requestBody, isClaudeThinking) {
    if (!requestBody || !requestBody.request) {
        return null;
    }

    const request = { ...requestBody.request };
    const warmupPrompt = "Warmup request for thinking signature.";

    // Create simple warmup request
    request.contents = [{ role: 'user', parts: [{ text: warmupPrompt }] }];

    // Remove tools for warmup
    delete request.tools;
    delete request.toolConfig;

    // Configure thinking config
    if (!request.generationConfig) {
        request.generationConfig = {};
    }

    request.generationConfig.thinkingConfig = {
        include_thoughts: true,
        thinking_budget: DEFAULT_THINKING_BUDGET
    };

    // For Claude thinking models
    if (isClaudeThinking) {
        request.generationConfig.maxOutputTokens = 64000;
    }

    return { ...requestBody, request };
}
```

#### 1.4.4 Добавить метод runThinkingWarmup в класс AntigravityApiService

Найти место внутри класса (например, после `parseSSEStream` метода, примерно строка 740) и добавить:

```javascript
/**
 * Run thinking warmup to get signature
 */
async runThinkingWarmup(modelName, requestBody, sessionId) {
    // Check if already attempted for this sessionId
    if (warmupAttemptedSessionIds.has(sessionId)) {
        if (warmupSucceededSessionIds.has(sessionId)) {
            return true; // Already succeeded
        }
        // Already failed, don't retry
        return false;
    }

    // Check attempt limit
    if (warmupAttemptedSessionIds.size >= 1000) {
        // Remove oldest entry
        const first = warmupAttemptedSessionIds.values().next().value;
        warmupAttemptedSessionIds.delete(first);
        warmupSucceededSessionIds.delete(first);
    }

    warmupAttemptedSessionIds.add(sessionId);

    const isClaudeThinking = ThinkingUtils.isThinkingModel(modelName);
    const warmupBody = buildThinkingWarmupBody(modelName, requestBody, isClaudeThinking);

    if (!warmupBody) {
        console.warn('[Thinking Warmup] Could not build warmup body');
        return false;
    }

    console.log(`[Thinking Warmup] Executing warmup for ${sessionId} (model: ${modelName})...`);

    try {
        // Form warmup request
        const warmupRequest = {
            model: modelName,
            project: this.projectId,
            request: warmupBody.request,
            userAgent: 'antigravity',
            requestId: `agent-${uuidv4()}`,
        };

        // Send warmup request
        const requestOptions = {
            url: `${this.baseURL}/${ANTIGRAVITY_API_VERSION}:streamGenerateContent`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'User-Agent': 'antigravity/1.11.5 windows/amd64',
                'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
            },
            responseType: 'stream',
            params: { alt: 'sse' },
            body: JSON.stringify(warmupRequest),
        };

        const res = await this.authClient.request(requestOptions);

        // Parse SSE stream to get signature
        for await (const chunk of this.parseSSEStream(res.data)) {
            const signature = ThinkingUtils.extractSignatureFromSseChunk(chunk);

            if (signature) {
                console.log(`[Thinking Warmup] Got signature for ${sessionId}`);

                // Cache signature
                const conversationKey = ThinkingUtils.extractConversationKey(requestBody);
                this.signatureCache.cache(
                    PLUGIN_SESSION_ID,
                    modelName,
                    conversationKey,
                    "Warmup request for thinking signature.",
                    signature
                );

                warmupSucceededSessionIds.add(sessionId);
                return true;
            }
        }

        console.warn(`[Thinking Warmup] No signature found in response for ${sessionId}`);
        return false;
    } catch (error) {
        console.error(`[Thinking Warmup] Failed for ${sessionId}:`, error.message);
        return false;
    }
}
```

#### 1.4.5 Изменить geminiToAntigravity функцию

Найти существующую функцию `geminiToAntigravity` (примерно строка 109) и заменить обработку thinkingConfig (примерно строки 145-165) на:

```javascript
// ВНУТРИ функции geminiToAntigravity:
// Замените существующий блок обработки thinkingConfig на:

// Handle Thinking Config
if (template.request.generationConfig && template.request.generationConfig.thinkingConfig) {
    const thinkingConfig = template.request.generationConfig.thinkingConfig;

    console.log(`[Antigravity Transform] Model: ${modelName}, thinkingConfig BEFORE:`, JSON.stringify(thinkingConfig, null, 2));

    if (!modelName.startsWith('gemini-3-')) {
        // For non-Gemini-3 models, ensure thinkingBudget is set if includeThoughts is true
        if (thinkingConfig.include_thoughts &&
            (!thinkingConfig.thinking_budget || thinkingConfig.thinking_budget === -1)) {
            // Set a reasonable default budget if not specified
            thinkingConfig.thinking_budget = DEFAULT_THINKING_BUDGET;
        }

        if (thinkingConfig.thinking_level) {
            delete thinkingConfig.thinking_level;
        }
    }

    console.log(`[Antigravity Transform] Model: ${modelName}, thinkingConfig AFTER:`, JSON.stringify(thinkingConfig, null, 2));
}
```

#### 1.4.6 Изменить generateContentStream для интеграции warmup

Найти `async *generateContentStream(model, requestBody)` (примерно строка 765) и добавить в НАЧАЛО функции:

```javascript
// В НАЧАЛО метода generateContentStream (сразу после console.log):
async *generateContentStream(model, requestBody) {
    console.log(`[Antigravity Auth Token] Time until expiry: ${formatExpiryTime(this.authClient.credentials.expiry_date)}`);

    // NEW: Thinking Warmup
    if (this.thinkingConfig.enable_thinking_warmup) {
        const isThinking = ThinkingUtils.isThinkingModel(model);
        const hasTools = ThinkingUtils.hasToolUseInRequest(requestBody);

        if (isThinking && hasTools) {
            console.log(`[Antigravity] Model ${model} is thinking model with tools - running warmup`);

            // Get conversation key
            const conversationKey = ThinkingUtils.extractConversationKey(requestBody);
            const sessionId = ThinkingUtils.buildSignatureSessionKey(PLUGIN_SESSION_ID, model, conversationKey, this.projectId);

            // Run warmup
            const warmupSuccess = await this.runThinkingWarmup(model, requestBody, sessionId);

            if (!warmupSuccess) {
                console.warn(`[Antigravity] Warmup failed for ${sessionId}, proceeding anyway`);
            } else {
                console.log(`[Antigravity] Warmup succeeded for ${sessionId}`);
            }
        }
    }

    // ... существующий код продолжается ...
```

---

## Тестирование Phase 1

### Тест 1: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/config.js
node -c src/gemini/thinking-utils.js
node -c src/gemini/signature-cache.js
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

**Проверка логов**:
- `[Antigravity] Initializing Antigravity API Service...`
- `[SignatureCache] Loaded X entries from disk` (или `No existing cache file`)

---

### Тест 3: Unit тесты (опционально)

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/signature-cache.test.js
```

**Ожидание**: Тесты проходят.

---

### Тест 4: Ручное тестирование с thinking моделью

Отправить запрос с thinking моделью и tools:

```bash
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Use a tool to get weather"}]}],
    "generationConfig": {
      "thinkingConfig": {
        "include_thoughts": true,
        "thinking_budget": 16000
      }
    },
    "tools": [{"functionDeclarations": [{"name": "get_weather", "parameters": {"type": "object", "properties": {"location": {"type": "string"}}}]}]
  }'
```

**Проверка логов**:
- `[Antigravity] Model claude-opus-4-5-thinking is thinking model with tools - running warmup`
- `[Thinking Warmup] Executing warmup for ...`
- `[Thinking Warmup] Got signature for ...`
- `[SignatureCache] Cached signature for key: ...`
- `[Antigravity] Warmup succeeded for ...`

**Проверка ответа**: Ответ содержит thinking-блоки (если thinking работает).

---

## Критерии успеха Phase 1

- ✅ Файлы `config.js`, `thinking-utils.js`, `signature-cache.js` созданы
- ✅ `antigravity-core.js` модифицирован без синтаксических ошибок
- ✅ Сервис запускается без ошибок
- ✅ Логи показывают выполнение warmup для thinking моделей
- ✅ Signature cache работает (логи кеширования)
- ✅ Ручной тест с thinking моделью не падает с ошибками

---

## Следующий шаг

Если Phase 1 успешно протестирован - переходите к `PHASE_2.md`

---

## Отладка

### Проблема: Warmup не выполняется

**Проверка**:
1. Включить debug лог: `src/gemini/config.js` → `debug_thinking: true`
2. Проверить логи на наличие `Model X is thinking model with tools`
3. Убедиться, что модель содержит `-thinking` в названии

### Проблема: Signature не кешируется

**Проверка**:
1. Проверить папку `data/signature-cache/`
2. Проверить права записи
3. Проверить логи на `[SignatureCache] Cached signature...`

### Проблема: Ошибки импорта

**Проверка**:
1. Убедитесь, что `uuid` установлен: `npm install uuid`
2. Проверьте пути импорта

---

## Rollback

Если что-то пошло не так - восстановите `src/gemini/antigravity-core.js` из git:

```bash
git checkout src/gemini/antigravity-core.js
```

И удалите новые файлы:
```bash
rm src/gemini/config.js
rm src/gemini/thinking-utils.js
rm src/gemini/signature-cache.js
```
