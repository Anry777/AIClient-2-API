# Antigravity Configuration

Этот файл описывает все параметры конфигурации для Antigravity thinking features.

## Конфигурационные файлы

Конфигурация загружается в следующем порядке приоритетности (выше = важнее):
1. Переменные окружения (`ANTIGRAVITY_*`)
2. User config: `~/.config/antigravity/config.json`
3. Project config: `.antigravity/config.json`
4. Значения по умолчанию

## Пример файла конфигурации

Скопируйте `config.example.json` в `config.json` и измените нужные параметры:

```bash
cp config.example.json config.json
```

---

## Параметры конфигурации

### Основные настройки

#### `quiet_mode` (false)
- **Тип:** boolean
- **По умолчанию:** false
- **Описание:** Режим тишины. При `true` отключает часть логов для уменьшения вывода в консоль. Полезно для production-сред.

#### `debug` (false)
- **Тип:** boolean
- **По умолчанию:** false
- **Описание:** Включение детального отладочного логирования. При `true` выводит подробную информацию о работе thinking-фич, warmup, recovery и т.д. Полезно для диагностики проблем.

#### `log_dir` (null)
- **Тип:** string | null
- **По умолчанию:** null
- **Описание:** Директория для записи логов в файлы. При `null` логи выводятся только в консоль. Укажите путь (например: `/var/log/antigravity` или `./logs`), чтобы сохранять логи в файлы.

---

### Thinking Warmup (Phase 1)

#### `enable_thinking_warmup` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Включает предварительный "разогрев" для thinking моделей. Перед основным запросом отправляется короткий тестовый запрос для получения подписи thinking блоков. Это улучшает стабильность multi-turn диалогов с thinking моделями.

#### `thinking_warmup_budget` (16000)
- **Тип:** number
- **По умолчанию:** 16000
- **Минимум:** 1
- **Описание:** Максимальное количество токенов для thinking в warmup запросе. Определяет, сколько токенов модель может потратить на размышления во время warmup.

---

### Signature Caching (Phase 2)

#### `enable_signature_cache` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Включает кеширование подписей thinking блоков. Подписи сохраняются в памяти и на диске, что позволяет:
- Повторно использовать подписи между запросами
- Сократить количество warmup запросов
- Улучшить производительность multi-turn диалогов

#### `signature_cache_memory_ttl_seconds` (3600)
- **Тип:** number
- **По умолчанию:** 3600 (1 час)
- **Минимум:** 60
- **Описание:** Время хранения подписей в памяти (в секундах). После истечения TTL подпись удаляется из RAM кеша.

#### `signature_cache_disk_ttl_seconds` (172800)
- **Тип:** number
- **По умолчанию:** 172800 (48 часов)
- **Минимум:** 3600
- **Описание:** Время хранения подписей на диске (в секундах). Подписи сохраняются в файл `data/signature-cache/cache.json` и могут быть перезагружены после рестарта сервиса.

#### `signature_cache_write_interval_seconds` (60)
- **Тип:** number
- **По умолчанию:** 60
- **Минимум:** 10
- **Описание:** Интервал записи кеша на диск (в секундах). Кеш периодически сбрасывается на диск, чтобы не терять данные при внезапном завершении работы сервиса.

---

### Stable Session ID (Phase 3)

#### `use_stable_session_id` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Использовать стабильный session ID для всех запросов в процессе. При `true` генерируется один session ID при запуске и используется для всех запросов. Это критически важно для:
- Корректной работы signature cache
- Multi-turn диалогов с thinking моделями
- Прямой ссылки на warmup запросы

**Важно:** Не отключайте, если используете thinking модели или multi-turn диалоги.

---

### Session Recovery (Phase 4)

#### `session_recovery` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Автоматическое восстановление сессий при ошибках thinking блоков. Если модель возвращает ошибку `thinking_block_order` или аналогичную, система автоматически пытается восстановить контекст диалога.

#### `auto_resume` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Автоматическое продолжение прерванных диалогов. При `true` и при обнаружении необходимости recovery, система автоматически добавляет resume запрос для продолжения диалога.

#### `resume_text` ("continue")
- **Тип:** string
- **По умолчанию:** "continue"
- **Описание:** Текст для автоматического продолжения диалога при recovery. Этот текст добавляется в сообщение для восстановления прерванного thinking процесса.

---

### Tool ID Recovery (Phase 5)

#### `tool_id_recovery` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Восстановление потерянных tool ID в диалоге. Иногда после контекстной компакции модель может потерять связь между `functionCall` и `functionResponse`. При `true` система автоматически создает placeholder tool calls для orphan tool responses.

**Пример проблемы:**
```
User: Calculate 2+2
Model: functionCall(calculate, {a: 2, b: 2})  ← ID потерян при компакции
User: functionResponse({result: 4})  ← orphan response
```

**Решение с recovery:**
```
User: Calculate 2+2
Model: functionCall(calculate, {a: 2, b: 2})  ← Placeholder создан автоматически
User: functionResponse({result: 4})  ← Связь восстановлена
```

---

### Tool Hallucination Prevention

#### `claude_tool_hardening` (true)
- **Тип:** boolean
- **По умолчанию:** true
- **Описание:** Усиление защиты от галлюцинаций для Claude tools. Включает дополнительные проверки для tool вызовов в моделях Claude (Sonnet, Opus, Thinking).

---

### Empty Response Retry (Phase 6)

#### `empty_response_max_attempts` (4)
- **Тип:** number
- **По умолчанию:** 4
- **Минимум:** 1
- **Максимум:** 10
- **Описание:** Максимальное количество попыток при получении пустого ответа от API. Иногда API может вернуть пустой ответ без ошибок - система автоматически повторит запрос.

#### `empty_response_retry_delay_ms` (2000)
- **Тип:** number
- **По умолчанию:** 2000 (2 секунды)
- **Минимум:** 500
- **Максимум:** 10000
- **Описание:** Задержка между попытками при пустом ответе (в миллисекундах). Время ожидания перед повторным запросом.

---

### Recoverable Error Retries (Phase 6)

#### `recoverable_error_max_retries` (3)
- **Тип:** number
- **По умолчанию:** 3
- **Минимум:** 1
- **Максимум:** 10
- **Описание:** Максимальное количество повторных попыток для восстанавливаемых ошибок. Включает такие ошибки как:
- `thinking_block_order` - неправильный порядок thinking блоков
- `thinking_disabled_violation` - нарушение режима thinking
- Другие 4xx ошибки, которые можно решить путем изменения запроса

---

## Переменные окружения

Все параметры также можно задать через переменные окружения с префиксом `ANTIGRAVITY_`:

```bash
export ANTIGRAVITY_DEBUG=true
export ANTIGRAVITY_ENABLE_THINKING_WARMUP=false
export ANTIGRAVITY_SIGNATURE_CACHE_MEMORY_TTL_SECONDS=7200
```

Имена переменных преобразуются из snake_case в UPPER_CASE.

---

## Примеры конфигураций

### Минималистичная конфигурация (все фичи включены)
```json
{
  "debug": false
}
```

### Отладочная конфигурация (подробные логи)
```json
{
  "debug": true,
  "log_dir": "./logs"
}
```

### Производительная конфигурация (максимум кеширования)
```json
{
  "enable_signature_cache": true,
  "signature_cache_memory_ttl_seconds": 7200,
  "signature_cache_disk_ttl_seconds": 604800,
  "signature_cache_write_interval_seconds": 120
}
```

### Отключение всех фич (базовый режим)
```json
{
  "enable_thinking_warmup": false,
  "enable_signature_cache": false,
  "session_recovery": false,
  "tool_id_recovery": false,
  "empty_response_max_attempts": 0,
  "recoverable_error_max_retries": 1
}
```

---

## Фазы реализации

- **Phase 1:** Thinking Warmup System
- **Phase 2:** Signature Caching System
- **Phase 3:** Stable Session ID
- **Phase 4:** Thinking Recovery
- **Phase 5:** Tool ID Recovery
- **Phase 6:** Enhanced Error Handling
- **Phase 7:** Configuration Schema

Подробная информация о реализации в `docs/implementation-plan/` директории.
