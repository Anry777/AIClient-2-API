/**
 * Error handling utilities for Antigravity API
 */

/**
 * Error types for recovery
 */
export const ERROR_TYPES = {
    THINKING_BLOCK_ORDER: 'thinking_block_order',
    TOOL_RESULT_MISSING: 'tool_result_missing',
    THINKING_DISABLED_VIOLATION: 'thinking_disabled_violation',
};

/**
 * Extract error message from error object
 */
function getErrorMessage(error) {
    if (!error) return "";
    if (typeof error === "string") return error.toLowerCase();

    const errorObj = error;
    const paths = [
        errorObj.data,
        errorObj.error,
        errorObj,
        errorObj.data?.error,
    ];

    for (const obj of paths) {
        if (obj && typeof obj === "object") {
            const msg = obj.message;
            if (typeof msg === "string" && msg.length > 0) {
                return msg.toLowerCase();
            }
        }
    }

    try {
        return JSON.stringify(error).toLowerCase();
    } catch {
        return "";
    }
}

/**
 * Detect the type of recoverable error from an error object.
 */
export function detectErrorType(error) {
    const message = getErrorMessage(error);

    // tool_result_missing: Happens when ESC is pressed during tool execution
    if (message.includes("tool_use") && message.includes("tool_result")) {
        return ERROR_TYPES.TOOL_RESULT_MISSING;
    }

    // thinking_block_order: Happens when thinking blocks are corrupted
    if (
        message.includes("thinking") &&
        (message.includes("first block") ||
            message.includes("must start with") ||
            message.includes("preceding") ||
            (message.includes("expected") && message.includes("found")))
    ) {
        return ERROR_TYPES.THINKING_BLOCK_ORDER;
    }

    // thinking_disabled_violation: Thinking in non-thinking model
    if (message.includes("thinking is disabled") && message.includes("cannot contain")) {
        return ERROR_TYPES.THINKING_DISABLED_VIOLATION;
    }

    return null;
}

/**
 * Check if an error is recoverable.
 */
export function isRecoverableError(error) {
    return detectErrorType(error) !== null;
}

/**
 * Get user-friendly message for error type
 */
export function getRecoveryMessage(errorType) {
    const messages = {
        [ERROR_TYPES.THINKING_BLOCK_ORDER]: "Recovering thinking block order...",
        [ERROR_TYPES.TOOL_RESULT_MISSING]: "Injecting cancelled tool results...",
        [ERROR_TYPES.THINKING_DISABLED_VIOLATION]: "Stripping thinking blocks...",
    };
    return messages[errorType] || "Attempting to recover...";
}
