// Utility functions

/**
 * Format uptime
 * @param {number} seconds - Seconds
 * @returns {string} Formatted time string
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

/**
 * HTML escape
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show toast message
 * @param {string} message - Toast message
 * @param {string} type - Message type (info, success, error)
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div>${escapeHtml(message)}</div>
    `;

    // Get toast container
    const toastContainer = document.getElementById('toastContainer') || document.querySelector('.toast-container');
    if (toastContainer) {
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

/**
 * Get field display label
 * @param {string} key - Field key
 * @returns {string} Display label
 */
function getFieldLabel(key) {
    const labelMap = {
        'checkModelName': 'Check model name (optional)',
        'checkHealth': 'Health check',
        'OPENAI_API_KEY': 'OpenAI API Key',
        'OPENAI_BASE_URL': 'OpenAI Base URL',
        'CLAUDE_API_KEY': 'Claude API Key',
        'CLAUDE_BASE_URL': 'Claude Base URL',
        'PROJECT_ID': 'Project ID',
        'GEMINI_OAUTH_CREDS_FILE_PATH': 'OAuth credentials file path',
        'KIRO_OAUTH_CREDS_FILE_PATH': 'OAuth credentials file path',
        'QWEN_OAUTH_CREDS_FILE_PATH': 'OAuth credentials file path'
    };
    
    return labelMap[key] || key;
}

/**
 * Get field configuration for provider type
 * @param {string} providerType - Provider type
 * @returns {Array} Field configuration array
 */
function getProviderTypeFields(providerType) {
    const fieldConfigs = {
        'openai-custom': [
            {
                id: 'OpenaiApiKey',
                label: 'OpenAI API Key',
                type: 'password',
                placeholder: 'sk-...'
            },
            {
                id: 'OpenaiBaseUrl',
                label: 'OpenAI Base URL',
                type: 'text',
                value: 'https://api.openai.com/v1'
            }
        ],
        'openaiResponses-custom': [
            {
                id: 'OpenaiApiKey',
                label: 'OpenAI API Key',
                type: 'password',
                placeholder: 'sk-...'
            },
            {
                id: 'OpenaiBaseUrl',
                label: 'OpenAI Base URL',
                type: 'text',
                value: 'https://api.openai.com/v1'
            }
        ],
        'claude-custom': [
            {
                id: 'ClaudeApiKey',
                label: 'Claude API Key',
                type: 'password',
                placeholder: 'sk-ant-...'
            },
            {
                id: 'ClaudeBaseUrl',
                label: 'Claude Base URL',
                type: 'text',
                value: 'https://api.anthropic.com'
            }
        ],
        'gemini-cli-oauth': [
            {
                id: 'ProjectId',
                label: 'Project ID',
                type: 'text',
                placeholder: 'Google Cloud Project ID'
            },
            {
                id: 'GeminiOauthCredsFilePath',
                label: 'OAuth credentials file path',
                type: 'text',
                placeholder: 'e.g. ~/.gemini/oauth_creds.json'
            }
        ],
        'claude-kiro-oauth': [
            {
                id: 'KiroOauthCredsFilePath',
                label: 'OAuth credentials file path',
                type: 'text',
                placeholder: 'e.g. ~/.aws/sso/cache/kiro-auth-token.json'
            }
        ],
        'openai-qwen-oauth': [
            {
                id: 'QwenOauthCredsFilePath',
                label: 'OAuth credentials file path',
                type: 'text',
                placeholder: 'e.g. ~/.qwen/oauth_creds.json'
            }
        ],
        'gemini-antigravity': [
            {
                id: 'ProjectId',
                label: 'Project ID (optional)',
                type: 'text',
                placeholder: 'Google Cloud Project ID (leave empty to auto-discover)'
            },
            {
                id: 'AntigravityOauthCredsFilePath',
                label: 'OAuth credentials file path',
                type: 'text',
                placeholder: 'e.g. ~/.antigravity/oauth_creds.json'
            }
        ]
    };
    
    return fieldConfigs[providerType] || [];
}

/**
 * Debug function: Get current provider statistics
 * @param {Object} providerStats - Provider statistics object
 * @returns {Object} Extended statistics
 */
function getProviderStats(providerStats) {
    return {
        ...providerStats,
        // Add calculated statistics
        successRate: providerStats.totalRequests > 0 ? 
            ((providerStats.totalRequests - providerStats.totalErrors) / providerStats.totalRequests * 100).toFixed(2) + '%' : '0%',
        avgUsagePerProvider: providerStats.activeProviders > 0 ? 
            Math.round(providerStats.totalRequests / providerStats.activeProviders) : 0,
        healthRatio: providerStats.totalAccounts > 0 ? 
            (providerStats.healthyProviders / providerStats.totalAccounts * 100).toFixed(2) + '%' : '0%'
    };
}

// Export all utility functions
export {
    formatUptime,
    escapeHtml,
    showToast,
    getFieldLabel,
    getProviderTypeFields,
    getProviderStats
};