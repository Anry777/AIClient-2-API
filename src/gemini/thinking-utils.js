/**
 * Utility functions for thinking models support
 */

// Thinking models for Antigravity
export const THINKING_MODELS = [
    'claude-opus-4-5-thinking',
    'gemini-claude-sonnet-4-5-thinking',
    'claude-sonnet-4-5-thinking',
];

/**
 * Check if a model is a thinking model
 */
export function isThinkingModel(model) {
    if (!model) return false;
    const lowerModel = model.toLowerCase();
    return THINKING_MODELS.some(thinkingModel => {
        const tModel = thinkingModel.replace('gemini-', '').toLowerCase();
        return lowerModel.includes(tModel);
    });
}

/**
 * Check if request contains tool use
 */
export function hasToolUseInRequest(requestBody) {
    if (!requestBody || !requestBody.request) return false;
    const contents = requestBody.request.contents || [];

    return contents.some(content => {
        if (!content.parts) return false;
        return content.parts.some(part =>
            part.functionCall ||
            part.tool_use ||
            (part.type === 'tool_use') ||
            (part.type === 'functionCall')
        );
    });
}

/**
 * Check if request has tools defined
 */
export function hasToolsInRequest(requestBody) {
    if (!requestBody) return false;

    // Check Gemini format (top level tools)
    if (requestBody.tools && requestBody.tools.length > 0) {
        return true;
    }

    // Check Antigravity format (nested in request)
    if (requestBody.request && requestBody.request.tools && requestBody.request.tools.length > 0) {
        return true;
    }

    return false;
}

/**
 * Check if Antigravity format contents have tool use
 */
export function hasAntigravityToolUse(contents) {
    if (!contents || !Array.isArray(contents)) return false;
    return contents.some(content => {
        if (!content.parts) return false;
        return content.parts.some(part => part.functionCall);
    });
}

/**
 * Extract conversation key from request body
 */
export function extractConversationKey(requestBody) {
    if (!requestBody || !requestBody.request) return 'default';
    const request = requestBody.request;

    // Priority fields for conversation ID
    const candidates = [
        request.conversationId,
        request.conversation_id,
        request.thread_id,
        request.threadId,
        request.sessionId,
        request.session_id,
    ];

    for (const candidate of candidates) {
        if (candidate && typeof candidate === 'string') {
            return candidate.trim();
        }
    }

    return 'default';
}

/**
 * Extract signature from SSE chunk
 */
export function extractSignatureFromSseChunk(chunk) {
    if (!chunk || !chunk.candidates || !chunk.candidates[0]) {
        return null;
    }

    const candidate = chunk.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
        return null;
    }

    for (const part of candidate.content.parts) {
        // Format: thoughtSignature
        if (part.thoughtSignature && part.thoughtSignature.length > 50) {
            return part.thoughtSignature;
        }
        // Alternative format: signature in thinking block
        if (part.type === 'thinking' && part.signature && part.signature.length > 50) {
            return part.signature;
        }
    }

    return null;
}

/**
 * Build signature session key
 */
export function buildSignatureSessionKey(sessionId, model, conversationKey, projectKey) {
    const modelKey = typeof model === 'string' && model.trim() ? model.toLowerCase() : 'unknown';
    const projectPart = typeof projectKey === 'string' && projectKey.trim() ? projectKey.trim() : 'default';
    const conversationPart = typeof conversationKey === 'string' && conversationKey.trim() ? conversationKey.trim() : 'default';
    return `${sessionId}:${modelKey}:${projectPart}:${conversationPart}`;
}
