# AIClient-2-API Thinking Features Implementation Plan

## Обзор

Этот план описывает поэтапную реализацию продвинутых функций работы с думающими моделями из проекта opencode-antigravity-auth.

**Цель**: Включить полноценную поддержку thinking-режимов для Cloud Opus и других думающих моделей в Antigravity.

---

## Проблема

В текущей реализации `E:\1C\AIClient-2-API` думающие модели (Cloud Opus, Claude Opus 4.5 Thinking) не работают корректно:

1. **Отсутствие Thinking Warmup** - нет предварительного запроса для получения подписи thinking-блоков
2. **Нет Signature Caching** - подписи не кешируются, каждый запрос генерирует новый sessionId
3. **Простая обработка thinkingConfig** - нет поддержки tier-based thinking (low/medium/high)
4. **Отсутствие Thinking Recovery** - нет автоматического восстановления при ошибках думающих блоков
5. **Нет Tool ID Recovery** - orphan tool responses не восстанавливаются

---

## Фазы реализации

| Фаза | Название | Описание | Ориентировочное время |
|------|----------|-----------|---------------------|
| Phase 1 | Thinking Warmup System | Предварительный запрос для получения подписи thinking-блоков и их кеширование | 2-3 часа |
| Phase 2 | Signature Caching System | Полноценная система кеширования подписей (память + диск) | 1-2 часа |
| Phase 3 | Stable Session ID | Использование стабильного sessionId для multi-turn conversations | 30 минут |
| Phase 4 | Thinking Recovery | Автоматическое восстановление при ошибках думающих блоков | 2-3 часа |
| Phase 5 | Tool ID Recovery | Сопоставление functionCall с functionResponse при context compaction | 2-3 часа |
| Phase 6 | Enhanced Error Handling | Расширенная обработка ошибок и retry логика | 1-2 часа |
| Phase 7 | Configuration Schema | Полная конфигурация всех фич через config.json | 1 час |
| Phase 8 | Testing & Validation | Unit тесты, integration тесты, ручное тестирование | 3-4 часа |

**Итого**: ~13-19 часов работы

---

## Порядок выполнения

1. Прочитайте `PHASE_1.md`
2. Выполните все шаги Phase 1
3. Протестируйте Phase 1
4. Если тесты прошли - переходите к `PHASE_2.md`
5. Повторяйте для всех фаз

---

## Файлы для выполнения

- `PHASE_1.md` - Thinking Warmup System
- `PHASE_2.md` - Signature Caching System (доработка Phase 1)
- `PHASE_3.md` - Stable Session ID
- `PHASE_4.md` - Thinking Recovery
- `PHASE_5.md` - Tool ID Recovery
- `PHASE_6.md` - Enhanced Error Handling
- `PHASE_7.md` - Configuration Schema
- `PHASE_8.md` - Testing & Validation

---

## Критерии успеха

### Минимум (MVP)
- ✅ Cloud Opus модели выдают thinking-блоки в ответах
- ✅ Multi-turn conversations работают корректно
- ✅ Нет ошибок `thinking_block_order` и подобных

### Полноценная реализация
- ✅ Все фазы выполнены
- ✅ Unit тесты проходят
- ✅ Integration тесты проходят
- ✅ Ручное тестирование подтверждает работоспособность

---

## Обратная связь

Если возникают вопросы или проблемы - обращайтесь к детальным планам в файлах PHASE_*.md

---

## Структура файлов после реализации

```
E:\1C\AIClient-2-API\
├── PHASE_1.md
├── PHASE_2.md
├── PHASE_3.md
├── PHASE_4.md
├── PHASE_5.md
├── PHASE_6.md
├── PHASE_7.md
├── PHASE_8.md
├── IMPLEMENTATION_PLAN.md (этот файл)
└── src/gemini/
    ├── antigravity-core.js (модифицирован)
    ├── signature-cache.js (новый)
    ├── thinking-utils.js (новый)
    ├── config.js (новый)
    ├── thinking-recovery.js (новый)
    ├── tool-recovery.js (новый)
    ├── error-handler.js (новый)
    └── tests/
        ├── signature-cache.test.js
        ├── thinking-recovery.test.js
        ├── tool-recovery.test.js
        └── integration.test.js
```

---

## Начало работы

Прочитайте `PHASE_1.md` и начинайте с первой фазы!
