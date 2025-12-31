/**
 * OpenAI Converter
 * Handles conversion between OpenAI protocol and other protocols
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseConverter } from '../BaseConverter.js';
import {
    extractAndProcessSystemMessages as extractSystemMessages,
    extractTextFromMessageContent as extractText,
    safeParseJSON,
    checkAndAssignOrDefault,
    extractThinkingFromOpenAIText,
    mapFinishReason,
    cleanJsonSchemaProperties as cleanJsonSchema,
    CLAUDE_DEFAULT_MAX_TOKENS,
    CLAUDE_DEFAULT_TEMPERATURE,
    CLAUDE_DEFAULT_TOP_P,
    GEMINI_DEFAULT_MAX_TOKENS,
    GEMINI_DEFAULT_TEMPERATURE,
    GEMINI_DEFAULT_TOP_P,
    OPENAI_DEFAULT_INPUT_TOKEN_LIMIT,
    OPENAI_DEFAULT_OUTPUT_TOKEN_LIMIT
} from '../utils.js';
import { MODEL_PROTOCOL_PREFIX } from '../../common.js';
import {
    generateResponseCreated,
    generateResponseInProgress,
    generateOutputItemAdded,
    generateContentPartAdded,
    generateOutputTextDone,
    generateContentPartDone,
    generateOutputItemDone,
    generateResponseCompleted
} from '../../openai/openai-responses-core.mjs';

/**
 * OpenAI Converter Class
 * Implements conversion from OpenAI protocol to other protocols
 */
export class OpenAIConverter extends BaseConverter {
    constructor() {
        super('openai');
    }

    /**
     * Convert Request
     */
    convertRequest(data, targetProtocol) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeRequest(data);
            case MODEL_PROTOCOL_PREFIX.GEMINI:
                return this.toGeminiRequest(data);
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesRequest(data);
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * Convert Response
     */
    convertResponse(data, targetProtocol, model) {
        // When OpenAI is the source format, response conversion is usually not needed
        // because other protocols will convert to OpenAI format
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeResponse(data, model);
            case MODEL_PROTOCOL_PREFIX.GEMINI:
                return this.toGeminiResponse(data, model);
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesResponse(data, model);
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * Convert Stream Chunk
     */
    convertStreamChunk(chunk, targetProtocol, model) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeStreamChunk(chunk, model);
            case MODEL_PROTOCOL_PREFIX.GEMINI:
                return this.toGeminiStreamChunk(chunk, model);
            case MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES:
                return this.toOpenAIResponsesStreamChunk(chunk, model);
            default:
                throw new Error(`Unsupported target protocol: ${targetProtocol}`);
        }
    }

    /**
     * Convert Model List
     */
    convertModelList(data, targetProtocol) {
        switch (targetProtocol) {
            case MODEL_PROTOCOL_PREFIX.CLAUDE:
                return this.toClaudeModelList(data);
            case MODEL_PROTOCOL_PREFIX.GEMINI:
                return this.toGeminiModelList(data);
            default:
                return data;
        }
    }

    // =========================================================================
    // OpenAI -> Claude Conversion
    // =========================================================================

    /**
     * OpenAI Request -> Claude Request
     */
    toClaudeRequest(openaiRequest) {
        const messages = openaiRequest.messages || [];
        const { systemInstruction, nonSystemMessages } = extractSystemMessages(messages);

        const claudeMessages = [];

        for (const message of nonSystemMessages) {
            const role = message.role === 'assistant' ? 'assistant' : 'user';
            let content = [];

            if (message.role === 'tool') {
                // Tool result message
                content.push({
                    type: 'tool_result',
                    tool_use_id: message.tool_call_id,
                    content: safeParseJSON(message.content)
                });
                claudeMessages.push({ role: 'user', content: content });
            } else if (message.role === 'assistant' && (message.tool_calls?.length || message.function_calls?.length)) {
                // Assistant tool call message - supports tool_calls and function_calls
                const calls = message.tool_calls || message.function_calls || [];
                const toolUseBlocks = calls.map(tc => ({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.function.name,
                    input: safeParseJSON(tc.function.arguments)
                }));
                claudeMessages.push({ role: 'assistant', content: toolUseBlocks });
            } else {
                // Normal message
                if (typeof message.content === 'string') {
                    if (message.content) {
                        content.push({ type: 'text', text: message.content.trim() });
                    }
                } else if (Array.isArray(message.content)) {
                    message.content.forEach(item => {
                        if (!item) return;
                        switch (item.type) {
                            case 'text':
                                if (item.text) {
                                    content.push({ type: 'text', text: item.text.trim() });
                                }
                                break;
                            case 'image_url':
                                if (item.image_url) {
                                    const imageUrl = typeof item.image_url === 'string'
                                        ? item.image_url
                                        : item.image_url.url;
                                    if (imageUrl.startsWith('data:')) {
                                        const [header, data] = imageUrl.split(',');
                                        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                                        content.push({
                                            type: 'image',
                                            source: {
                                                type: 'base64',
                                                media_type: mediaType,
                                                data: data
                                            }
                                        });
                                    } else {
                                        content.push({ type: 'text', text: `[Image: ${imageUrl}]` });
                                    }
                                }
                                break;
                            case 'audio':
                                if (item.audio_url) {
                                    const audioUrl = typeof item.audio_url === 'string'
                                        ? item.audio_url
                                        : item.audio_url.url;
                                    content.push({ type: 'text', text: `[Audio: ${audioUrl}]` });
                                }
                                break;
                        }
                    });
                }
                if (content.length > 0) {
                    claudeMessages.push({ role: role, content: content });
                }
            }
        }
        // Merge adjacent messages with the same role
        const mergedClaudeMessages = [];
        for (let i = 0; i < claudeMessages.length; i++) {
            const currentMessage = claudeMessages[i];

            if (mergedClaudeMessages.length === 0) {
                mergedClaudeMessages.push(currentMessage);
            } else {
                const lastMessage = mergedClaudeMessages[mergedClaudeMessages.length - 1];

                // If current message role matches last message role, merge content arrays
                if (lastMessage.role === currentMessage.role) {
                    lastMessage.content = lastMessage.content.concat(currentMessage.content);
                } else {
                    mergedClaudeMessages.push(currentMessage);
                }
            }
        }

        // Clean up trailing whitespace from the last assistant message
        if (mergedClaudeMessages.length > 0) {
            const lastMessage = mergedClaudeMessages[mergedClaudeMessages.length - 1];
            if (lastMessage.role === 'assistant' && Array.isArray(lastMessage.content)) {
                // Find the last text content block from back to front
                for (let i = lastMessage.content.length - 1; i >= 0; i--) {
                    const contentBlock = lastMessage.content[i];
                    if (contentBlock.type === 'text' && contentBlock.text) {
                        // Remove trailing whitespace characters
                        contentBlock.text = contentBlock.text.trimEnd();
                        break;
                    }
                }
            }
        }


        const claudeRequest = {
            model: openaiRequest.model,
            messages: mergedClaudeMessages,
            max_tokens: checkAndAssignOrDefault(openaiRequest.max_tokens, CLAUDE_DEFAULT_MAX_TOKENS),
            temperature: checkAndAssignOrDefault(openaiRequest.temperature, CLAUDE_DEFAULT_TEMPERATURE),
            top_p: checkAndAssignOrDefault(openaiRequest.top_p, CLAUDE_DEFAULT_TOP_P),
        };

        if (systemInstruction) {
            claudeRequest.system = extractText(systemInstruction.parts[0].text);
        }

        if (openaiRequest.tools?.length) {
            claudeRequest.tools = openaiRequest.tools.map(t => ({
                name: t.function.name,
                description: t.function.description || '',
                input_schema: t.function.parameters || { type: 'object', properties: {} }
            }));
            claudeRequest.tool_choice = this.buildClaudeToolChoice(openaiRequest.tool_choice);
        }

        return claudeRequest;
    }

    /**
     * OpenAI Response -> Claude Response
     */
    toClaudeResponse(openaiResponse, model) {
        if (!openaiResponse || !openaiResponse.choices || openaiResponse.choices.length === 0) {
            return {
                id: `msg_${uuidv4()}`,
                type: "message",
                role: "assistant",
                content: [],
                model: model,
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: {
                    input_tokens: openaiResponse?.usage?.prompt_tokens || 0,
                    output_tokens: openaiResponse?.usage?.completion_tokens || 0
                }
            };
        }

        const choice = openaiResponse.choices[0];
        const contentList = [];

        // Handle tool calls - supports tool_calls and function_calls
        const toolCalls = choice.message?.tool_calls || choice.message?.function_calls || [];
        for (const toolCall of toolCalls.filter(tc => tc && typeof tc === 'object')) {
            if (toolCall.function) {
                const func = toolCall.function;
                const argStr = func.arguments || "{}";
                let argObj;
                try {
                    argObj = typeof argStr === 'string' ? JSON.parse(argStr) : argStr;
                } catch (e) {
                    argObj = {};
                }
                contentList.push({
                    type: "tool_use",
                    id: toolCall.id || "",
                    name: func.name || "",
                    input: argObj,
                });
            }
        }

        // Handle reasoning_content (thinking content)
        const reasoningContent = choice.message?.reasoning_content || "";
        if (reasoningContent) {
            contentList.push({
                type: "thinking",
                thinking: reasoningContent
            });
        }

        // Handle text content
        const contentText = choice.message?.content || "";
        if (contentText) {
            const extractedContent = extractThinkingFromOpenAIText(contentText);
            if (Array.isArray(extractedContent)) {
                contentList.push(...extractedContent);
            } else {
                contentList.push({ type: "text", text: extractedContent });
            }
        }

        // Map finish reason
        const stopReason = mapFinishReason(
            choice.finish_reason || "stop",
            "openai",
            "anthropic"
        );

        return {
            id: `msg_${uuidv4()}`,
            type: "message",
            role: "assistant",
            content: contentList,
            model: model,
            stop_reason: stopReason,
            stop_sequence: null,
            usage: {
                input_tokens: openaiResponse.usage?.prompt_tokens || 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: openaiResponse.usage?.prompt_tokens_details?.cached_tokens || 0,
                output_tokens: openaiResponse.usage?.completion_tokens || 0
            }
        };
    }

    /**
     * OpenAI Stream Chunk -> Claude Stream Chunk
     *
     * This method implements the reverse conversion logic of ClaudeConverter.toOpenAIStreamChunk
     * Converts OpenAI stream chunks to Claude stream events
     */
    toClaudeStreamChunk(openaiChunk, model) {
        if (!openaiChunk) return null;

        // Handle OpenAI chunk object
        if (typeof openaiChunk === 'object' && !Array.isArray(openaiChunk)) {
            const choice = openaiChunk.choices?.[0];
            if (!choice) {
                return null;
            }

            const delta = choice.delta;
            const finishReason = choice.finish_reason;
            const events = [];

            // Commented out section is for compatibility with claude code, but not cherry studio
            // 1. Handle role (corresponds to message_start)
            // if (delta?.role === "assistant") {
            //     events.push({
            //         type: "message_start",
            //         message: {
            //             id: openaiChunk.id || `msg_${uuidv4()}`,
            //             type: "message",
            //             role: "assistant",
            //             content: [],
            //             model: model || openaiChunk.model || "unknown",
            //             stop_reason: null,
            //             stop_sequence: null,
            //             usage: {
            //                 input_tokens: openaiChunk.usage?.prompt_tokens || 0,
            //                 output_tokens: 0
            //             }
            //         }
            //     });
            //     events.push({
            //         type: "content_block_start",
            //         index: 0,
            //         content_block: {
            //             type: "text",
            //             text: ""
            //         }
            //     });
            // }

            // 2. Handle tool_calls (corresponds to content_block_start and content_block_delta)
            // if (delta?.tool_calls) {
            //     const toolCalls = delta.tool_calls;
            //     for (const toolCall of toolCalls) {
            //         // If function.name is present, it's the start of a tool call
            //         if (toolCall.function?.name) {
            //             events.push({
            //                 type: "content_block_start",
            //                 index: toolCall.index || 0,
            //                 content_block: {
            //                     type: "tool_use",
            //                     id: toolCall.id || `tool_${uuidv4()}`,
            //                     name: toolCall.function.name,
            //                     input: {}
            //                 }
            //             });
            //         }

            //         // If function.arguments is present, it's an argument delta
            //         if (toolCall.function?.arguments) {
            //             events.push({
            //                 type: "content_block_delta",
            //                 index: toolCall.index || 0,
            //                 delta: {
            //                     type: "input_json_delta",
            //                     partial_json: toolCall.function.arguments
            //                 }
            //             });
            //         }
            //     }
            // }

            // 3. Handle reasoning_content (corresponds to thinking type content_block)
            if (delta?.reasoning_content) {
                // Note: We might need to send content_block_start first, but due to complex state management,
                // we assume the caller handles this logic
                events.push({
                    type: "content_block_delta",
                    index: 0,
                    delta: {
                        type: "thinking_delta",
                        thinking: delta.reasoning_content
                    }
                });
            }

            // 4. Handle normal text content (corresponds to text type content_block)
            if (delta?.content) {
                events.push({
                    type: "content_block_delta",
                    index: 0,
                    delta: {
                        type: "text_delta",
                        text: delta.content
                    }
                });
            }

            // 5. Handle finish_reason (corresponds to message_delta and message_stop)
            if (finishReason) {
                // Map finish reason
                const stopReason = finishReason === "stop" ? "end_turn" :
                    finishReason === "length" ? "max_tokens" :
                        "end_turn";

                events.push({
                    type: "content_block_stop",
                    index: 0
                });
                // Send message_delta
                events.push({
                    type: "message_delta",
                    delta: {
                        stop_reason: stopReason,
                        stop_sequence: null
                    },
                    usage: {
                        input_tokens: openaiChunk.usage?.prompt_tokens || 0,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: openaiChunk.usage?.prompt_tokens_details?.cached_tokens || 0,
                        output_tokens: openaiChunk.usage?.completion_tokens || 0
                    }
                });

                // Send message_stop
                events.push({
                    type: "message_stop"
                });
            }

            return events.length > 0 ? events : null;
        }

        // Backward compatibility: Handle string format
        if (typeof openaiChunk === 'string') {
            return {
                type: "content_block_delta",
                index: 0,
                delta: {
                    type: "text_delta",
                    text: openaiChunk
                }
            };
        }

        return null;
    }

    /**
     * OpenAI Model List -> Claude Model List
     */
    toClaudeModelList(openaiModels) {
        return {
            models: openaiModels.data.map(m => ({
                name: m.id,
                description: "",
            })),
        };
    }

    /**
     * Convert OpenAI model list to Gemini model list
     */
    toGeminiModelList(openaiModels) {
        const models = openaiModels.data || [];
        return {
            models: models.map(m => ({
                name: `models/${m.id}`,
                version: m.version || "1.0.0",
                displayName: m.displayName || m.id,
                description: m.description || `A generative model for text and chat generation. ID: ${m.id}`,
                inputTokenLimit: m.inputTokenLimit || OPENAI_DEFAULT_INPUT_TOKEN_LIMIT,
                outputTokenLimit: m.outputTokenLimit || OPENAI_DEFAULT_OUTPUT_TOKEN_LIMIT,
                supportedGenerationMethods: m.supportedGenerationMethods || ["generateContent", "streamGenerateContent"]
            }))
        };
    }

    /**
     * Build Claude tool choice
     */
    buildClaudeToolChoice(toolChoice) {
        if (typeof toolChoice === 'string') {
            const mapping = { auto: 'auto', none: 'none', required: 'any' };
            return { type: mapping[toolChoice] };
        }
        if (typeof toolChoice === 'object' && toolChoice.function) {
            return { type: 'tool', name: toolChoice.function.name };
        }
        return undefined;
    }

    // =========================================================================
    // OpenAI -> OpenAI Responses Conversion
    // =========================================================================

    /**
     * OpenAI Request -> OpenAI Responses Request
     */
    toOpenAIResponsesRequest(openaiRequest) {
        // OpenAI Responses API is usually handled directly by the backend,
        // but if conversion is needed, we map the fields
        return {
            model: openaiRequest.model,
            instructions: extractText(extractSystemMessages(openaiRequest.messages || []).systemInstruction),
            input: extractText(extractSystemMessages(openaiRequest.messages || []).nonSystemMessages),
            ...openaiRequest // Pass through other parameters
        };
    }

    /**
     * OpenAI Response -> OpenAI Responses Response
     */
    toOpenAIResponsesResponse(openaiResponse, model) {
        // This conversion is highly dependent on the specific OpenAI Responses API structure.
        // For now, we'll assume a direct passthrough or minimal transformation.
        // If specific mapping is needed, it would go here.
        return openaiResponse;
    }

    // =========================================================================
    // OpenAI -> Gemini Conversion
    // =========================================================================

    /**
     * OpenAI Request -> Gemini Request
     */
    toGeminiRequest(openaiRequest) {
        const messages = openaiRequest.messages || [];
        const { systemInstruction, nonSystemMessages } = extractSystemMessages(messages);

        const processedMessages = [];
        let lastMessage = null;
        
        console.log('[OpenAI->Gemini] Converting request with messages:', JSON.stringify(nonSystemMessages.map(m => ({
            role: m.role,
            hasToolCalls: !!m.tool_calls?.length,
            toolCallId: m.tool_call_id,
            hasName: !!m.name,
            contentType: typeof m.content
        })), null, 2));

        for (const message of nonSystemMessages) {
            const geminiRole = message.role === 'assistant' ? 'model' : message.role;

            if (geminiRole === 'tool') {
                console.log('[OpenAI->Gemini] Processing tool message:', { tool_call_id: message.tool_call_id, name: message.name });
                // Save previous model response with functionCall
                if (lastMessage) {
                    processedMessages.push(lastMessage);
                    lastMessage = null;
                }

                // Get function name from message.name or via tool_call_id
                let functionName = message.name;
                if (!functionName && message.tool_call_id) {
                    const currentIndex = nonSystemMessages.indexOf(message);
                    for (let i = currentIndex - 1; i >= 0; i--) {
                        const prevMsg = nonSystemMessages[i];
                        if (prevMsg.role === 'assistant' && prevMsg.tool_calls) {
                            const toolCall = prevMsg.tool_calls.find(tc => tc.id === message.tool_call_id);
                            if (toolCall?.function?.name) {
                                functionName = toolCall.function.name;
                                break;
                            }
                        }
                    }
                }
                
                console.log('[OpenAI->Gemini] Resolved function name:', functionName);

                // Build functionResponse according to Gemini API spec
                const parsedContent = safeParseJSON(message.content);
                const contentStr = typeof parsedContent === 'string' ? parsedContent : JSON.stringify(parsedContent);

                const toolMsg = {
                    role: 'user',
                    parts: [{
                        functionResponse: {
                            name: functionName || 'unknown',
                            response: {
                                name: functionName || 'unknown',
                                content: contentStr
                            }
                        }
                    }]
                };
                console.log('[OpenAI->Gemini] Created functionResponse:', JSON.stringify(toolMsg, null, 2));
                processedMessages.push(toolMsg);
                lastMessage = null;
                continue;
            }

            let processedContent = this.processOpenAIContentToGeminiParts(message.content);

            // Add tool_calls as functionCall to parts
            if (message.tool_calls && Array.isArray(message.tool_calls)) {
                for (const toolCall of message.tool_calls) {
                    if (toolCall.function) {
                        processedContent.push({
                            functionCall: {
                                name: toolCall.function.name,
                                args: safeParseJSON(toolCall.function.arguments)
                            }
                        });
                    }
                }
            }

            if (lastMessage && lastMessage.role === geminiRole && !message.tool_calls &&
                Array.isArray(processedContent) && processedContent.every(p => p.text) &&
                Array.isArray(lastMessage.parts) && lastMessage.parts.every(p => p.text)) {
                lastMessage.parts.push(...processedContent);
                continue;
            }

            if (lastMessage) processedMessages.push(lastMessage);
            lastMessage = { role: geminiRole, parts: processedContent };
        }
        if (lastMessage) processedMessages.push(lastMessage);

        const geminiRequest = {
            contents: processedMessages.filter(item => item.parts && item.parts.length > 0)
        };

        if (systemInstruction) geminiRequest.systemInstruction = systemInstruction;

        if (openaiRequest.tools?.length) {
            geminiRequest.tools = [{
                functionDeclarations: openaiRequest.tools.map(t => {
                    if (!t || typeof t !== 'object' || !t.function) return null;
                    const func = t.function;
                    const parameters = cleanJsonSchema(func.parameters || {});
                    return {
                        name: String(func.name || ''),
                        description: String(func.description || ''),
                        parameters: parameters
                    };
                }).filter(Boolean)
            }];
            if (geminiRequest.tools[0].functionDeclarations.length === 0) {
                delete geminiRequest.tools;
            }
        }

        if (openaiRequest.tool_choice) {
            geminiRequest.toolConfig = this.buildGeminiToolConfig(openaiRequest.tool_choice);
        }

        const config = this.buildGeminiGenerationConfig(openaiRequest, openaiRequest.model);
        if (Object.keys(config).length) geminiRequest.generationConfig = config;

        return geminiRequest;
    }

    /**
     * Process OpenAI content to Gemini parts
     */
    processOpenAIContentToGeminiParts(content) {
        if (!content) return [];
        if (typeof content === 'string') return [{ text: content }];

        if (Array.isArray(content)) {
            const parts = [];

            for (const item of content) {
                if (!item) continue;

                if (item.type === 'text' && item.text) {
                    parts.push({ text: item.text });
                } else if (item.type === 'image_url' && item.image_url) {
                    const imageUrl = typeof item.image_url === 'string'
                        ? item.image_url
                        : item.image_url.url;

                    if (imageUrl.startsWith('data:')) {
                        const [header, data] = imageUrl.split(',');
                        const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                        parts.push({ inlineData: { mimeType, data } });
                    } else {
                        parts.push({
                            fileData: { mimeType: 'image/jpeg', fileUri: imageUrl }
                        });
                    }
                }
            }

            return parts;
        }

        return [];
    }

    /**
     * Build Gemini tool config
     */
    buildGeminiToolConfig(toolChoice) {
        if (typeof toolChoice === 'string' && ['none', 'auto'].includes(toolChoice)) {
            return { functionCallingConfig: { mode: toolChoice.toUpperCase() } };
        }
        if (typeof toolChoice === 'object' && toolChoice.function) {
            return { functionCallingConfig: { mode: 'ANY' } };
        }
        return undefined;
    }

    /**
     * Build Gemini generation config
     */
    buildGeminiGenerationConfig(openaiRequest, model) {
        const { temperature, max_tokens, top_p, stop, tools, response_format, reasoning_effort } = openaiRequest;
        const config = {};
        config.temperature = checkAndAssignOrDefault(temperature, GEMINI_DEFAULT_TEMPERATURE);
        config.maxOutputTokens = checkAndAssignOrDefault(max_tokens, GEMINI_DEFAULT_MAX_TOKENS);
        config.topP = checkAndAssignOrDefault(top_p, GEMINI_DEFAULT_TOP_P);
        if (stop !== undefined) config.stopSequences = Array.isArray(stop) ? stop : [stop];

        // Handle Thinking Config for Gemini 2.0+
        if (model && (model.includes('thinking') || reasoning_effort)) {
            config.thinkingConfig = {
                includeThoughts: true
            };
            // Only set thinkingBudget for Claude models via Antigravity
            if (model.includes('opus') || model.includes('sonnet')) {
                // Claude models need smaller thinking budget to leave room for output
                config.thinkingConfig.thinkingBudget = 4000;
            }
            // For native Gemini thinking models, don't set budget - use API default
        }

        // Handle response_format
        if (response_format) {
            if (response_format.type === 'json_object') {
                config.responseMimeType = 'application/json';
            } else if (response_format.type === 'json_schema' && response_format.json_schema) {
                config.responseMimeType = 'application/json';
                if (response_format.json_schema.schema) {
                    config.responseSchema = response_format.json_schema.schema;
                }
            }
        }

        // Gemini 2.5 and thinking models require responseModalities: ["TEXT"]
        const hasTools = tools && Array.isArray(tools) && tools.length > 0;
        const isClaude = model && (model.includes('claude') || model.includes('opus') || model.includes('sonnet'));

        if (!hasTools && !isClaude && model && (model.includes('2.5') || model.includes('thinking') || model.includes('2.0-flash-thinking'))) {
            console.log(`[OpenAI->Gemini] Adding responseModalities: ["TEXT"] for model: ${model}`);
            config.responseModalities = ["TEXT"];
        }

        return config;
    }

    /**
     * Convert OpenAI response to Gemini response format
     */
    toGeminiResponse(openaiResponse, model) {
        if (!openaiResponse || !openaiResponse.choices || !openaiResponse.choices[0]) {
            return { candidates: [], usageMetadata: {} };
        }

        const choice = openaiResponse.choices[0];
        const message = choice.message || {};
        const parts = [];

        // Handle text content
        if (message.content) {
            parts.push({ text: message.content });
        }

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
                if (toolCall.type === 'function') {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: typeof toolCall.function.arguments === 'string'
                                ? JSON.parse(toolCall.function.arguments)
                                : toolCall.function.arguments
                        }
                    });
                }
            }
        }

        // Map finish_reason
        const finishReasonMap = {
            'stop': 'STOP',
            'length': 'MAX_TOKENS',
            'tool_calls': 'STOP',
            'content_filter': 'SAFETY'
        };

        return {
            candidates: [{
                content: {
                    role: 'model',
                    parts: parts
                },
                finishReason: finishReasonMap[choice.finish_reason] || 'STOP'
            }],
            usageMetadata: openaiResponse.usage ? {
                promptTokenCount: openaiResponse.usage.prompt_tokens || 0,
                candidatesTokenCount: openaiResponse.usage.completion_tokens || 0,
                totalTokenCount: openaiResponse.usage.total_tokens || 0,
                cachedContentTokenCount: openaiResponse.usage.prompt_tokens_details?.cached_tokens || 0,
                promptTokensDetails: [{
                    modality: "TEXT",
                    tokenCount: openaiResponse.usage.prompt_tokens || 0
                }],
                candidatesTokensDetails: [{
                    modality: "TEXT",
                    tokenCount: openaiResponse.usage.completion_tokens || 0
                }],
                thoughtsTokenCount: openaiResponse.usage.completion_tokens_details?.reasoning_tokens || 0
            } : {}
        };
    }

    /**
    /**
     * Convert OpenAI stream chunk to Gemini stream chunk format
     */
    toGeminiStreamChunk(openaiChunk, model) {
        if (!openaiChunk || !openaiChunk.choices || !openaiChunk.choices[0]) {
            return null;
        }

        const choice = openaiChunk.choices[0];
        const delta = choice.delta || {};
        const parts = [];

        // Handle text content
        if (delta.content) {
            parts.push({ text: delta.content });
        }

        // Handle tool calls
        if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const toolCall of delta.tool_calls) {
                if (toolCall.function) {
                    const functionCall = {
                        name: toolCall.function.name || '',
                        args: {}
                    };

                    if (toolCall.function.arguments) {
                        try {
                            functionCall.args = typeof toolCall.function.arguments === 'string'
                                ? JSON.parse(toolCall.function.arguments)
                                : toolCall.function.arguments;
                        } catch (e) {
                            // Partial arguments, keep as string
                            functionCall.args = { partial: toolCall.function.arguments };
                        }
                    }

                    parts.push({ functionCall });
                }
            }
        }

        const result = {
            candidates: [{
                content: {
                    role: 'model',
                    parts: parts
                }
            }]
        };

        // Add finish_reason (if present)
        if (choice.finish_reason) {
            const finishReasonMap = {
                'stop': 'STOP',
                'length': 'MAX_TOKENS',
                'tool_calls': 'STOP',
                'content_filter': 'SAFETY'
            };
            result.candidates[0].finishReason = finishReasonMap[choice.finish_reason] || 'STOP';
        }

        // Add usage info (if present)
        if (openaiChunk.usage) {
            result.usageMetadata = {
                promptTokenCount: openaiChunk.usage.prompt_tokens || 0,
                candidatesTokenCount: openaiChunk.usage.completion_tokens || 0,
                totalTokenCount: openaiChunk.usage.total_tokens || 0,
                cachedContentTokenCount: openaiChunk.usage.prompt_tokens_details?.cached_tokens || 0,
                promptTokensDetails: [{
                    modality: "TEXT",
                    tokenCount: openaiChunk.usage.prompt_tokens || 0
                }],
                candidatesTokensDetails: [{
                    modality: "TEXT",
                    tokenCount: openaiChunk.usage.completion_tokens || 0
                }],
                thoughtsTokenCount: openaiChunk.usage.completion_tokens_details?.reasoning_tokens || 0
            };
        }

        return result;
    }

    /**
     * Convert OpenAI request to OpenAI Responses format
     */
    toOpenAIResponsesRequest(openaiRequest) {
        const responsesRequest = {
            model: openaiRequest.model,
            messages: []
        };

        // Convert messages
        if (openaiRequest.messages && openaiRequest.messages.length > 0) {
            responsesRequest.messages = openaiRequest.messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string'
                    ? [{ type: 'input_text', text: msg.content }]
                    : msg.content
            }));
        }

        // Convert other parameters
        if (openaiRequest.temperature !== undefined) {
            responsesRequest.temperature = openaiRequest.temperature;
        }
        if (openaiRequest.max_tokens !== undefined) {
            responsesRequest.max_output_tokens = openaiRequest.max_tokens;
        }
        if (openaiRequest.top_p !== undefined) {
            responsesRequest.top_p = openaiRequest.top_p;
        }
        if (openaiRequest.tools) {
            responsesRequest.tools = openaiRequest.tools;
        }
        if (openaiRequest.tool_choice) {
            responsesRequest.tool_choice = openaiRequest.tool_choice;
        }

        return responsesRequest;
    }

    /**
     * Convert OpenAI response to OpenAI Responses format
     */
    toOpenAIResponsesResponse(openaiResponse, model) {
        if (!openaiResponse || !openaiResponse.choices || !openaiResponse.choices[0]) {
            return {
                id: `resp_${Date.now()}`,
                object: 'response',
                created_at: Math.floor(Date.now() / 1000),
                status: 'completed',
                model: model || 'unknown',
                output: [],
                usage: {
                    input_tokens: 0,
                    output_tokens: 0,
                    total_tokens: 0
                }
            };
        }

        const choice = openaiResponse.choices[0];
        const message = choice.message || {};
        const output = [];

        // Build message output
        const messageContent = [];
        if (message.content) {
            messageContent.push({
                type: 'output_text',
                text: message.content
            });
        }

        output.push({
            type: 'message',
            id: `msg_${Date.now()}`,
            status: 'completed',
            role: 'assistant',
            content: messageContent
        });

        return {
            id: openaiResponse.id || `resp_${Date.now()}`,
            object: 'response',
            created_at: openaiResponse.created || Math.floor(Date.now() / 1000),
            status: choice.finish_reason === 'stop' ? 'completed' : 'in_progress',
            model: model || openaiResponse.model || 'unknown',
            output: output,
            usage: openaiResponse.usage ? {
                input_tokens: openaiResponse.usage.prompt_tokens || 0,
                input_tokens_details: {
                    cached_tokens: openaiResponse.usage.prompt_tokens_details?.cached_tokens || 0
                },
                output_tokens: openaiResponse.usage.completion_tokens || 0,
                output_tokens_details: {
                    reasoning_tokens: openaiResponse.usage.completion_tokens_details?.reasoning_tokens || 0
                },
                total_tokens: openaiResponse.usage.total_tokens || 0
            } : {
                input_tokens: 0,
                input_tokens_details: {
                    cached_tokens: 0
                },
                output_tokens: 0,
                output_tokens_details: {
                    reasoning_tokens: 0
                },
                total_tokens: 0
            }
        };
    }

    /**
     * Convert OpenAI stream response to OpenAI Responses stream format
     * Reference ClaudeConverter.toOpenAIResponsesStreamChunk implementation logic
     */
    toOpenAIResponsesStreamChunk(openaiChunk, model, requestId = null) {
        if (!openaiChunk || !openaiChunk.choices || !openaiChunk.choices[0]) {
            return [];
        }

        const responseId = requestId || `resp_${uuidv4().replace(/-/g, '')}`;
        const choice = openaiChunk.choices[0];
        const delta = choice.delta || {};
        const events = [];

        // First chunk - call getOpenAIResponsesStreamChunkBegin when role is assistant
        if (delta.role === 'assistant') {
            events.push(
                generateResponseCreated(responseId, model || openaiChunk.model || 'unknown'),
                generateResponseInProgress(responseId),
                generateOutputItemAdded(responseId),
                generateContentPartAdded(responseId)
            );
        }

        // Handle reasoning_content
        if (delta.reasoning_content) {
            events.push({
                delta: delta.reasoning_content,
                item_id: `thinking_${uuidv4().replace(/-/g, '')}`,
                output_index: 0,
                sequence_number: 3,
                type: "response.reasoning_summary_text.delta"
            });
        }

        // Handle tool_calls
        if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const toolCall of delta.tool_calls) {
                const outputIndex = toolCall.index || 0;

                // If function.name exists, it indicates tool call start
                if (toolCall.function && toolCall.function.name) {
                    events.push({
                        item: {
                            id: toolCall.id || `call_${uuidv4().replace(/-/g, '')}`,
                            type: "function_call",
                            name: toolCall.function.name,
                            arguments: "",
                            status: "in_progress"
                        },
                        output_index: outputIndex,
                        sequence_number: 2,
                        type: "response.output_item.added"
                    });
                }

                // If function.arguments exists, it indicates argument delta
                if (toolCall.function && toolCall.function.arguments) {
                    events.push({
                        delta: toolCall.function.arguments,
                        item_id: toolCall.id || `call_${uuidv4().replace(/-/g, '')}`,
                        output_index: outputIndex,
                        sequence_number: 3,
                        type: "response.custom_tool_call_input.delta"
                    });
                }
            }
        }

        // Handle normal text content
        if (delta.content) {
            events.push({
                delta: delta.content,
                item_id: `msg_${uuidv4().replace(/-/g, '')}`,
                output_index: 0,
                sequence_number: 3,
                type: "response.output_text.delta"
            });
        }

        // Handle completion status - call getOpenAIResponsesStreamChunkEnd
        if (choice.finish_reason) {
            events.push(
                generateOutputTextDone(responseId),
                generateContentPartDone(responseId),
                generateOutputItemDone(responseId),
                generateResponseCompleted(responseId)
            );

            // If usage info exists, update the last event
            if (openaiChunk.usage && events.length > 0) {
                const lastEvent = events[events.length - 1];
                if (lastEvent.response) {
                    lastEvent.response.usage = {
                        input_tokens: openaiChunk.usage.prompt_tokens || 0,
                        input_tokens_details: {
                            cached_tokens: openaiChunk.usage.prompt_tokens_details?.cached_tokens || 0
                        },
                        output_tokens: openaiChunk.usage.completion_tokens || 0,
                        output_tokens_details: {
                            reasoning_tokens: openaiChunk.usage.completion_tokens_details?.reasoning_tokens || 0
                        },
                        total_tokens: openaiChunk.usage.total_tokens || 0
                    };
                }
            }
        }

        return events;
    }

}

export default OpenAIConverter;