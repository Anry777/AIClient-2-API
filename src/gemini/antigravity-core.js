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

// 配置 HTTP/HTTPS agent 限制连接池大小，避免资源泄漏
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
const REFRESH_SKEW = 3000; // 3000秒（50分钟）提前刷新Token

// Stable Session ID (instead of generateSessionID for each request)
const PLUGIN_SESSION_ID = `-${uuidv4()}`;

// Constants for warmup
const DEFAULT_THINKING_BUDGET = 16000;
const WARMUP_MAX_ATTEMPTS = 2;
const warmupAttemptedSessionIds = new Set();
const warmupSucceededSessionIds = new Set();

// 获取 Antigravity 模型列表
const ANTIGRAVITY_MODELS = getProviderModels('gemini-antigravity');

// 模型别名映射
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

// 不支持的模型列表
const UNSUPPORTED_MODELS = ['chat_20706', 'chat_23310', 'gemini-2.5-flash-thinking', 'gemini-3-pro-low', 'gemini-2.5-pro'];

/**
 * 将别名转换为真实模型名
 */
function alias2ModelName(modelName) {
    return MODEL_ALIAS_MAP[modelName] || modelName;
}

/**
 * 将真实模型名转换为别名
 */
function modelName2Alias(modelName) {
    if (UNSUPPORTED_MODELS.includes(modelName)) {
        return '';
    }
    return MODEL_NAME_MAP[modelName] || modelName;
}

/**
 * 生成随机请求ID
 */
function generateRequestID() {
    return 'agent-' + uuidv4();
}

/**
 * 生成随机会话ID
 */
function generateSessionID() {
    const n = Math.floor(Math.random() * 9000000000000000000);
    return '-' + n.toString();
}

/**
 * 生成随机项目ID
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
 * 将 Gemini 格式请求转换为 Antigravity 格式
 */
function geminiToAntigravity(modelName, payload, projectId) {
    // 深拷贝请求体,避免修改原始对象
    let template = JSON.parse(JSON.stringify(payload));

    // 设置基本字段
    template.model = modelName;
    template.userAgent = 'antigravity';
    template.project = projectId || generateProjectID();
    template.requestId = generateRequestID();

    // 确保 request 对象存在
    if (!template.request) {
        template.request = {};
    }

    // 设置会话ID
    template.request.sessionId = generateSessionID();

    // 删除安全设置
    if (template.request.safetySettings) {
        delete template.request.safetySettings;
    }

    // 设置工具配置
    if (template.request.toolConfig) {
        if (!template.request.toolConfig.functionCallingConfig) {
            template.request.toolConfig.functionCallingConfig = {};
        }
        template.request.toolConfig.functionCallingConfig.mode = 'VALIDATED';
    }

    // 删除 maxOutputTokens
    if (template.request.generationConfig && template.request.generationConfig.maxOutputTokens) {
        delete template.request.generationConfig.maxOutputTokens;
    }

    // 处理 Thinking 配置
    if (template.request.generationConfig && template.request.generationConfig.thinkingConfig) {
        console.log(`[Antigravity Transform] Model: ${modelName}, thinkingConfig BEFORE:`, JSON.stringify(template.request.generationConfig.thinkingConfig, null, 2));

        if (!modelName.startsWith('gemini-3-')) {
            // For non-Gemini-3 models, we ensure thinkingBudget is set if includeThoughts is true
            if (template.request.generationConfig.thinkingConfig.includeThoughts &&
                (!template.request.generationConfig.thinkingConfig.thinkingBudget || template.request.generationConfig.thinkingConfig.thinkingBudget === -1)) {
                // Set a reasonable default budget if not specified
                template.request.generationConfig.thinkingConfig.thinkingBudget = 16000;
            }

            if (template.request.generationConfig.thinkingConfig.thinkingLevel) {
                delete template.request.generationConfig.thinkingConfig.thinkingLevel;
            }
        }

        console.log(`[Antigravity Transform] Model: ${modelName}, thinkingConfig AFTER:`, JSON.stringify(template.request.generationConfig.thinkingConfig, null, 2));
    } else {
        console.log(`[Antigravity Transform] Model: ${modelName}, NO thinkingConfig in generationConfig`);
    }

    // 处理 Claude Sonnet 模型的工具声明
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

    return template;
}

/**
 * 将 Antigravity 响应转换为 Gemini 格式
 */
function toGeminiApiResponse(antigravityResponse) {
    if (!antigravityResponse) return null;

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
 * 确保请求体中的内容部分都有角色属性
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
        // 配置 OAuth2Client 使用自定义的 HTTP agent
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
        this.baseURL = ANTIGRAVITY_BASE_URL_DAILY; // 使用通用 GEMINI_BASE_URL 配置
        this.userAgent = DEFAULT_USER_AGENT; // 支持通用 USER_AGENT 配置
        this.projectId = config.PROJECT_ID;

        // NEW: Thinking support
        this.signatureCache = null;
        this.thinkingConfig = ThinkingConfig.getConfig();

        // 多环境降级顺序
        this.baseURLs = this.baseURL ? [this.baseURL] : [
            ANTIGRAVITY_BASE_URL_DAILY,
            ANTIGRAVITY_BASE_URL_AUTOPUSH
            // ANTIGRAVITY_BASE_URL_PROD // 生产环境已注释
        ];
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('[Antigravity] Initializing Antigravity API Service...');

        // NEW: Initialize signature cache
        this.signatureCache = new SignatureCache({
            memory_ttl_seconds: this.thinkingConfig.signature_cache_memory_ttl_seconds,
            disk_ttl_seconds: this.thinkingConfig.signature_cache_disk_ttl_seconds,
            write_interval_seconds: this.thinkingConfig.signature_cache_write_interval_seconds,
            debug_thinking: this.thinkingConfig.debug_thinking,
        });
        console.log(`[Antigravity] Stable Session ID: ${PLUGIN_SESSION_ID}`);

        await this.initializeAuth();

        if (!this.projectId) {
            this.projectId = await this.discoverProjectAndModels();
        } else {
            console.log(`[Antigravity] Using provided Project ID: ${this.projectId}`);
            // 获取可用模型
            await this.fetchAvailableModels();
        }

        this.isInitialized = true;
        console.log(`[Antigravity] Initialization complete. Project ID: ${this.projectId}`);
    }

    async initializeAuth(forceRefresh = false) {
        // 检查是否需要刷新 Token
        const needsRefresh = forceRefresh || this.isTokenExpiringSoon();

        if (this.authClient.credentials.access_token && !needsRefresh) {
            // Token 有效且不需要刷新
            return;
        }

        // Antigravity 不支持 base64 配置，直接使用文件路径

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
                // 保存刷新后的凭证到文件
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

            console.log('\n[Antigravity Auth] Открываю браузер для авторизации...');
            console.log('[Antigravity Auth] Ссылка для авторизации:', authUrl, '\n');

            // 自动打开浏览器
            const showFallbackMessage = () => {
                console.log('[Antigravity Auth] Не удалось автоматически открыть браузер. Откройте ссылку выше вручную.');
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
                // 获取可用模型
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
            // 获取可用模型
            await this.fetchAvailableModels();
            return discoveredProjectId;
        } catch (error) {
            console.error('[Antigravity] Failed to discover Project ID:', error.response?.data || error.message);
            console.log('[Antigravity] Falling back to generated Project ID as last resort...');
            const fallbackProjectId = generateProjectID();
            console.log(`[Antigravity] Generated fallback Project ID: ${fallbackProjectId}`);
            // 获取可用模型
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
            // Debug logging for request body
            if (body.generationConfig?.thinkingConfig) {
                console.log('[Antigravity] Request with thinkingConfig:', JSON.stringify({
                    model: body.model,
                    thinkingConfig: body.generationConfig.thinkingConfig
                }, null, 2));
            }

            const requestOptions = {
                url: `${baseURL}/${ANTIGRAVITY_API_VERSION}:${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': this.userAgent
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
                    'User-Agent': this.userAgent
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

        // 深拷贝请求体
        const processedRequestBody = ensureRolesInContents(JSON.parse(JSON.stringify(requestBody)));
        const actualModelName = alias2ModelName(selectedModel);

        // 将处理后的请求体转换为 Antigravity 格式
        const payload = geminiToAntigravity(actualModelName, { request: processedRequestBody }, this.projectId);

        // 设置模型名称为实际模型名
        payload.model = actualModelName;

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

        // 深拷贝请求体
        const processedRequestBody = ensureRolesInContents(JSON.parse(JSON.stringify(requestBody)));
        const actualModelName = alias2ModelName(selectedModel);

        // 将处理后的请求体转换为 Antigravity 格式
        const payload = geminiToAntigravity(actualModelName, { request: processedRequestBody }, this.projectId);

        // 设置模型名称为实际模型名
        payload.model = actualModelName;

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
            }
        }

        const stream = this.streamApi('streamGenerateContent', payload);
        for await (const chunk of stream) {
            yield toGeminiApiResponse(chunk.response);
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
}