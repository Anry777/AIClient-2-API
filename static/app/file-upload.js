// File upload functionality module

import { showToast } from './utils.js';

/**
 * File upload handler class
 */
class FileUploadHandler {
    constructor() {
        this.currentProvider = 'gemini'; // Default provider
        this.initEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Listen for all upload button click events
        document.addEventListener('click', (event) => {
            if (event.target.closest('.upload-btn')) {
                const button = event.target.closest('.upload-btn');
                const targetInputId = button.getAttribute('data-target');
                if (targetInputId) {
                    // Try to get providerType from modal
                    const modal = button.closest('.provider-modal');
                    const providerType = modal ? modal.getAttribute('data-provider-type') : null;
                    this.handleFileUpload(button, targetInputId, providerType);
                }
            }
        });

        // Listen for provider change events
        const modelProvider = document.getElementById('modelProvider');
        if (modelProvider) {
            modelProvider.addEventListener('change', (event) => {
                this.updateCurrentProvider(event.target.value);
            });
        }
    }

    /**
     * Update current provider
     * @param {string} provider - Selected provider
     */
    updateCurrentProvider(provider) {
        this.currentProvider = this.getProviderKey(provider);
    }

    /**
     * Get provider key name
     * @param {string} provider - Provider name
     * @returns {string} - Provider identifier
     */
    getProviderKey(provider) {
        const providerMap = {
            'gemini-cli-oauth': 'gemini',
            'gemini-antigravity': 'antigravity',
            'claude-kiro-oauth': 'kiro',
            'openai-qwen-oauth': 'qwen'
        };
        return providerMap[provider] || 'gemini';
    }

    /**
     * Handle file upload
     * @param {HTMLElement} button - Upload button element
     * @param {string} targetInputId - Target input ID
     * @param {string} providerType - Provider type
     */
    async handleFileUpload(button, targetInputId, providerType) {
        // Create hidden file input element
        const fileInput = this.createFileInput();
        
        // Set file selection callback
        fileInput.onchange = async (event) => {
            const file = event.target.files[0];
            
            if (file) {
                // Only show loading state and upload after file is actually selected
                this.setButtonLoading(button, true);
                await this.uploadFile(file, targetInputId, button, providerType);
            }
            
            // Clean up temporary file input element
            fileInput.remove();
        };

        // Trigger file selection
        fileInput.click();
    }

    /**
     * Create file input element
     * @returns {HTMLInputElement} - File input element
     */
    createFileInput() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,.txt,.key,.pem,.p12,.pfx';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
        return fileInput;
    }

    /**
     * Upload file to server
     * @param {File} file - File to upload
     * @param {string} targetInputId - Target input ID
     * @param {HTMLElement} button - Upload button
     * @param {string} providerType - Provider type
     */
    async uploadFile(file, targetInputId, button, providerType) {
        try {
            // Validate file type
            if (!this.validateFileType(file)) {
                showToast('Unsupported file type. Please select a JSON, TXT, KEY, PEM, P12, or PFX file.', 'error');
                this.setButtonLoading(button, false);
                return;
            }

            // Validate file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                showToast('File size must not exceed 5MB.', 'error');
                this.setButtonLoading(button, false);
                return;
            }

            // Use passed providerType or fall back to currentProvider
            const provider = providerType ? this.getProviderKey(providerType) : this.currentProvider;

            // Create FormData
            const formData = new FormData();
            formData.append('file', file);
            formData.append('provider', provider);
            formData.append('targetInputId', targetInputId);

            // Use wrapped interface to send upload request
            const result = await window.apiClient.upload('/upload-oauth-credentials', formData);
            
            // Upload successful, set file path to input
            this.setFilePathToInput(targetInputId, result.filePath);
            showToast('File uploaded successfully', 'success');

        } catch (error) {
            console.error('File upload error:', error);
            showToast('File upload failed: ' + error.message, 'error');
        } finally {
            this.setButtonLoading(button, false);
        }
    }

    /**
     * Validate file type
     * @param {File} file - File to validate
     * @returns {boolean} - Whether it's a valid file type
     */
    validateFileType(file) {
        const allowedExtensions = ['.json', '.txt', '.key', '.pem', '.p12', '.pfx'];
        const fileName = file.name.toLowerCase();
        return allowedExtensions.some(ext => fileName.endsWith(ext));
    }

    /**
     * Set button loading state
     * @param {HTMLElement} button - Button element
     * @param {boolean} isLoading - Whether loading
     */
    setButtonLoading(button, isLoading) {
        const icon = button.querySelector('i');
        if (isLoading) {
            button.disabled = true;
            icon.className = 'fas fa-spinner fa-spin';
        } else {
            button.disabled = false;
            icon.className = 'fas fa-upload';
        }
    }

    /**
     * Set file path to input
     * @param {string} inputId - Input ID
     * @param {string} filePath - File path
     */
    setFilePathToInput(inputId, filePath) {
        // console.log('Setting file path to input:', inputId, filePath);
        let input = document.getElementById(inputId);
        if (input) {
            // console.log('Input element exists, setting file path:', filePath);
            input.value = filePath;
            // Also update data-config-value attribute (for edit mode)
            if (input.hasAttribute('data-config-value')) {
                input.setAttribute('data-config-value', filePath);
                console.log('Updated data-config-value:', filePath);
            }
            // Trigger input event to notify other listeners
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            console.error('Input not found:', inputId);
        }
    }
}

/**
 * Initialize file upload functionality
 */
function initFileUpload() {
    // File upload functionality is a self-initializing singleton
    console.log('File upload initialized');
}

// Export singleton instance
const fileUploadHandler = new FileUploadHandler();

export {
    fileUploadHandler,
    FileUploadHandler,
    initFileUpload
};