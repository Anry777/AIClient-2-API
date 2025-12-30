# Phase 4: Thinking Recovery

## Обзор

**Цель**: Реализовать автоматическое восстановление при ошибках думающих блоков (thinking blocks corruption).

**Проблемы, которые решает**:
- `thinking_block_order` - thinking блоки находятся в неправильном порядке
- `tool_result_missing` - tool use вызван, но tool result отсутствует (ESC нажат)
- `thinking_disabled_violation` - thinking блоки отправлены в модель, которая их не поддерживает

**Подход**: Detect error → Analyze conversation state → Apply recovery → Retry

---

## Задачи Phase 4

### Задача 4.1: Создать файл thinking-recovery.js

**Файл**: `E:\1C\AIClient-2-API\src\gemini\thinking-recovery.js`

```javascript
/**
 * Thinking Recovery Module
 *
 * Minimal implementation for recovering from corrupted thinking state.
 * When conversation history gets corrupted (thinking blocks stripped/malformed),
 * this module provides recovery by closing the current turn and starting fresh.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Conversation state for thinking mode analysis
 */
export interface ConversationState {
    /** True if we're in an incomplete tool use loop (ends with functionResponse) */
    inToolLoop: boolean;
    /** Index of first model message in current turn */
    turnStartIdx: number;
    /** Whether the TURN started with thinking */
    turnHasThinking: boolean;
    /** Index of last model message */
    lastModelIdx: number;
    /** Whether last model msg has thinking */
    lastModelHasThinking: boolean;
    /** Whether last model msg has tool calls */
    lastModelHasToolCalls: boolean;
}

// ============================================================================
// DETECTION HELPERS
// ============================================================================

/**
 * Checks if a message part is a thinking/reasoning block.
 */
function isThinkingPart(part) {
    if (!part || typeof part !== "object") return false;
    return (
        part.thought === true ||
        part.type === "thinking" ||
        part.type === "redacted_thinking"
    );
}

/**
 * Checks if a message part is a function response (tool result).
 */
function isFunctionResponsePart(part) {
    return part && typeof part === "object" && "functionResponse" in part;
}

/**
 * Checks if a message part is a function call.
 */
function isFunctionCallPart(part) {
    return part && typeof part === "object" && "functionCall" in part;
}

/**
 * Checks if a message is a tool result container (user role with functionResponse).
 */
function isToolResultMessage(msg) {
    if (!msg || msg.role !== "user") return false;
    const parts = msg.parts || [];
    return parts.some(isFunctionResponsePart);
}

/**
 * Checks if a message contains thinking/reasoning content.
 */
function messageHasThinking(msg) {
    if (!msg || typeof msg !== "object") return false;

    // Gemini format: parts array
    if (Array.isArray(msg.parts)) {
        return msg.parts.some(isThinkingPart);
    }

    return false;
}

/**
 * Checks if a message contains tool calls.
 */
function messageHasToolCalls(msg) {
    if (!msg || typeof msg !== "object") return false;

    // Gemini format: parts array with functionCall
    if (Array.isArray(msg.parts)) {
        return msg.parts.some(isFunctionCallPart);
    }

    return false;
}

// ============================================================================
// CONVERSATION STATE ANALYSIS
// ============================================================================

/**
 * Analyzes conversation state to detect tool use loops and thinking mode issues.
 *
 * Key insight: A "turn" can span multiple assistant messages in a tool-use loop.
 * We need to find the TURN START (first assistant message after last real user message)
 * and check if THAT message had thinking, not just the last assistant message.
 */
export function analyzeConversationState(contents) {
    const state = {
        inToolLoop: false,
        turnStartIdx: -1,
        turnHasThinking: false,
        lastModelIdx: -1,
        lastModelHasThinking: false,
        lastModelHasToolCalls: false,
    };

    if (!Array.isArray(contents) || contents.length === 0) {
        return state;
    }

    // First pass: Find the last "real" user message (not a tool result)
    let lastRealUserIdx = -1;
    for (let i = 0; i < contents.length; i++) {
        const msg = contents[i];
        if (msg?.role === "user" && !isToolResultMessage(msg)) {
            lastRealUserIdx = i;
        }
    }

    // Second pass: Analyze conversation and find turn boundaries
    for (let i = 0; i < contents.length; i++) {
        const msg = contents[i];
        const role = msg?.role;

        if (role === "model") {
            const hasThinking = messageHasThinking(msg);
            const hasToolCalls = messageHasToolCalls(msg);

            // Track if this is the turn start
            if (i > lastRealUserIdx && state.turnStartIdx === -1) {
                state.turnStartIdx = i;
                state.turnHasThinking = hasThinking;
            }

            state.lastModelIdx = i;
            state.lastModelHasToolCalls = hasToolCalls;
            state.lastModelHasThinking = hasThinking;
        }
    }

    // Determine if we're in a tool loop
    // We're in a tool loop if the conversation ends with a tool result
    if (contents.length > 0) {
        const lastMsg = contents[contents.length - 1];
        if (lastMsg?.role === "user" && isToolResultMessage(lastMsg)) {
            state.inToolLoop = true;
        }
    }

    return state;
}

// ============================================================================
// RECOVERY FUNCTIONS
// ============================================================================

/**
 * Strips all thinking blocks from messages.
 * Used before injecting synthetic messages to avoid invalid thinking patterns.
 */
function stripAllThinkingBlocks(contents) {
    return contents.map((content) => {
        if (!content || typeof content !== "object") return content;

        // Handle Gemini-style parts
        if (Array.isArray(content.parts)) {
            const filteredParts = content.parts.filter(
                (part) => !isThinkingPart(part),
            );
            // Keep at least one part to avoid empty messages
            if (filteredParts.length === 0 && content.parts.length > 0) {
                return content;
            }
            return { ...content, parts: filteredParts };
        }

        return content;
    });
}

/**
 * Counts tool results at the end of the conversation.
 */
function countTrailingToolResults(contents) {
    let count = 0;

    for (let i = contents.length - 1; i >= 0; i--) {
        const msg = contents[i];

        if (msg?.role === "user") {
            const parts = msg.parts || [];
            const functionResponses = parts.filter(isFunctionResponsePart);

            if (functionResponses.length > 0) {
                count += functionResponses.length;
            } else {
                break; // Real user message, stop counting
            }
        } else if (msg?.role === "model") {
            break; // Stop at the model that made the tool calls
        }
    }

    return count;
}

/**
 * Closes an incomplete tool loop by injecting synthetic messages to start a new turn.
 *
 * This is the "let it crash and start again" recovery mechanism.
 *
 * When we detect:
 * - We're in a tool loop (conversation ends with functionResponse)
 * - The tool call was made WITHOUT thinking (thinking was stripped/corrupted)
 * - We NOW want to enable thinking
 *
 * Instead of trying to fix the corrupted state, we:
 * 1. Strip ALL thinking blocks (removes any corrupted ones)
 * 2. Add synthetic MODEL message to complete the non-thinking turn
 * 3. Add synthetic USER message to start a NEW turn
 *
 * This allows the model to generate fresh thinking for the new turn.
 */
export function closeToolLoopForThinking(contents) {
    // Strip any old/corrupted thinking first
    const strippedContents = stripAllThinkingBlocks(contents);

    // Count tool results from the end of the conversation
    const toolResultCount = countTrailingToolResults(strippedContents);

    // Build synthetic model message content based on tool count
    let syntheticModelContent;
    if (toolResultCount === 0) {
        syntheticModelContent = "[Processing previous context.]";
    } else if (toolResultCount === 1) {
        syntheticModelContent = "[Tool execution completed.]";
    } else {
        syntheticModelContent = `[${toolResultCount} tool executions completed.]`;
    }

    // Step 1: Inject synthetic MODEL message to complete the non-thinking turn
    const syntheticModel = {
        role: "model",
        parts: [{ text: syntheticModelContent }],
    };

    // Step 2: Inject synthetic USER message to start a NEW turn
    const syntheticUser = {
        role: "user",
        parts: [{ text: "[Continue]" }],
    };

    return [...strippedContents, syntheticModel, syntheticUser];
}

/**
 * Checks if conversation state requires tool loop closure for thinking recovery.
 *
 * Returns true if:
 * - We're in a tool loop (state.inToolLoop)
 * - The turn didn't start with thinking (state.turnHasThinking === false)
 *
 * This is the trigger for the "let it crash and start again" recovery.
 */
export function needsThinkingRecovery(state) {
    return state.inToolLoop && !state.turnHasThinking;
}
```

---

### Задача 4.2: Создать error-handler.js

**Файл**: `E:\1C\AIClient-2-API\src\gemini\error-handler.js`

```javascript
/**
 * Error handling utilities for Antigravity API
 */

/**
 * Error types for recovery
 */
export const ERROR_TYPES = {
    THINKING_BLOCK_ORDER: 'thinking_block_order',
    TOOL_RESULT_MISSING: 'tool_result_missing',
    THINKING_DISABLED_VIOLATION: 'thinking_disabled_violation',
};

/**
 * Extract error message from error object
 */
function getErrorMessage(error) {
    if (!error) return "";
    if (typeof error === "string") return error.toLowerCase();

    const errorObj = error;
    const paths = [
        errorObj.data,
        errorObj.error,
        errorObj,
        (errorObj.data)?.error,
    ];

    for (const obj of paths) {
        if (obj && typeof obj === "object") {
            const msg = obj.message;
            if (typeof msg === "string" && msg.length > 0) {
                return msg.toLowerCase();
            }
        }
    }

    try {
        return JSON.stringify(error).toLowerCase();
    } catch {
        return "";
    }
}

/**
 * Detect the type of recoverable error from an error object.
 */
export function detectErrorType(error) {
    const message = getErrorMessage(error);

    // tool_result_missing: Happens when ESC is pressed during tool execution
    if (message.includes("tool_use") && message.includes("tool_result")) {
        return ERROR_TYPES.TOOL_RESULT_MISSING;
    }

    // thinking_block_order: Happens when thinking blocks are corrupted
    if (
        message.includes("thinking") &&
        (message.includes("first block") ||
          message.includes("must start with") ||
          message.includes("preceding") ||
          (message.includes("expected") && message.includes("found")))
    ) {
        return ERROR_TYPES.THINKING_BLOCK_ORDER;
    }

    // thinking_disabled_violation: Thinking in non-thinking model
    if (message.includes("thinking is disabled") && message.includes("cannot contain")) {
        return ERROR_TYPES.THINKING_DISABLED_VIOLATION;
    }

    return null;
}

/**
 * Check if an error is recoverable.
 */
export function isRecoverableError(error) {
    return detectErrorType(error) !== null;
}

/**
 * Get user-friendly message for error type
 */
export function getRecoveryMessage(errorType) {
    const messages = {
        [ERROR_TYPES.THINKING_BLOCK_ORDER]: "Recovering thinking block order...",
        [ERROR_TYPES.TOOL_RESULT_MISSING]: "Injecting cancelled tool results...",
        [ERROR_TYPES.THINKING_DISABLED_VIOLATION]: "Stripping thinking blocks...",
    };
    return messages[errorType] || "Attempting to recover...";
}
```

---

### Задача 4.3: Интегрировать thinking recovery в antigravity-core.js

**Файл**: `E:\1C\AIClient-2-API\src\gemini\antigravity-core.js`

#### 4.3.1 Добавить импорт

После существующих импортов добавить:

```javascript
import * as ThinkingRecovery from './thinking-recovery.js';
import * as ErrorHandler from './error-handler.js';
```

#### 4.3.2 Добавить логирование recovery

Внутри метода `async initialize()` добавить:

```javascript
// ВНУТРИ async initialize(), ПОСЛЕ инициализации signatureCache:

// NEW: Thinking recovery
console.log('[Antigravity] Thinking recovery: ' + (this.thinkingConfig.session_recovery ? 'ENABLED' : 'DISABLED'));
```

#### 4.3.3 Добавить проверку перед отправкой запроса

Внутри `geminiToAntigravity` функции (примерно строка 109) добавить ПОСЛЕ обработки thinkingConfig:

```javascript
// ВНУТРИ функции geminiToAntigravity, ПОСЛЕ обработки thinkingConfig:

// Apply thinking recovery if enabled
if (this.thinkingConfig.session_recovery && template.request.contents) {
    const state = ThinkingRecovery.analyzeConversationState(template.request.contents);

    if (ThinkingRecovery.needsThinkingRecovery(state)) {
        console.log('[Antigravity] Detected thinking recovery needed, applying fix...');

        // Apply recovery
        template.request.contents = ThinkingRecovery.closeToolLoopForThinking(template.request.contents);

        console.log('[Antigravity] Applied thinking recovery, conversation restored');
    }
}
```

#### 4.3.4 Обновить config для session_recovery

**Файл**: `E:\1C\AIClient-2-API\src\gemini\config.js`

Добавить в DEFAULT_CONFIG:

```javascript
export const DEFAULT_CONFIG = {
    // ... existing config ...

    // Session Recovery
    session_recovery: true,
    auto_resume: true,
    resume_text: "continue",
};
```

---

### Задача 4.4: Создать тесты для thinking recovery

**Файл**: `E:\1C\AIClient-2-API\src\gemini/tests/thinking-recovery.test.js`

```javascript
import { describe, test, expect } from '@jest/globals';
import { analyzeConversationState, needsThinkingRecovery, closeToolLoopForThinking } from '../thinking-recovery.js';

describe('Thinking Recovery', () => {
    describe('analyzeConversationState', () => {
        test('should detect tool loop', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Response' }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(true);
        });

        test('should detect thinking blocks', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ type: 'thinking', text: 'Thinking...' }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.turnHasThinking).toBe(true);
        });

        test('should handle empty contents', () => {
            const state = analyzeConversationState([]);

            expect(state.inToolLoop).toBe(false);
            expect(state.turnHasThinking).toBe(false);
        });
    });

    describe('needsThinkingRecovery', () => {
        test('should return true when in tool loop without thinking', () => {
            const state = {
                inToolLoop: true,
                turnHasThinking: false,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(true);
        });

        test('should return false when thinking is present', () => {
            const state = {
                inToolLoop: true,
                turnHasThinking: true,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(false);
        });

        test('should return false when not in tool loop', () => {
            const state = {
                inToolLoop: false,
                turnHasThinking: false,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(false);
        });
    });

    describe('closeToolLoopForThinking', () => {
        test('should inject synthetic messages', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = closeToolLoopForThinking(contents);

            expect(result.length).toBe(contents.length + 2);
            expect(result[result.length - 2].role).toBe('model');
            expect(result[result.length - 1].role).toBe('user');
        });

        test('should strip thinking blocks', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [
                    { type: 'thinking', text: 'Thinking...' },
                    { functionCall: { name: 'tool1' } }
                ]},
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = closeToolLoopForThinking(contents);

            // Check thinking blocks were removed from original messages
            const modelMsg = result.find(m => m.role === 'model' && !m.parts.some(p => p.text === '[Tool execution completed.]'));
            expect(modelMsg).toBeDefined();
            expect(modelMsg.parts.some(p => p.type === 'thinking')).toBe(false);
        });
    });
});
```

---

## Тестирование Phase 4

### Тест 1: Компиляция

```bash
cd E:\1C\AIClient-2-API
node -c src/gemini/thinking-recovery.js
node -c src/gemini/error-handler.js
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
- `[Antigravity] Thinking recovery: ENABLED`

---

### Тест 3: Unit тесты

```bash
cd E:\1C\AIClient-2-API
npm test -- src/gemini/tests/thinking-recovery.test.js
```

**Ожидание**: Все тесты проходят.

---

### Тест 4: Ручное тестирование recovery

Создать сценарий, где нужно recovery:

```bash
# Отправить запрос с tool loop без thinking
curl -X POST http://localhost:3000/v1beta/models/claude-opus-4-5-thinking:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "contents": [
        {"role": "user", "parts": [{"text": "Hello"}]},
        {"role": "model", "parts": [{"functionCall": {"name": "get_weather", "args": {}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "get_weather", "response": {"temp": 20}}}]}
      ]
    }
  }'
```

**Проверка логов**:
- `[Antigravity] Detected thinking recovery needed, applying fix...`
- `[Antigravity] Applied thinking recovery, conversation restored`

---

## Критерии успеха Phase 4

- ✅ `thinking-recovery.js` создан
- ✅ `error-handler.js` создан
- ✅ Recovery интегрирован в `antigravity-core.js`
- ✅ Unit тесты проходят
- ✅ Логи показывают выполнение recovery
- ✅ Recovery применяется автоматически при необходимости

---

## Следующий шаг

Если Phase 4 успешно протестирован - переходите к `PHASE_5.md`

---

## Отладка

### Проблема: Recovery не применяется

**Проверка**:
1. Убедитесь, что `session_recovery: true` в config
2. Проверьте логи на `[Antigravity] Detected thinking recovery needed`
3. Проверьте, что `analyzeConversationState` правильно анализирует состояние

### Проблема: Recovery ломает conversation

**Проверка**:
1. Проверьте synthetic сообщения - они должны быть корректными
2. Убедитесь, что thinking блоки корректно удаляются

---

## Rollback

Если что-то пошло не так - восстановите изменения:

```bash
git checkout src/gemini/antigravity-core.js
git checkout src/gemini/config.js
rm src/gemini/thinking-recovery.js
rm src/gemini/error-handler.js
rm src/gemini/tests/thinking-recovery.test.js
```

---

## Улучшения (опционально)

- [ ] Добавить recovery для `tool_result_missing` ошибок
- [ ] Добавить recovery для `thinking_disabled_violation` ошибок
- [ ] Добавить логирование когда recovery применяется
- [ ] Добавить метрики recovery success rate
