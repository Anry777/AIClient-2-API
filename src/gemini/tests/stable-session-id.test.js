/**
 * Unit tests for Stable Session ID (Phase 3)
 * 
 * Verifies that PLUGIN_SESSION_ID is used consistently across requests
 * instead of generating random session IDs for each request.
 * 
 * Note: These tests verify source code patterns since the main module has 
 * dependencies that don't work well with Jest's ESM handling.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Stable Session ID', () => {
    let source;

    beforeEach(async () => {
        const modulePath = resolve(__dirname, '../antigravity-core.js');
        source = await fs.readFile(modulePath, 'utf-8');
    });

    describe('PLUGIN_SESSION_ID Declaration', () => {
        it('should define PLUGIN_SESSION_ID using UUID format', () => {
            // Verify PLUGIN_SESSION_ID uses UUID format with leading dash
            expect(source).toMatch(/const\s+PLUGIN_SESSION_ID\s*=\s*`-\$\{uuidv4\(\)\}`/);
        });

        it('should import uuid v4 function', () => {
            expect(source).toMatch(/import\s*\{[^}]*v4\s+as\s+uuidv4[^}]*\}\s*from\s*['"]uuid['"]/);
        });

        it('should define PLUGIN_SESSION_ID at module level', () => {
            // PLUGIN_SESSION_ID should be defined after imports, not inside any function
            const lines = source.split('\n');
            let foundPluginSessionId = false;
            let insideFunction = 0;

            for (const line of lines) {
                // Track function depth (simplified)
                if (line.match(/function\s+\w+\s*\(|=>\s*\{|{\s*$/)) {
                    insideFunction++;
                }
                if (line.match(/^\s*\}/)) {
                    insideFunction = Math.max(0, insideFunction - 1);
                }

                if (line.includes('const PLUGIN_SESSION_ID')) {
                    foundPluginSessionId = true;
                    // Should be at module level (depth 0)
                    expect(insideFunction).toBe(0);
                    break;
                }
            }

            expect(foundPluginSessionId).toBe(true);
        });
    });

    describe('Session ID Usage', () => {
        it('should use PLUGIN_SESSION_ID in request transformation', () => {
            // Verify the correct assignment pattern
            expect(source).toMatch(/template\.request\.sessionId\s*=\s*PLUGIN_SESSION_ID/);
        });

        it('should NOT call generateSessionID() for request sessionId', () => {
            // Check that generateSessionID() is not used for setting request.sessionId
            expect(source).not.toMatch(/template\.request\.sessionId\s*=\s*generateSessionID\(\)/);
        });

        it('should have removed or commented generateSessionID function', () => {
            // Check that generateSessionID function is either removed or only in comments
            const functionDeclaration = source.match(/^function\s+generateSessionID\s*\(/m);

            // If function is not found as standalone declaration, it's been removed
            expect(functionDeclaration).toBeNull();
        });
    });

    describe('Logging', () => {
        it('should log stable session ID during initialization', () => {
            // Check for proper logging statements
            expect(source).toContain('[Antigravity] Using stable session ID:');
        });

        it('should log that session ID remains constant', () => {
            expect(source).toContain('Session ID will remain constant across all requests');
        });
    });

    describe('Comment Documentation', () => {
        it('should have comment explaining stable session ID purpose', () => {
            // Check for comment about stable session usage
            expect(source).toMatch(/Stable\s+Session\s+ID|PLUGIN_SESSION_ID/i);
        });

        it('should document that generateSessionID is no longer used', () => {
            // Look for comment indicating removal
            expect(source).toMatch(/generateSessionID\s+removed|using\s+stable\s+PLUGIN_SESSION_ID/i);
        });
    });

    describe('Session ID Format', () => {
        it('should produce UUID-format session ID', () => {
            // The pattern `-${uuidv4()}` should produce something like
            // "-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            // Verify the pattern is correct
            const match = source.match(/PLUGIN_SESSION_ID\s*=\s*`(-\$\{uuidv4\(\)\})`/);
            expect(match).not.toBeNull();

            // The format should be: dash + uuid ("-" + uuid)
            expect(match[1]).toBe('-${uuidv4()}');
        });
    });
});
