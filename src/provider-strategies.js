import { MODEL_PROTOCOL_PREFIX, MODEL_PROVIDER, ENDPOINT_TYPE } from './common.js';
import { GeminiStrategy } from './gemini/gemini-strategy.js';
import { OpenAIStrategy } from './openai/openai-strategy.js';
import { ClaudeStrategy } from './claude/claude-strategy.js';
import { ResponsesAPIStrategy } from './openai/openai-responses-strategy.js';
import { AntigravityClaudeStrategy } from './gemini/antigravity-strategy.js';

/**
 * Strategy factory that returns appropriate strategy instance based on provider protocol or full provider name.
 */
class ProviderStrategyFactory {
    static getStrategy(providerOrProtocol, endpointType = null) {
        // Handle special case: gemini-antigravity with Claude Messages API (/v1/messages)
        if (providerOrProtocol === MODEL_PROVIDER.ANTIGRAVITY && endpointType === ENDPOINT_TYPE.CLAUDE_MESSAGE) {
            return new AntigravityClaudeStrategy();
        }

        // Handle protocol prefix
        switch (providerOrProtocol) {
            case MODEL_PROTOCOL_PREFIX.GEMINI:
                return new GeminiStrategy();
            case MODEL_PROTOCOL_PREFIX.OPENAI:
                return new OpenAIStrategy();
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return new ResponsesAPIStrategy();
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return new ClaudeStrategy();
            case MODEL_PROTOCOL_PREFIX.GEMINI_ANTIGRAVITY:
                return new AntigravityClaudeStrategy();
            default:
                throw new Error(`Unsupported provider protocol: ${providerOrProtocol}`);
        }
    }
}

export { ProviderStrategyFactory };
