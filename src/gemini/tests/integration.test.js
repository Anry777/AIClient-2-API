import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as ThinkingUtils from '../thinking-utils.js';
import * as ThinkingRecovery from '../thinking-recovery.js';
import * as ToolRecovery from '../tool-recovery.js';
import * as ErrorHandler from '../error-handler.js';
import { SignatureCache } from '../signature-cache.js';
import { loadConfig, validateConfig } from '../config-loader.js';

describe('Integration Tests', () => {
    let signatureCache;

    beforeAll(() => {
        signatureCache = new SignatureCache();
    });

    afterAll(() => {
        if (signatureCache) {
            signatureCache.clear();
        }
    });

    describe('Thinking Utils', () => {
        test('should detect thinking models', () => {
            const isThinking = ThinkingUtils.isThinkingModel('claude-opus-4-5-thinking');
            expect(isThinking).toBe(true);
        });

        test('should detect non-thinking models', () => {
            const isThinking = ThinkingUtils.isThinkingModel('gemini-2.5-flash');
            expect(isThinking).toBe(false);
        });

        test('should detect tools in request', () => {
            const requestBody = {
                request: {
                    tools: [
                        { functionDeclarations: [
                            { name: 'get_weather', parameters: { type: 'object', properties: { location: { type: 'string' } } } }
                        ]}
                    ]
                }
            };

            const hasTools = ThinkingUtils.hasToolsInRequest(requestBody);
            expect(hasTools).toBe(true);
        });

        test('should detect no tools in request', () => {
            const requestBody = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
                }
            };

            const hasTools = ThinkingUtils.hasToolsInRequest(requestBody);
            expect(hasTools).toBe(false);
        });

        test('should extract conversation key from request', () => {
            const requestBody = {
                request: {
                    conversationId: 'test-conv-123',
                    contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
                }
            };

            const key = ThinkingUtils.extractConversationKey(requestBody);
            expect(key).toBe('test-conv-123');
        });

        test('should build signature session key', () => {
            const key = ThinkingUtils.buildSignatureSessionKey('session-1', 'claude-opus-4-5-thinking', 'conv-1', 'project-1');
            expect(key).toBe('session-1:claude-opus-4-5-thinking:project-1:conv-1');
        });
    });

    describe('Signature Cache', () => {
        test('should cache and retrieve signatures', () => {
            const signature = 'sig-' + 'a'.repeat(50);

            signatureCache.cache(
                'session-1',
                'claude-opus-4-5-thinking',
                'conv-1',
                'test thinking',
                signature
            );

            const retrieved = signatureCache.get(
                'session-1',
                'claude-opus-4-5-thinking',
                'conv-1',
                'test thinking'
            );

            expect(retrieved).toBe(signature);
        });

        test('should return null for non-existent signature', () => {
            const result = signatureCache.get(
                'non-existent',
                'model',
                'conv',
                'text'
            );

            expect(result).toBeNull();
        });

        test('should detect cache hit', () => {
            const signature = 'sig-' + 'b'.repeat(50);

            signatureCache.cache(
                'session-2',
                'claude-opus-4-5-thinking',
                'conv-2',
                'test thinking 2',
                signature
            );

            const result = signatureCache.get(
                'session-2',
                'claude-opus-4-5-thinking',
                'conv-2',
                'test thinking 2'
            );

            expect(result).toBe(signature);
        });

        test('should clear cache', () => {
            signatureCache.clear();

            const result = signatureCache.get(
                'session-2',
                'claude-opus-4-5-thinking',
                'conv-2',
                'test thinking 2'
            );

            expect(result).toBeNull();
        });
    });

    describe('Thinking Recovery', () => {
        test('should detect thinking recovery needed for tool loop without thinking', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const state = ThinkingRecovery.analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(true);
            expect(state.turnHasThinking).toBe(false);
        });

        test('should apply thinking recovery', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const recovered = ThinkingRecovery.closeToolLoopForThinking(contents);

            expect(recovered.length).toBe(contents.length + 2);
            expect(recovered[recovered.length - 2].role).toBe('model');
            expect(recovered[recovered.length - 1].role).toBe('user');
        });

        test('should not apply recovery when thinking is present', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [
                    { type: 'thinking', thought: true },
                    { functionCall: { name: 'tool1', args: {} } }
                ]},
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const state = ThinkingRecovery.analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(true);
            expect(state.turnHasThinking).toBe(true);
        });

        test('should not apply recovery when not in tool loop', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Hi there!' }] },
            ];

            const state = ThinkingRecovery.analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(false);
        });
    });

    describe('Tool ID Recovery', () => {
        test('should fix tool response grouping', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = ToolRecovery.fixToolResponseGrouping(contents);

            expect(result[0].parts[0].functionCall.id).toBeDefined();
            expect(result[1].parts[0].functionResponse.id).toBe(result[0].parts[0].functionCall.id);
        });

        test('should find orphan tool responses', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
            ];

            const orphans = ToolRecovery.findOrphanToolResponses(contents);

            expect(orphans.length).toBe(1);
            expect(orphans[0].responseId).toBe('call-2');
        });

        test('should create placeholder tool calls', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
            ];
            const orphans = [
                { requestIndex: 1, responseIndex: 0, responseId: 'call-2', requestToolName: 'tool1' }
            ];

            const placeholders = ToolRecovery.createPlaceholderToolCalls(contents, orphans);

            expect(placeholders.length).toBe(1);
            expect(placeholders[0].role).toBe('model');
            expect(placeholders[0].parts[0].functionCall.name).toBe('tool1');
        });
    });

    describe('Error Handler', () => {
        test('should detect thinking block order error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking blocks must be in the first block position'
                        }
                    }
                }
            };

            const errorType = ErrorHandler.detectErrorType(error);

            expect(errorType).toBe(ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER);
            expect(ErrorHandler.isRecoverableError(error)).toBe(true);
        });

        test('should detect tool result missing error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'tool_use without tool_result'
                        }
                    }
                }
            };

            const errorType = ErrorHandler.detectErrorType(error);

            expect(errorType).toBe(ErrorHandler.ERROR_TYPES.TOOL_RESULT_MISSING);
            expect(ErrorHandler.isRecoverableError(error)).toBe(true);
        });

        test('should detect thinking disabled violation error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking is disabled and cannot contain thinking blocks'
                        }
                    }
                }
            };

            const errorType = ErrorHandler.detectErrorType(error);

            expect(errorType).toBe(ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION);
            expect(ErrorHandler.isRecoverableError(error)).toBe(true);
        });

        test('should return null for other errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'some other error'
                        }
                    }
                }
            };

            const errorType = ErrorHandler.detectErrorType(error);

            expect(errorType).toBeNull();
            expect(ErrorHandler.isRecoverableError(error)).toBe(false);
        });

        test('should get recovery message', () => {
            const msg1 = ErrorHandler.getRecoveryMessage(ErrorHandler.ERROR_TYPES.THINKING_BLOCK_ORDER);
            expect(msg1).toBeDefined();
            expect(msg1.length).toBeGreaterThan(0);

            const msg2 = ErrorHandler.getRecoveryMessage(ErrorHandler.ERROR_TYPES.TOOL_RESULT_MISSING);
            expect(msg2).toBeDefined();
            expect(msg2.length).toBeGreaterThan(0);

            const msg3 = ErrorHandler.getRecoveryMessage(ErrorHandler.ERROR_TYPES.THINKING_DISABLED_VIOLATION);
            expect(msg3).toBeDefined();
            expect(msg3.length).toBeGreaterThan(0);
        });
    });

    describe('Configuration', () => {
        test('should load default config', async () => {
            const config = await loadConfig();

            expect(config).toBeDefined();
            expect(config.enable_thinking_warmup).toBe(true);
            expect(config.session_recovery).toBe(true);
        });

        test('should validate valid config', () => {
            const validConfig = {
                quiet_mode: false,
                debug: false,
                log_dir: null,
                enable_thinking_warmup: true,
                thinking_warmup_budget: 16000,
                enable_signature_cache: true,
                signature_cache_memory_ttl_seconds: 3600,
                signature_cache_disk_ttl_seconds: 172800,
                signature_cache_write_interval_seconds: 60,
                use_stable_session_id: true,
                session_recovery: true,
                auto_resume: true,
                resume_text: 'continue',
                tool_id_recovery: true,
                claude_tool_hardening: true,
                empty_response_max_attempts: 4,
                empty_response_retry_delay_ms: 2000,
                recoverable_error_max_retries: 3
            };

            const result = validateConfig(validConfig);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should reject invalid config - low TTL', () => {
            const invalidConfig = {
                signature_cache_memory_ttl_seconds: 30
            };

            const result = validateConfig(invalidConfig);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('signature_cache_memory_ttl_seconds must be at least 60 seconds');
        });

        test('should reject invalid config - too many retry attempts', () => {
            const invalidConfig = {
                empty_response_max_attempts: 20
            };

            const result = validateConfig(invalidConfig);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('empty_response_max_attempts must be between 1 and 10');
        });

        test('should reject invalid config - retry delay out of range', () => {
            const invalidConfig = {
                empty_response_retry_delay_ms: 20000
            };

            const result = validateConfig(invalidConfig);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('empty_response_retry_delay_ms must be between 500 and 10000');
        });
    });

    describe('Combined Workflows', () => {
        test('should handle complete thinking model workflow', () => {
            const requestBody = {
                request: {
                    conversationId: 'test-complete-1',
                    contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
                    tools: [
                        { functionDeclarations: [
                            { name: 'get_weather', parameters: { type: 'object', properties: { location: { type: 'string' } } } }
                        ]}
                    ]
                },
                generationConfig: {
                    thinkingConfig: {
                        include_thoughts: true,
                        thinking_budget: 16000
                    }
                }
            };

            const isThinkingModel = ThinkingUtils.isThinkingModel('claude-opus-4-5-thinking');
            expect(isThinkingModel).toBe(true);

            const hasTools = ThinkingUtils.hasToolsInRequest(requestBody);
            expect(hasTools).toBe(true);

            const convKey = ThinkingUtils.extractConversationKey(requestBody);
            expect(convKey).toBe('test-complete-1');

            const sigKey = ThinkingUtils.buildSignatureSessionKey('session-1', 'claude-opus-4-5-thinking', convKey, 'project-1');
            expect(sigKey).toBe('session-1:claude-opus-4-5-thinking:project-1:test-complete-1');
        });

        test('should handle recovery workflow for corrupted thinking', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const state = ThinkingRecovery.analyzeConversationState(contents);
            expect(state.inToolLoop).toBe(true);
            expect(state.turnHasThinking).toBe(false);

            const recovered = ThinkingRecovery.closeToolLoopForThinking(contents);
            expect(recovered.length).toBe(contents.length + 2);

            const toolRepaired = ToolRecovery.fixToolResponseGrouping(recovered);
            expect(toolRepaired).toBeDefined();
        });
    });
});
