import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock all problematic dependencies before importing
jest.mock('open', () => ({
    default: jest.fn()
}));

jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn()
}));

jest.mock('../../common.js', () => ({
    API_ACTIONS: {},
    formatExpiryTime: jest.fn()
}));

jest.mock('../../provider-models.js', () => ({
    getProviderModels: jest.fn()
}));

jest.mock('../signature-cache.js', () => ({
    SignatureCache: jest.fn()
}));

jest.mock('../thinking-utils.js', () => ({}));

jest.mock('../config.js', () => ({
    getDefaultConfig: jest.fn()
}));

jest.mock('../thinking-recovery.js', () => ({}));

jest.mock('../error-handler.js', () => ({}));

jest.mock('../tool-recovery.js', () => ({}));

// Import the function - will be loaded after all mocks are set up
import { geminiToAntigravity } from '../antigravity-core.js';

describe('Claude Tool Safety Injection', () => {
    describe('Claude models with tools', () => {
        it('should inject safety instruction for Claude Sonnet with tools', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'test_function',
                                    parametersJsonSchema: {
                                        type: 'object',
                                        properties: {
                                            param1: { type: 'string' }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeDefined();
            expect(result.request.systemInstruction.parts).toBeDefined();
            const lastTextPart = result.request.systemInstruction.parts[result.request.systemInstruction.parts.length - 1];
            expect(lastTextPart.text).toContain('CRITICAL TOOL USAGE INSTRUCTIONS');
            expect(lastTextPart.text).toContain('DO NOT use your internal training data');
        });

        it('should inject safety instruction for Claude Opus with tools', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('claude-opus-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeDefined();
            expect(result.request.systemInstruction.parts).toBeDefined();
            const textParts = result.request.systemInstruction.parts.filter(p => p.text);
            expect(textParts.some(p => p.text.includes('CRITICAL TOOL USAGE INSTRUCTIONS'))).toBe(true);
        });

        it('should append to existing systemInstruction text part', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    systemInstruction: {
                        parts: [{ text: 'You are a helpful assistant.' }]
                    },
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction.parts[0].text).toContain('You are a helpful assistant.');
            expect(result.request.systemInstruction.parts[0].text).toContain('CRITICAL TOOL USAGE INSTRUCTIONS');
        });

        it('should create new part when systemInstruction has no text parts', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    systemInstruction: {
                        parts: [{ inlineData: { data: 'base64data' } }]
                    },
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction.parts.length).toBe(2);
            const textPart = result.request.systemInstruction.parts.find(p => p.text);
            expect(textPart).toBeDefined();
            expect(textPart.text).toContain('CRITICAL TOOL USAGE INSTRUCTIONS');
        });

        it('should handle string systemInstruction', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    systemInstruction: 'You are a helpful assistant.',
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toEqual(expect.objectContaining({
                parts: expect.arrayContaining([
                    expect.objectContaining({
                        text: expect.stringContaining('You are a helpful assistant.')
                    })
                ])
            }));
            const textParts = result.request.systemInstruction.parts.filter(p => p.text);
            expect(textParts.some(p => p.text.includes('CRITICAL TOOL USAGE INSTRUCTIONS'))).toBe(true);
        });

        it('should fix parameter schemas for Claude models', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'test_func',
                                    parametersJsonSchema: {
                                        $schema: 'http://json-schema.org/draft-07/schema#',
                                        type: 'object',
                                        properties: {
                                            param1: { type: 'string' }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            const funcDecl = result.request.tools[0].functionDeclarations[0];
            expect(funcDecl.parameters).toBeDefined();
            expect(funcDecl.parameters.$schema).toBeUndefined();
            expect(funcDecl.parametersJsonSchema).toBeUndefined();
        });
    });

    describe('Claude models without tools', () => {
        it('should not inject safety instruction for Claude without tools', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeUndefined();
        });

        it('should not inject safety instruction for Claude with empty tools array', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: []
                }
            };

            const result = geminiToAntigravity('claude-sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeUndefined();
        });
    });

    describe('Non-Claude models', () => {
        it('should not inject safety instruction for Gemini models with tools', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [{ functionDeclarations: [] }],
                    systemInstruction: {
                        parts: [{ text: 'You are a helpful assistant.' }]
                    }
                }
            };

            const result = geminiToAntigravity('gemini-2.0-flash-exp', payload, 'test-project');

            expect(result.request.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
            expect(result.request.systemInstruction.parts[0].text).not.toContain('CRITICAL TOOL USAGE INSTRUCTIONS');
        });

        it('should not inject safety instruction for GPT models with tools', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [{ functionDeclarations: [] }],
                    systemInstruction: {
                        parts: [{ text: 'You are a helpful assistant.' }]
                    }
                }
            };

            const result = geminiToAntigravity('gpt-4', payload, 'test-project');

            expect(result.request.systemInstruction.parts[0].text).toBe('You are a helpful assistant.');
            expect(result.request.systemInstruction.parts[0].text).not.toContain('CRITICAL TOOL USAGE INSTRUCTIONS');
        });

        it('should not modify parameters for non-Claude models', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'test_func',
                                    parametersJsonSchema: {
                                        $schema: 'http://json-schema.org/draft-07/schema#',
                                        type: 'object',
                                        properties: {
                                            param1: { type: 'string' }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            };

            const result = geminiToAntigravity('gemini-2.0-flash-exp', payload, 'test-project');

            const funcDecl = result.request.tools[0].functionDeclarations[0];
            expect(funcDecl.parameters).toBeUndefined();
            expect(funcDecl.parametersJsonSchema).toBeDefined();
        });
    });

    describe('Case insensitive model detection', () => {
        it('should detect CLAUDE-SONNET-4-5 (uppercase)', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('CLAUDE-SONNET-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeDefined();
            const textParts = result.request.systemInstruction.parts.filter(p => p.text);
            expect(textParts.some(p => p.text.includes('CRITICAL TOOL USAGE INSTRUCTIONS'))).toBe(true);
        });

        it('should detect Claude-Sonnet-4-5 (mixed case)', () => {
            const payload = {
                request: {
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
                    tools: [{ functionDeclarations: [] }]
                }
            };

            const result = geminiToAntigravity('Claude-Sonnet-4-5', payload, 'test-project');

            expect(result.request.systemInstruction).toBeDefined();
            const textParts = result.request.systemInstruction.parts.filter(p => p.text);
            expect(textParts.some(p => p.text.includes('CRITICAL TOOL USAGE INSTRUCTIONS'))).toBe(true);
        });
    });
});
