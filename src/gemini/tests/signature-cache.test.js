/**
 * Unit tests for signature-cache.js
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { SignatureCache } from '../signature-cache.js';

describe('SignatureCache', () => {
    let cache;

    beforeEach(() => {
        cache = new SignatureCache({
            memory_ttl_seconds: 3600,
            disk_ttl_seconds: 172800,
            write_interval_seconds: 60,
            debug_thinking: false,
            disable_auto_load: true,
        });
    });

    afterEach(async () => {
        cache.cleanup();
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    describe('buildKey', () => {
        it('should build correct cache key', () => {
            const key = cache.buildKey('session-123', 'model-name', 'conv-1', 'test text');
            expect(key).toMatch(/^session-123:model-name:conv-1:[a-f0-9]{16}$/);
        });

        it('should use default for null conversationKey', () => {
            const key = cache.buildKey('session-123', 'model-name', null, 'test text');
            expect(key).toContain(':default:');
        });
    });

    describe('cache and get', () => {
        it('should cache and retrieve signature', () => {
            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', 'signature-value');
            const result = cache.get('session-1', 'model-1', 'conv-1', 'text-1');
            expect(result).toBe('signature-value');
        });

        it('should return null for non-existent key', () => {
            const result = cache.get('non-existent', 'model', 'conv', 'text');
            expect(result).toBeNull();
        });

        it('should handle different texts with same params', () => {
            cache.cache('session-1', 'model-1', 'conv-1', 'text-1', 'sig-1');
            cache.cache('session-1', 'model-1', 'conv-1', 'text-2', 'sig-2');

            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-1')).toBe('sig-1');
            expect(cache.get('session-1', 'model-1', 'conv-1', 'text-2')).toBe('sig-2');
        });
    });

    describe('isExpired', () => {
        it('should return false for recent entries', () => {
            const timestamp = Date.now();
            expect(cache.isExpired(timestamp, 3600)).toBe(false);
        });

        it('should return true for old entries', () => {
            const oldTimestamp = Date.now() - (3601 * 1000); // 3601 seconds ago
            expect(cache.isExpired(oldTimestamp, 3600)).toBe(true);
        });
    });

    describe('clear', () => {
        it('should clear all cache entries', async () => {
            cache.cache('s1', 'm1', 'c1', 't1', 'sig1');
            cache.cache('s2', 'm2', 'c2', 't2', 'sig2');

            cache.clear();

            expect(cache.get('s1', 'm1', 'c1', 't1')).toBeNull();
            expect(cache.get('s2', 'm2', 'c2', 't2')).toBeNull();
            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });

    describe('cleanupExpired', () => {
        it('should remove expired entries from memory cache', () => {
            // Manually add an expired entry
            const key = cache.buildKey('s1', 'm1', 'c1', 't1');
            cache.memoryCache.set(key, {
                signature: 'old-sig',
                timestamp: Date.now() - (3601 * 1000) // expired
            });

            const flushToDiskSpy = jest.spyOn(cache, 'flushToDisk');
            cache.cleanupExpired();

            expect(cache.memoryCache.has(key)).toBe(false);
            flushToDiskSpy.mockRestore();
        });

        it('should keep valid entries', async () => {
            cache.cache('s1', 'm1', 'c1', 't1', 'sig1');
            const flushToDiskSpy = jest.spyOn(cache, 'flushToDisk');
            cache.cleanupExpired();
            expect(cache.get('s1', 'm1', 'c1', 't1')).toBe('sig1');
            flushToDiskSpy.mockRestore();
            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });
});
