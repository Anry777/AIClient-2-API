// Event listeners module

import { elements, autoScroll, setAutoScroll, clearLogs } from './constants.js';
import { showToast } from './utils.js';

/**
 * Initialize all event listeners
 */
function initEventListeners() {
    // Refresh button
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', handleRefresh);
    }

    // Clear logs
    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.addEventListener('click', () => {
            clearLogs();
            if (elements.logsContainer) {
                elements.logsContainer.innerHTML = '';
            }
            showToast('Logs cleared', 'success');
        });
    }

    // Auto-scroll toggle
    if (elements.toggleAutoScrollBtn) {
        elements.toggleAutoScrollBtn.addEventListener('click', () => {
            const newAutoScroll = !autoScroll;
            setAutoScroll(newAutoScroll);
            elements.toggleAutoScrollBtn.dataset.enabled = newAutoScroll;
            elements.toggleAutoScrollBtn.innerHTML = `
                <i class="fas fa-arrow-down"></i>
                Auto-scroll: ${newAutoScroll ? 'On' : 'Off'}
            `;
        });
    }

    // Save configuration
    if (elements.saveConfigBtn) {
        elements.saveConfigBtn.addEventListener('click', saveConfiguration);
    }

    // Reset configuration
    if (elements.resetConfigBtn) {
        elements.resetConfigBtn.addEventListener('click', loadInitialData);
    }

    // Model provider switch
    if (elements.modelProvider) {
        elements.modelProvider.addEventListener('change', handleProviderChange);
    }

    // Gemini credentials type switch
    document.querySelectorAll('input[name="geminiCredsType"]').forEach(radio => {
        radio.addEventListener('change', handleGeminiCredsTypeChange);
    });

    // Kiro credentials type switch
    document.querySelectorAll('input[name="kiroCredsType"]').forEach(radio => {
        radio.addEventListener('change', handleKiroCredsTypeChange);
    });

    // Password show/hide toggle
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', handlePasswordToggle);
    });

    // Provider pools config listener
    // const providerPoolsInput = document.getElementById('providerPoolsFilePath');
    // if (providerPoolsInput) {
    //     providerPoolsInput.addEventListener('input', handleProviderPoolsConfigChange);
    // }

    // Log container scroll
    if (elements.logsContainer) {
        elements.logsContainer.addEventListener('scroll', () => {
            if (autoScroll) {
                const isAtBottom = elements.logsContainer.scrollTop + elements.logsContainer.clientHeight
                    >= elements.logsContainer.scrollHeight - 5;
                if (!isAtBottom) {
                    setAutoScroll(false);
                    elements.toggleAutoScrollBtn.dataset.enabled = false;
                    elements.toggleAutoScrollBtn.innerHTML = `
                        <i class="fas fa-arrow-down"></i>
                        Auto-scroll: Off
                    `;
                }
            }
        });
    }
}

/**
 * Provider configuration switch handler
 */
function handleProviderChange() {
    const selectedProvider = elements.modelProvider?.value;
    if (!selectedProvider) return;

    const allProviderConfigs = document.querySelectorAll('.provider-config');
    
    // Hide all provider configs
    allProviderConfigs.forEach(config => {
        config.style.display = 'none';
    });
    
    // Show currently selected provider config
    const targetConfig = document.querySelector(`[data-provider="${selectedProvider}"]`);
    if (targetConfig) {
        targetConfig.style.display = 'block';
    }
}

/**
 * Gemini credentials type switch
 * @param {Event} event - Event object
 */
function handleGeminiCredsTypeChange(event) {
    const selectedType = event.target.value;
    const base64Group = document.getElementById('geminiCredsBase64Group');
    const fileGroup = document.getElementById('geminiCredsFileGroup');
    
    if (selectedType === 'base64') {
        if (base64Group) base64Group.style.display = 'block';
        if (fileGroup) fileGroup.style.display = 'none';
    } else {
        if (base64Group) base64Group.style.display = 'none';
        if (fileGroup) fileGroup.style.display = 'block';
    }
}

/**
 * Kiro credentials type switch
 * @param {Event} event - Event object
 */
function handleKiroCredsTypeChange(event) {
    const selectedType = event.target.value;
    const base64Group = document.getElementById('kiroCredsBase64Group');
    const fileGroup = document.getElementById('kiroCredsFileGroup');
    
    if (selectedType === 'base64') {
        if (base64Group) base64Group.style.display = 'block';
        if (fileGroup) fileGroup.style.display = 'none';
    } else {
        if (base64Group) base64Group.style.display = 'none';
        if (fileGroup) fileGroup.style.display = 'block';
    }
}

/**
 * Password show/hide toggle handler
 * @param {Event} event - Event object
 */
function handlePasswordToggle(event) {
    const button = event.target.closest('.password-toggle');
    if (!button) return;
    
    const targetId = button.getAttribute('data-target');
    const input = document.getElementById(targetId);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

/**
 * Provider pools configuration change handler
 * @param {Event} event - Event object
 */
function handleProviderPoolsConfigChange(event) {
    const filePath = event.target.value.trim();
    const providersMenuItem = document.querySelector('.nav-item[data-section="providers"]');
    
    if (filePath) {
        // Show provider pools menu
        if (providersMenuItem) providersMenuItem.style.display = 'flex';
    } else {
        // Hide provider pools menu
        if (providersMenuItem) providersMenuItem.style.display = 'none';
        
        // If currently on provider pools page, switch to dashboard
        if (providersMenuItem && providersMenuItem.classList.contains('active')) {
            const dashboardItem = document.querySelector('.nav-item[data-section="dashboard"]');
            const dashboardSection = document.getElementById('dashboard');
            
            // Update navigation state
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
            
            if (dashboardItem) dashboardItem.classList.add('active');
            if (dashboardSection) dashboardSection.classList.add('active');
        }
    }
}

/**
 * Password show/hide toggle handler (for password inputs in modals)
 * @param {HTMLElement} button - Button element
 */
function handleProviderPasswordToggle(button) {
    const targetKey = button.getAttribute('data-target');
    const input = button.parentNode.querySelector(`input[data-config-key="${targetKey}"]`);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Data loading functions (to be imported from main module)
let loadInitialData;
let saveConfiguration;
let reloadConfig;

// Refresh handler function
async function handleRefresh() {
    try {
        // First refresh basic data
        if (loadInitialData) {
            loadInitialData();
        }
        
        // If reloadConfig function is available, also refresh config
        if (reloadConfig) {
            await reloadConfig();
        }
    } catch (error) {
        console.error('Refresh failed:', error);
        showToast('Refresh failed: ' + error.message, 'error');
    }
}

export function setDataLoaders(dataLoader, configSaver) {
    loadInitialData = dataLoader;
    saveConfiguration = configSaver;
}

export function setReloadConfig(configReloader) {
    reloadConfig = configReloader;
}

export {
    initEventListeners,
    handleProviderChange,
    handleGeminiCredsTypeChange,
    handleKiroCredsTypeChange,
    handlePasswordToggle,
    handleProviderPoolsConfigChange,
    handleProviderPasswordToggle
};