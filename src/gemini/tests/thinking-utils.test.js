/**
 * Unit tests for thinking-utils.js
 */

import { jest, describe, it, expect } from '@jest/globals';
import {
    isThinkingModel,
    hasToolUseInRequest,
    hasToolsInRequest,
    hasAntigravityToolUse,
    extractConversationKey,
    extractSignatureFromSseChunk,
    buildSignatureSessionKey,
    THINKING_MODELS
} from '../thinking-utils.js';

describe('thinking-utils', () => {
    describe('isThinkingModel', () => {
        it('should return true for thinking models', () => {
            expect(isThinkingModel('claude-opus-4-5-thinking')).toBe(true);
            expect(isThinkingModel('claude-sonnet-4-5-thinking')).toBe(true);
            expect(isThinkingModel('gemini-claude-sonnet-4-5-thinking')).toBe(true);
        });

        it('should return false for non-thinking models', () => {
            expect(isThinkingModel('claude-sonnet-3')).toBe(false);
            expect(isThinkingModel('gemini-2.5-pro')).toBe(false);
            expect(isThinkingModel('gpt-4')).toBe(false);
        });

        it('should return false for null or undefined', () => {
            expect(isThinkingModel(null)).toBe(false);
            expect(isThinkingModel(undefined)).toBe(false);
            expect(isThinkingModel('')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(isThinkingModel('CLAUDE-SONNET-4-5-THINKING')).toBe(true);
            expect(isThinkingModel('Claude-Sonnet-4-5-Thinking')).toBe(true);
        });
    });

    describe('hasToolUseInRequest', () => {
        it('should return true when request has functionCall in contents', () => {
            const requestBody = {
                request: {
                    contents: [
                        {
                            role: 'model',
                            parts: [{ functionCall: { name: 'test' } }]
                        }
                    ]
                }
            };
            expect(hasToolUseInRequest(requestBody)).toBe(true);
        });

        it('should return true when request has tool_use in contents', () => {
            const requestBody = {
                request: {
                    contents: [
                        {
                            role: 'model',
                            parts: [{ tool_use: { name: 'test' } }]
                        }
                    ]
                }
            };
            expect(hasToolUseInRequest(requestBody)).toBe(true);
        });

        it('should return false when no tool use in request', () => {
            const requestBody = {
                request: {
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: 'hello' }]
                        }
                    ]
                }
            };
            expect(hasToolUseInRequest(requestBody)).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(hasToolUseInRequest(null)).toBe(false);
            expect(hasToolUseInRequest(undefined)).toBe(false);
            expect(hasToolUseInRequest({})).toBe(false);
        });
    });

    describe('hasToolsInRequest', () => {
        it('should return true when tools are defined in request', () => {
            const requestBody = {
                request: {
                    tools: [{ functionDeclarations: [{ name: 'test' }] }]
                }
            };
            expect(hasToolsInRequest(requestBody)).toBe(true);
        });

        it('should return true for Gemini format with tools', () => {
            const requestBody = {
                tools: [{ functionDeclarations: [{ name: 'test' }] }]
            };
            expect(hasToolsInRequest(requestBody)).toBe(true);
        });

        it('should return false when no tools', () => {
            const requestBody = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'hello' }] }]
                }
            };
            expect(hasToolsInRequest(requestBody)).toBe(false);
        });

        it('should return false for empty tools array', () => {
            const requestBody = {
                request: {
                    tools: []
                }
            };
            expect(hasToolsInRequest(requestBody)).toBe(false);
        });
    });

    describe('hasAntigravityToolUse', () => {
        it('should return true when contents have functionCall', () => {
            const contents = [
                { parts: [{ functionCall: { name: 'test' } }] }
            ];
            expect(hasAntigravityToolUse(contents)).toBe(true);
        });

        it('should return false when no functionCall', () => {
            const contents = [
                { parts: [{ text: 'hello' }] }
            ];
            expect(hasAntigravityToolUse(contents)).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(hasAntigravityToolUse(null)).toBe(false);
            expect(hasAntigravityToolUse(undefined)).toBe(false);
        });
    });

    describe('extractConversationKey', () => {
        it('should extract conversationId', () => {
            const requestBody = {
                request: { conversationId: 'conv-123' }
            };
            expect(extractConversationKey(requestBody)).toBe('conv-123');
        });

        it('should extract conversation_id', () => {
            const requestBody = {
                request: { conversation_id: 'conv-456' }
            };
            expect(extractConversationKey(requestBody)).toBe('conv-456');
        });

        it('should extract thread_id', () => {
            const requestBody = {
                request: { thread_id: 'thread-789' }
            };
            expect(extractConversationKey(requestBody)).toBe('thread-789');
        });

        it('should return default for missing conversation key', () => {
            const requestBody = { request: {} };
            expect(extractConversationKey(requestBody)).toBe('default');
        });

        it('should return default for null/undefined', () => {
            expect(extractConversationKey(null)).toBe('default');
            expect(extractConversationKey(undefined)).toBe('default');
        });

        it('should prioritize conversationId over others', () => {
            const requestBody = {
                request: {
                    conversationId: 'first',
                    conversation_id: 'second',
                    thread_id: 'third'
                }
            };
            expect(extractConversationKey(requestBody)).toBe('first');
        });
    });

    describe('extractSignatureFromSseChunk', () => {
        it('should extract thoughtSignature from chunk', () => {
            const chunk = {
                candidates: [{
                    content: {
                        parts: [{
                            thoughtSignature: 'a'.repeat(60) // longer than 50 chars
                        }]
                    }
                }]
            };
            expect(extractSignatureFromSseChunk(chunk)).toBe('a'.repeat(60));
        });

        it('should extract signature from thinking block', () => {
            const chunk = {
                candidates: [{
                    content: {
                        parts: [{
                            type: 'thinking',
                            signature: 'b'.repeat(60)
                        }]
                    }
                }]
            };
            expect(extractSignatureFromSseChunk(chunk)).toBe('b'.repeat(60));
        });

        it('should return null for short signatures', () => {
            const chunk = {
                candidates: [{
                    content: {
                        parts: [{
                            thoughtSignature: 'short'
                        }]
                    }
                }]
            };
            expect(extractSignatureFromSseChunk(chunk)).toBeNull();
        });

        it('should return null for missing candidates', () => {
            expect(extractSignatureFromSseChunk(null)).toBeNull();
            expect(extractSignatureFromSseChunk({})).toBeNull();
            expect(extractSignatureFromSseChunk({ candidates: [] })).toBeNull();
        });
    });

    describe('buildSignatureSessionKey', () => {
        it('should build correct session key', () => {
            const key = buildSignatureSessionKey('session-1', 'model-1', 'conv-1', 'project-1');
            expect(key).toBe('session-1:model-1:project-1:conv-1');
        });

        it('should handle undefined project', () => {
            const key = buildSignatureSessionKey('session-1', 'model-1', 'conv-1', undefined);
            expect(key).toBe('session-1:model-1:default:conv-1');
        });

        it('should handle undefined conversation', () => {
            const key = buildSignatureSessionKey('session-1', 'model-1', undefined, 'project-1');
            expect(key).toBe('session-1:model-1:project-1:default');
        });

        it('should lowercase model name', () => {
            const key = buildSignatureSessionKey('session-1', 'MODEL-NAME', 'conv-1', 'project-1');
            expect(key).toContain('model-name');
        });
    });

    describe('THINKING_MODELS', () => {
        it('should contain expected thinking models', () => {
            expect(THINKING_MODELS).toContain('claude-opus-4-5-thinking');
            expect(THINKING_MODELS).toContain('claude-sonnet-4-5-thinking');
            expect(THINKING_MODELS).toContain('gemini-claude-sonnet-4-5-thinking');
        });
    });
});
