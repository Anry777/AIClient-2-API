import { describe, test, expect } from '@jest/globals';
import { detectErrorType, isRecoverableError, getRecoveryMessage, ERROR_TYPES } from '../error-handler.js';

describe('Error Handler', () => {
    describe('detectErrorType', () => {
        test('should detect thinking_block_order error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking blocks must be in the first block position'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_BLOCK_ORDER);
        });

        test('should detect tool_result_missing error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'tool_use without corresponding tool_result'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.TOOL_RESULT_MISSING);
        });

        test('should detect thinking_disabled_violation error', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking is disabled and cannot contain thinking blocks'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_DISABLED_VIOLATION);
        });

        test('should detect thinking error with "preceding" keyword', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'preceding content before thinking blocks'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_BLOCK_ORDER);
        });

        test('should detect thinking error with "expected" and "found" keywords', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'expected thinking block, found text'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_BLOCK_ORDER);
        });

        test('should detect thinking error with "must start with" keyword', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'must start with thinking block'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.THINKING_BLOCK_ORDER);
        });

        test('should return null for non-recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'something went wrong'
                        }
                    }
                }
            };

            const type = detectErrorType(error);

            expect(type).toBeNull();
        });

        test('should return null for null error', () => {
            const type = detectErrorType(null);
            expect(type).toBeNull();
        });

        test('should handle string error messages', () => {
            const error = 'tool_use without corresponding tool_result';

            const type = detectErrorType(error);

            expect(type).toBe(ERROR_TYPES.TOOL_RESULT_MISSING);
        });
    });

    describe('isRecoverableError', () => {
        test('should return true for recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'thinking blocks must be in the first block position'
                        }
                    }
                }
            };

            expect(isRecoverableError(error)).toBe(true);
        });

        test('should return true for tool_result_missing', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'tool_use without corresponding tool_result'
                        }
                    }
                }
            };

            expect(isRecoverableError(error)).toBe(true);
        });

        test('should return false for non-recoverable errors', () => {
            const error = {
                response: {
                    data: {
                        error: {
                            message: 'something went wrong'
                        }
                    }
                }
            };

            expect(isRecoverableError(error)).toBe(false);
        });

        test('should return false for null error', () => {
            expect(isRecoverableError(null)).toBe(false);
        });
    });

    describe('getRecoveryMessage', () => {
        test('should return appropriate message for thinking_block_order', () => {
            const message = getRecoveryMessage(ERROR_TYPES.THINKING_BLOCK_ORDER);

            expect(message).toContain('Recovering thinking block order');
        });

        test('should return appropriate message for tool_result_missing', () => {
            const message = getRecoveryMessage(ERROR_TYPES.TOOL_RESULT_MISSING);

            expect(message).toContain('Injecting cancelled tool results');
        });

        test('should return appropriate message for thinking_disabled_violation', () => {
            const message = getRecoveryMessage(ERROR_TYPES.THINKING_DISABLED_VIOLATION);

            expect(message).toContain('Stripping thinking blocks');
        });

        test('should return default message for unknown error type', () => {
            const message = getRecoveryMessage('unknown');

            expect(message).toContain('Attempting to recover');
        });
    });
});
