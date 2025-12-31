import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Config file locations (in priority order, highest wins)
 */
const CONFIG_PATHS = {
    project: path.join(process.cwd(), '.antigravity', 'config.json'),
    user: path.join(os.homedir(), '.config', 'antigravity', 'config.json'),
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    // General Settings
    quiet_mode: false,
    debug: false,
    log_dir: null,

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

    // Session Recovery
    session_recovery: true,
    auto_resume: true,
    resume_text: "continue",

    // Tool ID Recovery
    tool_id_recovery: true,

    // Tool Hallucination Prevention
    claude_tool_hardening: true,

    // Empty Response Retry
    empty_response_max_attempts: 4,
    empty_response_retry_delay_ms: 2000,

    // Recoverable Error Retries
    recoverable_error_max_retries: 3,
};

/**
 * Load configuration from file
 */
async function loadConfigFromFile(configPath) {
    try {
        const data = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(data);
        console.log(`[Config] Loaded configuration from ${configPath}`);
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        console.error(`[Config] Failed to load configuration from ${configPath}:`, error.message);
        return null;
    }
}

/**
 * Load configuration from environment variables
 */
function loadConfigFromEnv() {
    const envConfig = {};

    const envMapping = {
        'ANTIGRAVITY_QUIET_MODE': 'quiet_mode',
        'ANTIGRAVITY_DEBUG': 'debug',
        'ANTIGRAVITY_LOG_DIR': 'log_dir',
        'ANTIGRAVITY_ENABLE_THINKING_WARMUP': 'enable_thinking_warmup',
        'ANTIGRAVITY_THINKING_WARMUP_BUDGET': 'thinking_warmup_budget',
        'ANTIGRAVITY_ENABLE_SIGNATURE_CACHE': 'enable_signature_cache',
        'ANTIGRAVITY_SIGNATURE_CACHE_MEMORY_TTL_SECONDS': 'signature_cache_memory_ttl_seconds',
        'ANTIGRAVITY_SIGNATURE_CACHE_DISK_TTL_SECONDS': 'signature_cache_disk_ttl_seconds',
        'ANTIGRAVITY_SIGNATURE_CACHE_WRITE_INTERVAL_SECONDS': 'signature_cache_write_interval_seconds',
        'ANTIGRAVITY_USE_STABLE_SESSION_ID': 'use_stable_session_id',
        'ANTIGRAVITY_SESSION_RECOVERY': 'session_recovery',
        'ANTIGRAVITY_AUTO_RESUME': 'auto_resume',
        'ANTIGRAVITY_RESUME_TEXT': 'resume_text',
        'ANTIGRAVITY_TOOL_ID_RECOVERY': 'tool_id_recovery',
        'ANTIGRAVITY_CLAUDE_TOOL_HARDENING': 'claude_tool_hardening',
        'ANTIGRAVITY_EMPTY_RESPONSE_MAX_ATTEMPTS': 'empty_response_max_attempts',
        'ANTIGRAVITY_EMPTY_RESPONSE_RETRY_DELAY_MS': 'empty_response_retry_delay_ms',
        'ANTIGRAVITY_RECOVERABLE_ERROR_MAX_RETRIES': 'recoverable_error_max_retries',
    };

    for (const [envKey, configKey] of Object.entries(envMapping)) {
        const envValue = process.env[envKey];
        if (envValue !== undefined && envValue !== null && envValue !== '') {
            if (typeof DEFAULT_CONFIG[configKey] === 'boolean') {
                envConfig[configKey] = envValue === '1' || envValue === 'true' || envValue === 'yes';
            } else if (typeof DEFAULT_CONFIG[configKey] === 'number') {
                envConfig[configKey] = parseInt(envValue, 10);
            } else {
                envConfig[configKey] = envValue;
            }

            console.log(`[Config] Loaded from env: ${configKey} = ${envConfig[configKey]}`);
        }
    }

    return envConfig;
}

/**
 * Merge configurations with priority order
 * Priority: env > user config > project config > defaults
 */
function mergeConfigs(...configs) {
    const result = { ...DEFAULT_CONFIG };

    for (const config of configs) {
        if (!config) continue;

        for (const [key, value] of Object.entries(config)) {
            if (value !== undefined && value !== null) {
                result[key] = value;
            }
        }
    }

    return result;
}

/**
 * Load full configuration
 */
export async function loadConfig() {
    const projectConfig = await loadConfigFromFile(CONFIG_PATHS.project);
    const userConfig = await loadConfigFromFile(CONFIG_PATHS.user);
    const envConfig = loadConfigFromEnv();

    const finalConfig = mergeConfigs(envConfig, userConfig, projectConfig);

    console.log('[Config] Final configuration:', JSON.stringify(finalConfig, null, 2));

    return finalConfig;
}

/**
 * Save configuration to file
 */
export async function saveConfig(config, configType = 'project') {
    const configPath = CONFIG_PATHS[configType];
    if (!configPath) {
        throw new Error(`Invalid config type: ${configType}`);
    }

    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    console.log(`[Config] Saved configuration to ${configPath}`);
}

/**
 * Validate configuration
 */
export function validateConfig(config) {
    const errors = [];

    if (config.signature_cache_memory_ttl_seconds < 60) {
        errors.push('signature_cache_memory_ttl_seconds must be at least 60 seconds');
    }

    if (config.signature_cache_disk_ttl_seconds < 3600) {
        errors.push('signature_cache_disk_ttl_seconds must be at least 3600 seconds');
    }

    if (config.signature_cache_write_interval_seconds < 10) {
        errors.push('signature_cache_write_interval_seconds must be at least 10 seconds');
    }

    if (config.empty_response_max_attempts < 1 || config.empty_response_max_attempts > 10) {
        errors.push('empty_response_max_attempts must be between 1 and 10');
    }

    if (config.empty_response_retry_delay_ms < 500 || config.empty_response_retry_delay_ms > 10000) {
        errors.push('empty_response_retry_delay_ms must be between 500 and 10000');
    }

    if (config.recoverable_error_max_retries < 1 || config.recoverable_error_max_retries > 10) {
        errors.push('recoverable_error_max_retries must be between 1 and 10');
    }

    if (errors.length > 0) {
        console.error('[Config] Validation errors:', errors);
        return { valid: false, errors };
    }

    console.log('[Config] Configuration is valid');
    return { valid: true, errors: [] };
}
