// Routing examples functionality module

import { showToast } from './utils.js';

/**
 * Initialize routing examples functionality
 */
function initRoutingExamples() {
    // Delayed initialization to ensure all DOM is loaded
    setTimeout(() => {
        initProtocolTabs();
        initCopyButtons();
        initCardInteractions();
    }, 100);
}

/**
 * Initialize protocol tab switching functionality
 */
function initProtocolTabs() {
    // Use event delegation to bind click events
    document.addEventListener('click', function(e) {
        // Check if clicked element is a protocol tab or its child
        const tab = e.target.classList.contains('protocol-tab') ? e.target : e.target.closest('.protocol-tab');
        
        if (tab) {
            e.preventDefault();
            e.stopPropagation();
            
            const targetProtocol = tab.dataset.protocol;
            const card = tab.closest('.routing-example-card');
            
            if (!card) {
                return;
            }
            
            // Remove active state from all tabs and content in current card
            const cardTabs = card.querySelectorAll('.protocol-tab');
            const cardContents = card.querySelectorAll('.protocol-content');
            
            cardTabs.forEach(t => t.classList.remove('active'));
            cardContents.forEach(c => c.classList.remove('active'));
            
            // Add active state to current tab and corresponding content
            tab.classList.add('active');
            
            // Use more precise selector to find corresponding content
            const targetContent = card.querySelector(`.protocol-content[data-protocol="${targetProtocol}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }
    });
}

/**
 * Initialize copy button functionality
 */
function initCopyButtons() {
    document.addEventListener('click', async function(e) {
        if (e.target.closest('.copy-btn')) {
            e.stopPropagation();
            
            const button = e.target.closest('.copy-btn');
            const path = button.dataset.path;
            if (!path) return;
            
            try {
                await navigator.clipboard.writeText(path);
                showToast(`Copied path: ${path}`, 'success');
                
                // Temporarily change button icon
                const icon = button.querySelector('i');
                if (icon) {
                    const originalClass = icon.className;
                    icon.className = 'fas fa-check';
                    button.style.color = 'var(--success-color)';
                    
                    setTimeout(() => {
                        icon.className = originalClass;
                        button.style.color = '';
                    }, 2000);
                }
                
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
                showToast('Copy failed', 'error');
            }
        }
    });
}

/**
 * Initialize card interaction functionality
 */
function initCardInteractions() {
    const routingCards = document.querySelectorAll('.routing-example-card');
    
    routingCards.forEach(card => {
        // Add hover effect
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = 'var(--shadow-lg)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
        });
        
    });
}

/**
 * Get all available route endpoints
 * @returns {Array} Route endpoints array
 */
function getAvailableRoutes() {
    return [
        {
            provider: 'claude-custom',
            name: 'Claude Custom',
            paths: {
                openai: '/claude-custom/v1/chat/completions',
                claude: '/claude-custom/v1/messages'
            },
            description: 'Official Claude API',
            badge: 'Official',
            badgeClass: 'official'
        },
        {
            provider: 'claude-kiro-oauth',
            name: 'Claude Kiro OAuth',
            paths: {
                openai: '/claude-kiro-oauth/v1/chat/completions',
                claude: '/claude-kiro-oauth/v1/messages'
            },
            description: 'Free access to Claude Sonnet 4.5',
            badge: 'Free',
            badgeClass: 'oauth'
        },
        {
            provider: 'openai-custom',
            name: 'OpenAI Custom',
            paths: {
                openai: '/openai-custom/v1/chat/completions',
                claude: '/openai-custom/v1/messages'
            },
            description: 'Official OpenAI API',
            badge: 'Official',
            badgeClass: 'official'
        },
        {
            provider: 'gemini-cli-oauth',
            name: 'Gemini CLI OAuth',
            paths: {
                openai: '/gemini-cli-oauth/v1/chat/completions',
                claude: '/gemini-cli-oauth/v1/messages'
            },
            description: 'Bypass Gemini free limits',
            badge: 'Bypass limits',
            badgeClass: 'oauth'
        },
        {
            provider: 'openai-qwen-oauth',
            name: 'Qwen OAuth',
            paths: {
                openai: '/openai-qwen-oauth/v1/chat/completions',
                claude: '/openai-qwen-oauth/v1/messages'
            },
            description: 'Qwen Code Plus',
            badge: 'Code',
            badgeClass: 'oauth'
        },
        {
            provider: 'openaiResponses-custom',
            name: 'OpenAI Responses',
            paths: {
                openai: '/openaiResponses-custom/v1/responses',
                claude: '/openaiResponses-custom/v1/messages'
            },
            description: 'Structured conversation API',
            badge: 'Structured',
            badgeClass: 'responses'
        }
    ];
}

/**
 * Highlight specific provider route
 * @param {string} provider - Provider identifier
 */
function highlightProviderRoute(provider) {
    const card = document.querySelector(`[data-provider="${provider}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = 'var(--success-color)';
        card.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
        
        setTimeout(() => {
            card.style.borderColor = '';
            card.style.boxShadow = '';
        }, 3000);
        
        showToast(`Focused: ${provider}`, 'success');
    }
}

/**
 * Copy cURL command example
 * @param {string} provider - Provider identifier
 * @param {Object} options - Options parameters
 */
async function copyCurlExample(provider, options = {}) {
    const routes = getAvailableRoutes();
    const route = routes.find(r => r.provider === provider);
    
    if (!route) {
        showToast('Route not found', 'error');
        return;
    }
    
    const { protocol = 'openai', model = 'default-model', message = 'Hello!' } = options;
    const path = route.paths[protocol];
    
    if (!path) {
        showToast('Protocol path not found', 'error');
        return;
    }

    const baseURL = window.location.origin;
    
    let curlCommand = '';
    
    // Generate corresponding cURL command based on different providers and protocols
    switch (provider) {
        case 'claude-custom':
        case 'claude-kiro-oauth':
            if (protocol === 'openai') {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "${message}"}],
    "max_tokens": 1000
  }'`;
            } else {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "${message}"}]
  }'`;
            }
            break;
            
        case 'openai-custom':
        case 'openai-qwen-oauth':
            if (protocol === 'openai') {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "${message}"}],
    "max_tokens": 1000
  }'`;
            } else {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "model": "${model}",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "${message}"}]
  }'`;
            }
            break;
            
        case 'gemini-cli-oauth':
            if (protocol === 'openai') {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "${message}"}],
    "max_tokens": 1000
  }'`;
            } else {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.0-flash-exp",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "${message}"}]
  }'`;
            }
            break;
            
        case 'openaiResponses-custom':
            if (protocol === 'openai') {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${model}",
    "input": "${message}",
    "max_output_tokens": 1000
  }'`;
            } else {
                curlCommand = `curl ${baseURL}${path} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "model": "${model}",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": "${message}"}]
  }'`;
            }
            break;
    }
    
    try {
        await navigator.clipboard.writeText(curlCommand);
        showToast('cURL command copied to clipboard', 'success');
    } catch (error) {
        console.error('Failed to copy curl command:', error);
        showToast('Copy failed', 'error');
    }
}

export {
    initRoutingExamples,
    getAvailableRoutes,
    highlightProviderRoute,
    copyCurlExample
};