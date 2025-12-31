import { extractSystemPromptFromRequestBody, MODEL_PROTOCOL_PREFIX } from '../common.js';
import { ProviderStrategy } from '../provider-strategy.js';

/**
 * Antigravity Claude Messages provider strategy implementation.
 * This strategy handles Claude Messages API format requests for the gemini-antigravity provider.
 * 
 * - Request format: Claude Messages (messages array)
 * - Response format: Antigravity (Gemini candidates)
 * - Internal format: Antigravity (contents, systemInstruction)
 */
class AntigravityClaudeStrategy extends ProviderStrategy {
    extractModelAndStreamInfo(req, requestBody) {
        const model = requestBody.model;
        const isStream = requestBody.stream === true;
        return { model, isStream };
    }

    extractResponseText(response) {
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                return candidate.content.parts.map(part => part.text).join('');
            }
        }
        return '';
    }

    extractPromptText(requestBody) {
        if (requestBody.contents && requestBody.contents.length > 0) {
            const lastContent = requestBody.contents[requestBody.contents.length - 1];
            if (lastContent.parts && lastContent.parts.length > 0) {
                return lastContent.parts.map(part => part.text).join('');
            }
        }
        return '';
    }

    async applySystemPromptFromFile(config, requestBody) {
        if (!config.SYSTEM_PROMPT_FILE_PATH) {
            return requestBody;
        }

        const filePromptContent = config.SYSTEM_PROMPT_CONTENT;
        if (filePromptContent === null) {
            return requestBody;
        }

        const existingSystemText = extractSystemPromptFromRequestBody(requestBody, MODEL_PROTOCOL_PREFIX.GEMINI);

        const newSystemText = config.SYSTEM_PROMPT_MODE === 'append' && existingSystemText
            ? `${existingSystemText}\n${filePromptContent}`
            : filePromptContent;

        requestBody.systemInstruction = { parts: [{ text: newSystemText }] };
        if (requestBody.system_instruction) {
            delete requestBody.system_instruction;
        }
        console.log(`[System Prompt] Applied system prompt from ${config.SYSTEM_PROMPT_FILE_PATH} in '${config.SYSTEM_PROMPT_MODE}' mode for provider 'gemini-antigravity' (Claude Messages API).`);

        return requestBody;
    }

    async manageSystemPrompt(requestBody) {
        const incomingSystemText = extractSystemPromptFromRequestBody(requestBody, MODEL_PROTOCOL_PREFIX.GEMINI);
        await this._updateSystemPromptFile(incomingSystemText, MODEL_PROTOCOL_PREFIX.GEMINI);
    }
}

export { AntigravityClaudeStrategy };
