# Фаза 11: Защита от галлюцинаций инструментов для Claude

## Цель
Внедрить механизм защиты («hardening»), который используется в референсном проекте `opencode-antigravity-auth`, чтобы предотвратить галлюцинации параметров инструментов у моделей семейства Claude (Sonnet, Opus). Модели Claude склонны выдумывать параметры инструментов, если им не дана строгая системная инструкция.

## Контекст
В проекте `opencode-antigravity-auth` используется специальная системная инструкция `CLAUDE_TOOL_SYSTEM_INSTRUCTION`, которая добавляется к запросу, если:
1.  Модель определена как Claude (`isClaudeModel`).
2.  В запросе есть инструменты (`tools`).

Текущая реализация `AIClient-2-API` такой защиты не имеет, что может приводить к ошибкам при работе с Claude.

## План реализации

### 1. Добавить константу инструкции
В файле `src/gemini/antigravity-core.js` добавить константу:

```javascript
// Tool Hallucination Prevention Instruction (for Claude models)
const CLAUDE_TOOL_SYSTEM_INSTRUCTION = \`CRITICAL TOOL USAGE INSTRUCTIONS:
You are operating in a custom environment where tool definitions differ from your training data.
You MUST follow these rules strictly:

1. DO NOT use your internal training data to guess tool parameters
2. ONLY use the exact parameter structure defined in the tool schema
3. Parameter names in schemas are EXACT - do not substitute with similar names from your training
4. Array parameters have specific item types - check the schema's 'items' field for the exact structure
5. When you see "STRICT PARAMETERS" in a tool description, those type definitions override any assumptions
6. Tool use in agentic workflows is REQUIRED - you must call tools with the exact parameters specified

If you are unsure about a tool's parameters, YOU MUST read the schema definition carefully.\`;
```

### 2. Обновить логику `geminiToAntigravity`
В функции `geminiToAntigravity` (файл `src/gemini/antigravity-core.js`) найти блок обработки инструментов для Claude и заменить проверку модели на более универсальную, а также добавить инъекцию инструкции.

**Было:**
```javascript
// Handle tool declarations for Claude Sonnet models
if (modelName.startsWith('claude-sonnet-')) {
    if (template.request.tools && Array.isArray(template.request.tools)) {
        // ... (исправление схем)
    }
}
```

**Станет:**
```javascript
// Handle tool declarations for Claude models (Sonnet, Opus, etc.)
if (modelName.toLowerCase().includes('claude')) {
    if (template.request.tools && Array.isArray(template.request.tools) && template.request.tools.length > 0) {
        
        // 1. Fix parameter schemas (existing logic)
        template.request.tools.forEach(tool => {
            // ... (существующий код исправления схем) ...
        });

        // 2. Inject Tool Hallucination Prevention Instruction
        const hint = CLAUDE_TOOL_SYSTEM_INSTRUCTION;
        
        // Ensure systemInstruction object exists
        if (!template.request.systemInstruction) {
            template.request.systemInstruction = { parts: [] };
        }
        
        // Normalize systemInstruction to object if it's just a string
        if (typeof template.request.systemInstruction === 'string') {
            template.request.systemInstruction = { parts: [{ text: template.request.systemInstruction }] };
        }

        // Ensure parts array exists
        if (!template.request.systemInstruction.parts) {
            template.request.systemInstruction.parts = [];
        }

        const parts = template.request.systemInstruction.parts;
        let appended = false;

        // Try to append to the last text part
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i] && typeof parts[i].text === 'string') {
                parts[i].text = `${parts[i].text}\n\n${hint}`;
                appended = true;
                break;
            }
        }

        // If no text part found, add a new one
        if (!appended) {
            parts.push({ text: hint });
        }
    }
}
```

## Проверка (Verification)
Создать тест `src/gemini/tests/claude-tool-safety.test.js`, который проверяет, что инструкция добавляется для Claude с инструментами, но не добавляется для Gemini или Claude без инструментов.

```javascript
import { geminiToAntigravity } from '../antigravity-core.js'; // Не забудьте экспортировать функцию!

describe('Claude Tool Safety Injection', () => {
    // ... тест кейсы ...
});
```
