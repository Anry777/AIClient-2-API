import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import { loadConfig, saveConfig, validateConfig, DEFAULT_CONFIG } from '../config-loader.js';

jest.mock('fs/promises');

describe('Config Loader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.ANTIGRAVITY_DEBUG;
        delete process.env.ANTIGRAVITY_ENABLE_THINKING_WARMUP;
    });

    describe('loadConfig', () => {
        test('should load default config when no files exist', async () => {
            fs.readFile.mockRejectedValue({ code: 'ENOENT' });

            const config = await loadConfig();

            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test('should load from project config file', async () => {
            fs.readFile.mockRejectedValue({ code: 'ENOENT' });

            const config = await loadConfig();

            expect(config).toEqual(DEFAULT_CONFIG);
        });

        test('should merge configs correctly', async () => {
            const customConfig = { debug: true, enable_thinking_warmup: false };
            fs.readFile.mockResolvedValue(JSON.stringify(customConfig));

            const config = await loadConfig();

            expect(config.debug).toBe(true);
            expect(config.enable_thinking_warmup).toBe(false);
        });
    });

    describe('validateConfig', () => {
        test('should validate correct config', () => {
            const config = { ...DEFAULT_CONFIG };

            const result = validateConfig(config);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should detect invalid TTL values', () => {
            const config = {
                ...DEFAULT_CONFIG,
                signature_cache_memory_ttl_seconds: 10,
            };

            const result = validateConfig(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('signature_cache_memory_ttl_seconds must be at least 60 seconds');
        });

        test('should detect invalid retry attempts', () => {
            const config = {
                ...DEFAULT_CONFIG,
                empty_response_max_attempts: 20,
            };

            const result = validateConfig(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('empty_response_max_attempts must be between 1 and 10');
        });

        test('should detect invalid retry delay', () => {
            const config = {
                ...DEFAULT_CONFIG,
                empty_response_retry_delay_ms: 100,
            };

            const result = validateConfig(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('empty_response_retry_delay_ms must be between 500 and 10000');
        });

        test('should detect invalid recoverable error retries', () => {
            const config = {
                ...DEFAULT_CONFIG,
                recoverable_error_max_retries: 0,
            };

            const result = validateConfig(config);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('recoverable_error_max_retries must be between 1 and 10');
        });

        test('should allow valid recoverable error retries', () => {
            const config = {
                ...DEFAULT_CONFIG,
                recoverable_error_max_retries: 5,
            };

            const result = validateConfig(config);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('saveConfig', () => {
        test('should save config to file', async () => {
            const config = { debug: true };

            await saveConfig(config, 'project');

            expect(fs.mkdir).toHaveBeenCalled();
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(config, null, 2),
                'utf8'
            );
        });
    });

    describe('loadConfigFromEnv', () => {
        test('should load boolean from env', async () => {
            process.env.ANTIGRAVITY_DEBUG = 'true';
            process.env.ANTIGRAVITY_QUIET_MODE = '1';

            const { loadConfig } = await import('../config-loader.js');
            const config = await loadConfig();

            expect(config.debug).toBe(true);
            expect(config.quiet_mode).toBe(true);
        });

        test('should load number from env', async () => {
            process.env.ANTIGRAVITY_THINKING_WARMUP_BUDGET = '32000';
            process.env.ANTIGRAVITY_EMPTY_RESPONSE_MAX_ATTEMPTS = '5';

            const { loadConfig } = await import('../config-loader.js');
            const config = await loadConfig();

            expect(config.thinking_warmup_budget).toBe(32000);
            expect(config.empty_response_max_attempts).toBe(5);
        });

        test('should load string from env', async () => {
            process.env.ANTIGRAVITY_LOG_DIR = '/var/log/antigravity';
            process.env.ANTIGRAVITY_RESUME_TEXT = 'please continue';

            const { loadConfig } = await import('../config-loader.js');
            const config = await loadConfig();

            expect(config.log_dir).toBe('/var/log/antigravity');
            expect(config.resume_text).toBe('please continue');
        });
    });
});
