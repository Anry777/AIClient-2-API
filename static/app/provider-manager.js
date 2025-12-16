// Provider management functionality module

import { providerStats, updateProviderStats } from './constants.js';
import { showToast } from './utils.js';

// Save initial server time and uptime
let initialServerTime = null;
let initialUptime = null;
let initialLoadTime = null;

/**
 * Load system information
 */
async function loadSystemInfo() {
    try {
        const data = await window.apiClient.get('/system');

        const nodeVersionEl = document.getElementById('nodeVersion');
        const serverTimeEl = document.getElementById('serverTime');
        const memoryUsageEl = document.getElementById('memoryUsage');
        const uptimeEl = document.getElementById('uptime');

        if (nodeVersionEl) nodeVersionEl.textContent = data.nodeVersion || '--';
        if (memoryUsageEl) memoryUsageEl.textContent = data.memoryUsage || '--';
        
        // Save initial time for local calculation
        if (data.serverTime && data.uptime !== undefined) {
            initialServerTime = new Date(data.serverTime);
            initialUptime = data.uptime;
            initialLoadTime = Date.now();
        }
        
        // Initial display
        if (serverTimeEl) serverTimeEl.textContent = data.serverTime || '--';
        if (uptimeEl) uptimeEl.textContent = data.uptime ? formatUptime(data.uptime) : '--';

    } catch (error) {
        console.error('Failed to load system info:', error);
    }
}

/**
 * Update server time and uptime display (local calculation)
 */
function updateTimeDisplay() {
    if (!initialServerTime || initialUptime === null || !initialLoadTime) {
        return;
    }

    const serverTimeEl = document.getElementById('serverTime');
    const uptimeEl = document.getElementById('uptime');

    // Calculate elapsed seconds
    const elapsedSeconds = Math.floor((Date.now() - initialLoadTime) / 1000);

    // Update server time
    if (serverTimeEl) {
        const currentServerTime = new Date(initialServerTime.getTime() + elapsedSeconds * 1000);
        serverTimeEl.textContent = currentServerTime.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    // Update uptime
    if (uptimeEl) {
        const currentUptime = initialUptime + elapsedSeconds;
        uptimeEl.textContent = formatUptime(currentUptime);
    }
}

/**
 * Load provider list
 */
async function loadProviders() {
    try {
        const data = await window.apiClient.get('/providers');
        renderProviders(data);
    } catch (error) {
        console.error('Failed to load providers:', error);
    }
}

/**
 * Render provider list
 * @param {Object} providers - Provider data
 */
function renderProviders(providers) {
    const container = document.getElementById('providersList');
    if (!container) return;
    
    container.innerHTML = '';

    // Check if there is provider pool data
    const hasProviders = Object.values(providers).some(accounts => Array.isArray(accounts) && accounts.length > 0);
    const statsGrid = document.querySelector('#providers .stats-grid');
    
    // Always show statistics cards
    if (statsGrid) statsGrid.style.display = 'grid';
    
    // Define the display order of all supported providers
    const providerDisplayOrder = [
        'gemini-cli-oauth',
        'gemini-antigravity',
        'openai-custom',
        'claude-custom',
        'claude-kiro-oauth',
        'openai-qwen-oauth',
        'openaiResponses-custom'
    ];
    
    // Get all provider types and sort them in the specified order
    // Prioritize displaying all predefined provider types, even if some providers have no data
    let allProviderTypes;
    if (hasProviders) {
        // Merge predefined types and actual existing types to ensure all predefined providers are displayed
        const actualProviderTypes = Object.keys(providers);
        allProviderTypes = [...new Set([...providerDisplayOrder, ...actualProviderTypes])];
    } else {
        allProviderTypes = providerDisplayOrder;
    }
    const sortedProviderTypes = providerDisplayOrder.filter(type => allProviderTypes.includes(type))
        .concat(allProviderTypes.filter(type => !providerDisplayOrder.includes(type)));
    
    // Calculate total statistics
    let totalAccounts = 0;
    let totalHealthy = 0;
    
    // Render providers in the sorted order
    sortedProviderTypes.forEach((providerType) => {
        const accounts = hasProviders ? providers[providerType] || [] : [];
        const providerDiv = document.createElement('div');
        providerDiv.className = 'provider-item';
        providerDiv.dataset.providerType = providerType;
        providerDiv.style.cursor = 'pointer';

        const healthyCount = accounts.filter(acc => acc.isHealthy).length;
        const totalCount = accounts.length;
        const usageCount = accounts.reduce((sum, acc) => sum + (acc.usageCount || 0), 0);
        const errorCount = accounts.reduce((sum, acc) => sum + (acc.errorCount || 0), 0);
        
        totalAccounts += totalCount;
        totalHealthy += healthyCount;

        // Update global statistics variables
        if (!providerStats.providerTypeStats[providerType]) {
            providerStats.providerTypeStats[providerType] = {
                totalAccounts: 0,
                healthyAccounts: 0,
                totalUsage: 0,
                totalErrors: 0,
                lastUpdate: null
            };
        }
        
        const typeStats = providerStats.providerTypeStats[providerType];
        typeStats.totalAccounts = totalCount;
        typeStats.healthyAccounts = healthyCount;
        typeStats.totalUsage = usageCount;
        typeStats.totalErrors = errorCount;
        typeStats.lastUpdate = new Date().toISOString();

        // Set special styles for empty state
        const isEmptyState = !hasProviders || totalCount === 0;
        const statusClass = isEmptyState ? 'status-empty' : (healthyCount === totalCount ? 'status-healthy' : 'status-unhealthy');
        const statusIcon = isEmptyState ? 'fa-info-circle' : (healthyCount === totalCount ? 'fa-check-circle' : 'fa-exclamation-triangle');
        const statusText = isEmptyState ? '0/0 nodes' : `${healthyCount}/${totalCount} healthy`;

        providerDiv.innerHTML = `
            <div class="provider-header">
                <div class="provider-name">
                    <span class="provider-type-text">${providerType}</span>
                </div>
                <div class="provider-header-right">
                    ${generateAuthButton(providerType)}
                    <div class="provider-status ${statusClass}">
                        <i class="fas fa-${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
            </div>
            <div class="provider-stats">
                <div class="provider-stat">
                    <span class="provider-stat-label">Total</span>
                    <span class="provider-stat-value">${totalCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label">Healthy</span>
                    <span class="provider-stat-value">${healthyCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label">Usage</span>
                    <span class="provider-stat-value">${usageCount}</span>
                </div>
                <div class="provider-stat">
                    <span class="provider-stat-label">Errors</span>
                    <span class="provider-stat-value">${errorCount}</span>
                </div>
            </div>
        `;

        // Add special styles for empty state
        if (isEmptyState) {
            providerDiv.classList.add('empty-provider');
        }

        // Add click event - entire provider group can be clicked
        providerDiv.addEventListener('click', (e) => {
            e.preventDefault();
            openProviderManager(providerType);
        });

        container.appendChild(providerDiv);
        
        // Add event listener for authorization button
        const authBtn = providerDiv.querySelector('.generate-auth-btn');
        if (authBtn) {
            authBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling to parent element
                handleGenerateAuthUrl(providerType);
            });
        }
    });
    
    // Update statistics cards
    const activeProviders = hasProviders
        ? Object.entries(providers).filter(([, accounts]) => Array.isArray(accounts) && accounts.length > 0).length
        : 0;
    updateProviderStatsDisplay(activeProviders, totalHealthy, totalAccounts);
}

/**
 * Update provider statistics
 * @param {number} activeProviders - Number of active providers
 * @param {number} healthyProviders - Number of healthy providers
 * @param {number} totalAccounts - Total number of accounts
 */
function updateProviderStatsDisplay(activeProviders, healthyProviders, totalAccounts) {
    // Update global statistics variables
    const newStats = {
        activeProviders,
        healthyProviders,
        totalAccounts,
        lastUpdateTime: new Date().toISOString()
    };
    
    updateProviderStats(newStats);
    
    // Calculate total requests and errors
    let totalUsage = 0;
    let totalErrors = 0;
    Object.values(providerStats.providerTypeStats).forEach(typeStats => {
        totalUsage += typeStats.totalUsage || 0;
        totalErrors += typeStats.totalErrors || 0;
    });
    
    const finalStats = {
        ...newStats,
        totalRequests: totalUsage,
        totalErrors: totalErrors
    };
    
    updateProviderStats(finalStats);
    
    // Modified: Calculate "active providers" and "active connections" based on usage statistics
    // "Active providers": Count the number of provider types with usageCount > 0
    let activeProvidersByUsage = 0;
    Object.entries(providerStats.providerTypeStats).forEach(([providerType, typeStats]) => {
        if (typeStats.totalUsage > 0) {
            activeProvidersByUsage++;
        }
    });
    
    // "Active connections": Sum up the usageCount of all provider accounts
    const activeConnections = totalUsage;
    
    // Update page display
    const activeProvidersEl = document.getElementById('activeProviders');
    const healthyProvidersEl = document.getElementById('healthyProviders');
    const activeConnectionsEl = document.getElementById('activeConnections');
    
    if (activeProvidersEl) activeProvidersEl.textContent = activeProvidersByUsage;
    if (healthyProvidersEl) healthyProvidersEl.textContent = healthyProviders;
    if (activeConnectionsEl) activeConnectionsEl.textContent = activeConnections;
    
    // Print debug information to console
    console.log('Provider Stats Updated:', {
        activeProviders,
        activeProvidersByUsage,
        healthyProviders,
        totalAccounts,
        totalUsage,
        totalErrors,
        providerTypeStats: providerStats.providerTypeStats
    });
}

/**
 * Open provider manager modal
 * @param {string} providerType - Provider type
 */
async function openProviderManager(providerType) {
    try {
        const data = await window.apiClient.get(`/providers/${encodeURIComponent(providerType)}`);
        
        showProviderManagerModal(data);
    } catch (error) {
        console.error('Failed to load provider details:', error);
        showToast('Failed to load provider details', 'error');
    }
}

/**
 * Generate authorization button HTML
 * @param {string} providerType - Provider type
 * @returns {string} Authorization button HTML
 */
function generateAuthButton(providerType) {
    // Only display authorization button for OAuth-supported providers
    const oauthProviders = ['gemini-cli-oauth', 'gemini-antigravity', 'openai-qwen-oauth'];
    
    if (!oauthProviders.includes(providerType)) {
        return '';
    }
    
    return `
        <button class="generate-auth-btn" title="Generate OAuth authorization link">
            <i class="fas fa-key"></i>
            <span>Authorize</span>
        </button>
    `;
}

/**
 * Handle generating authorization link
 * @param {string} providerType - Provider type
 */
async function handleGenerateAuthUrl(providerType) {
    try {
        showToast('Generating authorization link...', 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/generate-auth-url`,
            {}
        );
        
        if (response.success && response.authUrl) {
            // Display authorization information modal
            showAuthModal(response.authUrl, response.authInfo);
        } else {
            showToast('Failed to generate authorization link', 'error');
        }
    } catch (error) {
        console.error('Failed to generate authorization link:', error);
        showToast(`Failed to generate authorization link: ${error.message}`, 'error');
    }
}

/**
 * Get provider's credentials file path
 * @param {string} provider - Provider type
 * @returns {string} Credentials file path
 */
function getAuthFilePath(provider) {
    const authFilePaths = {
        'gemini-cli-oauth': '~/.gemini/oauth_creds.json',
        'gemini-antigravity': '~/.antigravity/oauth_creds.json',
        'openai-qwen-oauth': '~/.qwen/oauth_creds.json',
        'claude-kiro-oauth': '~/.aws/sso/cache/kiro-auth-token.json'
    };
    return authFilePaths[provider] || 'Unknown path';
}

/**
 * Display authorization information modal
 * @param {string} authUrl - Authorization URL
 * @param {Object} authInfo - Authorization information
 */
function showAuthModal(authUrl, authInfo) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    // Get credentials file path
    const authFilePath = getAuthFilePath(authInfo.provider);
    
    let instructionsHtml = '';
    if (authInfo.provider === 'openai-qwen-oauth') {
        instructionsHtml = `
            <div class="auth-instructions">
                <h4>Authorization steps:</h4>
                <ol>
                    <li>Click the button below to open the authorization page in your browser</li>
                    <li>Enter the user code on the authorization page: <strong>${authInfo.userCode}</strong></li>
                    <li>After authorization, the system will automatically obtain the access token</li>
                    <li>Expires in: ${Math.floor(authInfo.expiresIn / 60)} minutes</li>
                </ol>
                <p class="auth-note">${authInfo.instructions}</p>
                <div class="auth-file-path" style="margin-top: 15px; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; border-left: 4px solid var(--primary-color);">
                    <strong style="color: var(--text-primary);"><i class="fas fa-folder-open" style="margin-right: 5px; color: var(--primary-color);"></i>Credentials file path:</strong>
                    <code style="display: block; margin-top: 5px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; word-break: break-all; font-family: 'Courier New', monospace; color: var(--text-primary);">${authFilePath}</code>
                    <small style="color: var(--text-secondary); display: block; margin-top: 5px;">Note: <code style="background: var(--bg-tertiary); padding: 0.125rem 0.25rem; border-radius: 0.25rem;">~</code> refers to the user home directory (Windows: C:\\Users\\username, Linux/macOS: /home/username or /Users/username)</small>
                </div>
            </div>
        `;
    } else {
        instructionsHtml = `
            <div class="auth-instructions">
                <div class="auth-warning" style="margin-bottom: 15px;">
                    <div>
                        <strong>⚠️ Important: callback host restriction</strong>
                        <p>The OAuth callback host must be <code>localhost</code> or <code>127.0.0.1</code>, otherwise authorization will fail.</p>
                        <p style="margin-top: 8px;">Current redirect URI: <code>${authInfo.redirectUri}</code></p>
                        <p style="margin-top: 8px; color: #d97706;">If your configured host is not localhost/127.0.0.1, change it and regenerate the link.</p>
                    </div>
                </div>
                <h4>Authorization steps:</h4>
                <ol>
                    <li>Ensure the redirect URI host is localhost or 127.0.0.1</li>
                    <li>Click the button below to open the authorization page in your browser</li>
                    <li>Sign in with your Google account and grant access</li>
                    <li>After authorization, the credentials file will be saved automatically</li>
                </ol>
                <p class="auth-note">${authInfo.instructions}</p>
                <div class="auth-file-path" style="margin-top: 15px; padding: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; border-left: 4px solid var(--primary-color);">
                    <strong style="color: var(--text-primary);"><i class="fas fa-folder-open" style="margin-right: 5px; color: var(--primary-color);"></i>Credentials file path:</strong>
                    <code style="display: block; margin-top: 5px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; word-break: break-all; font-family: 'Courier New', monospace; color: var(--text-primary);">${authFilePath}</code>
                    <small style="color: var(--text-secondary); display: block; margin-top: 5px;">Note: <code style="background: var(--bg-tertiary); padding: 0.125rem 0.25rem; border-radius: 0.25rem;">~</code> refers to the user home directory (Windows: C:\\Users\\username, Linux/macOS: /home/username or /Users/username)</small>
                </div>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> OAuth Authorization</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="auth-info">
                    <p><strong>Provider:</strong> ${authInfo.provider}</p>
                    ${instructionsHtml}
                    <div class="auth-url-section">
                        <label>Authorization URL:</label>
                        <div class="auth-url-container">
                            <input type="text" readonly value="${authUrl}" class="auth-url-input">
                            <button class="copy-btn" title="Copy link">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-cancel">Close</button>
                <button class="open-auth-btn">
                    <i class="fas fa-external-link-alt"></i>
                    Open in browser
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.modal-cancel');
    [closeBtn, cancelBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Copy link button
    const copyBtn = modal.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
        const input = modal.querySelector('.auth-url-input');
        input.select();
        document.execCommand('copy');
        showToast('Authorization link copied to clipboard', 'success');
    });
    
    // Open in browser button
    const openBtn = modal.querySelector('.open-auth-btn');
    openBtn.addEventListener('click', () => {
        window.open(authUrl, '_blank');
        showToast('Authorization page opened in a new tab', 'success');
    });
    
    // Click on overlay to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Import utility functions
import { formatUptime } from './utils.js';

export {
    loadSystemInfo,
    updateTimeDisplay,
    loadProviders,
    renderProviders,
    updateProviderStatsDisplay,
    openProviderManager
};