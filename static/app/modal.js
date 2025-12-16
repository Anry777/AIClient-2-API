// Modal management module

import { showToast, getFieldLabel, getProviderTypeFields } from './utils.js';
import { handleProviderPasswordToggle } from './event-handlers.js';

// Pagination configuration
const PROVIDERS_PER_PAGE = 5;
let currentPage = 1;
let currentProviders = [];
let currentProviderType = '';
let cachedModels = []; // Cached model list

/**
 * Show provider management modal
 * @param {Object} data - Provider data
 */
function showProviderManagerModal(data) {
    const { providerType, providers, totalCount, healthyCount } = data;
    
    // Save current data for pagination
    currentProviders = providers;
    currentProviderType = providerType;
    currentPage = 1;
    cachedModels = [];
    
    // Remove existing modal
    const existingModal = document.querySelector('.provider-modal');
    if (existingModal) {
        // Clean up event listeners
        if (existingModal.cleanup) {
            existingModal.cleanup();
        }
        existingModal.remove();
    }
    
    const totalPages = Math.ceil(providers.length / PROVIDERS_PER_PAGE);
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'provider-modal';
    modal.setAttribute('data-provider-type', providerType);
    modal.innerHTML = `
        <div class="provider-modal-content">
            <div class="provider-modal-header">
                <h3><i class="fas fa-cogs"></i> Manage ${providerType} Provider Configuration</h3>
                <button class="modal-close" onclick="window.closeProviderModal(this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="provider-modal-body">
                <div class="provider-summary">
                    <div class="provider-summary-item">
                        <span class="label">Total Accounts:</span>
                        <span class="value">${totalCount}</span>
                    </div>
                    <div class="provider-summary-item">
                        <span class="label">Healthy Accounts:</span>
                        <span class="value">${healthyCount}</span>
                    </div>
                    <div class="provider-summary-actions">
                        <button class="btn btn-success" onclick="window.showAddProviderForm('${providerType}')">
                            <i class="fas fa-plus"></i> Add New Provider
                        </button>
                        <button class="btn btn-warning" onclick="window.resetAllProvidersHealth('${providerType}')" title="Reset all nodes to healthy status">
                            <i class="fas fa-heartbeat"></i> Reset to Healthy
                        </button>
                        <button class="btn btn-info" onclick="window.performHealthCheck('${providerType}')" title="Perform health check on all nodes">
                            <i class="fas fa-stethoscope"></i> Health Check
                        </button>
                    </div>
                </div>
                
                ${totalPages > 1 ? renderPagination(1, totalPages, providers.length) : ''}
                
                <div class="provider-list" id="providerList">
                    ${renderProviderListPaginated(providers, 1)}
                </div>
                
                ${totalPages > 1 ? renderPagination(1, totalPages, providers.length, 'bottom') : ''}
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(modal);
    
    // Add modal event listeners
    addModalEventListeners(modal);
    
    // First get model list for this provider type (only call API once)
    const pageProviders = providers.slice(0, PROVIDERS_PER_PAGE);
    loadModelsForProviderType(providerType, pageProviders);
}

/**
 * Render pagination controls
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total pages
 * @param {number} totalItems - Total items
 * @param {string} position - Position identifier (top/bottom)
 * @returns {string} HTML string
 */
function renderPagination(page, totalPages, totalItems, position = 'top') {
    const startItem = (page - 1) * PROVIDERS_PER_PAGE + 1;
    const endItem = Math.min(page * PROVIDERS_PER_PAGE, totalItems);
    
    // Generate page number buttons
    let pageButtons = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
        pageButtons += `<button class="page-btn" onclick="window.goToProviderPage(1)">1</button>`;
        if (startPage > 2) {
            pageButtons += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pageButtons += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="window.goToProviderPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageButtons += `<span class="page-ellipsis">...</span>`;
        }
        pageButtons += `<button class="page-btn" onclick="window.goToProviderPage(${totalPages})">${totalPages}</button>`;
    }
    
    return `
        <div class="pagination-container ${position}" data-position="${position}">
            <div class="pagination-info">
                Showing ${startItem}-${endItem} / Total ${totalItems}
            </div>
            <div class="pagination-controls">
                <button class="page-btn nav-btn" onclick="window.goToProviderPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                ${pageButtons}
                <button class="page-btn nav-btn" onclick="window.goToProviderPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="pagination-jump">
                <span>Jump to</span>
                <input type="number" min="1" max="${totalPages}" value="${page}" 
                       onkeypress="if(event.key==='Enter')window.goToProviderPage(parseInt(this.value))"
                       class="page-jump-input">
                <span>page</span>
            </div>
        </div>
    `;
}

/**
 * Jump to specified page
 * @param {number} page - Target page number
 */
function goToProviderPage(page) {
    const totalPages = Math.ceil(currentProviders.length / PROVIDERS_PER_PAGE);
    
    // Validate page number range
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    
    currentPage = page;
    
    // Update provider list
    const providerList = document.getElementById('providerList');
    if (providerList) {
        providerList.innerHTML = renderProviderListPaginated(currentProviders, page);
    }
    
    // Update pagination controls
    const paginationContainers = document.querySelectorAll('.pagination-container');
    paginationContainers.forEach(container => {
        const position = container.getAttribute('data-position');
        container.outerHTML = renderPagination(page, totalPages, currentProviders.length, position);
    });
    
    // Scroll to top
    const modalBody = document.querySelector('.provider-modal-body');
    if (modalBody) {
        modalBody.scrollTop = 0;
    }
    
    // Load model list for providers on current page
    const startIndex = (page - 1) * PROVIDERS_PER_PAGE;
    const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, currentProviders.length);
    const pageProviders = currentProviders.slice(startIndex, endIndex);
    
    // If model list is cached, use it directly
    if (cachedModels.length > 0) {
        pageProviders.forEach(provider => {
            renderNotSupportedModelsSelector(provider.uuid, cachedModels, provider.notSupportedModels || []);
        });
    } else {
        loadModelsForProviderType(currentProviderType, pageProviders);
    }
}

/**
 * Render paginated provider list
 * @param {Array} providers - Provider array
 * @param {number} page - Current page number
 * @returns {string} HTML string
 */
function renderProviderListPaginated(providers, page) {
    const startIndex = (page - 1) * PROVIDERS_PER_PAGE;
    const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, providers.length);
    const pageProviders = providers.slice(startIndex, endIndex);
    
    return renderProviderList(pageProviders);
}

/**
 * Load model list for provider type (optimized: only call API once and cache results)
 * @param {string} providerType - Provider type
 * @param {Array} providers - Provider list
 */
async function loadModelsForProviderType(providerType, providers) {
    try {
        // If already cached, use directly
        if (cachedModels.length > 0) {
            providers.forEach(provider => {
                renderNotSupportedModelsSelector(provider.uuid, cachedModels, provider.notSupportedModels || []);
            });
            return;
        }
        
        // Only call API once to get model list
        const response = await window.apiClient.get(`/provider-models/${encodeURIComponent(providerType)}`);
        const models = response.models || [];
        
        // Cache model list
        cachedModels = models;
        
        // Render model selector for each provider
        providers.forEach(provider => {
            renderNotSupportedModelsSelector(provider.uuid, models, provider.notSupportedModels || []);
        });
    } catch (error) {
        console.error('Failed to load models for provider type:', error);
        // If loading fails, show error message for each provider
        providers.forEach(provider => {
            const container = document.querySelector(`.not-supported-models-container[data-uuid="${provider.uuid}"]`);
            if (container) {
                container.innerHTML = '<div class="error-message">Failed to load model list</div>';
            }
        });
    }
}

/**
 * Add event listeners to modal
 * @param {HTMLElement} modal - Modal element
 */
function addModalEventListeners(modal) {
    // Close modal on ESC key
    const handleEscKey = (event) => {
        if (event.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // Close modal on background click
    const handleBackgroundClick = (event) => {
        if (event.target === modal) {
            modal.remove();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    
    // Prevent modal from closing when clicking on content area
    const modalContent = modal.querySelector('.provider-modal-content');
    const handleContentClick = (event) => {
        event.stopPropagation();
    };
    
    // Password toggle button event handler
    const handlePasswordToggleClick = (event) => {
        const button = event.target.closest('.password-toggle');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            handleProviderPasswordToggle(button);
        }
    };
    
    // Upload button event handler
    const handleUploadButtonClick = (event) => {
        const button = event.target.closest('.upload-btn');
        if (button) {
            event.preventDefault();
            event.stopPropagation();
            const targetInputId = button.getAttribute('data-target');
            const providerType = modal.getAttribute('data-provider-type');
            if (targetInputId && window.fileUploadHandler) {
                window.fileUploadHandler.handleFileUpload(button, targetInputId, providerType);
            }
        }
    };
    
    // Add event listeners
    document.addEventListener('keydown', handleEscKey);
    modal.addEventListener('click', handleBackgroundClick);
    if (modalContent) {
        modalContent.addEventListener('click', handleContentClick);
        modalContent.addEventListener('click', handlePasswordToggleClick);
        modalContent.addEventListener('click', handleUploadButtonClick);
    }
    
    // Cleanup function, called when modal closes
    modal.cleanup = () => {
        document.removeEventListener('keydown', handleEscKey);
        modal.removeEventListener('click', handleBackgroundClick);
        if (modalContent) {
            modalContent.removeEventListener('click', handleContentClick);
            modalContent.removeEventListener('click', handlePasswordToggleClick);
            modalContent.removeEventListener('click', handleUploadButtonClick);
        }
    };
}

/**
 * Close modal and clean up event listeners
 * @param {HTMLElement} button - Close button
 */
function closeProviderModal(button) {
    const modal = button.closest('.provider-modal');
    if (modal) {
        if (modal.cleanup) {
            modal.cleanup();
        }
        modal.remove();
    }
}

/**
 * Render provider list
 * @param {Array} providers - Provider array
 * @returns {string} HTML string
 */
function renderProviderList(providers) {
    return providers.map(provider => {
        const isHealthy = provider.isHealthy;
        const isDisabled = provider.isDisabled || false;
        const lastUsed = provider.lastUsed ? new Date(provider.lastUsed).toLocaleString() : 'Never used';
        const lastHealthCheckTime = provider.lastHealthCheckTime ? new Date(provider.lastHealthCheckTime).toLocaleString() : 'Never checked';
        const lastHealthCheckModel = provider.lastHealthCheckModel || '-';
        const healthClass = isHealthy ? 'healthy' : 'unhealthy';
        const disabledClass = isDisabled ? 'disabled' : '';
        const healthIcon = isHealthy ? 'fas fa-check-circle text-success' : 'fas fa-exclamation-triangle text-warning';
        const healthText = isHealthy ? 'Healthy' : 'Unhealthy';
        const disabledText = isDisabled ? 'Disabled' : 'Enabled';
        const disabledIcon = isDisabled ? 'fas fa-ban text-muted' : 'fas fa-play text-success';
        const toggleButtonText = isDisabled ? 'Enable' : 'Disable';
        const toggleButtonIcon = isDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isDisabled ? 'btn-success' : 'btn-warning';
        
        // Build error info display
        let errorInfoHtml = '';
        if (!isHealthy && provider.lastErrorMessage) {
            const escapedErrorMsg = provider.lastErrorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            errorInfoHtml = `
                <div class="provider-error-info">
                    <i class="fas fa-exclamation-circle text-danger"></i>
                    <span class="error-label">Last Error:</span>
                    <span class="error-message" title="${escapedErrorMsg}">${escapedErrorMsg}</span>
                </div>
            `;
        }
        
        return `
            <div class="provider-item-detail ${healthClass} ${disabledClass}" data-uuid="${provider.uuid}">
                <div class="provider-item-header" onclick="window.toggleProviderDetails('${provider.uuid}')">
                    <div class="provider-info">
                        <div class="provider-name">${provider.uuid}</div>
                        <div class="provider-meta">
                            <span class="health-status">
                                <i class="${healthIcon}"></i>
                                Health: ${healthText}
                            </span> |
                            <span class="disabled-status">
                                <i class="${disabledIcon}"></i>
                                Status: ${disabledText}
                            </span> |
                            Usage: ${provider.usageCount || 0} |
                            Errors: ${provider.errorCount || 0} |
                            Last Used: ${lastUsed}
                        </div>
                        <div class="provider-health-meta">
                            <span class="health-check-time">
                                <i class="fas fa-clock"></i>
                                Last Check: ${lastHealthCheckTime}
                            </span> |
                            <span class="health-check-model">
                                <i class="fas fa-cube"></i>
                                Check Model: ${lastHealthCheckModel}
                            </span>
                        </div>
                        ${errorInfoHtml}
                    </div>
                    <div class="provider-actions-group">
                        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${provider.uuid}', event)" title="${toggleButtonText} this provider">
                            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
                        </button>
                        <button class="btn-small btn-edit" onclick="window.editProvider('${provider.uuid}', event)">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn-small btn-delete" onclick="window.deleteProvider('${provider.uuid}', event)">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
                <div class="provider-item-content" id="content-${provider.uuid}">
                    <div class="">
                        ${renderProviderConfig(provider)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render provider configuration
 * @param {Object} provider - Provider object
 * @returns {string} HTML string
 */
function renderProviderConfig(provider) {
    // Get field mapping, ensure consistent order
    const fieldOrder = getFieldOrder(provider);
    
    // First render basic config fields (checkModelName and checkHealth)
    let html = '<div class="form-grid">';
    const baseFields = ['checkModelName', 'checkHealth'];
    
    baseFields.forEach(fieldKey => {
        const displayLabel = getFieldLabel(fieldKey);
        const value = provider[fieldKey];
        const displayValue = value || '';
        
        // If checkHealth field, use dropdown selector
        if (fieldKey === 'checkHealth') {
            // If no value, default to false
            const actualValue = value !== undefined ? value : false;
            const isEnabled = actualValue === true || actualValue === 'true';
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <select class="form-control"
                            data-config-key="${fieldKey}"
                            data-config-value="${actualValue}"
                            disabled>
                        <option value="true" ${isEnabled ? 'selected' : ''}>Enabled</option>
                        <option value="false" ${!isEnabled ? 'selected' : ''}>Disabled</option>
                    </select>
                </div>
            `;
        } else {
            // checkModelName field always displayed
            html += `
                <div class="config-item">
                    <label>${displayLabel}</label>
                    <input type="text"
                           value="${displayValue}"
                           readonly
                           data-config-key="${fieldKey}"
                           data-config-value="${value || ''}">
                </div>
            `;
        }
    });
    html += '</div>';
    
    // Render other config fields, 2 columns per row
    const otherFields = fieldOrder.filter(key => !baseFields.includes(key));
    
    for (let i = 0; i < otherFields.length; i += 2) {
        html += '<div class="form-grid">';
        
        const field1Key = otherFields[i];
        const field1Label = getFieldLabel(field1Key);
        const field1Value = provider[field1Key];
        const field1IsPassword = field1Key.toLowerCase().includes('key') || field1Key.toLowerCase().includes('password');
        const field1IsOAuthFilePath = field1Key.includes('OAUTH_CREDS_FILE_PATH');
        const field1DisplayValue = field1IsPassword && field1Value ? '••••••••' : (field1Value || '');
        
        if (field1IsPassword) {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="password-input-wrapper">
                        <input type="password"
                               value="${field1DisplayValue}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${field1Value || ''}">
                        <button type="button" class="password-toggle" data-target="${field1Key}">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `;
        } else if (field1IsOAuthFilePath) {
            // OAuth凭据文件路径字段，添加上传按钮
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <div class="file-input-group">
                        <input type="text"
                               id="edit-${provider.uuid}-${field1Key}"
                               value="${field1Value || ''}"
                               readonly
                               data-config-key="${field1Key}"
                               data-config-value="${field1Value || ''}">
                        <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field1Key}" aria-label="Upload file" disabled>
                            <i class="fas fa-upload"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="config-item">
                    <label>${field1Label}</label>
                    <input type="text"
                           value="${field1DisplayValue}"
                           readonly
                           data-config-key="${field1Key}"
                           data-config-value="${field1Value || ''}">
                </div>
            `;
        }
        
        // If there is a second field
        if (i + 1 < otherFields.length) {
            const field2Key = otherFields[i + 1];
            const field2Label = getFieldLabel(field2Key);
            const field2Value = provider[field2Key];
            const field2IsPassword = field2Key.toLowerCase().includes('key') || field2Key.toLowerCase().includes('password');
            const field2IsOAuthFilePath = field2Key.includes('OAUTH_CREDS_FILE_PATH');
            const field2DisplayValue = field2IsPassword && field2Value ? '••••••••' : (field2Value || '');
            
            if (field2IsPassword) {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="password-input-wrapper">
                            <input type="password"
                                   value="${field2DisplayValue}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${field2Value || ''}">
                            <button type="button" class="password-toggle" data-target="${field2Key}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (field2IsOAuthFilePath) {
                // OAuth凭据文件路径字段，添加上传按钮
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <div class="file-input-group">
                            <input type="text"
                                   id="edit-${provider.uuid}-${field2Key}"
                                   value="${field2Value || ''}"
                                   readonly
                                   data-config-key="${field2Key}"
                                   data-config-value="${field2Value || ''}">
                            <button type="button" class="btn btn-outline upload-btn" data-target="edit-${provider.uuid}-${field2Key}" aria-label="Upload file" disabled>
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="config-item">
                        <label>${field2Label}</label>
                        <input type="text"
                               value="${field2DisplayValue}"
                               readonly
                               data-config-key="${field2Key}"
                               data-config-value="${field2Value || ''}">
                    </div>
                `;
            }
        }
        
        html += '</div>';
    }
    
    // Add notSupportedModels configuration area
    html += '<div class="form-grid full-width">';
    html += `
        <div class="config-item not-supported-models-section">
            <label>
                <i class="fas fa-ban"></i> Unsupported Models
                <span class="help-text">Select models not supported by this provider, system will automatically exclude them</span>
            </label>
            <div class="not-supported-models-container" data-uuid="${provider.uuid}">
                <div class="models-loading">
                    <i class="fas fa-spinner fa-spin"></i> Loading model list...
                </div>
            </div>
        </div>
    `;
    html += '</div>';
    
    return html;
}

/**
 * Get field display order
 * @param {Object} provider - Provider object
 * @returns {Array} Field key array
 */
function getFieldOrder(provider) {
    const orderedFields = ['checkModelName', 'checkHealth'];
    
    // Internal state fields to exclude
    const excludedFields = [
        'isHealthy', 'lastUsed', 'usageCount', 'errorCount', 'lastErrorTime',
        'uuid', 'isDisabled', 'lastHealthCheckTime', 'lastHealthCheckModel', 'lastErrorMessage'
    ];
    
    // Get all other config items
    const otherFields = Object.keys(provider).filter(key =>
        !excludedFields.includes(key) && !orderedFields.includes(key)
    );
    
    // Sort other fields alphabetically
    otherFields.sort();
    
    return [...orderedFields, ...otherFields].filter(key => provider.hasOwnProperty(key));
}

/**
 * Toggle provider details display
 * @param {string} uuid - Provider UUID
 */
function toggleProviderDetails(uuid) {
    const content = document.getElementById(`content-${uuid}`);
    if (content) {
        content.classList.toggle('expanded');
    }
}

/**
 * Edit provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
function editProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const content = providerDetail.querySelector(`#content-${uuid}`);
    
    // If not expanded yet, automatically expand edit box
    if (content && !content.classList.contains('expanded')) {
        toggleProviderDetails(uuid);
    }
    
    // Wait a moment for expand animation to complete, then switch inputs to editable state
    setTimeout(() => {
        // Switch inputs to editable state
        configInputs.forEach(input => {
            input.readOnly = false;
            if (input.type === 'password') {
                const actualValue = input.dataset.configValue;
                input.value = actualValue;
            }
        });
        
        // Enable file upload buttons
        const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
        uploadButtons.forEach(button => {
            button.disabled = false;
        });
        
        // Enable dropdown selectors
        configSelects.forEach(select => {
            select.disabled = false;
        });
        
        // Enable model checkboxes
        const modelCheckboxes = providerDetail.querySelectorAll('.model-checkbox');
        modelCheckboxes.forEach(checkbox => {
            checkbox.disabled = false;
        });
        
        // Add editing state class
        providerDetail.classList.add('editing');
        
        // Replace edit button with save and cancel buttons, but keep disable/enable button
        const actionsGroup = providerDetail.querySelector('.provider-actions-group');
        const toggleButton = actionsGroup.querySelector('[onclick*="toggleProviderStatus"]');
        const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
        const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
        const toggleButtonText = isCurrentlyDisabled ? 'Enable' : 'Disable';
        const toggleButtonIcon = isCurrentlyDisabled ? 'fas fa-play' : 'fas fa-ban';
        const toggleButtonClass = isCurrentlyDisabled ? 'btn-success' : 'btn-warning';
        
        actionsGroup.innerHTML = `
            <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${uuid}', event)" title="${toggleButtonText} this provider">
                <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
            </button>
            <button class="btn-small btn-save" onclick="window.saveProvider('${uuid}', event)">
                <i class="fas fa-save"></i> Save
            </button>
            <button class="btn-small btn-cancel" onclick="window.cancelEdit('${uuid}', event)">
                <i class="fas fa-times"></i> Cancel
            </button>
        `;
    }, 100);
}

/**
 * Cancel edit
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
function cancelEdit(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    
    // Restore inputs to read-only state
    configInputs.forEach(input => {
        input.readOnly = true;
        // Restore display to password format (if applicable)
        if (input.type === 'password') {
            const actualValue = input.dataset.configValue;
            input.value = actualValue ? '••••••••' : '';
        }
    });
    
    // Disable model checkboxes
    const modelCheckboxes = providerDetail.querySelectorAll('.model-checkbox');
    modelCheckboxes.forEach(checkbox => {
        checkbox.disabled = true;
    });
    
    // Remove editing state class
    providerDetail.classList.remove('editing');
    
    // Disable file upload buttons
    const uploadButtons = providerDetail.querySelectorAll('.upload-btn');
    uploadButtons.forEach(button => {
        button.disabled = true;
    });
    
    // Disable dropdown selectors
    configSelects.forEach(select => {
        select.disabled = true;
        // Restore original value
        const originalValue = select.dataset.configValue;
        select.value = originalValue || '';
    });
    
    // Restore original edit and delete buttons, but keep disable/enable button
    const actionsGroup = providerDetail.querySelector('.provider-actions-group');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const toggleButtonText = isCurrentlyDisabled ? 'Enable' : 'Disable';
    const toggleButtonIcon = isCurrentlyDisabled ? 'fas fa-play' : 'fas fa-ban';
    const toggleButtonClass = isCurrentlyDisabled ? 'btn-success' : 'btn-warning';
    
    actionsGroup.innerHTML = `
        <button class="btn-small ${toggleButtonClass}" onclick="window.toggleProviderStatus('${uuid}', event)" title="${toggleButtonText} this provider">
            <i class="${toggleButtonIcon}"></i> ${toggleButtonText}
        </button>
        <button class="btn-small btn-edit" onclick="window.editProvider('${uuid}', event)">
            <i class="fas fa-edit"></i> Edit
        </button>
        <button class="btn-small btn-delete" onclick="window.deleteProvider('${uuid}', event)">
            <i class="fas fa-trash"></i> Delete
        </button>
    `;
}

/**
 * Save provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function saveProvider(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    const configInputs = providerDetail.querySelectorAll('input[data-config-key]');
    const configSelects = providerDetail.querySelectorAll('select[data-config-key]');
    const providerConfig = {};
    
    configInputs.forEach(input => {
        const key = input.dataset.configKey;
        const value = input.value;
        providerConfig[key] = value;
    });
    
    configSelects.forEach(select => {
        const key = select.dataset.configKey;
        const value = select.value === 'true';
        providerConfig[key] = value;
    });
    
    // Collect unsupported models list
    const modelCheckboxes = providerDetail.querySelectorAll(`.model-checkbox[data-uuid="${uuid}"]:checked`);
    const notSupportedModels = Array.from(modelCheckboxes).map(checkbox => checkbox.value);
    providerConfig.notSupportedModels = notSupportedModels;
    
    try {
        await window.apiClient.put(`/providers/${encodeURIComponent(providerType)}/${uuid}`, { providerConfig });
        await window.apiClient.post('/reload-config');
        showToast('Provider configuration updated successfully', 'success');
        // 重新获取该提供商类型的最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to update provider:', error);
        showToast('Update failed: ' + error.message, 'error');
    }
}

/**
 * Delete provider
 * @param {string} uuid - Provider UUID
 * @param {Event} event - Event object
 */
async function deleteProvider(uuid, event) {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this provider configuration? This action cannot be undone.')) {
        return;
    }
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    
    try {
        await window.apiClient.delete(`/providers/${encodeURIComponent(providerType)}/${uuid}`);
        await window.apiClient.post('/reload-config');
        showToast('Provider configuration deleted successfully', 'success');
        // 重新获取最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to delete provider:', error);
        showToast('Delete failed: ' + error.message, 'error');
    }
}

/**
 * Refresh and reload provider config
 * @param {string} providerType - Provider type
 */
async function refreshProviderConfig(providerType) {
    try {
        // Re-fetch latest data for this provider type
        const data = await window.apiClient.get(`/providers/${encodeURIComponent(providerType)}`);
        
        // If currently displaying modal for this provider type, update modal
        const modal = document.querySelector('.provider-modal');
        if (modal && modal.getAttribute('data-provider-type') === providerType) {
            // Update cached provider data
            currentProviders = data.providers;
            currentProviderType = providerType;
            
            // Update statistics
            const totalCountElement = modal.querySelector('.provider-summary-item .value');
            if (totalCountElement) {
                totalCountElement.textContent = data.totalCount;
            }
            
            const healthyCountElement = modal.querySelectorAll('.provider-summary-item .value')[1];
            if (healthyCountElement) {
                healthyCountElement.textContent = data.healthyCount;
            }
            
            const totalPages = Math.ceil(data.providers.length / PROVIDERS_PER_PAGE);
            
            // Ensure current page doesn't exceed total pages
            if (currentPage > totalPages) {
                currentPage = Math.max(1, totalPages);
            }
            
            // Re-render provider list (paginated)
            const providerList = modal.querySelector('.provider-list');
            if (providerList) {
                providerList.innerHTML = renderProviderListPaginated(data.providers, currentPage);
            }
            
            // Update pagination controls
            const paginationContainers = modal.querySelectorAll('.pagination-container');
            if (totalPages > 1) {
                paginationContainers.forEach(container => {
                    const position = container.getAttribute('data-position');
                    container.outerHTML = renderPagination(currentPage, totalPages, data.providers.length, position);
                });
                
                // If no pagination controls before, need to add
                if (paginationContainers.length === 0) {
                    const modalBody = modal.querySelector('.provider-modal-body');
                    const providerListEl = modal.querySelector('.provider-list');
                    if (modalBody && providerListEl) {
                        providerListEl.insertAdjacentHTML('beforebegin', renderPagination(currentPage, totalPages, data.providers.length, 'top'));
                        providerListEl.insertAdjacentHTML('afterend', renderPagination(currentPage, totalPages, data.providers.length, 'bottom'));
                    }
                }
            } else {
                // If only one page, remove pagination controls
                paginationContainers.forEach(container => container.remove());
            }
            
            // Reload model list for current page
            const startIndex = (currentPage - 1) * PROVIDERS_PER_PAGE;
            const endIndex = Math.min(startIndex + PROVIDERS_PER_PAGE, data.providers.length);
            const pageProviders = data.providers.slice(startIndex, endIndex);
            loadModelsForProviderType(providerType, pageProviders);
        }
        
        // Also update provider statistics on main interface
        if (typeof window.loadProviders === 'function') {
            await window.loadProviders();
        }
        
    } catch (error) {
        console.error('Failed to refresh provider config:', error);
    }
}

/**
 * Show add provider form
 * @param {string} providerType - Provider type
 */
function showAddProviderForm(providerType) {
    const modal = document.querySelector('.provider-modal');
    const existingForm = modal.querySelector('.add-provider-form');
    
    if (existingForm) {
        existingForm.remove();
        return;
    }
    
    const form = document.createElement('div');
    form.className = 'add-provider-form';
    form.innerHTML = `
        <h4><i class="fas fa-plus"></i> Add New Provider Configuration</h4>
        <div class="form-grid">
            <div class="form-group">
                <label>Check Model Name <span class="optional-mark">(Optional)</span></label>
                <input type="text" id="newCheckModelName" placeholder="e.g.: gpt-3.5-turbo">
            </div>
            <div class="form-group">
                <label>Health Check</label>
                <select id="newCheckHealth">
                    <option value="false">Disabled</option>
                    <option value="true">Enabled</option>
                </select>
            </div>
        </div>
        <div id="dynamicConfigFields">
            <!-- Dynamic config fields will be displayed here -->
        </div>
        <div class="form-actions" style="margin-top: 15px;">
            <button class="btn btn-success" onclick="window.addProvider('${providerType}')">
                <i class="fas fa-save"></i> Save
            </button>
            <button class="btn btn-secondary" onclick="this.closest('.add-provider-form').remove()">
                <i class="fas fa-times"></i> Cancel
            </button>
        </div>
    `;
    
    // Add dynamic config fields
    addDynamicConfigFields(form, providerType);
    
    // Bind event listeners for password toggle buttons in add form
    bindAddFormPasswordToggleListeners(form);
    
    // Insert before provider list
    const providerList = modal.querySelector('.provider-list');
    providerList.parentNode.insertBefore(form, providerList);
}

/**
 * Add dynamic config fields
 * @param {HTMLElement} form - Form element
 * @param {string} providerType - Provider type
 */
function addDynamicConfigFields(form, providerType) {
    const configFields = form.querySelector('#dynamicConfigFields');
    
    // Get field config for this provider type
    const providerFields = getProviderTypeFields(providerType);
    let fields = '';
    
    if (providerFields.length > 0) {
        // 分组显示，每行两个字段
        for (let i = 0; i < providerFields.length; i += 2) {
            fields += '<div class="form-grid">';
            
            const field1 = providerFields[i];
            // 检查是否为密码类型字段
            const isPassword1 = field1.type === 'password';
            // 检查是否为OAuth凭据文件路径字段
            const isOAuthFilePath1 = field1.id.includes('OauthCredsFilePath');
            
            if (isPassword1) {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <div class="password-input-wrapper">
                            <input type="password" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                            <button type="button" class="password-toggle" data-target="new${field1.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (isOAuthFilePath1) {
                // OAuth凭据文件路径字段，添加上传按钮
                const isKiroField = field1.id.includes('Kiro');
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <div class="file-input-group">
                            <input type="text" id="new${field1.id}" class="form-control" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                            <button type="button" class="btn btn-outline upload-btn" data-target="new${field1.id}" aria-label="上传文件">
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                        ${isKiroField ? '<small class="form-text"><i class="fas fa-info-circle"></i> 使用 AWS 登录方式时，请确保授权文件中包含 <code>clientId</code> 和 <code>clientSecret</code> 字段</small>' : ''}
                    </div>
                `;
            } else {
                fields += `
                    <div class="form-group">
                        <label>${field1.label}</label>
                        <input type="${field1.type}" id="new${field1.id}" placeholder="${field1.placeholder || ''}" value="${field1.value || ''}">
                    </div>
                `;
            }
            
            const field2 = providerFields[i + 1];
            if (field2) {
                // 检查是否为密码类型字段
                const isPassword2 = field2.type === 'password';
                // 检查是否为OAuth凭据文件路径字段
                const isOAuthFilePath2 = field2.id.includes('OauthCredsFilePath');
                
                if (isPassword2) {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                                <button type="button" class="password-toggle" data-target="new${field2.id}">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    `;
                } else if (isOAuthFilePath2) {
                    // OAuth凭据文件路径字段，添加上传按钮
                    const isKiroField = field2.id.includes('Kiro');
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <div class="file-input-group">
                                <input type="text" id="new${field2.id}" class="form-control" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                                <button type="button" class="btn btn-outline upload-btn" data-target="new${field2.id}" aria-label="上传文件">
                                    <i class="fas fa-upload"></i>
                                </button>
                            </div>
                            ${isKiroField ? '<small class="form-text"><i class="fas fa-info-circle"></i> 使用 AWS 登录方式时，请确保授权文件中包含 <code>clientId</code> 和 <code>clientSecret</code> 字段</small>' : ''}
                        </div>
                    `;
                } else {
                    fields += `
                        <div class="form-group">
                            <label>${field2.label}</label>
                            <input type="${field2.type}" id="new${field2.id}" placeholder="${field2.placeholder || ''}" value="${field2.value || ''}">
                        </div>
                    `;
                }
            }
            
            fields += '</div>';
        }
    } else {
        fields = '<p>不支持的提供商类型</p>';
    }
    
    configFields.innerHTML = fields;
}

/**
 * 为添加新提供商表单中的密码切换按钮绑定事件监听器
 * @param {HTMLElement} form - 表单元素
 */
function bindAddFormPasswordToggleListeners(form) {
    const passwordToggles = form.querySelectorAll('.password-toggle');
    passwordToggles.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = this.querySelector('i');
            
            if (!input || !icon) return;
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        });
    });
}

/**
 * 添加新提供商
 * @param {string} providerType - 提供商类型
 */
async function addProvider(providerType) {
    const checkModelName = document.getElementById('newCheckModelName')?.value;
    const checkHealth = document.getElementById('newCheckHealth')?.value === 'true';
    
    const providerConfig = {
        checkModelName: checkModelName || '', // 允许为空
        checkHealth
    };
    
    // 根据提供商类型收集配置
    switch (providerType) {
        case 'openai-custom':
            providerConfig.OPENAI_API_KEY = document.getElementById('newOpenaiApiKey')?.value || '';
            providerConfig.OPENAI_BASE_URL = document.getElementById('newOpenaiBaseUrl')?.value || '';
            break;
        case 'openaiResponses-custom':
            providerConfig.OPENAI_API_KEY = document.getElementById('newOpenaiApiKey')?.value || '';
            providerConfig.OPENAI_BASE_URL = document.getElementById('newOpenaiBaseUrl')?.value || '';
            break;
        case 'claude-custom':
            providerConfig.CLAUDE_API_KEY = document.getElementById('newClaudeApiKey')?.value || '';
            providerConfig.CLAUDE_BASE_URL = document.getElementById('newClaudeBaseUrl')?.value || '';
            break;
        case 'gemini-cli-oauth':
            providerConfig.PROJECT_ID = document.getElementById('newProjectId')?.value || '';
            providerConfig.GEMINI_OAUTH_CREDS_FILE_PATH = document.getElementById('newGeminiOauthCredsFilePath')?.value || '';
            break;
        case 'claude-kiro-oauth':
            providerConfig.KIRO_OAUTH_CREDS_FILE_PATH = document.getElementById('newKiroOauthCredsFilePath')?.value || '';
            break;
        case 'openai-qwen-oauth':
            providerConfig.QWEN_OAUTH_CREDS_FILE_PATH = document.getElementById('newQwenOauthCredsFilePath')?.value || '';
            break;
        case 'gemini-antigravity':
            providerConfig.PROJECT_ID = document.getElementById('newProjectId')?.value || '';
            providerConfig.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH = document.getElementById('newAntigravityOauthCredsFilePath')?.value || '';
            break;
    }
    
    try {
        await window.apiClient.post('/providers', {
            providerType,
            providerConfig
        });
        await window.apiClient.post('/reload-config');
        showToast('Provider configuration added successfully', 'success');
        // 移除添加表单
        const form = document.querySelector('.add-provider-form');
        if (form) {
            form.remove();
        }
        // 重新获取最新配置数据
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to add provider:', error);
        showToast('Add failed: ' + error.message, 'error');
    }
}

/**
 * 切换提供商禁用/启用状态
 * @param {string} uuid - 提供商UUID
 * @param {Event} event - 事件对象
 */
async function toggleProviderStatus(uuid, event) {
    event.stopPropagation();
    
    const providerDetail = event.target.closest('.provider-item-detail');
    const providerType = providerDetail.closest('.provider-modal').getAttribute('data-provider-type');
    const currentProvider = providerDetail.closest('.provider-modal').querySelector(`[data-uuid="${uuid}"]`);
    
    // 获取当前提供商信息
    const isCurrentlyDisabled = currentProvider.classList.contains('disabled');
    const action = isCurrentlyDisabled ? 'enable' : 'disable';
    const confirmMessage = isCurrentlyDisabled ?
        `Are you sure you want to enable this provider configuration?` :
        `Are you sure you want to disable this provider configuration? After disabling, it will not be selected for use.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        await window.apiClient.post(`/providers/${encodeURIComponent(providerType)}/${uuid}/${action}`, { action });
        await window.apiClient.post('/reload-config');
        showToast(`Provider ${isCurrentlyDisabled ? 'enabled' : 'disabled'} successfully`, 'success');
        // 重新获取该提供商类型的最新配置
        await refreshProviderConfig(providerType);
    } catch (error) {
        console.error('Failed to toggle provider status:', error);
        showToast(`Operation failed: ${error.message}`, 'error');
    }
}

/**
 * 重置所有提供商的健康状态
 * @param {string} providerType - 提供商类型
 */
async function resetAllProvidersHealth(providerType) {
    if (!confirm(`Are you sure you want to reset all ${providerType} nodes to healthy status?\n\nThis will clear error counts and error timestamps for all nodes.`)) {
        return;
    }
    
    try {
        showToast('Resetting health status...', 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/reset-health`,
            {}
        );
        
        if (response.success) {
            showToast(`Successfully reset health status for ${response.resetCount} node(s)`, 'success');
            
            // 重新加载配置
            await window.apiClient.post('/reload-config');
            
            // 刷新提供商配置显示
            await refreshProviderConfig(providerType);
        } else {
            showToast('Failed to reset health status', 'error');
        }
    } catch (error) {
        console.error('Failed to reset health status:', error);
        showToast(`Failed to reset health status: ${error.message}`, 'error');
    }
}

/**
 * 执行健康检测
 * @param {string} providerType - 提供商类型
 */
async function performHealthCheck(providerType) {
    if (!confirm(`Are you sure you want to perform health check on all ${providerType} nodes?\n\nThis will send test requests to each node to verify availability.`)) {
        return;
    }
    
    try {
        showToast('Performing health check, please wait...', 'info');
        
        const response = await window.apiClient.post(
            `/providers/${encodeURIComponent(providerType)}/health-check`,
            {}
        );
        
        if (response.success) {
            const { successCount, failCount, totalCount, results } = response;
            
            // 统计跳过的数量（checkHealth 未启用的）
            const skippedCount = results ? results.filter(r => r.success === null).length : 0;
            
            let message = `Health check completed: ${successCount} healthy`;
            if (failCount > 0) message += `, ${failCount} unhealthy`;
            if (skippedCount > 0) message += `, ${skippedCount} skipped (disabled)`;
            
            showToast(message, failCount > 0 ? 'warning' : 'success');
            
            // 重新加载配置
            await window.apiClient.post('/reload-config');
            
            // 刷新提供商配置显示
            await refreshProviderConfig(providerType);
        } else {
            showToast('Health check failed', 'error');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        showToast(`Health check failed: ${error.message}`, 'error');
    }
}

/**
 * 渲染不支持的模型选择器（不调用API，直接使用传入的模型列表）
 * @param {string} uuid - 提供商UUID
 * @param {Array} models - 模型列表
 * @param {Array} notSupportedModels - 当前不支持的模型列表
 */
function renderNotSupportedModelsSelector(uuid, models, notSupportedModels = []) {
    const container = document.querySelector(`.not-supported-models-container[data-uuid="${uuid}"]`);
    if (!container) return;
    
    if (models.length === 0) {
        container.innerHTML = '<div class="no-models">No models available for this provider type</div>';
        return;
    }
    
    // 渲染模型复选框列表
    let html = '<div class="models-checkbox-grid">';
    models.forEach(model => {
        const isChecked = notSupportedModels.includes(model);
        html += `
            <label class="model-checkbox-label">
                <input type="checkbox"
                       class="model-checkbox"
                       value="${model}"
                       data-uuid="${uuid}"
                       ${isChecked ? 'checked' : ''}
                       disabled>
                <span class="model-name">${model}</span>
            </label>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// 导出所有函数，并挂载到window对象供HTML调用
export {
    showProviderManagerModal,
    closeProviderModal,
    toggleProviderDetails,
    editProvider,
    cancelEdit,
    saveProvider,
    deleteProvider,
    refreshProviderConfig,
    showAddProviderForm,
    addProvider,
    toggleProviderStatus,
    resetAllProvidersHealth,
    performHealthCheck,
    loadModelsForProviderType,
    renderNotSupportedModelsSelector,
    goToProviderPage
};

// 将函数挂载到window对象
window.closeProviderModal = closeProviderModal;
window.toggleProviderDetails = toggleProviderDetails;
window.editProvider = editProvider;
window.cancelEdit = cancelEdit;
window.saveProvider = saveProvider;
window.deleteProvider = deleteProvider;
window.showAddProviderForm = showAddProviderForm;
window.addProvider = addProvider;
window.toggleProviderStatus = toggleProviderStatus;
window.resetAllProvidersHealth = resetAllProvidersHealth;
window.performHealthCheck = performHealthCheck;
window.goToProviderPage = goToProviderPage;