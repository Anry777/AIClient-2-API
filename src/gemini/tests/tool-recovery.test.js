import { describe, test, expect } from '@jest/globals';
import {
    assignToolCallIds,
    matchToolResponseIds,
    fixToolResponseGrouping,
    findOrphanToolResponses,
    createPlaceholderToolCalls,
} from '../tool-recovery.js';

describe('Tool ID Recovery', () => {
    describe('assignToolCallIds', () => {
        test('should assign IDs to functionCall parts', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
            ];

            const result = assignToolCallIds(contents);

            expect(result[0].parts[0].functionCall.id).toBeDefined();
            expect(result[0].parts[0].functionCall.id).toMatch(/^call-tool1-/);
        });

        test('should preserve existing IDs', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'existing-id' } }] },
            ];

            const result = assignToolCallIds(contents);

            expect(result[0].parts[0].functionCall.id).toBe('existing-id');
        });

        test('should handle empty contents', () => {
            const result = assignToolCallIds([]);
            expect(result).toEqual([]);
        });

        test('should handle null contents', () => {
            const result = assignToolCallIds(null);
            expect(result).toBe(null);
        });
    });

    describe('matchToolResponseIds', () => {
        test('should match functionResponse with call IDs', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-tool1-123' } }] },
            ];
            const callQueues = new Map([['tool1', ['call-tool1-123']]]);

            const responses = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = matchToolResponseIds(responses, callQueues);

            expect(result[0].parts[0].functionResponse.id).toBe('call-tool1-123');
        });

        test('should not assign ID when queue is empty', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'custom-id' } }] },
            ];
            const callQueues = new Map();

            const result = matchToolResponseIds(contents, callQueues);

            expect(result[0].parts[0].functionResponse.id).toBe('custom-id');
        });

        test('should handle null contents', () => {
            const result = matchToolResponseIds(null, new Map());
            expect(result).toBe(null);
        });

        test('should respect FIFO order for multiple calls', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];
            const callQueues = new Map([['tool1', ['call-tool1-first', 'call-tool1-second']]]);

            const result = matchToolResponseIds(contents, callQueues);

            expect(result[0].parts[0].functionResponse.id).toBe('call-tool1-first');
            expect(callQueues.get('tool1')).toEqual(['call-tool1-second']);
        });
    });

    describe('fixToolResponseGrouping', () => {
        test('should fix tool response grouping in one pass', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = fixToolResponseGrouping(contents);

            // Check functionCall has ID
            expect(result[0].parts[0].functionCall.id).toBeDefined();

            // Check functionResponse has matching ID
            expect(result[1].parts[0].functionResponse.id).toBe(result[0].parts[0].functionCall.id);
        });

        test('should handle multiple tool calls and responses', () => {
            const contents = [
                { role: 'model', parts: [
                    { functionCall: { name: 'tool1', args: {} } },
                    { functionCall: { name: 'tool2', args: {} } },
                ]},
                { role: 'user', parts: [
                    { functionResponse: { name: 'tool1', response: {} } },
                    { functionResponse: { name: 'tool2', response: {} } },
                ]},
            ];

            const result = fixToolResponseGrouping(contents);

            // Check all functionCalls have IDs
            expect(result[0].parts[0].functionCall.id).toBeDefined();
            expect(result[0].parts[1].functionCall.id).toBeDefined();

            // Check functionResponses have matching IDs (FIFO order)
            expect(result[1].parts[0].functionResponse.id).toBe(result[0].parts[0].functionCall.id);
            expect(result[1].parts[1].functionResponse.id).toBe(result[0].parts[1].functionCall.id);
        });

        test('should handle existing IDs', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'existing-id' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {} } }] },
            ];

            const result = fixToolResponseGrouping(contents);

            expect(result[0].parts[0].functionCall.id).toBe('existing-id');
            expect(result[1].parts[0].functionResponse.id).toBe('existing-id');
        });

        test('should handle null contents', () => {
            const result = fixToolResponseGrouping(null);
            expect(result).toBe(null);
        });

        test('should handle empty contents', () => {
            const result = fixToolResponseGrouping([]);
            expect(result).toEqual([]);
        });
    });

    describe('findOrphanToolResponses', () => {
        test('should find orphan responses', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] }, // Orphan
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans.length).toBe(1);
            expect(orphans[0].responseId).toBe('call-2');
            expect(orphans[0].functionName).toBe('tool1');
        });

        test('should return empty when no orphans', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-1' } }] },
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans.length).toBe(0);
        });

        test('should handle multiple orphans', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-3' } }] },
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans.length).toBe(2);
            expect(orphans.map(o => o.responseId)).toEqual(['call-2', 'call-3']);
        });

        test('should handle null contents', () => {
            const orphans = findOrphanToolResponses(null);
            expect(orphans).toEqual([]);
        });

        test('should track content index', () => {
            const contents = [
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {}, id: 'call-1' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
            ];

            const orphans = findOrphanToolResponses(contents);

            expect(orphans[0].contentIndex).toBe(1);
        });
    });

    describe('createPlaceholderToolCalls', () => {
        test('should create placeholders for orphans', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
            ];
            const orphans = [
                { contentIndex: 0, responseId: 'call-2', functionName: 'tool1' },
            ];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result.length).toBe(2); // Placeholder + original
            expect(result[0].role).toBe('model');
            expect(result[0].parts[0].functionCall.name).toBe('tool1');
            expect(result[0].parts[0].functionCall.id).toBe('call-2');
        });

        test('should not modify when no orphans', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Hello' }] },
            ];
            const orphans = [];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result).toEqual(contents);
        });

        test('should handle multiple orphans', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool2', response: {}, id: 'call-3' } }] },
            ];
            const orphans = [
                { contentIndex: 0, responseId: 'call-2', functionName: 'tool1' },
                { contentIndex: 1, responseId: 'call-3', functionName: 'tool2' },
            ];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result.length).toBe(4); // 2 placeholders + 2 originals
            expect(result[0].role).toBe('model');
            expect(result[1].role).toBe('user');
            expect(result[2].role).toBe('model');
            expect(result[3].role).toBe('user');
        });

        test('should create placeholder with empty args', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'call-2' } }] },
            ];
            const orphans = [
                { contentIndex: 0, responseId: 'call-2', functionName: 'tool1' },
            ];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result[0].parts[0].functionCall.args).toEqual({});
        });

        test('should preserve original content', () => {
            const contents = [
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: { data: 'test' }, id: 'call-2' } }] },
            ];
            const orphans = [
                { contentIndex: 0, responseId: 'call-2', functionName: 'tool1' },
            ];

            const result = createPlaceholderToolCalls(contents, orphans);

            expect(result[1].parts[0].functionResponse.response).toEqual({ data: 'test' });
        });
    });

    describe('Integration tests', () => {
        test('should handle complete workflow: find orphans, create placeholders, fix grouping', () => {
            // Scenario: orphan tool response without matching function call
            const contents = [
                { role: 'user', parts: [{ text: 'Use tools' }] },
                { role: 'model', parts: [{ functionCall: { name: 'tool1', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'tool1', response: {}, id: 'orphan-id' } }] },
            ];

            // Step 1: Find orphans
            const orphans = findOrphanToolResponses(contents);
            expect(orphans.length).toBe(1);

            // Step 2: Create placeholders
            const withPlaceholders = createPlaceholderToolCalls(contents, orphans);
            expect(withPlaceholders.length).toBe(4); // Original + placeholder

            // Step 3: Fix grouping
            const final = fixToolResponseGrouping(withPlaceholders);

            // Verify all tool calls have IDs
            const toolCalls = final.filter(c => c.role === 'model' && c.parts?.[0]?.functionCall);
            expect(toolCalls.length).toBe(2);
            expect(toolCalls[0].parts[0].functionCall.id).toBeDefined();
            expect(toolCalls[1].parts[0].functionCall.id).toBe('orphan-id');

            // Verify tool responses have matching IDs
            const toolResponses = final.filter(c => c.role === 'user' && c.parts?.[0]?.functionResponse);
            expect(toolResponses.length).toBe(1);
            expect(toolResponses[0].parts[0].functionResponse.id).toBeDefined();
        });

        test('should handle complex multi-turn conversation', () => {
            const contents = [
                { role: 'user', parts: [{ text: 'Step 1' }] },
                { role: 'model', parts: [{ functionCall: { name: 'get_weather', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'get_weather', response: {} } }] },
                { role: 'model', parts: [{ functionCall: { name: 'get_time', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'get_time', response: {} } }] },
            ];

            const result = fixToolResponseGrouping(contents);

            // All function calls should have IDs
            const weatherCallId = result[1].parts[0].functionCall.id;
            const timeCallId = result[3].parts[0].functionCall.id;

            expect(weatherCallId).toBeDefined();
            expect(timeCallId).toBeDefined();
            expect(weatherCallId).not.toBe(timeCallId); // IDs should be unique

            // Tool responses should have matching IDs (FIFO order)
            expect(result[2].parts[0].functionResponse.id).toBe(weatherCallId);
            expect(result[4].parts[0].functionResponse.id).toBe(timeCallId);
        });
    });
});
