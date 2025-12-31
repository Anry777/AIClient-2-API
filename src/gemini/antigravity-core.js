import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import * as https from 'https';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import open from 'open';
import { API_ACTIONS, formatExpiryTime } from '../common.js';
import { getProviderModels } from '../provider-models.js';
import { SignatureCache } from './signature-cache.js';
import * as ThinkingUtils from './thinking-utils.js';
import * as ThinkingConfig from './config.js';
import { getDefaultConfig } from './config.js';
import * as ThinkingRecovery from './thinking-recovery.js';
import * as ErrorHandler from './error-handler.js';
import * as ToolRecovery from './tool-recovery.js';

// Configure HTTP/HTTPS agent to limit connection pool size and avoid resource leaks
const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 5,
    timeout: 120000,
});
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 5,
    timeout: 120000,
});

// --- Constants ---
const AUTH_REDIRECT_PORT = 8086;
const CREDENTIALS_DIR = '.antigravity';
const CREDENTIALS_FILE = 'oauth_creds.json';
const ANTIGRAVITY_BASE_URL_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
const ANTIGRAVITY_BASE_URL_AUTOPUSH = 'https://autopush-cloudcode-pa.sandbox.googleapis.com';
const ANTIGRAVITY_API_VERSION = 'v1internal';
const OAUTH_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = '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';
const DEFAULT_USER_AGENT = 'antigravity/1.11.5 windows/amd64';
const REFRESH_SKEW = 3000; // 3000 seconds (50 minutes) refresh token ahead of time

// Stable Session ID (instead of generateSessionID for each request)
const PLUGIN_SESSION_ID = `-${uuidv4()}`;

// Constants for warmup
const DEFAULT_THINKING_BUDGET = 16000;
const WARMUP_MAX_ATTEMPTS = 2;
const warmupAttemptedSessionIds = new Set();
const warmupSucceededSessionIds = new Set();

// Get Antigravity Model List
const ANTIGRAVITY_MODELS = getProviderModels('gemini-antigravity');

// Model Alias Mapping
const MODEL_ALIAS_MAP = {
    'gemini-2.5-computer-use-preview-10-2025': 'rev19-uic3-1p',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image',
    'gemini-3-pro-preview': 'gemini-3-pro-high',
    'gemini-claude-sonnet-4-5': 'claude-sonnet-4-5',
    'gemini-claude-sonnet-4-5-thinking': 'claude-sonnet-4-5-thinking'
};

const MODEL_NAME_MAP = {
    'rev19-uic3-1p': 'gemini-2.5-computer-use-preview-10-2025',
    'gemini-3-pro-image': 'gemini-3-pro-image-preview',
    'gemini-3-pro-high': 'gemini-3-pro-preview',
    'claude-sonnet-4-5': 'gemini-claude-sonnet-4-5',
    'claude-sonnet-4-5-thinking': 'gemini-claude-sonnet-4-5-thinking'
};

// List of unsupported models
const UNSUPPORTED_MODELS = ['chat_20706', 'chat_23310', 'gemini-2.5-flash-thinking', 'gemini-3-pro-low', 'gemini-2.5-pro'];

/**
 * Convert alias to real model name
 */
function alias2ModelName(modelName) {
    return MODEL_ALIAS_MAP[modelName] || modelName;
}

/**
 * Convert real model name to alias
 */
function modelName2Alias(modelName) {
    if (UNSUPPORTED_MODELS.includes(modelName)) {
        return '';
    }
    return MODEL_NAME_MAP[modelName] || modelName;
}

/**
 * Generate Random Request ID
 */
function generateRequestID() {
    return 'agent-' + uuidv4();
}

// generateSessionID removed - using stable PLUGIN_SESSION_ID instead

/**
 * Generate Random Project ID
 */
function generateProjectID() {
    const adjectives = ['useful', 'bright', 'swift', 'calm', 'bold'];
    const nouns = ['fuze', 'wave', 'spark', 'flow', 'core'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomPart = uuidv4().toLowerCase().substring(0, 5);
    return `${adj}-${noun}-${randomPart}`;
}

/**
 * Convert Gemini format request to Antigravity format
 */
function geminiToAntigravity(modelName, payload, projectId) {
    // Deep copy request body to avoid modifying original object
    let template = JSON.parse(JSON.stringify(payload));

    // Set basic fields
    template.model = modelName;
    template.userAgent = 'antigravity';
    template.project = projectId || generateProjectID();
    template.requestId = generateRequestID();

    // Ensure request object exists
    if (!template.request) {
        template.request = {};
    }

    // Set Session ID - use stable PLUGIN_SESSION_ID for multi-turn conversations
    template.request.sessionId = PLUGIN_SESSION_ID;

    // Remove safety settings
    if (template.request.safetySettings) {
        delete template.request.safetySettings;
    }

    // Set tool config
    if (template.request.toolConfig) {
        if (!template.request.toolConfig.functionCallingConfig) {
            template.request.toolConfig.functionCallingConfig = {};
        }
        template.request.toolConfig.functionCallingConfig.mode = 'VALIDATED';
    }

    // Remove maxOutputTokens (but keep for Claude thinking models)
    if (template.request.generationConfig && template.request.generationConfig.maxOutputTokens) {
        const isClaudeThinking = modelName.toLowerCase().includes('claude') && modelName.toLowerCase().includes('thinking');
        if (!isClaudeThinking) {
            delete template.request.generationConfig.maxOutputTokens;
        }
    }

    // Handle Thinking Config
    if (template.request.generationConfig && template.request.generationConfig.thinkingConfig) {
        const isClaudeModel = modelName.toLowerCase().includes('claude');
        const isClaudeThinking = isClaudeModel && modelName.toLowerCase().includes('thinking');

        if (!modelName.startsWith('gemini-3-')) {
            // For non-Gemini-3 models, we ensure thinkingBudget is set if includeThoughts is true
            const tc = template.request.generationConfig.thinkingConfig;
            const includeThoughts = tc.includeThoughts ?? tc.include_thoughts;
            const thinkingBudget = tc.thinkingBudget ?? tc.thinking_budget;

            if (includeThoughts && (!thinkingBudget || thinkingBudget === -1)) {
                // Set a reasonable default budget if not specified
                tc.thinkingBudget = 16000;
            }

            if (tc.thinkingLevel) {
                delete tc.thinkingLevel;
            }
        }

        // Claude models require snake_case keys for thinkingConfig
        if (isClaudeThinking) {
            const tc = template.request.generationConfig.thinkingConfig;
            const budget = tc.thinkingBudget ?? tc.thinking_budget ?? 16000;
            const convertedConfig = {
                include_thoughts: tc.includeThoughts ?? tc.include_thoughts ?? true,
                thinking_budget: budget
            };
            template.request.generationConfig.thinkingConfig = convertedConfig;

            // Ensure maxOutputTokens is sufficient for thinking (Reference: CLAUDE_THINKING_MAX_OUTPUT_TOKENS = 64000)
            let currentMax = template.request.generationConfig.maxOutputTokens;
            if (!currentMax || currentMax <= budget || currentMax > 64000) {
                template.request.generationConfig.maxOutputTokens = 64000;
            }
        }

        // Phase 2: Attach cached signature if available (for multi-turn conversations)
        // Note: this.signatureCache is not available here since geminiToAntigravity is a standalone function
        // The signature attachment happens in generateContent/generateContentStream methods
    } else {
        // console.log(`[Antigravity Transform] Model: ${modelName}, NO thinkingConfig in generationConfig`);
    }

    // Handle tool declarations for Claude Sonnet models
    if (modelName.startsWith('claude-sonnet-')) {
        if (template.request.tools && Array.isArray(template.request.tools)) {
            template.request.tools.forEach(tool => {
                if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
                    tool.functionDeclarations.forEach(funcDecl => {
                        if (funcDecl.parametersJsonSchema) {
                            funcDecl.parameters = funcDecl.parametersJsonSchema;
                            delete funcDecl.parameters.$schema;
                            delete funcDecl.parametersJsonSchema;
                        }
                    });
                }
            });
        }
    }

    // Phase 5: Apply tool ID recovery
    // Note: this.thinkingConfig is not available here, we'll check config when integrating in generateContent/generateContentStream
    // This is a placeholder - actual recovery will be applied after geminiToAntigravity is called

    return template;
}

/**
 * Convert Antigravity response to Gemini format
 */
function toGeminiApiResponse(antigravityResponse) {
    if (!antigravityResponse) return null;

    // DEBUG: Check for thinking parts in raw response
    // if (antigravityResponse.candidates) {
    //     antigravityResponse.candidates.forEach((candidate, cIdx) => {
    //         if (candidate.content?.parts) {
    //             candidate.content.parts.forEach((part, pIdx) => {
    //                 if (part.thought || part.type === 'thinking' || part.thoughtSignature) {
    //                     console.log(`[Antigravity DEBUG] Candidate ${cIdx}, Part ${pIdx} has thinking:`, {
    //                         thought: part.thought,
    //                         type: part.type,
    //                         hasThoughtSignature: !!part.thoughtSignature,
    //                         textLength: part.text?.length || 0
    //                     });
    //                 }
    //             });
    //         }
    //     });
    // }

    const compliantResponse = {
        candidates: antigravityResponse.candidates
    };

    if (antigravityResponse.usageMetadata) {
        compliantResponse.usageMetadata = antigravityResponse.usageMetadata;
    }

    if (antigravityResponse.promptFeedback) {
        compliantResponse.promptFeedback = antigravityResponse.promptFeedback;
    }

    if (antigravityResponse.automaticFunctionCallingHistory) {
        compliantResponse.automaticFunctionCallingHistory = antigravityResponse.automaticFunctionCallingHistory;
    }

    return compliantResponse;
}

/**
 * Ensure content parts in request body have role attribute
 */
function ensureRolesInContents(requestBody) {
    delete requestBody.model;

    if (requestBody.system_instruction) {
        requestBody.systemInstruction = requestBody.system_instruction;
        delete requestBody.system_instruction;
    }

    if (requestBody.systemInstruction && !requestBody.systemInstruction.role) {
        requestBody.systemInstruction.role = 'user';
    }

    if (requestBody.contents && Array.isArray(requestBody.contents)) {
        requestBody.contents.forEach(content => {
            if (!content.role) {
                content.role = 'user';
            }
        });
    }

    return requestBody;
}

/**
 * Build warmup request body for thinking signature
 */
function buildThinkingWarmupBody(modelName, requestBody, isClaudeThinking) {
    if (!requestBody || !requestBody.request) {
        return null;
    }

    const request = { ...requestBody.request };
    const warmupPrompt = "Warmup request for thinking signature.";

    // Create simple warmup request
    request.contents = [{ role: 'user', parts: [{ text: warmupPrompt }] }];

    // Remove tools for warmup
    delete request.tools;
    delete request.toolConfig;

    // Configure thinking config
    if (!request.generationConfig) {
        request.generationConfig = {};
    }

    request.generationConfig.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: DEFAULT_THINKING_BUDGET
    };

    // For Claude thinking models
    if (isClaudeThinking) {
        request.generationConfig.maxOutputTokens = 64000;
    }

    return { ...requestBody, request };
}

export class AntigravityApiService {
    constructor(config) {
        // Configure OAuth2Client to use custom HTTP agent
        this.authClient = new OAuth2Client({
            clientId: OAUTH_CLIENT_ID,
            clientSecret: OAUTH_CLIENT_SECRET,
            transporterOptions: {
                agent: httpsAgent,
            },
        });
        this.availableModels = [];
        this.isInitialized = false;

        this.config = config;
        this.host = config.HOST;
        this.oauthCredsFilePath = config.ANTIGRAVITY_OAUTH_CREDS_FILE_PATH;
        this.baseURL = ANTIGRAVITY_BASE_URL_DAILY; // Use generic GEMINI_BASE_URL config
        this.userAgent = DEFAULT_USER_AGENT; // Support generic USER_AGENT config
        this.projectId = config.PROJECT_ID;

        this.retryStats = {
            total: 0,
            thinkingRecovery: 0,
            toolRecovery: 0,
            emptyResponse: 0,
            rateLimit: 0,
        };

        this.thinkingConfig = getDefaultConfig();
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('[Antigravity] Initializing Antigravity API Service...');

        this.baseURLs = this.baseURL ? [this.baseURL] : [
            ANTIGRAVITY_BASE_URL_DAILY,
            ANTIGRAVITY_BASE_URL_AUTOPUSH
        ];

        this.thinkingConfig = await ThinkingConfig.getConfig();

        const validation = ThinkingConfig.validateConfig(this.thinkingConfig);
        if (!validation.valid) {
            console.warn('[Antigravity] Configuration has validation errors, using defaults for invalid values');
        }

        this.signatureCache = new SignatureCache({
            memory_ttl_seconds: this.thinkingConfig.signature_cache_memory_ttl_seconds,
            localStorage_ttl_seconds: this.thinkingConfig.signature_cache_disk_ttl_seconds,
            write_interval_seconds: this.thinkingConfig.signature_cache_write_interval_seconds,
            debug_thinking: this.thinkingConfig.debug,
        });
        console.log(`[Antigravity] Using stable session ID: ${PLUGIN_SESSION_ID}`);
        console.log(`[Antigravity] Session ID will remain constant across all requests in this process`);

        // Phase 2: Cleanup expired signatures on startup
        if (this.thinkingConfig.enable_signature_cache) {
            this.signatureCache.cleanupExpired();
            console.log('[Antigravity] Signature cache cleanup completed');
        }

        // Phase 4: Thinking recovery status
        console.log('[Antigravity] Thinking recovery: ' + (this.thinkingConfig.session_recovery ? 'ENABLED' : 'DISABLED'));

        await this.initializeAuth();

        if (!this.projectId) {
            this.projectId = await this.discoverProjectAndModels();
        } else {
            console.log(`[Antigravity] Using provided Project ID: ${this.projectId}`);
            // Get available models
            await this.fetchAvailableModels();
        }

        this.isInitialized = true;
        console.log(`[Antigravity] Initialization complete. Project ID: ${this.projectId}`);
    }



    async initializeAuth(forceRefresh = false) {
        // Check if Token needs refresh
        const needsRefresh = forceRefresh || this.isTokenExpiringSoon();

        if (this.authClient.credentials.access_token && !needsRefresh) {
            // Token is valid and does not need refresh
            return;
        }

        // Antigravity does not support base64 config, use file path directly

        const credPath = this.oauthCredsFilePath || path.join(os.homedir(), CREDENTIALS_DIR, CREDENTIALS_FILE);
        try {
            const data = await fs.readFile(credPath, "utf8");
            const credentials = JSON.parse(data);
            this.authClient.setCredentials(credentials);
            console.log('[Antigravity Auth] Authentication configured successfully from file.');

            if (needsRefresh) {
                console.log('[Antigravity Auth] Token expiring soon or force refresh requested. Refreshing token...');
                const { credentials: newCredentials } = await this.authClient.refreshAccessToken();
                this.authClient.setCredentials(newCredentials);
                // Save refreshed credentials to file
                await fs.writeFile(credPath, JSON.stringify(newCredentials, null, 2));
                console.log(`[Antigravity Auth] Token refreshed and saved to ${credPath} successfully.`);
            }
        } catch (error) {
            console.error('[Antigravity Auth] Error initializing authentication:', error.code);
            if (error.code === 'ENOENT' || error.code === 400) {
                console.log(`[Antigravity Auth] Credentials file '${credPath}' not found. Starting new authentication flow...`);
                const newTokens = await this.getNewToken(credPath);
                this.authClient.setCredentials(newTokens);
                console.log('[Antigravity Auth] New token obtained and loaded into memory.');
            } else {
                console.error('[Antigravity Auth] Failed to initialize authentication from file:', error);
                throw new Error(`Failed to load OAuth credentials.`);
            }
        }
    }

    async getNewToken(credPath) {
        let host = this.host;
        if (!host || host === 'undefined') {
            host = '127.0.0.1';
        }
        const redirectUri = `http://${host}:${AUTH_REDIRECT_PORT}`;
        this.authClient.redirectUri = redirectUri;

        return new Promise(async (resolve, reject) => {
            const authUrl = this.authClient.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/cloud-platform']
            });

            console.log('\n[Antigravity Auth] Opening browser for authentication...');
            console.log('[Antigravity Auth] Authorization link:', authUrl, '\n');

            // Automatically open browser
            const showFallbackMessage = () => {
                console.log('[Antigravity Auth] Failed to automatically open browser. Please open the link above manually.');
            };

            if (this.config) {
                try {
                    const childProcess = await open(authUrl);
                    if (childProcess) {
                        childProcess.on('error', () => showFallbackMessage());
                    }
                } catch (_err) {
                    showFallbackMessage();
                }
            } else {
                showFallbackMessage();
            }

            const server = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url, redirectUri);
                    const code = url.searchParams.get('code');
                    const errorParam = url.searchParams.get('error');

                    if (code) {
                        console.log(`[Antigravity Auth] Received successful callback from Google: ${req.url}`);
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Authentication successful! You can close this browser tab.');
                        server.close();

                        const { tokens } = await this.authClient.getToken(code);
                        await fs.mkdir(path.dirname(credPath), { recursive: true });
                        await fs.writeFile(credPath, JSON.stringify(tokens, null, 2));
                        console.log('[Antigravity Auth] New token received and saved to file.');
                        resolve(tokens);
                    } else if (errorParam) {
                        const errorMessage = `Authentication failed. Google returned an error: ${errorParam}.`;
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end(errorMessage);
                        server.close();
                        reject(new Error(errorMessage));
                    } else {
                        console.log(`[Antigravity Auth] Ignoring irrelevant request: ${req.url}`);
                        res.writeHead(204);
                        res.end();
                    }
                } catch (e) {
                    if (server.listening) server.close();
                    reject(e);
                }
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    const errorMessage = `[Antigravity Auth] Port ${AUTH_REDIRECT_PORT} on ${host} is already in use.`;
                    console.error(errorMessage);
                    reject(new Error(errorMessage));
                } else {
                    reject(err);
                }
            });

            const listenHost = '0.0.0.0';
            server.listen(AUTH_REDIRECT_PORT, listenHost);
        });
    }

    isTokenExpiringSoon() {
        if (!this.authClient.credentials.expiry_date) {
            return true;
        }
        const currentTime = Date.now();
        const expiryTime = this.authClient.credentials.expiry_date;
        const refreshSkewMs = REFRESH_SKEW * 1000;
        return expiryTime <= (currentTime + refreshSkewMs);
    }

    async discoverProjectAndModels() {
        if (this.projectId) {
            console.log(`[Antigravity] Using pre-configured Project ID: ${this.projectId}`);
            return this.projectId;
        }

        console.log('[Antigravity] Discovering Project ID...');
        try {
            const initialProjectId = "";
            // Prepare client metadata
            const clientMetadata = {
                ideType: "IDE_UNSPECIFIED",
                platform: "PLATFORM_UNSPECIFIED",
                pluginType: "GEMINI",
                duetProject: initialProjectId,
            };

            // Call loadCodeAssist to discover the actual project ID
            const loadRequest = {
                cloudaicompanionProject: initialProjectId,
                metadata: clientMetadata,
            };

            const loadResponse = await this.callApi('loadCodeAssist', loadRequest);

            // Check if we already have a project ID from the response
            if (loadResponse.cloudaicompanionProject) {
                console.log(`[Antigravity] Discovered existing Project ID: ${loadResponse.cloudaicompanionProject}`);
                // Get available models
                await this.fetchAvailableModels();
                return loadResponse.cloudaicompanionProject;
            }

            // If no existing project, we need to onboard
            const defaultTier = loadResponse.allowedTiers?.find(tier => tier.isDefault);
            const tierId = defaultTier?.id || 'free-tier';

            const onboardRequest = {
                tierId: tierId,
                cloudaicompanionProject: initialProjectId,
                metadata: clientMetadata,
            };

            let lroResponse = await this.callApi('onboardUser', onboardRequest);

            // Poll until operation is complete with timeout protection
            const MAX_RETRIES = 30; // Maximum number of retries (60 seconds total)
            let retryCount = 0;

            while (!lroResponse.done && retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                lroResponse = await this.callApi('onboardUser', onboardRequest);
                retryCount++;
            }

            if (!lroResponse.done) {
                throw new Error('Onboarding timeout: Operation did not complete within expected time.');
            }

            const discoveredProjectId = lroResponse.response?.cloudaicompanionProject?.id || initialProjectId;
            console.log(`[Antigravity] Onboarded and discovered Project ID: ${discoveredProjectId}`);
            // Get available models
            await this.fetchAvailableModels();
            return discoveredProjectId;
        } catch (error) {
            console.error('[Antigravity] Failed to discover Project ID:', error.response?.data || error.message);
            console.log('[Antigravity] Falling back to generated Project ID as last resort...');
            const fallbackProjectId = generateProjectID();
            console.log(`[Antigravity] Generated fallback Project ID: ${fallbackProjectId}`);
            // Get available models
            await this.fetchAvailableModels();
            return fallbackProjectId;
        }
    }

    async fetchAvailableModels() {
        console.log('[Antigravity] Fetching available models...');

        for (const baseURL of this.baseURLs) {
            try {
                const modelsURL = `${baseURL}/${ANTIGRAVITY_API_VERSION}:fetchAvailableModels`;
                const requestOptions = {
                    url: modelsURL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': this.userAgent
                    },
                    responseType: 'json',
                    body: JSON.stringify({})
                };

                const res = await this.authClient.request(requestOptions);

                if (res.data && res.data.models) {
                    const models = Object.keys(res.data.models);
                    this.availableModels = models
                        .map(modelName2Alias)
                        .filter(alias => alias !== '');

                    console.log(`[Antigravity] Available models: [${this.availableModels.join(', ')}]`);
                    return;
                }
            } catch (error) {
                console.error(`[Antigravity] Failed to fetch models from ${baseURL}:`, error.message);
            }
        }

        console.warn('[Antigravity] Failed to fetch models from all endpoints. Using default models.');
        this.availableModels = ANTIGRAVITY_MODELS;
    }

    async listModels() {
        if (!this.isInitialized) await this.initialize();

        const now = Math.floor(Date.now() / 1000);
        const formattedModels = this.availableModels.map(modelId => {
            const displayName = modelId.split('-').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');

            const modelInfo = {
                name: `models/${modelId}`,
                version: '1.0.0',
                displayName: displayName,
                description: `Antigravity model: ${modelId}`,
                inputTokenLimit: 1024000,
                outputTokenLimit: 65535,
                supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
                object: 'model',
                created: now,
                ownedBy: 'antigravity',
                type: 'antigravity'
            };

            if (modelId.endsWith('-thinking') || modelId.includes('-thinking-')) {
                modelInfo.thinking = {
                    min: 1024,
                    max: 100000,
                    zeroAllowed: false,
                    dynamicAllowed: true
                };
            }

            return modelInfo;
        });

        return { models: formattedModels };
    }

    async callApi(method, body, isRetry = false, retryCount = 0, baseURLIndex = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        if (baseURLIndex >= this.baseURLs.length) {
            throw new Error('All Antigravity base URLs failed');
        }

        const baseURL = this.baseURLs[baseURLIndex];

        try {
            const requestOptions = {
                url: `${baseURL}/${ANTIGRAVITY_API_VERSION}:${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': this.userAgent,
                    // Missing headers from reference project to potentially enable thinking
                    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
                    'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
                },
                responseType: 'json',
                body: JSON.stringify(body)
            };

            const res = await this.authClient.request(requestOptions);
            return res.data;
        } catch (error) {
            console.error(`[Antigravity API] Error calling ${method} on ${baseURL}:`, error.response?.status, error.message);

            if ((error.response?.status === 400 || error.response?.status === 401) && !isRetry) {
                console.log('[Antigravity API] Received 401/400. Refreshing auth and retrying...');
                await this.initializeAuth(true);
                return this.callApi(method, body, true, retryCount, baseURLIndex);
            }

            if (error.response?.status === 429) {
                if (baseURLIndex + 1 < this.baseURLs.length) {
                    console.log(`[Antigravity API] Rate limited on ${baseURL}. Trying next base URL...`);
                    return this.callApi(method, body, isRetry, retryCount, baseURLIndex + 1);
                } else if (retryCount < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retryCount);
                    console.log(`[Antigravity API] Rate limited. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.callApi(method, body, isRetry, retryCount + 1, 0);
                }
            }

            if (!error.response && baseURLIndex + 1 < this.baseURLs.length) {
                console.log(`[Antigravity API] Network error on ${baseURL}. Trying next base URL...`);
                return this.callApi(method, body, isRetry, retryCount, baseURLIndex + 1);
            }

            if (error.response?.status >= 500 && error.response?.status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[Antigravity API] Server error ${error.response.status}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(method, body, isRetry, retryCount + 1, baseURLIndex);
            }

            if (error.response?.status >= 400 && error.response?.status < 500) {
                const errorType = ErrorHandler.detectErrorType(error);

                if (errorType && retryCount < this.thinkingConfig.recoverable_error_max_retries) {
                    console.log(`[Antigravity API] Recoverable error (${errorType}) detected. Retrying (${retryCount + 1}/${this.thinkingConfig.recoverable_error_max_retries})...`);

                    this.retryStats.total++;

                    let recoveredBody = { ...body };

                    if (errorType === ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER ||
                        errorType === ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION) {

                        if (recoveredBody.request?.generationConfig?.thinkingConfig) {
                            delete recoveredBody.request.generationConfig.thinkingConfig;
                        }

                        console.log(`[Antigravity API] Stripped thinking config for retry`);
                        this.retryStats.thinkingRecovery++;
                    }

                    const delay = 1000 * Math.pow(2, retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    return this.callApi(method, recoveredBody, true, retryCount + 1, baseURLIndex);
                }
            }

            throw error;
        }
    }

    async * streamApi(method, body, isRetry = false, retryCount = 0, baseURLIndex = 0) {
        const maxRetries = this.config.REQUEST_MAX_RETRIES || 3;
        const baseDelay = this.config.REQUEST_BASE_DELAY || 1000;

        if (baseURLIndex >= this.baseURLs.length) {
            throw new Error('All Antigravity base URLs failed');
        }

        const baseURL = this.baseURLs[baseURLIndex];

        try {
            const requestOptions = {
                url: `${baseURL}/${ANTIGRAVITY_API_VERSION}:${method}`,
                method: 'POST',
                params: { alt: 'sse' },
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'User-Agent': this.userAgent,
                    // Missing headers from reference project
                    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
                    'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
                },
                responseType: 'stream',
                body: JSON.stringify(body)
            };

            const res = await this.authClient.request(requestOptions);

            if (res.status !== 200) {
                let errorBody = '';
                for await (const chunk of res.data) {
                    errorBody += chunk.toString();
                }
                throw new Error(`Upstream API Error (Status ${res.status}): ${errorBody}`);
            }

            yield* this.parseSSEStream(res.data);
        } catch (error) {
            console.error(`[Antigravity API] Error during stream ${method} on ${baseURL}:`, error.response?.status, error.message);

            if ((error.response?.status === 400 || error.response?.status === 401) && !isRetry) {
                console.log('[Antigravity API] Received 401/400 during stream. Refreshing auth and retrying...');
                await this.initializeAuth(true);
                yield* this.streamApi(method, body, true, retryCount, baseURLIndex);
                return;
            }

            if (error.response?.status === 429) {
                if (baseURLIndex + 1 < this.baseURLs.length) {
                    console.log(`[Antigravity API] Rate limited on ${baseURL}. Trying next base URL...`);
                    yield* this.streamApi(method, body, isRetry, retryCount, baseURLIndex + 1);
                    return;
                } else if (retryCount < maxRetries) {
                    const delay = baseDelay * Math.pow(2, retryCount);
                    console.log(`[Antigravity API] Rate limited during stream. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    yield* this.streamApi(method, body, isRetry, retryCount + 1, 0);
                    return;
                }
            }

            if (!error.response && baseURLIndex + 1 < this.baseURLs.length) {
                console.log(`[Antigravity API] Network error on ${baseURL}. Trying next base URL...`);
                yield* this.streamApi(method, body, isRetry, retryCount, baseURLIndex + 1);
                return;
            }

            if (error.response?.status >= 500 && error.response?.status < 600 && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[Antigravity API] Server error ${error.response.status} during stream. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                yield* this.streamApi(method, body, isRetry, retryCount + 1, baseURLIndex);
                return;
            }

            if (error.response?.status >= 400 && error.response?.status < 500) {
                const errorType = ErrorHandler.detectErrorType(error);

                if (errorType && retryCount < this.thinkingConfig.recoverable_error_max_retries) {
                    console.log(`[Antigravity Stream] Recoverable error (${errorType}) detected. Retrying (${retryCount + 1}/${this.thinkingConfig.recoverable_error_max_retries})...`);

                    this.retryStats.total++;

                    let recoveredBody = { ...body };

                    if (errorType === ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER ||
                        errorType === ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION) {

                        if (recoveredBody.request?.generationConfig?.thinkingConfig) {
                            delete recoveredBody.request.generationConfig.thinkingConfig;
                        }

                        console.log(`[Antigravity Stream] Stripped thinking config for retry`);
                        this.retryStats.thinkingRecovery++;
                    }

                    const delay = 1000 * Math.pow(2, retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    yield* this.streamApi(method, recoveredBody, true, retryCount + 1, baseURLIndex);
                    return;
                }
            }

            throw error;
        }
    }

    async * parseSSEStream(stream) {
        const rl = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
        });

        let buffer = [];
        for await (const line of rl) {
            if (line.startsWith('data: ')) {
                buffer.push(line.slice(6));
            } else if (line === '' && buffer.length > 0) {
                try {
                    yield JSON.parse(buffer.join('\n'));
                } catch (e) {
                    console.error('[Antigravity Stream] Failed to parse JSON chunk:', buffer.join('\n'));
                }
                buffer = [];
            }
        }

        if (buffer.length > 0) {
            try {
                yield JSON.parse(buffer.join('\n'));
            } catch (e) {
                console.error('[Antigravity Stream] Failed to parse final JSON chunk:', buffer.join('\n'));
            }
        }
    }

    /**
     * Run thinking warmup to get signature
     */
    async runThinkingWarmup(modelName, requestBody, sessionId) {
        // Check if already attempted for this sessionId
        if (warmupAttemptedSessionIds.has(sessionId)) {
            if (warmupSucceededSessionIds.has(sessionId)) {
                return true; // Already succeeded
            }
            // Already failed, don't retry
            return false;
        }

        // Check attempt limit
        if (warmupAttemptedSessionIds.size >= 1000) {
            // Remove oldest entry
            const first = warmupAttemptedSessionIds.values().next().value;
            warmupAttemptedSessionIds.delete(first);
            warmupSucceededSessionIds.delete(first);
        }

        warmupAttemptedSessionIds.add(sessionId);

        const isClaudeThinking = ThinkingUtils.isThinkingModel(modelName);
        const warmupBody = buildThinkingWarmupBody(modelName, requestBody, isClaudeThinking);

        if (!warmupBody) {
            console.warn('[Thinking Warmup] Could not build warmup body');
            return false;
        }

        console.log(`[Thinking Warmup] Executing warmup for ${sessionId} (model: ${modelName})...`);

        try {
            // Form warmup request
            const warmupRequest = {
                model: modelName,
                project: this.projectId,
                request: warmupBody.request,
                userAgent: 'antigravity',
                requestId: `agent-${uuidv4()}`,
            };

            // Send warmup request using streamApi
            const stream = this.streamApi('streamGenerateContent', warmupRequest);

            // Parse SSE stream to get signature
            for await (const chunk of stream) {
                const signature = ThinkingUtils.extractSignatureFromSseChunk(chunk.response || chunk);

                if (signature) {
                    console.log(`[Thinking Warmup] Got signature for ${sessionId}`);

                    // Cache signature
                    const conversationKey = ThinkingUtils.extractConversationKey(requestBody);
                    this.signatureCache.cache(
                        PLUGIN_SESSION_ID,
                        modelName,
                        conversationKey,
                        "Warmup request for thinking signature.",
                        signature
                    );

                    warmupSucceededSessionIds.add(sessionId);
                    return true;
                }
            }

            console.warn(`[Thinking Warmup] No signature found in response for ${sessionId}`);
            return false;
        } catch (error) {
            console.error(`[Thinking Warmup] Failed for ${sessionId}:`, error.message);
            return false;
        }
    }

    async generateContent(model, requestBody) {
        console.log(`[Antigravity Auth Token] Time until expiry: ${formatExpiryTime(this.authClient.credentials.expiry_date)}`);

        let selectedModel = model;
        if (!this.availableModels.includes(model)) {
            console.warn(`[Antigravity] Model '${model}' not found. Using default model: '${this.availableModels[0]}'`);
            selectedModel = this.availableModels[0];
        }

        // Deep copy request body
        const processedRequestBody = ensureRolesInContents(JSON.parse(JSON.stringify(requestBody)));
        const actualModelName = alias2ModelName(selectedModel);

        // Convert processed request body to Antigravity format
        let payload = geminiToAntigravity(actualModelName, { request: processedRequestBody }, this.projectId);

        // Set model name to actual model name
        payload.model = actualModelName;

        // Phase 5: Apply tool ID recovery if enabled
        if (this.thinkingConfig.tool_id_recovery && payload.request?.contents) {
            console.log('[Antigravity] Applying tool ID recovery...');

            // Find orphan tool responses
            const orphans = ToolRecovery.findOrphanToolResponses(payload.request.contents);

            if (orphans.length > 0) {
                console.log(`[Antigravity] Found ${orphans.length} orphan tool responses, creating placeholders`);

                // Create placeholders
                payload.request.contents = ToolRecovery.createPlaceholderToolCalls(payload.request.contents, orphans);
            }

            // Fix tool response grouping
            payload.request.contents = ToolRecovery.fixToolResponseGrouping(payload.request.contents);

            console.log('[Antigravity] Tool ID recovery applied');
        }

        // Phase 4: Apply thinking recovery if enabled
        if (this.thinkingConfig.session_recovery && payload.request?.contents) {
            const state = ThinkingRecovery.analyzeConversationState(payload.request.contents);

            if (ThinkingRecovery.needsThinkingRecovery(state)) {
                console.log('[Antigravity] Detected thinking recovery needed, applying fix...');
                payload.request.contents = ThinkingRecovery.closeToolLoopForThinking(payload.request.contents);
                console.log('[Antigravity] Applied thinking recovery, conversation restored');
            }
        }

        // NEW: Thinking Warmup
        if (this.thinkingConfig.enable_thinking_warmup) {
            const isThinking = ThinkingUtils.isThinkingModel(actualModelName);
            const hasTools = ThinkingUtils.hasToolsInRequest(requestBody);

            if (isThinking && hasTools) {
                console.log(`[Antigravity] Model ${actualModelName} is thinking model with tools - running warmup`);

                // Get conversation key
                const conversationKey = ThinkingUtils.extractConversationKey(payload);
                const sessionId = ThinkingUtils.buildSignatureSessionKey(PLUGIN_SESSION_ID, actualModelName, conversationKey, this.projectId);

                // Run warmup
                const warmupSuccess = await this.runThinkingWarmup(actualModelName, payload, sessionId);

                if (!warmupSuccess) {
                    console.warn(`[Antigravity] Warmup failed for ${sessionId}, proceeding anyway`);
                } else {
                    console.log(`[Antigravity] Warmup succeeded for ${sessionId}`);
                }

                // Phase 2: Verify cached signature is available (for future multi-turn use)
                if (this.thinkingConfig.enable_signature_cache) {
                    const cachedSignature = this.signatureCache?.get(
                        PLUGIN_SESSION_ID,
                        actualModelName,
                        conversationKey,
                        "Warmup request for thinking signature."
                    );

                    if (cachedSignature) {
                        console.log(`[Antigravity] Cached signature available for ${sessionId} (length: ${cachedSignature.length})`);
                        // Note: Signature is used for filtering history thinking blocks, not for thinkingConfig
                    } else {
                        console.log(`[Antigravity] No cached signature for ${sessionId}`);
                    }
                }
            }
        }

        const response = await this.callApi('generateContent', payload);
        return toGeminiApiResponse(response.response);
    }

    async * generateContentStream(model, requestBody) {
        console.log(`[Antigravity Auth Token] Time until expiry: ${formatExpiryTime(this.authClient.credentials.expiry_date)}`);

        let selectedModel = model;
        if (!this.availableModels.includes(model)) {
            console.warn(`[Antigravity] Model '${model}' not found. Using default model: '${this.availableModels[0]}'`);
            selectedModel = this.availableModels[0];
        }

        // Deep copy request body
        const processedRequestBody = ensureRolesInContents(JSON.parse(JSON.stringify(requestBody)));
        const actualModelName = alias2ModelName(selectedModel);

        // Convert processed request body to Antigravity format
        let payload = geminiToAntigravity(actualModelName, { request: processedRequestBody }, this.projectId);

        // Set model name to actual model name
        payload.model = actualModelName;

        // Phase 5: Apply tool ID recovery if enabled
        if (this.thinkingConfig.tool_id_recovery && payload.request?.contents) {
            console.log('[Antigravity] Applying tool ID recovery...');

            // Find orphan tool responses
            const orphans = ToolRecovery.findOrphanToolResponses(payload.request.contents);

            if (orphans.length > 0) {
                console.log(`[Antigravity] Found ${orphans.length} orphan tool responses, creating placeholders`);

                // Create placeholders
                payload.request.contents = ToolRecovery.createPlaceholderToolCalls(payload.request.contents, orphans);
            }

            // Fix tool response grouping
            payload.request.contents = ToolRecovery.fixToolResponseGrouping(payload.request.contents);

            console.log('[Antigravity] Tool ID recovery applied');
        }

        // Phase 4: Apply thinking recovery if enabled
        if (this.thinkingConfig.session_recovery && payload.request?.contents) {
            const state = ThinkingRecovery.analyzeConversationState(payload.request.contents);

            if (ThinkingRecovery.needsThinkingRecovery(state)) {
                console.log('[Antigravity] Detected thinking recovery needed, applying fix...');
                payload.request.contents = ThinkingRecovery.closeToolLoopForThinking(payload.request.contents);
                console.log('[Antigravity] Applied thinking recovery, conversation restored');
            }
        }

        // NEW: Thinking Warmup
        if (this.thinkingConfig.enable_thinking_warmup) {
            const isThinking = ThinkingUtils.isThinkingModel(actualModelName);
            const hasTools = ThinkingUtils.hasToolsInRequest(requestBody);

            if (isThinking && hasTools) {
                console.log(`[Antigravity] Model ${actualModelName} is thinking model with tools - running warmup`);

                // Get conversation key
                const conversationKey = ThinkingUtils.extractConversationKey(payload);
                const sessionId = ThinkingUtils.buildSignatureSessionKey(PLUGIN_SESSION_ID, actualModelName, conversationKey, this.projectId);

                // Run warmup
                const warmupSuccess = await this.runThinkingWarmup(actualModelName, payload, sessionId);

                if (!warmupSuccess) {
                    console.warn(`[Antigravity] Warmup failed for ${sessionId}, proceeding anyway`);
                } else {
                    console.log(`[Antigravity] Warmup succeeded for ${sessionId}`);
                }

                // Phase 2: Verify cached signature is available (for future multi-turn use)
                if (this.thinkingConfig.enable_signature_cache) {
                    const cachedSignature = this.signatureCache?.get(
                        PLUGIN_SESSION_ID,
                        actualModelName,
                        conversationKey,
                        "Warmup request for thinking signature."
                    );

                    if (cachedSignature) {
                        console.log(`[Antigravity] Cached signature available for ${sessionId} (length: ${cachedSignature.length})`);
                        // Note: Signature is used for filtering history thinking blocks, not for thinkingConfig
                    } else {
                        console.log(`[Antigravity] No cached signature for ${sessionId}`);
                    }
                }
            }
        }

        // Store conversation key for signature extraction
        const conversationKeyForCache = ThinkingUtils.extractConversationKey(payload);

        if (!this.emptyResponseAttempts) {
            this.emptyResponseAttempts = new Map();
        }

        const emptyResponseKey = `${actualModelName}:${Date.now()}`;

        let retryCount = 0;
        const maxEmptyRetries = this.thinkingConfig.empty_response_max_attempts || 0;

        while (retryCount <= maxEmptyRetries) {
            let isEmptyResponse = true;

            const stream = this.streamApi('streamGenerateContent', payload);
            for await (const chunk of stream) {
                const response = toGeminiApiResponse(chunk.response);

                isEmptyResponse = !response?.candidates || response.candidates.length === 0 ||
                    (response.candidates[0] && (!response.candidates[0].content || !response.candidates[0].content?.parts));

                if (!isEmptyResponse) {
                    yield response;
                }
            }

            if (!isEmptyResponse || maxEmptyRetries === 0 || retryCount >= maxEmptyRetries) {
                break;
            }

            retryCount++;
            const delay = this.thinkingConfig.empty_response_retry_delay_ms || 2000;
            console.warn(`[Antigravity] Empty response detected (attempt ${retryCount}/${maxEmptyRetries}). Retrying in ${delay}ms...`);
            this.retryStats.emptyResponse++;

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    isExpiryDateNear() {
        try {
            const currentTime = Date.now();
            const cronNearMinutesInMillis = (this.config.CRON_NEAR_MINUTES || 10) * 60 * 1000;
            console.log(`[Antigravity] Expiry date: ${this.authClient.credentials.expiry_date}, Current time: ${currentTime}, ${this.config.CRON_NEAR_MINUTES || 10} minutes from now: ${currentTime + cronNearMinutesInMillis}`);
            return this.authClient.credentials.expiry_date <= (currentTime + cronNearMinutesInMillis);
        } catch (error) {
            console.error(`[Antigravity] Error checking expiry date: ${error.message}`);
            return false;
        }
    }

    /**
     * Phase 2: Graceful shutdown - flush signature cache to disk
     */
    async shutdown() {
        console.log('[Antigravity] Shutting down...');
        if (this.signatureCache) {
            await this.signatureCache.flushToDisk();
            console.log('[Antigravity] Signature cache flushed to disk');
        }
        console.log('[Antigravity] Shutdown complete');
    }

    logRetryStats() {
        console.log('[Antigravity] Retry Statistics:', JSON.stringify(this.retryStats, null, 2));
    }
}

// Phase 2: Handle graceful shutdown
let antigravityInstance = null;

/**
 * Set the Antigravity instance for shutdown handling
 */
export function setAntigravityInstance(instance) {
    antigravityInstance = instance;
}

/**
 * Get the current Antigravity instance
 */
export function getAntigravityInstance() {
    return antigravityInstance;
}

// Handle SIGTERM/SIGINT for graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Antigravity] Received SIGTERM');
    if (antigravityInstance) {
        await antigravityInstance.shutdown();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Antigravity] Received SIGINT');
    if (antigravityInstance) {
        await antigravityInstance.shutdown();
    }
    process.exit(0);
});