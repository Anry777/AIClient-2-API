// Configuration management module

import { showToast, formatUptime } from './utils.js';
import { handleProviderChange, handleGeminiCredsTypeChange, handleKiroCredsTypeChange } from './event-handlers.js';
import { loadProviders } from './provider-manager.js';

/**
 * Load configuration
 */
async function loadConfiguration() {
    try {
        const data = await window.apiClient.get('/config');

        // Basic configuration
        const apiKeyEl = document.getElementById('apiKey');
        const hostEl = document.getElementById('host');
        const portEl = document.getElementById('port');
        const modelProviderEl = document.getElementById('modelProvider');
        const systemPromptEl = document.getElementById('systemPrompt');

        if (apiKeyEl) apiKeyEl.value = data.REQUIRED_API_KEY || '';
        if (hostEl) hostEl.value = data.HOST || '127.0.0.1';
        if (portEl) portEl.value = data.SERVER_PORT || 3000;
        if (modelProviderEl) modelProviderEl.value = data.MODEL_PROVIDER || 'gemini-cli-oauth';
        if (systemPromptEl) systemPromptEl.value = data.systemPrompt || '';
        
        // Gemini CLI OAuth
        const projectIdEl = document.getElementById('projectId');
        const geminiOauthCredsBase64El = document.getElementById('geminiOauthCredsBase64');
        const geminiOauthCredsFilePathEl = document.getElementById('geminiOauthCredsFilePath');
        
        if (projectIdEl) projectIdEl.value = data.PROJECT_ID || '';
        if (geminiOauthCredsBase64El) geminiOauthCredsBase64El.value = data.GEMINI_OAUTH_CREDS_BASE64 || '';
        if (geminiOauthCredsFilePathEl) geminiOauthCredsFilePathEl.value = data.GEMINI_OAUTH_CREDS_FILE_PATH || '';
        
        // OpenAI Custom
        const openaiApiKeyEl = document.getElementById('openaiApiKey');
        const openaiBaseUrlEl = document.getElementById('openaiBaseUrl');
        
        if (openaiApiKeyEl) openaiApiKeyEl.value = data.OPENAI_API_KEY || '';
        if (openaiBaseUrlEl) openaiBaseUrlEl.value = data.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        
        // Claude Custom
        const claudeApiKeyEl = document.getElementById('claudeApiKey');
        const claudeBaseUrlEl = document.getElementById('claudeBaseUrl');
        
        if (claudeApiKeyEl) claudeApiKeyEl.value = data.CLAUDE_API_KEY || '';
        if (claudeBaseUrlEl) claudeBaseUrlEl.value = data.CLAUDE_BASE_URL || 'https://api.anthropic.com';
        
        // Claude Kiro OAuth
        const kiroOauthCredsBase64El = document.getElementById('kiroOauthCredsBase64');
        const kiroOauthCredsFilePathEl = document.getElementById('kiroOauthCredsFilePath');
        
        if (kiroOauthCredsBase64El) kiroOauthCredsBase64El.value = data.KIRO_OAUTH_CREDS_BASE64 || '';
        if (kiroOauthCredsFilePathEl) kiroOauthCredsFilePathEl.value = data.KIRO_OAUTH_CREDS_FILE_PATH || '';
        
        // Qwen OAuth
        const qwenOauthCredsFilePathEl = document.getElementById('qwenOauthCredsFilePath');
        if (qwenOauthCredsFilePathEl) qwenOauthCredsFilePathEl.value = data.QWEN_OAUTH_CREDS_FILE_PATH || '';
        
        // OpenAI Responses
        const openaiResponsesApiKeyEl = document.getElementById('openaiResponsesApiKey');
        const openaiResponsesBaseUrlEl = document.getElementById('openaiResponsesBaseUrl');
        
        if (openaiResponsesApiKeyEl) openaiResponsesApiKeyEl.value = data.OPENAI_API_KEY || '';
        if (openaiResponsesBaseUrlEl) openaiResponsesBaseUrlEl.value = data.OPENAI_BASE_URL || 'https://api.openai.com/v1';

        // Advanced configuration parameters
        const systemPromptFilePathEl = document.getElementById('systemPromptFilePath');
        const systemPromptModeEl = document.getElementById('systemPromptMode');
        const promptLogBaseNameEl = document.getElementById('promptLogBaseName');
        const promptLogModeEl = document.getElementById('promptLogMode');
        const requestMaxRetriesEl = document.getElementById('requestMaxRetries');
        const requestBaseDelayEl = document.getElementById('requestBaseDelay');
        const cronNearMinutesEl = document.getElementById('cronNearMinutes');
        const cronRefreshTokenEl = document.getElementById('cronRefreshToken');
        const providerPoolsFilePathEl = document.getElementById('providerPoolsFilePath');
        const maxErrorCountEl = document.getElementById('maxErrorCount');

        if (systemPromptFilePathEl) systemPromptFilePathEl.value = data.SYSTEM_PROMPT_FILE_PATH || 'input_system_prompt.txt';
        if (systemPromptModeEl) systemPromptModeEl.value = data.SYSTEM_PROMPT_MODE || 'append';
        if (promptLogBaseNameEl) promptLogBaseNameEl.value = data.PROMPT_LOG_BASE_NAME || 'prompt_log';
        if (promptLogModeEl) promptLogModeEl.value = data.PROMPT_LOG_MODE || 'none';
        if (requestMaxRetriesEl) requestMaxRetriesEl.value = data.REQUEST_MAX_RETRIES || 3;
        if (requestBaseDelayEl) requestBaseDelayEl.value = data.REQUEST_BASE_DELAY || 1000;
        if (cronNearMinutesEl) cronNearMinutesEl.value = data.CRON_NEAR_MINUTES || 1;
        if (cronRefreshTokenEl) cronRefreshTokenEl.checked = data.CRON_REFRESH_TOKEN || false;
        if (providerPoolsFilePathEl) providerPoolsFilePathEl.value = data.PROVIDER_POOLS_FILE_PATH;
        if (maxErrorCountEl) maxErrorCountEl.value = data.MAX_ERROR_COUNT || 3;

        // Trigger provider config display
        handleProviderChange();
        
        // Set display based on Gemini credentials type
        const geminiCredsType = data.GEMINI_OAUTH_CREDS_BASE64 ? 'base64' : 'file';
        const geminiRadio = document.querySelector(`input[name="geminiCredsType"][value="${geminiCredsType}"]`);
        if (geminiRadio) {
            geminiRadio.checked = true;
            handleGeminiCredsTypeChange({ target: geminiRadio });
        }
        
        // Set display based on Kiro credentials type
        const kiroCredsType = data.KIRO_OAUTH_CREDS_BASE64 ? 'base64' : 'file';
        const kiroRadio = document.querySelector(`input[name="kiroCredsType"][value="${kiroCredsType}"]`);
        if (kiroRadio) {
            kiroRadio.checked = true;
            handleKiroCredsTypeChange({ target: kiroRadio });
        }
        
        // Check and set provider pools menu display status
        // const providerPoolsFilePath = data.PROVIDER_POOLS_FILE_PATH;
        // const providersMenuItem = document.querySelector('.nav-item[data-section="providers"]');
        // if (providerPoolsFilePath && providerPoolsFilePath.trim() !== '') {
        //     if (providersMenuItem) providersMenuItem.style.display = 'flex';
        // } else {
        //     if (providersMenuItem) providersMenuItem.style.display = 'none';
        // }
        
    } catch (error) {
        console.error('Failed to load configuration:', error);
    }
}

/**
 * Save configuration
 */
async function saveConfiguration() {
    const config = {
        REQUIRED_API_KEY: document.getElementById('apiKey')?.value || '',
        HOST: document.getElementById('host')?.value || '127.0.0.1',
        SERVER_PORT: parseInt(document.getElementById('port')?.value || 3000),
        MODEL_PROVIDER: document.getElementById('modelProvider')?.value || 'gemini-cli-oauth',
        systemPrompt: document.getElementById('systemPrompt')?.value || '',
    };

    // Get admin login password (if entered)
    const adminPassword = document.getElementById('adminPassword')?.value || '';

    // Save different configs based on provider
    const provider = document.getElementById('modelProvider')?.value;
    
    switch (provider) {
        case 'gemini-cli-oauth':
            config.PROJECT_ID = document.getElementById('projectId')?.value || '';
            const geminiCredsType = document.querySelector('input[name="geminiCredsType"]:checked')?.value;
            if (geminiCredsType === 'base64') {
                config.GEMINI_OAUTH_CREDS_BASE64 = document.getElementById('geminiOauthCredsBase64')?.value || '';
                config.GEMINI_OAUTH_CREDS_FILE_PATH = null;
            } else {
                config.GEMINI_OAUTH_CREDS_BASE64 = null;
                config.GEMINI_OAUTH_CREDS_FILE_PATH = document.getElementById('geminiOauthCredsFilePath')?.value || '';
            }
            break;
            
        case 'openai-custom':
            config.OPENAI_API_KEY = document.getElementById('openaiApiKey')?.value || '';
            config.OPENAI_BASE_URL = document.getElementById('openaiBaseUrl')?.value || '';
            break;
            
        case 'claude-custom':
            config.CLAUDE_API_KEY = document.getElementById('claudeApiKey')?.value || '';
            config.CLAUDE_BASE_URL = document.getElementById('claudeBaseUrl')?.value || '';
            break;
            
        case 'claude-kiro-oauth':
            const kiroCredsType = document.querySelector('input[name="kiroCredsType"]:checked')?.value;
            if (kiroCredsType === 'base64') {
                config.KIRO_OAUTH_CREDS_BASE64 = document.getElementById('kiroOauthCredsBase64')?.value || '';
                config.KIRO_OAUTH_CREDS_FILE_PATH = null;
            } else {
                config.KIRO_OAUTH_CREDS_BASE64 = null;
                config.KIRO_OAUTH_CREDS_FILE_PATH = document.getElementById('kiroOauthCredsFilePath')?.value || '';
            }
            break;
            
        case 'openai-qwen-oauth':
            config.QWEN_OAUTH_CREDS_FILE_PATH = document.getElementById('qwenOauthCredsFilePath')?.value || '';
            break;
            
        case 'openaiResponses-custom':
            config.OPENAI_API_KEY = document.getElementById('openaiResponsesApiKey')?.value || '';
            config.OPENAI_BASE_URL = document.getElementById('openaiResponsesBaseUrl')?.value || '';
            break;
    }

    // Save advanced configuration parameters
    config.SYSTEM_PROMPT_FILE_PATH = document.getElementById('systemPromptFilePath')?.value || 'input_system_prompt.txt';
    config.SYSTEM_PROMPT_MODE = document.getElementById('systemPromptMode')?.value || 'append';
    config.PROMPT_LOG_BASE_NAME = document.getElementById('promptLogBaseName')?.value || '';
    config.PROMPT_LOG_MODE = document.getElementById('promptLogMode')?.value || '';
    config.REQUEST_MAX_RETRIES = parseInt(document.getElementById('requestMaxRetries')?.value || 3);
    config.REQUEST_BASE_DELAY = parseInt(document.getElementById('requestBaseDelay')?.value || 1000);
    config.CRON_NEAR_MINUTES = parseInt(document.getElementById('cronNearMinutes')?.value || 1);
    config.CRON_REFRESH_TOKEN = document.getElementById('cronRefreshToken')?.checked || false;
    config.PROVIDER_POOLS_FILE_PATH = document.getElementById('providerPoolsFilePath')?.value || '';
    config.MAX_ERROR_COUNT = parseInt(document.getElementById('maxErrorCount')?.value || 3);

    try {
        await window.apiClient.post('/config', config);
        
        // If new password entered, save it separately
        if (adminPassword) {
            try {
                await window.apiClient.post('/admin-password', { password: adminPassword });
                // Clear password input
                const adminPasswordEl = document.getElementById('adminPassword');
                if (adminPasswordEl) adminPasswordEl.value = '';
                showToast('Admin password updated. It will take effect on next login.', 'success');
            } catch (pwdError) {
                console.error('Failed to save admin password:', pwdError);
                showToast('Failed to save admin password: ' + pwdError.message, 'error');
            }
        }
        
        await window.apiClient.post('/reload-config');
        showToast('Configuration saved', 'success');
        
        // Check if currently on provider pools page, if so refresh data
        const providersSection = document.getElementById('providers');
        if (providersSection && providersSection.classList.contains('active')) {
            // Currently on provider pools page, refresh data
            await loadProviders();
            showToast('Provider pools refreshed', 'success');
        }
    } catch (error) {
        console.error('Failed to save configuration:', error);
        showToast('Failed to save configuration: ' + error.message, 'error');
    }
}

export {
    loadConfiguration,
    saveConfiguration
};