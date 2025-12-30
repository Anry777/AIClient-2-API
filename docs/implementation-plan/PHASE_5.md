# Phase 5: Tool ID Recovery

## Обзор

**Цель**: Реализовать сопоставление functionCall с functionResponse при context compaction.

**Проблема**: Когда Antigravity API возвращает conversation history, sometimes tool responses теряют свои ID из-за compression. Это приводит к ошибкам "Could not process tool results".

**Решение**: FIFO очереди для сопоставления functionCall с functionResponse по function name.

---

## Задачи Phase 5

### Задача 5.1: Создать tool-recovery.js

**Файл**: `E:\1C\AIClient-2-API\src\gemini\tool-recovery.js`

```javascript
/**
 * Tool ID Recovery Module
 *
 * Handles recovery of orphan tool responses when context compaction removes tool call IDs.
 * Uses FIFO queues to match functionCall with functionResponse by function name.
 */

/**
 * Assign tool call IDs to functionCall parts.
 * First pass: assign IDs and store in queue.
 */
export function assignToolCallIds(contents) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    const callQueues = new Map(); // function name -> queue of call IDs

    return contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            // Check for functionCall
            if (part.functionCall && part.functionCall.name) {
                const name = part.functionCall.name;

                // Generate call ID if not present
                if (!part.functionCall.id || !part.functionCall.callId) {
                    const callId = generateToolCallId(name);
                    part.functionCall.id = callId;

                    // Store in queue
                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(callId);
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Match tool response IDs with previously assigned call IDs.
 * Second pass: retrieve IDs from FIFO queue.
 */
export function matchToolResponseIds(contents, callQueues) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    return contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            // Check for functionResponse
            if (part.functionResponse && part.functionResponse.name) {
                const name = part.functionResponse.name;

                // If ID is missing, try to get from queue
                if (!part.functionResponse.id) {
                    const queue = callQueues.get(name);
                    if (queue && queue.length > 0) {
                        const callId = queue.shift(); // FIFO: get first element
                        part.functionResponse.id = callId;
                    }
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Fix tool response grouping by assigning and matching IDs in one pass.
 */
export function fixToolResponseGrouping(contents) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    const callQueues = new Map(); // function name -> queue of call IDs

    // First pass: assign tool call IDs
    const withCallIds = contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            if (part.functionCall && part.functionCall.name) {
                const name = part.functionCall.name;
                const callId = part.functionCall.id || part.functionCall.callId;

                if (callId) {
                    // Store existing ID in queue
                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(callId);
                } else {
                    // Generate new ID
                    const newCallId = generateToolCallId(name);
                    part.functionCall.id = newCallId;

                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(newCallId);
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });

    // Second pass: match functionResponse with call IDs
    return withCallIds.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            if (part.functionResponse && part.functionResponse.name) {
                const name = part.functionResponse.name;

                // If ID is missing, get from queue
                if (!part.functionResponse.id) {
                    const queue = callQueues.get(name);
                    if (queue && queue.length > 0) {
                        const callId = queue.shift(); // FIFO
                        part.functionResponse.id = callId;
                    }
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Generate tool call ID in format: call-<function-name>-<random>
 */
function generateToolCallId(functionName) {
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `call-${functionName}-${randomPart}`;
}

/**
 * Find orphan tool responses (functionResponse without matching functionCall)
 */
export function findOrphanToolResponses(contents) {
    const orphans = [];
    const callIds = new Set();

    // First pass: collect all call IDs
    contents.forEach(content => {
        if (!content || !Array.isArray(content.parts)) return;

        content.parts.forEach(part => {
            if (part.functionCall && part.functionCall.id) {
                callIds.add(part.functionCall.id);
            }
        });
    });

    // Second pass: find responses without matching call
    contents.forEach((content, idx) => {
        if (!content || !Array.isArray(content.parts)) return;

        content.parts.forEach(part => {
            if (part.functionResponse && part.functionResponse.id) {
                if (!callIds.has(part.functionResponse.id)) {
                    orphans.push({
                        contentIndex: idx,
                        responseId: part.functionResponse.id,
                        functionName: part.functionResponse.name,
                    });
                }
            }
        });
    });

    return orphans;
}

/**
 * Create placeholder tool calls for orphan responses.
 */
export function createPlaceholderToolCalls(contents, orphans) {
    if (orphans.length === 0) {
        return contents;
    }

    const placeholderMap = new Map(); // responseId -> placeholder call

    orphans.forEach(orphan => {
        placeholderMap.set(orphan.responseId, {
            functionCall: {
                id: orphan.responseId,
                name: orphan.functionName,
                args: {}, // Placeholder args
            }
        });
    });

    // Insert placeholder calls before each orphan response
    const newContents = [];
    const placeholderIndices = new Set(orphans.map(o => o.contentIndex));

    contents.forEach((content, idx) => {
        // Insert placeholder call before orphan response
        if (placeholderIndices.has(idx)) {
            const responseId = content.parts.find(p => p.functionResponse)?.functionResponse?.id;
            const placeholder = placeholderMap.get(responseId);

            if (placeholder) {
                newContents.push({
                    role: 'model',
                    parts: [placeholder],
                });
            }
        }

        newContents.push(content);
    });

    return newContents;
}
```

---

### Задача 5.2: Интегрировать tool recovery в geminiToAntigravity

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

#### 5.2.1 Добавить импорт

После существующих импортов добавить:

```javascript
import * as ToolRecovery from './tool-recovery.js';
```

#### 5.2.2 Применить tool recovery внутри geminiToAntigravity

Внутри функции `geminiToAntigravity` (примерно строка 109) добавить ПОСЛЕ обработки thinkingConfig и ДО применения thinking recovery:

```javascript
// ВНУТРИ функции geminiToAntigrativity, ПОСЛЕ обработки thinkingConfig:

// Apply tool ID recovery
if (this.thinkingConfig.tool_id_recovery && template.request.contents) {
    console.log('[Antigravity] Applying tool ID recovery...');

    // Find orphan tool responses
    const orphans = ToolRecovery.findOrphanToolResponses(template.request.contents);

    if (orphans.length > 0) {
        console.log(`[Antigravity] Found ${orphans.length} orphan tool responses, creating placeholders`);

        // Create placeholders
        template.request.contents = ToolRecovery.createPlaceholderToolCalls(template.request.contents, orphans);
    }

    // Fix tool response grouping
    template.request.contents = ToolRecovery.fixToolResponseGrouping(template.request.contents);

    console.log('[Antigravity] Tool ID recovery applied');
}
```

---

### Задача 5.3: Обновить config для tool_id_recovery

**Файл**: `E:\1C\AIClient-2-API\src\gemini\config.js`

Добавить в DEFAULT_CONFIG:

```javascript
export const DEFAULT_CONFIG = {
    // ... existing config ...

    // Tool ID Recovery
    tool_id_recovery: true,
};
```

---

### Задача 5.4: Создать тесты для tool recovery

**Файл**: `E:\1C\AIClient-2-API\src\gemini/tests/tool-recovery.test.js`

```javascript
import { describe, test, expect } from '@jest/globals';
import {
    assignToolCallIds,
    matchToolResponseIds,
    fixToolResponseGrouping,
    findOrphanToolResponses,
    createPlaceholderToolCalls,
} from '../tool-recovery.js';

describe('Tool ID Recovery', () => {
    describe('assignToolCallIds', () => {
        test('should assign IDs to functionCall parts', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
            ];

            const result = assignToolCallIds(contents);

            expect(result[0].parts[0].functionCall.id).toBeDefined();
            expect(result[0].parts[0].functionCall.id).toMatch(/^call-tool1-/);
        });

        test('should preserve existing IDs', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'existing-id' } }] },
            ];

            const result = assignToolCallIds(contents);

            expect(result[0].parts[0].functionCall.id).toBe('existing-id');
        });
    });

    describe('matchToolResponseIds', () => {
        test('should match functionResponse with call IDs', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-tool1-123' } }] },
            ];
            const callQueues = new Map([['tool1', ['call-tool1-123']]]);

            const responses = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = matchToolResponseIds(responses, callQueues);

            expect(result[0].parts[0].functionResponse.id).toBe('call-tool1-123');
        });

        test('should not assign ID when queue is empty', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'custom-id' } }] },
            ];
            const callQueues = new Map();

            const result = matchToolResponseIds(contents, callQueues);

            expect(result[0].parts[0].functionResponse.id).toBe('custom-id');
        });
    });

    describe('fixToolResponseGrouping', () => {
        test('should fix tool response grouping in one pass', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = fixToolResponseGrouping(contents);

            // Check functionCall has ID
            expect(result[0].parts[0].functionCall.id).toBeDefined();

            // Check functionResponse has matching ID
            expect(result[1].parts[0].functionResponse.id).toBe(result[0].parts[0].functionCall.id);
        });

        test('should handle multiple tool calls and responses', () => {
            const contents = [
                { role: 'model', parts: [
                    { functionCall: { name: 'tool1', args: {} } },
                    { functionCall: { name: 'tool2', args: {} } },
                ]},
                { role: 'user', parts: [
                    { functionResponse: { name: 'tool1', response: {} } },
                    { functionResponse: { name: 'tool2', response: {} } },
                ]},
            ];

            const result = fixToolResponseGrouping(contents);

            // Check all functionCalls have IDs
            expect(result[0].parts[0].functionCall.id).toBeDefined();
            expect(result[0].parts[1].functionCall.id).toBeDefined();

            // Check functionResponses have matching IDs (FIFO order)
            expect(result[1].parts[0].functionResponse.id).toBe(result[0].parts[0].functionCall.id);
            expect(result[1].parts[1].functionResponse.id).toBe(result[0].parts[1].functionCall.id);
        });
    });

    describe('findOrphanToolResponses', () => {
        test('should find orphan responses', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] }, // Orphan
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans.length).toBe(1);
            expect(orphans[0].responseId).toBe('call-2');
            expect(orphans[0].functionName).toBe('tool1');
        });

        test('should return empty when no orphans', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-1' } }] },
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans.length).toBe(0);
        });
    });

    describe('createPlaceholderToolCalls', () => {
        test('should create placeholders for orphans', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
            ];
            const orphans = [
                { contentIndex: 0, responseId: 'call-2', functionName: 'tool1' },
            ];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result.length).toBe(2); // Placeholder + original
            expect(result[0].role).toBe('model');
            expect(result[0].parts[0].functionCall.name).toBe('tool1');
        });

        test('should not modify when no orphans', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
            ];
            const orphans = [];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result).toEqual(contents);
        });
    });
});
```

---

## Тестирование Phase 5

### Тест 1: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/tool-recovery.js
node -c src/gemini/antigravity-core.js
```

**Ожидание**: Нет ошибок синтаксиса.

---

### Тест 2: Запуск сервиса

```bash
cd E:\1C\AIClient-2-API
npm start
```

**Проверка логов**:
- `[Antigravity] Applying tool ID recovery...`

---

### Тест 3: Unit тесты

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/tool-recovery.test.js
```

**Ожидание**: Все тесты проходят.

---

### Тест 4: Ручное тестирование с orphan tool responses

Отправить запрос с orphan tool response:

```bash
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "contents": [
        {"role": "user", "parts": [{"text": "Hello"}]},
        {"role": "model", "parts": [{"functionCall": {"name": "tool1", "args": {}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "tool1", "response": {}}}]},
        {"role": "model", "parts": [{"functionCall": {"name": "tool2", "args": {}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "tool2", "response": {}, "id": "orphan-id"}}]}
      ]
    }
  }'
```

**Проверка логов**:
- `[Antigravity] Found 1 orphan tool responses, creating placeholders`
- `[Antigravity] Tool ID recovery applied`

---

## Критерии успеха Phase 5

- ✅ `tool-recovery.js` создан
- ✅ Tool recovery интегрирован в `antigravity-core.js`
- ✅ Unit тесты проходят
- ✅ Логи показывают выполнение tool recovery
- ✅ Orphan tool responses обнаруживаются и обрабатываются
- ✅ Placeholder tool calls создаются

---

## Следующий шаг

Если Phase 5 успешно протестирован - переходите к `PHASE_6.md`

---

## Отладка

### Проблема: Tool recovery не работает

**Проверка**:
1. Убедитесь, что `tool_id_recovery: true` в config
2. Проверьте логи на `[Antigravity] Applying tool ID recovery...`
3. Проверьте, что `findOrphanToolResponses` находит orphans

### Проблема: Placeholder tool calls не создаются

**Проверка**:
1. Проверьте формат orphans, возвращаемый `findOrphanToolResponses`
2. Убедитесь, что `createPlaceholderToolCalls` получает правильный индекс

---

## Rollback

Если что-то пошло не так - восстановите изменения:

```bash
git checkout src/gemini/antigravity-core.js
git checkout src/gemini/config.js
rm src/gemini/tool-recovery.js
rm src/gemini/tests/tool-recovery.test.js
```

---

## Улучшения (опционально)

- [ ] Добавить логирование когда создаются placeholder tool calls
- [ ] Добавить поддержку recovery для множественных orphan responses
- [ ] Добавить метрики recovery success rate
