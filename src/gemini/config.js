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

    // Session Recovery (Phase 4)
    session_recovery: true,
    auto_resume: true,
    resume_text: "continue",
};

/**
 * Load configuration from project config or return defaults
 */
export function getConfig() {
    // TODO: Load from config.json if exists
    return DEFAULT_CONFIG;
}
