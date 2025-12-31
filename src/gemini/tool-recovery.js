/**
 * Tool ID Recovery Module
 *
 * Handles recovery of orphan tool responses when context compaction removes tool call IDs.
 * Uses FIFO queues to match functionCall with functionResponse by function name.
 */

/**
 * Assign tool call IDs to functionCall parts.
 * First pass: assign IDs and store in queue.
 */
export function assignToolCallIds(contents) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    const callQueues = new Map(); // function name -> queue of call IDs

    return contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            // Check for functionCall
            if (part.functionCall && part.functionCall.name) {
                const name = part.functionCall.name;

                // Generate call ID if not present (prefer id over callId)
                const hasId = part.functionCall.id || part.functionCall.callId;
                if (!hasId) {
                    const callId = generateToolCallId(name);
                    part.functionCall.id = callId;

                    // Store in queue
                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(callId);
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Match tool response IDs with previously assigned call IDs.
 * Second pass: retrieve IDs from FIFO queue.
 */
export function matchToolResponseIds(contents, callQueues) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    return contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            // Check for functionResponse
            if (part.functionResponse && part.functionResponse.name) {
                const name = part.functionResponse.name;

                // If ID is missing, try to get from queue
                if (!part.functionResponse.id) {
                    const queue = callQueues.get(name);
                    if (queue && queue.length > 0) {
                        const callId = queue.shift(); // FIFO: get first element
                        part.functionResponse.id = callId;
                    }
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Fix tool response grouping by assigning and matching IDs in one pass.
 */
export function fixToolResponseGrouping(contents) {
    if (!contents || !Array.isArray(contents)) {
        return contents;
    }

    const callQueues = new Map(); // function name -> queue of call IDs

    // First pass: assign tool call IDs
    const withCallIds = contents.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            if (part.functionCall && part.functionCall.name) {
                const name = part.functionCall.name;
                const callId = part.functionCall.id || part.functionCall.callId;

                if (callId) {
                    // Ensure id field is set (use id or callId)
                    part.functionCall.id = callId;

                    // Store existing ID in queue
                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(callId);
                } else {
                    // Generate new ID
                    const newCallId = generateToolCallId(name);
                    part.functionCall.id = newCallId;

                    if (!callQueues.has(name)) {
                        callQueues.set(name, []);
                    }
                    callQueues.get(name).push(newCallId);
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });

    // Second pass: match functionResponse with call IDs
    return withCallIds.map(content => {
        if (!content || !Array.isArray(content.parts)) {
            return content;
        }

        const newParts = content.parts.map(part => {
            if (part.functionResponse && part.functionResponse.name) {
                const name = part.functionResponse.name;

                // If ID is missing, get from queue
                if (!part.functionResponse.id) {
                    const queue = callQueues.get(name);
                    if (queue && queue.length > 0) {
                        const callId = queue.shift(); // FIFO
                        part.functionResponse.id = callId;
                    }
                }
            }

            return part;
        });

        return { ...content, parts: newParts };
    });
}

/**
 * Generate tool call ID in format: call-<function-name>-<random>
 */
function generateToolCallId(functionName) {
    const randomPart = Math.random().toString(36).substring(2, 10);
    return `call-${functionName}-${randomPart}`;
}

/**
 * Find orphan tool responses (functionResponse without matching functionCall)
 */
export function findOrphanToolResponses(contents) {
    const orphans = [];
    const callIds = new Set();

    if (!contents || !Array.isArray(contents)) {
        return orphans;
    }

    // First pass: collect all call IDs
    contents.forEach(content => {
        if (!content || !Array.isArray(content.parts)) return;

        content.parts.forEach(part => {
            if (part.functionCall && part.functionCall.id) {
                callIds.add(part.functionCall.id);
            }
        });
    });

    // Second pass: find responses without matching call
    contents.forEach((content, idx) => {
        if (!content || !Array.isArray(content.parts)) return;

        content.parts.forEach(part => {
            if (part.functionResponse && part.functionResponse.id) {
                if (!callIds.has(part.functionResponse.id)) {
                    orphans.push({
                        contentIndex: idx,
                        responseId: part.functionResponse.id,
                        functionName: part.functionResponse.name,
                    });
                }
            }
        });
    });

    return orphans;
}

/**
 * Create placeholder tool calls for orphan responses.
 */
export function createPlaceholderToolCalls(contents, orphans) {
    if (orphans.length === 0) {
        return contents;
    }

    const placeholderMap = new Map(); // responseId -> placeholder call

    orphans.forEach(orphan => {
        placeholderMap.set(orphan.responseId, {
            functionCall: {
                id: orphan.responseId,
                name: orphan.functionName,
                args: {}, // Placeholder args
            }
        });
    });

    // Insert placeholder calls before each orphan response
    const newContents = [];
    const placeholderIndices = new Set(orphans.map(o => o.contentIndex));

    contents.forEach((content, idx) => {
        // Insert placeholder call before orphan response
        if (placeholderIndices.has(idx)) {
            const responseId = content.parts.find(p => p.functionResponse)?.functionResponse?.id;
            const placeholder = placeholderMap.get(responseId);

            if (placeholder) {
                newContents.push({
                    role: 'model',
                    parts: [placeholder],
                });
            }
        }

        newContents.push(content);
    });

    return newContents;
}
