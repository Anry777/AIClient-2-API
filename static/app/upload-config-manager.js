// Upload configuration management module

import { showToast } from './utils.js';

let allConfigs = []; // Store all config data
let filteredConfigs = []; // Store filtered config data
let isLoadingConfigs = false; // Prevent duplicate config loading

/**
 * Search configurations
 * @param {string} searchTerm - Search keyword
 * @param {string} statusFilter - Status filter
 */
function searchConfigs(searchTerm = '', statusFilter = '') {
    if (!allConfigs.length) {
        console.log('No config data to search');
        return;
    }

    filteredConfigs = allConfigs.filter(config => {
        // Search filter
        const matchesSearch = !searchTerm ||
            config.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            config.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (config.content && config.content.toLowerCase().includes(searchTerm.toLowerCase()));

        // Status filter - convert boolean isUsed to status string
        const configStatus = config.isUsed ? 'used' : 'unused';
        const matchesStatus = !statusFilter || configStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    renderConfigList();
    updateStats();
}

/**
 * Render configuration list
 */
function renderConfigList() {
    const container = document.getElementById('configList');
    if (!container) return;

    container.innerHTML = '';

    if (!filteredConfigs.length) {
        container.innerHTML = '<div class="no-configs"><p>No matching configuration files found</p></div>';
        return;
    }

    filteredConfigs.forEach((config, index) => {
        const configItem = createConfigItemElement(config, index);
        container.appendChild(configItem);
    });
}

/**
 * Create config item element
 * @param {Object} config - Config data
 * @param {number} index - Index
 * @returns {HTMLElement} Config item element
 */
function createConfigItemElement(config, index) {
    // Convert boolean isUsed to status string for display
    const configStatus = config.isUsed ? 'used' : 'unused';
    const item = document.createElement('div');
    item.className = `config-item-manager ${configStatus}`;
    item.dataset.index = index;

    const statusIcon = config.isUsed ? 'fa-check-circle' : 'fa-circle';
    const statusText = config.isUsed ? 'Linked' : 'Unlinked';

    const typeIcon = config.type === 'oauth' ? 'fa-key' :
                    config.type === 'api-key' ? 'fa-lock' :
                    config.type === 'provider-pool' ? 'fa-network-wired' :
                    config.type === 'system-prompt' ? 'fa-file-text' : 'fa-cog';

    // Generate usage info HTML
    const usageInfoHtml = generateUsageInfoHtml(config);
    
    // Check if quick link is possible (unlinked and path contains supported provider directory)
    const providerInfo = detectProviderFromPath(config.path);
    const canQuickLink = !config.isUsed && providerInfo !== null;
    const quickLinkBtnHtml = canQuickLink ?
        `<button class="btn-quick-link" data-path="${config.path}" title="Quick link to ${providerInfo.displayName}">
            <i class="fas fa-link"></i> ${providerInfo.shortName}
        </button>` : '';

    item.innerHTML = `
        <div class="config-item-header">
            <div class="config-item-name">${config.name}</div>
            <div class="config-item-path" title="${config.path}">${config.path}</div>
        </div>
        <div class="config-item-meta">
            <div class="config-item-size">${formatFileSize(config.size)}</div>
            <div class="config-item-modified">${formatDate(config.modified)}</div>
            <div class="config-item-status">
                <i class="fas ${statusIcon}"></i>
                ${statusText}
                ${quickLinkBtnHtml}
            </div>
        </div>
        <div class="config-item-details">
            <div class="config-details-grid">
                <div class="config-detail-item">
                    <div class="config-detail-label">File Path</div>
                    <div class="config-detail-value">${config.path}</div>
                </div>
                <div class="config-detail-item">
                    <div class="config-detail-label">File Size</div>
                    <div class="config-detail-value">${formatFileSize(config.size)}</div>
                </div>
                <div class="config-detail-item">
                    <div class="config-detail-label">Last Modified</div>
                    <div class="config-detail-value">${formatDate(config.modified)}</div>
                </div>
                <div class="config-detail-item">
                    <div class="config-detail-label">Link Status</div>
                    <div class="config-detail-value">${statusText}</div>
                </div>
            </div>
            ${usageInfoHtml}
            <div class="config-item-actions">
                <button class="btn-small btn-view" data-path="${config.path}">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn-small btn-delete-small" data-path="${config.path}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;

    // Add button event listeners
    const viewBtn = item.querySelector('.btn-view');
    const deleteBtn = item.querySelector('.btn-delete-small');
    
    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewConfig(config.path);
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConfig(config.path);
        });
    }

    // Quick link button event
    const quickLinkBtn = item.querySelector('.btn-quick-link');
    if (quickLinkBtn) {
        quickLinkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            quickLinkProviderConfig(config.path);
        });
    }

    // Add click event to expand/collapse details
    item.addEventListener('click', (e) => {
        if (!e.target.closest('.config-item-actions')) {
            item.classList.toggle('expanded');
        }
    });

    return item;
}

/**
 * Generate usage info HTML
 * @param {Object} config - Config data
 * @returns {string} HTML string
 */
function generateUsageInfoHtml(config) {
    if (!config.usageInfo || !config.usageInfo.isUsed) {
        return '';
    }

    const { usageType, usageDetails } = config.usageInfo;
    
    if (!usageDetails || usageDetails.length === 0) {
        return '';
    }

    const typeLabels = {
        'main_config': 'Main Configuration',
        'provider_pool': 'Provider Pool',
        'multiple': 'Multiple Uses'
    };

    const typeLabel = typeLabels[usageType] || 'Unknown Usage';

    let detailsHtml = '';
    usageDetails.forEach(detail => {
        const icon = detail.type === 'Main Config' ? 'fa-cog' : 'fa-network-wired';
        const usageTypeKey = detail.type === 'Main Config' ? 'main_config' : 'provider_pool';
        detailsHtml += `
            <div class="usage-detail-item" data-usage-type="${usageTypeKey}">
                <i class="fas ${icon}"></i>
                <span class="usage-detail-type">${detail.type}</span>
                <span class="usage-detail-location">${detail.location}</span>
            </div>
        `;
    });

    return `
        <div class="config-usage-info">
            <div class="usage-info-header">
                <i class="fas fa-link"></i>
                <span class="usage-info-title">Link Details (${typeLabel})</span>
            </div>
            <div class="usage-details-list">
                ${detailsHtml}
            </div>
        </div>
    `;
}

/**
 * Format file size
 * @param {number} bytes - Bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date
 * @param {string} dateString - Date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Update statistics
 */
function updateStats() {
    const totalCount = filteredConfigs.length;
    const usedCount = filteredConfigs.filter(config => config.isUsed).length;
    const unusedCount = filteredConfigs.filter(config => !config.isUsed).length;

    const totalEl = document.getElementById('configCount');
    const usedEl = document.getElementById('usedConfigCount');
    const unusedEl = document.getElementById('unusedConfigCount');

    if (totalEl) totalEl.textContent = `Total ${totalCount} config files`;
    if (usedEl) usedEl.textContent = `Linked: ${usedCount}`;
    if (unusedEl) unusedEl.textContent = `Unlinked: ${unusedCount}`;
}

/**
 * Load configuration file list
 */
async function loadConfigList() {
    // Prevent duplicate loading
    if (isLoadingConfigs) {
        console.log('Config list is already loading, skipping duplicate call');
        return;
    }

    isLoadingConfigs = true;
    console.log('Loading config list...');
    
    try {
        const result = await window.apiClient.get('/upload-configs');
        allConfigs = result;
        filteredConfigs = [...allConfigs];
        renderConfigList();
        updateStats();
        console.log('Config list loaded successfully. Total items:', allConfigs.length);
        // showToast('Config list refreshed', 'success');
    } catch (error) {
        console.error('Failed to load config list:', error);
        showToast('Failed to load config list: ' + error.message, 'error');
        
        // Use mock data as fallback
        allConfigs = generateMockConfigData();
        filteredConfigs = [...allConfigs];
        renderConfigList();
        updateStats();
    } finally {
        isLoadingConfigs = false;
        console.log('Config list load complete');
    }
}

/**
 * Generate mock config data (for demonstration)
 * @returns {Array} Mock config data
 */
function generateMockConfigData() {
    return [
        {
            name: 'provider_pools.json',
            path: './provider_pools.json',
            type: 'provider-pool',
            size: 2048,
            modified: '2025-11-11T04:30:00.000Z',
            isUsed: true,
            content: JSON.stringify({
                "gemini-cli-oauth": [
                    {
                        "GEMINI_OAUTH_CREDS_FILE_PATH": "~/.gemini/oauth/creds.json",
                        "PROJECT_ID": "test-project"
                    }
                ]
            }, null, 2)
        },
        {
            name: 'config.json',
            path: './config.json',
            type: 'other',
            size: 1024,
            modified: '2025-11-10T12:00:00.000Z',
            isUsed: true,
            content: JSON.stringify({
                "REQUIRED_API_KEY": "123456",
                "SERVER_PORT": 3000
            }, null, 2)
        },
        {
            name: 'oauth_creds.json',
            path: '~/.gemini/oauth/creds.json',
            type: 'oauth',
            size: 512,
            modified: '2025-11-09T08:30:00.000Z',
            isUsed: false,
            content: '{"client_id": "test", "client_secret": "test"}'
        },
        {
            name: 'input_system_prompt.txt',
            path: './input_system_prompt.txt',
            type: 'system-prompt',
            size: 256,
            modified: '2025-11-08T15:20:00.000Z',
            isUsed: true,
            content: 'You are a helpful AI assistant...'
        },
        {
            name: 'invalid_config.json',
            path: './invalid_config.json',
            type: 'other',
            size: 128,
            modified: '2025-11-07T10:15:00.000Z',
            isUsed: false,
            content: '{"invalid": json}'
        }
    ];
}

/**
 * View config
 * @param {string} path - File path
 */
async function viewConfig(path) {
    try {
        const fileData = await window.apiClient.get(`/upload-configs/view/${encodeURIComponent(path)}`);
        showConfigModal(fileData);
    } catch (error) {
        console.error('Failed to view config:', error);
        showToast('Failed to view config: ' + error.message, 'error');
    }
}

/**
 * Show config modal
 * @param {Object} fileData - File data
 */
function showConfigModal(fileData) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'config-view-modal';
    modal.innerHTML = `
        <div class="config-modal-content">
            <div class="config-modal-header">
                <h3>Config file: ${fileData.name}</h3>
                <button class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="config-modal-body">
                <div class="config-file-info">
                    <div class="file-info-item">
                        <span class="info-label">File Path:</span>
                        <span class="info-value">${fileData.path}</span>
                    </div>
                    <div class="file-info-item">
                        <span class="info-label">File Size:</span>
                        <span class="info-value">${formatFileSize(fileData.size)}</span>
                    </div>
                    <div class="file-info-item">
                        <span class="info-label">Last Modified:</span>
                        <span class="info-value">${formatDate(fileData.modified)}</span>
                    </div>
                </div>
                <div class="config-content">
                    <label>File content:</label>
                    <pre class="config-content-display">${escapeHtml(fileData.content)}</pre>
                </div>
            </div>
            <div class="config-modal-footer">
                <button class="btn btn-secondary btn-close-modal">Close</button>
                <button class="btn btn-primary btn-copy-content" data-path="${fileData.path}">
                    <i class="fas fa-copy"></i> Copy content
                </button>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(modal);
    
    // Add button event listeners
    const closeBtn = modal.querySelector('.btn-close-modal');
    const copyBtn = modal.querySelector('.btn-copy-content');
    const modalCloseBtn = modal.querySelector('.modal-close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeConfigModal();
        });
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const path = copyBtn.dataset.path;
            copyConfigContent(path);
        });
    }
    
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            closeConfigModal();
        });
    }
    
    // Show modal
    setTimeout(() => modal.classList.add('show'), 10);
}

/**
 * Close config modal
 */
function closeConfigModal() {
    const modal = document.querySelector('.config-view-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

/**
 * Copy config content
 * @param {string} path - File path
 */
async function copyConfigContent(path) {
    try {
        const fileData = await window.apiClient.get(`/upload-configs/view/${encodeURIComponent(path)}`);
        
        // Try to use modern Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fileData.content);
            showToast('Content copied to clipboard', 'success');
        } else {
            // Fallback: use traditional document.execCommand
            const textarea = document.createElement('textarea');
            textarea.value = fileData.content;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showToast('Content copied to clipboard', 'success');
                } else {
                    showToast('Copy failed, please copy manually', 'error');
                }
            } catch (err) {
                console.error('Copy failed:', err);
                showToast('Copy failed, please copy manually', 'error');
            } finally {
                document.body.removeChild(textarea);
            }
        }
    } catch (error) {
        console.error('Copy failed:', error);
        showToast('Copy failed: ' + error.message, 'error');
    }
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
 * Show delete confirmation modal
 * @param {Object} config - Config data
 */
function showDeleteConfirmModal(config) {
    const isUsed = config.isUsed;
    const modalClass = isUsed ? 'delete-confirm-modal used' : 'delete-confirm-modal unused';
    const title = isUsed ? 'Delete linked config' : 'Delete config file';
    const icon = isUsed ? 'fas fa-exclamation-triangle' : 'fas fa-trash';
    const buttonClass = isUsed ? 'btn btn-danger' : 'btn btn-warning';
    
    const modal = document.createElement('div');
    modal.className = modalClass;
    
    modal.innerHTML = `
        <div class="delete-modal-content">
            <div class="delete-modal-header">
                <h3><i class="${icon}"></i> ${title}</h3>
                <button class="modal-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="delete-modal-body">
                <div class="delete-warning ${isUsed ? 'warning-used' : 'warning-unused'}">
                    <div class="warning-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="warning-content">
                        ${isUsed ?
                            '<h4>⚠️ This config is currently in use</h4><p>Deleting a linked config file may affect system operation. Make sure you understand the consequences.</p>' :
                            '<h4>🗑️ Confirm deletion</h4><p>This action will permanently delete the config file and cannot be undone.</p>'
                        }
                    </div>
                </div>
                
                <div class="config-info">
                    <div class="config-info-item">
                        <span class="info-label">File name:</span>
                        <span class="info-value">${config.name}</span>
                    </div>
                    <div class="config-info-item">
                        <span class="info-label">File path:</span>
                        <span class="info-value">${config.path}</span>
                    </div>
                    <div class="config-info-item">
                        <span class="info-label">File size:</span>
                        <span class="info-value">${formatFileSize(config.size)}</span>
                    </div>
                    <div class="config-info-item">
                        <span class="info-label">Link status:</span>
                        <span class="info-value status-${isUsed ? 'used' : 'unused'}">
                            ${isUsed ? 'Linked' : 'Unlinked'}
                        </span>
                    </div>
                </div>
                
                ${isUsed ? `
                    <div class="usage-alert">
                        <div class="alert-icon">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <div class="alert-content">
                            <h5>Link details</h5>
                            <p>This config file is currently in use. Deleting it may cause:</p>
                            <ul>
                                <li>Related AI services may stop working</li>
                                <li>Settings in Config Manager may break</li>
                                <li>Provider pool configuration may be lost</li>
                            </ul>
                            <p><strong>Recommendation:</strong> unlink this file in Config Manager before deleting.</p>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="delete-modal-footer">
                <button class="btn btn-secondary btn-cancel-delete">Cancel</button>
                <button class="${buttonClass} btn-confirm-delete" data-path="${config.path}">
                    <i class="fas fa-${isUsed ? 'exclamation-triangle' : 'trash'}"></i>
                    ${isUsed ? 'Force delete' : 'Confirm delete'}
                </button>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.btn-cancel-delete');
    const confirmBtn = modal.querySelector('.btn-confirm-delete');
    
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    };
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const path = confirmBtn.dataset.path;
            performDelete(path);
            closeModal();
        });
    }
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on ESC key
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Show modal
    setTimeout(() => modal.classList.add('show'), 10);
}

/**
 * Perform delete operation
 * @param {string} path - File path
 */
async function performDelete(path) {
    try {
        const result = await window.apiClient.delete(`/upload-configs/delete/${encodeURIComponent(path)}`);
        showToast(result.message, 'success');
        
        // Remove from local list
        allConfigs = allConfigs.filter(c => c.path !== path);
        filteredConfigs = filteredConfigs.filter(c => c.path !== path);
        renderConfigList();
        updateStats();
    } catch (error) {
        console.error('Failed to delete config:', error);
        showToast('Failed to delete config: ' + error.message, 'error');
    }
}

/**
 * Delete config
 * @param {string} path - File path
 */
async function deleteConfig(path) {
    const config = filteredConfigs.find(c => c.path === path) || allConfigs.find(c => c.path === path);
    if (!config) {
        showToast('Config file does not exist', 'error');
        return;
    }
    
    // Show delete confirmation modal
    showDeleteConfirmModal(config);
}

/**
 * Initialize upload config manager
 */
function initUploadConfigManager() {
    // Bind search events
    const searchInput = document.getElementById('configSearch');
    const searchBtn = document.getElementById('searchConfigBtn');
    const statusFilter = document.getElementById('configStatusFilter');
    const refreshBtn = document.getElementById('refreshConfigList');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const searchTerm = searchInput.value.trim();
            const currentStatusFilter = statusFilter?.value || '';
            searchConfigs(searchTerm, currentStatusFilter);
        }, 300));
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const searchTerm = searchInput?.value.trim() || '';
            const currentStatusFilter = statusFilter?.value || '';
            searchConfigs(searchTerm, currentStatusFilter);
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            const searchTerm = searchInput?.value.trim() || '';
            const currentStatusFilter = statusFilter.value;
            searchConfigs(searchTerm, currentStatusFilter);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadConfigList);
    }

    // Batch link config button
    const batchLinkBtn = document.getElementById('batchLinkKiroBtn') || document.getElementById('batchLinkProviderBtn');
    if (batchLinkBtn) {
        batchLinkBtn.addEventListener('click', batchLinkProviderConfigs);
    }

    // Initial load of config list
    loadConfigList();
}

/**
 * Reload config
 */
async function reloadConfig() {
    // Prevent duplicate reload
    if (isLoadingConfigs) {
        console.log('Config reload is already in progress, skipping duplicate call');
        return;
    }

    try {
        const result = await window.apiClient.post('/reload-config');
        showToast(result.message, 'success');
        
        // Reload config list to reflect latest link status
        await loadConfigList();
        
        // Note: no longer dispatching configReloaded event to avoid duplicate calls
        // window.dispatchEvent(new CustomEvent('configReloaded', {
        //     detail: result.details
        // }));
        
    } catch (error) {
        console.error('Failed to reload config:', error);
        showToast('Failed to reload config: ' + error.message, 'error');
    }
}

/**
 * Detect provider from path
 * @param {string} filePath - File path
 * @returns {Object|null} Provider info object or null
 */
function detectProviderFromPath(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
    // Define directory to provider mappings
    const providerMappings = [
        {
            patterns: ['configs/kiro/', '/kiro/'],
            providerType: 'claude-kiro-oauth',
            displayName: 'Claude Kiro OAuth',
            shortName: 'kiro-oauth'
        },
        {
            patterns: ['configs/gemini/', '/gemini/', 'configs/gemini-cli/'],
            providerType: 'gemini-cli-oauth',
            displayName: 'Gemini CLI OAuth',
            shortName: 'gemini-oauth'
        },
        {
            patterns: ['configs/qwen/', '/qwen/'],
            providerType: 'openai-qwen-oauth',
            displayName: 'Qwen OAuth',
            shortName: 'qwen-oauth'
        },
        {
            patterns: ['configs/antigravity/', '/antigravity/'],
            providerType: 'gemini-antigravity',
            displayName: 'Gemini Antigravity',
            shortName: 'antigravity'
        }
    ];

    // Iterate through mappings to find matching provider
    for (const mapping of providerMappings) {
        for (const pattern of mapping.patterns) {
            if (normalizedPath.includes(pattern)) {
                return {
                    providerType: mapping.providerType,
                    displayName: mapping.displayName,
                    shortName: mapping.shortName
                };
            }
        }
    }

    return null;
}

/**
 * Quick link provider config
 * @param {string} filePath - Config file path
 */
async function quickLinkProviderConfig(filePath) {
    try {
        const providerInfo = detectProviderFromPath(filePath);
        if (!providerInfo) {
            showToast('Unable to detect provider type for this config file', 'error');
            return;
        }
        
        showToast(`Linking config to ${providerInfo.displayName}...`, 'info');
        
        const result = await window.apiClient.post('/quick-link-provider', {
            filePath: filePath
        });
        
        showToast(result.message || 'Config linked successfully', 'success');
        
        // Refresh config list
        await loadConfigList();
    } catch (error) {
        console.error('Quick link failed:', error);
        showToast('Link failed: ' + error.message, 'error');
    }
}

/**
 * Batch link provider configs
 */
async function batchLinkProviderConfigs() {
    // Filter out unlinked configs in supported provider directories
    const unlinkedConfigs = allConfigs.filter(config => {
        if (config.isUsed) return false;
        const providerInfo = detectProviderFromPath(config.path);
        return providerInfo !== null;
    });
    
    if (unlinkedConfigs.length === 0) {
        showToast('No config files to link', 'info');
        return;
    }
    
    // Group by provider type
    const groupedByProvider = {};
    unlinkedConfigs.forEach(config => {
        const providerInfo = detectProviderFromPath(config.path);
        if (providerInfo) {
            if (!groupedByProvider[providerInfo.displayName]) {
                groupedByProvider[providerInfo.displayName] = 0;
            }
            groupedByProvider[providerInfo.displayName]++;
        }
    });
    
    const providerSummary = Object.entries(groupedByProvider)
        .map(([name, count]) => `${name}: ${count} file(s)`)
        .join(', ');
    
    const confirmMsg = `Are you sure you want to link ${unlinkedConfigs.length} config file(s)?\n\n${providerSummary}`;
    if (!confirm(confirmMsg)) {
        return;
    }
    
    showToast(`Linking ${unlinkedConfigs.length} config file(s)...`, 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const config of unlinkedConfigs) {
        try {
            await window.apiClient.post('/quick-link-provider', {
                filePath: config.path
            });
            successCount++;
        } catch (error) {
            console.error(`Link failed: ${config.path}`, error);
            failCount++;
        }
    }
    
    // Refresh config list
    await loadConfigList();
    
    if (failCount === 0) {
        showToast(`Successfully linked ${successCount} config file(s)`, 'success');
    } else {
        showToast(`Linking completed: ${successCount} succeeded, ${failCount} failed`, 'warning');
    }
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time (ms)
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export functions
export {
    initUploadConfigManager,
    searchConfigs,
    loadConfigList,
    viewConfig,
    deleteConfig,
    closeConfigModal,
    copyConfigContent,
    reloadConfig
};