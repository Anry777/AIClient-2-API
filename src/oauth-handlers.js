import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import open from 'open';
import { broadcastEvent } from './ui-manager.js';

/**
 * OAuth provider configuration
 */
const OAUTH_PROVIDERS = {
    'gemini-cli-oauth': {
        clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
        clientSecret: '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',
        port: 8085,
        credentialsDir: '.gemini',
        credentialsFile: 'oauth_creds.json',
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        logPrefix: '[Gemini Auth]'
    },
    'gemini-antigravity': {
        clientId: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
        clientSecret: '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',
        port: 8086,
        credentialsDir: '.antigravity',
        credentialsFile: 'oauth_creds.json',
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        logPrefix: '[Antigravity Auth]'
    }
};

/**
 * Active server instance management
 */
const activeServers = new Map();

/**
 * Active polling task management
 */
const activePollingTasks = new Map();

/**
 * Qwen OAuth configuration
 */
const QWEN_OAUTH_CONFIG = {
    clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
    scope: 'openid profile email model.completion',
    deviceCodeEndpoint: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    tokenEndpoint: 'https://chat.qwen.ai/api/v1/oauth2/token',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    credentialsDir: '.qwen',
    credentialsFile: 'oauth_creds.json',
    logPrefix: '[Qwen Auth]'
};

/**
 * Generate HTML response page
 * @param {boolean} isSuccess - Whether successful
 * @param {string} message - Display message
 * @returns {string} HTML content
 */
function generateResponsePage(isSuccess, message) {
    const title = isSuccess ? 'Authorization Successful!' : 'Authorization Failed';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;
}

/**
 * Close active server on specified port
 * @param {number} port - Port number
 * @returns {Promise<void>}
 */
async function closeActiveServer(port) {
    const existingServer = activeServers.get(port);
    if (existingServer && existingServer.listening) {
        return new Promise((resolve) => {
            existingServer.close(() => {
                activeServers.delete(port);
                console.log(`[OAuth] Closed old server on port ${port}`);
                resolve();
            });
        });
    }
}

/**
 * Create OAuth callback server
 * @param {Object} config - OAuth provider configuration
 * @param {string} redirectUri - Redirect URI
 * @param {OAuth2Client} authClient - OAuth2 client
 * @param {string} credPath - Credentials save path
 * @param {string} provider - Provider identifier
 * @returns {Promise<http.Server>} HTTP server instance
 */
async function createOAuthCallbackServer(config, redirectUri, authClient, credPath, provider) {
    // First close old server on this port
    await closeActiveServer(config.port);
    
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const url = new URL(req.url, redirectUri);
                const code = url.searchParams.get('code');
                const errorParam = url.searchParams.get('error');
                
                if (code) {
                    console.log(`${config.logPrefix} Received successful callback from Google: ${req.url}`);
                    
                    try {
                        const { tokens } = await authClient.getToken(code);
                        await fs.promises.mkdir(path.dirname(credPath), { recursive: true });
                        await fs.promises.writeFile(credPath, JSON.stringify(tokens, null, 2));
                        console.log(`${config.logPrefix} New token received and saved to file`);
                        
                        // Broadcast authorization success event
                        broadcastEvent('oauth_success', {
                            provider: provider,
                            credPath: credPath,
                            timestamp: new Date().toISOString()
                        });
                        
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(generateResponsePage(true, 'You can close this page'));
                    } catch (tokenError) {
                        console.error(`${config.logPrefix} Failed to get token:`, tokenError);
                        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(generateResponsePage(false, `Failed to get token: ${tokenError.message}`));
                    } finally {
                        server.close(() => {
                            activeServers.delete(config.port);
                        });
                    }
                } else if (errorParam) {
                    const errorMessage = `Authorization failed. Google returned error: ${errorParam}`;
                    console.error(`${config.logPrefix}`, errorMessage);
                    
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(generateResponsePage(false, errorMessage));
                    server.close(() => {
                        activeServers.delete(config.port);
                    });
                } else {
                    console.log(`${config.logPrefix} Ignoring unrelated request: ${req.url}`);
                    res.writeHead(204);
                    res.end();
                }
            } catch (error) {
                console.error(`${config.logPrefix} Error processing callback:`, error);
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(generateResponsePage(false, `Server error: ${error.message}`));
                
                if (server.listening) {
                    server.close(() => {
                        activeServers.delete(config.port);
                    });
                }
            }
        });
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`${config.logPrefix} Port ${config.port} is already in use`);
                reject(new Error(`Port ${config.port} is already in use`));
            } else {
                console.error(`${config.logPrefix} Server error:`, err);
                reject(err);
            }
        });
        
        const host = '0.0.0.0';
        server.listen(config.port, host, () => {
            console.log(`${config.logPrefix} OAuth callback server started at ${host}:${config.port}`);
            activeServers.set(config.port, server);
            resolve(server);
        });
    });
}

/**
 * Handle Google OAuth authorization (generic function)
 * @param {string} providerKey - Provider key name
 * @param {Object} currentConfig - Current config object
 * @returns {Promise<Object>} Returns authorization URL and related info
 */
async function handleGoogleOAuth(providerKey, currentConfig) {
    const config = OAUTH_PROVIDERS[providerKey];
    if (!config) {
        throw new Error(`Unknown provider: ${providerKey}`);
    }
    
    const host = 'localhost';
    const redirectUri = `http://${host}:${config.port}`;
    
    const authClient = new OAuth2Client(config.clientId, config.clientSecret);
    authClient.redirectUri = redirectUri;
    
    const authUrl = authClient.generateAuthUrl({
        access_type: 'offline',
        scope: config.scope
    });
    
    // Start callback server
    const credPath = path.join(os.homedir(), config.credentialsDir, config.credentialsFile);
    
    try {
        await createOAuthCallbackServer(config, redirectUri, authClient, credPath, providerKey);
    } catch (error) {
        throw new Error(`Failed to start callback server: ${error.message}`);
    }
    
    return {
        authUrl,
        authInfo: {
            provider: providerKey,
            redirectUri: redirectUri,
            port: config.port,
            instructions: 'Please open this link in your browser to authorize. After authorization completes, the credentials file will be saved automatically'
        }
    };
}

/**
 * Handle Gemini CLI OAuth authorization
 * @param {Object} currentConfig - Current config object
 * @returns {Promise<Object>} Returns authorization URL and related info
 */
export async function handleGeminiCliOAuth(currentConfig) {
    return handleGoogleOAuth('gemini-cli-oauth', currentConfig);
}

/**
 * Handle Gemini Antigravity OAuth authorization
 * @param {Object} currentConfig - Current config object
 * @returns {Promise<Object>} Returns authorization URL and related info
 */
export async function handleGeminiAntigravityOAuth(currentConfig) {
    return handleGoogleOAuth('gemini-antigravity', currentConfig);
}

/**
 * Generate PKCE code verifier
 * @returns {string} Base64URL encoded random string
 */
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge
 * @param {string} codeVerifier - Code verifier
 * @returns {string} Base64URL encoded SHA256 hash
 */
function generateCodeChallenge(codeVerifier) {
    const hash = crypto.createHash('sha256');
    hash.update(codeVerifier);
    return hash.digest('base64url');
}

/**
 * Stop active polling task
 * @param {string} taskId - Task identifier
 */
function stopPollingTask(taskId) {
    const task = activePollingTasks.get(taskId);
    if (task) {
        task.shouldStop = true;
        activePollingTasks.delete(taskId);
        console.log(`${QWEN_OAUTH_CONFIG.logPrefix} Stopped polling task: ${taskId}`);
    }
}

/**
 * Poll for Qwen OAuth token
 * @param {string} deviceCode - Device code
 * @param {string} codeVerifier - PKCE code verifier
 * @param {number} interval - Polling interval (seconds)
 * @param {number} expiresIn - Expiry time (seconds)
 * @param {string} taskId - Task identifier
 * @returns {Promise<Object>} Returns token info
 */
async function pollQwenToken(deviceCode, codeVerifier, interval = 5, expiresIn = 300, taskId = 'default') {
    const credPath = path.join(os.homedir(), QWEN_OAUTH_CONFIG.credentialsDir, QWEN_OAUTH_CONFIG.credentialsFile);
    const maxAttempts = Math.floor(expiresIn / interval);
    let attempts = 0;
    
    // ...
    
    return poll();
}

/**
 * 处理 Qwen OAuth 授权（设备授权流程）
 * @param {Object} currentConfig - 当前配置对象
 * @returns {Promise<Object>} 返回授权 URL 和相关信息
 */
export async function handleQwenOAuth(currentConfig) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    
    const bodyData = {
        // ...
        scope: QWEN_OAUTH_CONFIG.scope,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    };
    
    const formBody = Object.entries(bodyData)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    try {
        const response = await fetch(QWEN_OAUTH_CONFIG.deviceCodeEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: formBody
        });
        
        if (!response.ok) {
            throw new Error(`Qwen OAuth request failed: ${response.status} ${response.statusText}`);
        }
        
        const deviceAuth = await response.json();
        
        if (!deviceAuth.device_code || !deviceAuth.verification_uri_complete) {
            throw new Error('Qwen OAuth response format error, missing required fields');
        }
        
        // Start background polling for token
        const interval = deviceAuth.interval || 5;
        // const expiresIn = deviceAuth.expires_in || 1800;
        const expiresIn = 300;
        
        // Generate unique task ID
        const taskId = `qwen-${deviceAuth.device_code.substring(0, 8)}-${Date.now()}`;
        
        // First stop all existing Qwen polling tasks
        for (const [existingTaskId] of activePollingTasks.entries()) {
            if (existingTaskId.startsWith('qwen-')) {
                stopPollingTask(existingTaskId);
            }
        }
        
        // Don't wait for polling to complete, return authorization info immediately
        pollQwenToken(deviceAuth.device_code, codeVerifier, interval, expiresIn, taskId)
            .catch(error => {
                console.error(`${QWEN_OAUTH_CONFIG.logPrefix} Polling failed [${taskId}]:`, error);
                // Broadcast authorization failure event
                broadcastEvent('oauth_error', {
                    provider: 'openai-qwen-oauth',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            });
        
        return {
            authUrl: deviceAuth.verification_uri_complete,
            authInfo: {
                provider: 'openai-qwen-oauth',
                deviceCode: deviceAuth.device_code,
                userCode: deviceAuth.user_code,
                verificationUri: deviceAuth.verification_uri,
                verificationUriComplete: deviceAuth.verification_uri_complete,
                expiresIn: expiresIn,
                interval: interval,
                codeVerifier: codeVerifier,
                instructions: 'Please open this link in your browser and enter the user code to authorize. After authorization completes, the system will automatically poll for the access token.'
            }
        };
    } catch (error) {
        console.error(`${QWEN_OAUTH_CONFIG.logPrefix} Request failed:`, error);
        throw new Error(`Qwen OAuth authorization failed: ${error.message}`);
    }
}