// Main application entry file - modular version

// Import all modules
import {
    providerStats,
    REFRESH_INTERVALS
} from './constants.js';

import {
    showToast,
    getProviderStats
} from './utils.js';

import {
    initFileUpload,
    fileUploadHandler
} from './file-upload.js';

import { 
    initNavigation 
} from './navigation.js';

import {
    initEventListeners,
    setDataLoaders,
    setReloadConfig
} from './event-handlers.js';

import {
    initEventStream,
    setProviderLoaders,
    setConfigLoaders
} from './event-stream.js';

import {
    loadSystemInfo,
    updateTimeDisplay,
    loadProviders,
    openProviderManager
} from './provider-manager.js';

import {
    loadConfiguration,
    saveConfiguration
} from './config-manager.js';

import {
    showProviderManagerModal,
    refreshProviderConfig
} from './modal.js';

import {
    initRoutingExamples
} from './routing-examples.js';

import {
    initUploadConfigManager,
    loadConfigList,
    viewConfig,
    deleteConfig,
    closeConfigModal,
    copyConfigContent,
    reloadConfig
} from './upload-config-manager.js';

/**
 * Load initial data
 */
function loadInitialData() {
    loadSystemInfo();
    loadProviders();
    loadConfiguration();
    // showToast('Data refreshed', 'success');
}

/**
 * Initialize application
 */
function initApp() {
    // Set data loaders
    setDataLoaders(loadInitialData, saveConfiguration);
    
    // Set reloadConfig function
    setReloadConfig(reloadConfig);
    
    // Set provider loaders
    setProviderLoaders(loadProviders, refreshProviderConfig);
    
    // Set config loaders
    setConfigLoaders(loadConfigList);
    
    // Initialize all modules
    initNavigation();
    initEventListeners();
    initEventStream();
    initFileUpload(); // Initialize file upload functionality
    initRoutingExamples(); // Initialize routing examples functionality
    initUploadConfigManager(); // Initialize upload config manager functionality
    loadInitialData();
    
    // Show welcome message
    showToast('Welcome to the AIClient2API Management Console!', 'success');
    
    // Update server time and uptime display every 5 seconds
    setInterval(() => {
        updateTimeDisplay();
    }, 5000);
    
    // Periodically refresh system info
    setInterval(() => {
        loadProviders();

        if (providerStats.activeProviders > 0) {
            const stats = getProviderStats(providerStats);
            console.log('=== Provider Stats Report ===');
            console.log(`Active providers: ${stats.activeProviders}`);
            console.log(`Healthy providers: ${stats.healthyProviders} (${stats.healthRatio})`);
            console.log(`Total accounts: ${stats.totalAccounts}`);
            console.log(`Total requests: ${stats.totalRequests}`);
            console.log(`Total errors: ${stats.totalErrors}`);
            console.log(`Success rate: ${stats.successRate}`);
            console.log(`Avg requests per provider: ${stats.avgUsagePerProvider}`);
            console.log('=============================');
        }
    }, REFRESH_INTERVALS.SYSTEM_INFO);

}

// Initialize application after DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Export global functions for use by other modules
window.loadProviders = loadProviders;
window.openProviderManager = openProviderManager;
window.showProviderManagerModal = showProviderManagerModal;
window.refreshProviderConfig = refreshProviderConfig;
window.fileUploadHandler = fileUploadHandler;

// Upload config management related global functions
window.viewConfig = viewConfig;
window.deleteConfig = deleteConfig;
window.loadConfigList = loadConfigList;
window.closeConfigModal = closeConfigModal;
window.copyConfigContent = copyConfigContent;
window.reloadConfig = reloadConfig;

// Export debug functions
window.getProviderStats = () => getProviderStats(providerStats);

console.log('AIClient2API Management Console loaded (modular)');
