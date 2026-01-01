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
    formatExpiryTime: jest.fn(),
    MODEL_PROTOCOL_PREFIX: {
        OPENAI: 'openai:',
        GEMINI: 'gemini:',
        CLAUDE: 'claude:'
    },
    FETCH_SYSTEM_PROMPT_FILE: '/tmp/test-prompt.txt',
    extractSystemPromptFromRequestBody: jest.fn((requestBody, provider) => {
        if (provider === 'gemini:') {
            const geminiSystemInstruction = requestBody.system_instruction || requestBody.systemInstruction;
            if (geminiSystemInstruction?.parts) {
                return geminiSystemInstruction.parts
                    .filter(p => p?.text)
                    .map(p => p.text)
                    .join('\n');
            } else if (typeof geminiSystemInstruction === 'string') {
                return geminiSystemInstruction;
            }
        }
        return '';
    })
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

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'test-uuid')
}));

import { AntigravityClaudeStrategy } from '../antigravity-strategy.js';
import { MODEL_PROTOCOL_PREFIX, FETCH_SYSTEM_PROMPT_FILE } from '../../common.js';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

describe('AntigravityClaudeStrategy', () => {
    let strategy;

    beforeEach(() => {
        strategy = new AntigravityClaudeStrategy();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('extractModelAndStreamInfo', () => {
        it('should extract model and stream info from Claude Messages request', () => {
            const requestBody = {
                model: 'gemini-2.0-flash-exp',
                stream: true
            };

            const result = strategy.extractModelAndStreamInfo({}, requestBody);

            expect(result).toEqual({
                model: 'gemini-2.0-flash-exp',
                isStream: true
            });
        });

        it('should handle stream=false', () => {
            const requestBody = {
                model: 'claude-opus-4-5-thinking',
                stream: false
            };

            const result = strategy.extractModelAndStreamInfo({}, requestBody);

            expect(result).toEqual({
                model: 'claude-opus-4-5-thinking',
                isStream: false
            });
        });

        it('should handle missing stream field', () => {
            const requestBody = {
                model: 'gemini-2.0-flash-exp'
            };

            const result = strategy.extractModelAndStreamInfo({}, requestBody);

            expect(result).toEqual({
                model: 'gemini-2.0-flash-exp',
                isStream: false
            });
        });
    });

    describe('extractResponseText', () => {
        it('should extract text from Antigravity response', () => {
            const response = {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'Hello ' },
                            { text: 'world!' }
                        ]
                    }
                }]
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('Hello world!');
        });

        it('should handle single part response', () => {
            const response = {
                candidates: [{
                    content: {
                        parts: [{ text: 'Single response' }]
                    }
                }]
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('Single response');
        });

        it('should handle empty candidates', () => {
            const response = {
                candidates: []
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('');
        });

        it('should handle missing candidates', () => {
            const response = {};

            const result = strategy.extractResponseText(response);

            expect(result).toBe('');
        });

        it('should handle empty parts', () => {
            const response = {
                candidates: [{
                    content: {
                        parts: []
                    }
                }]
            };

            const result = strategy.extractResponseText(response);

            expect(result).toBe('');
        });
    });

    describe('extractPromptText', () => {
        it('should extract text from Antigravity contents', () => {
            const requestBody = {
                contents: [
                    { role: 'user', parts: [{ text: 'First message' }] },
                    { role: 'model', parts: [{ text: 'Response' }] },
                    { role: 'user', parts: [{ text: 'Last message' }] }
                ]
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('Last message');
        });

        it('should handle single content', () => {
            const requestBody = {
                contents: [
                    { role: 'user', parts: [{ text: 'Only message' }] }
                ]
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('Only message');
        });

        it('should handle multiple parts in last content', () => {
            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: 'Part 1' },
                            { text: ' Part 2' },
                            { text: ' Part 3' }
                        ]
                    }
                ]
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('Part 1 Part 2 Part 3');
        });

        it('should handle empty contents', () => {
            const requestBody = {
                contents: []
            };

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('');
        });

        it('should handle missing contents', () => {
            const requestBody = {};

            const result = strategy.extractPromptText(requestBody);

            expect(result).toBe('');
        });
    });

    describe('applySystemPromptFromFile', () => {
        beforeEach(async () => {
            jest.spyOn(fs, 'writeFile').mockResolvedValue();
        });

        it('should not apply system prompt if SYSTEM_PROMPT_FILE_PATH is not set', async () => {
            const config = {};
            const requestBody = { model: 'gemini-2.0-flash-exp' };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result).toEqual(requestBody);
        });

        it('should not apply system prompt if SYSTEM_PROMPT_CONTENT is null', async () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: null
            };
            const requestBody = { model: 'gemini-2.0-flash-exp' };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result).toEqual(requestBody);
        });

        it('should apply system prompt in replace mode', async () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'You are a helpful assistant.',
                SYSTEM_PROMPT_MODE: 'replace'
            };
            const requestBody = {
                model: 'gemini-2.0-flash-exp',
                systemInstruction: { parts: [{ text: 'Old prompt' }] }
            };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result.systemInstruction).toEqual({
                parts: [{ text: 'You are a helpful assistant.' }]
            });
            expect(result.system_instruction).toBeUndefined();
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('Applied system prompt from')
            );
        });

        it('should apply system prompt in append mode', async () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Additional instructions.',
                SYSTEM_PROMPT_MODE: 'append'
            };
            const requestBody = {
                model: 'gemini-2.0-flash-exp',
                systemInstruction: { parts: [{ text: 'Existing prompt' }] }
            };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result.systemInstruction).toEqual({
                parts: [{ text: 'Existing prompt\nAdditional instructions.' }]
            });
        });

        it('should handle missing existing system prompt in append mode', async () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'New prompt.',
                SYSTEM_PROMPT_MODE: 'append'
            };
            const requestBody = { model: 'gemini-2.0-flash-exp' };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result.systemInstruction).toEqual({
                parts: [{ text: 'New prompt.' }]
            });
        });

        it('should remove snake_case system_instruction', async () => {
            const config = {
                SYSTEM_PROMPT_FILE_PATH: '/path/to/prompt.txt',
                SYSTEM_PROMPT_CONTENT: 'Test prompt',
                SYSTEM_PROMPT_MODE: 'replace'
            };
            const requestBody = {
                model: 'gemini-2.0-flash-exp',
                system_instruction: { parts: [{ text: 'Old' }] }
            };

            const result = await strategy.applySystemPromptFromFile(config, requestBody);

            expect(result.system_instruction).toBeUndefined();
            expect(result.systemInstruction).toBeDefined();
        });
    });

    describe('manageSystemPrompt', () => {
        beforeEach(async () => {
            jest.spyOn(fs, 'readFile').mockResolvedValue('');
            jest.spyOn(fs, 'writeFile').mockResolvedValue();
        });

        it('should write system prompt to file', async () => {
            const requestBody = {
                systemInstruction: { parts: [{ text: 'You are helpful' }] }
            };

            await strategy.manageSystemPrompt(requestBody);

            expect(fs.writeFile).toHaveBeenCalledWith(
                FETCH_SYSTEM_PROMPT_FILE,
                'You are helpful'
            );
        });

        it('should handle empty system prompt', async () => {
            const requestBody = { model: 'gemini-2.0-flash-exp' };

            await strategy.manageSystemPrompt(requestBody);

            expect(fs.writeFile).toHaveBeenCalledWith(
                FETCH_SYSTEM_PROMPT_FILE,
                ''
            );
        });

        it('should log on system prompt update', async () => {
            const requestBody = {
                systemInstruction: { parts: [{ text: 'New system prompt' }] }
            };

            await strategy.manageSystemPrompt(requestBody);

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('System prompt updated in file')
            );
        });
    });
});
