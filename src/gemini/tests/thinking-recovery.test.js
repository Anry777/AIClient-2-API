import { describe, test, expect } from '@jest/globals';
import {
    analyzeConversationState,
    needsThinkingRecovery,
    closeToolLoopForThinking,
    looksLikeCompactedThinkingTurn,
    hasPossibleCompactedThinking
} from '../thinking-recovery.js';

describe('Thinking Recovery', () => {
    describe('analyzeConversationState', () => {
        test('should detect tool loop', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Response' }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(true);
        });

        test('should detect thinking blocks (thought: true)', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ thought: true, text: 'Thinking...' }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.turnHasThinking).toBe(true);
        });

        test('should detect thinking blocks (type: thinking)', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ type: 'thinking', text: 'Thinking...' }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.turnHasThinking).toBe(true);
        });

        test('should handle empty contents', () => {
            const state = analyzeConversationState([]);

            expect(state.inToolLoop).toBe(false);
            expect(state.turnHasThinking).toBe(false);
            expect(state.turnStartIdx).toBe(-1);
        });

        test('should handle null contents', () => {
            const state = analyzeConversationState(null);

            expect(state.inToolLoop).toBe(false);
        });

        test('should find correct turn start index', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Response' }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.turnStartIdx).toBe(1);
        });

        test('should not detect tool loop when conversation ends with model', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Response' }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.inToolLoop).toBe(false);
        });

        test('should detect tool calls in model message', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
            ];

            const state = analyzeConversationState(contents);

            expect(state.lastModelHasToolCalls).toBe(true);
        });
    });

    describe('needsThinkingRecovery', () => {
        test('should return true when in tool loop without thinking', () => {
            const state = {
                inToolLoop: true,
                turnHasThinking: false,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(true);
        });

        test('should return false when thinking is present', () => {
            const state = {
                inToolLoop: true,
                turnHasThinking: true,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(false);
        });

        test('should return false when not in tool loop', () => {
            const state = {
                inToolLoop: false,
                turnHasThinking: false,
                lastModelIdx: 1,
            };

            expect(needsThinkingRecovery(state)).toBe(false);
        });

        test('should return false when not in loop even without thinking', () => {
            const state = {
                inToolLoop: false,
                turnHasThinking: false,
                lastModelIdx: -1,
            };

            expect(needsThinkingRecovery(state)).toBe(false);
        });
    });

    describe('closeToolLoopForThinking', () => {
        test('should inject synthetic messages', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = closeToolLoopForThinking(contents);

            expect(result.length).toBe(contents.length + 2);
            expect(result[result.length - 2].role).toBe('model');
            expect(result[result.length - 1].role).toBe('user');
        });

        test('should inject model message with correct content for single tool result', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = closeToolLoopForThinking(contents);

            expect(result[result.length - 2].parts[0].text).toBe('[Tool execution completed.]');
            expect(result[result.length - 1].parts[0].text).toBe('[Continue]');
        });

        test('should inject model message with correct content for multiple tool results', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
                {
                    role: 'user', parts: [
                        { functionResponse: { name: 'tool1', response: {} } },
                        { functionResponse: { name: 'tool2', response: {} } }
                    ]
                },
            ];

            const result = closeToolLoopForThinking(contents);

            expect(result[result.length - 2].parts[0].text).toBe('[2 tool executions completed.]');
        });

        test('should strip thinking blocks', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                {
                    role: 'model', parts: [
                        { thought: true, text: 'Thinking...' },
                        { functionCall: { name: 'tool1' } }
                    ]
                },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = closeToolLoopForThinking(contents);

            // Find the original model message (not synthetic)
            const modelMsgs = result.filter(m => m.role === 'model');
            const originalModel = modelMsgs[0];

            // Check thinking blocks were removed
            expect(originalModel.parts.some(p => p.thought === true)).toBe(false);
        });

        test('should handle empty contents', () => {
            const result = closeToolLoopForThinking([]);

            expect(result.length).toBe(2); // Only synthetic messages
            expect(result[0].role).toBe('model');
            expect(result[1].role).toBe('user');
        });
    });

    describe('looksLikeCompactedThinkingTurn', () => {
        test('should return true for message with functionCall but no thinking', () => {
            const msg = {
                role: 'model',
                parts: [{ functionCall: { name: 'tool1' } }]
            };

            expect(looksLikeCompactedThinkingTurn(msg)).toBe(true);
        });

        test('should return false for message with thinking', () => {
            const msg = {
                role: 'model',
                parts: [
                    { thought: true, text: 'Thinking...' },
                    { functionCall: { name: 'tool1' } }
                ]
            };

            expect(looksLikeCompactedThinkingTurn(msg)).toBe(false);
        });

        test('should return false for message without functionCall', () => {
            const msg = {
                role: 'model',
                parts: [{ text: 'Hello' }]
            };

            expect(looksLikeCompactedThinkingTurn(msg)).toBe(false);
        });

        test('should return false when text before functionCall', () => {
            const msg = {
                role: 'model',
                parts: [
                    { text: 'Some response text' },
                    { functionCall: { name: 'tool1' } }
                ]
            };

            expect(looksLikeCompactedThinkingTurn(msg)).toBe(false);
        });

        test('should return false for null message', () => {
            expect(looksLikeCompactedThinkingTurn(null)).toBe(false);
        });

        test('should return false for empty parts', () => {
            const msg = { role: 'model', parts: [] };
            expect(looksLikeCompactedThinkingTurn(msg)).toBe(false);
        });
    });

    describe('hasPossibleCompactedThinking', () => {
        test('should return true if any model message looks compacted', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1' } }] },
            ];

            expect(hasPossibleCompactedThinking(contents, 1)).toBe(true);
        });

        test('should return false if no model messages look compacted', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
                { role: 'model', parts: [{ text: 'Response' }] },
            ];

            expect(hasPossibleCompactedThinking(contents, 1)).toBe(false);
        });

        test('should return false for invalid turnStartIdx', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
            ];

            expect(hasPossibleCompactedThinking(contents, -1)).toBe(false);
        });
    });
});
