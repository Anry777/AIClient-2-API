import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'signature-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

/**
 * Signature cache for thinking blocks
 * Supports in-memory and disk-based caching with TTL
 */
export class SignatureCache {
    constructor(config) {
        this.memoryCache = new Map();
        this.diskCache = new Map();
        this.config = config || {};
        this.writeTimer = null;

        // Load from disk on startup (unless disabled)
        if (!this.config.disable_auto_load) {
            this.loadFromDisk().catch(err => {
                console.log('[SignatureCache] No existing cache file');
            });
        }
    }

    /**
     * Build cache key: sessionId:model:conversationKey:textHash
     */
    buildKey(sessionId, model, conversationKey, text) {
        const textHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
        return `${sessionId}:${model}:${conversationKey || 'default'}:${textHash}`;
    }

    /**
     * Cache signature
     */
    cache(sessionId, model, conversationKey, text, signature) {
        const key = this.buildKey(sessionId, model, conversationKey, text);
        const timestamp = Date.now();

        // In-memory cache
        this.memoryCache.set(key, { signature, timestamp });

        // Disk cache
        this.diskCache.set(key, { signature, timestamp });

        // Schedule disk write (debounce)
        this.scheduleDiskWrite();

        if (this.config.debug_thinking) {
            console.log(`[SignatureCache] Cached signature for key: ${key.substring(0, 40)}...`);
        }
    }

    /**
     * Get cached signature
     */
    get(sessionId, model, conversationKey, text) {
        const key = this.buildKey(sessionId, model, conversationKey, text);

        // Check memory first
        const memEntry = this.memoryCache.get(key);
        if (memEntry && !this.isExpired(memEntry.timestamp, this.config.memory_ttl_seconds || 3600)) {
            if (this.config.debug_thinking) {
                console.log(`[SignatureCache] Memory hit for key: ${key.substring(0, 40)}...`);
            }
            return memEntry.signature;
        }

        // Check disk
        const diskEntry = this.diskCache.get(key);
        if (diskEntry && !this.isExpired(diskEntry.timestamp, this.config.disk_ttl_seconds || 172800)) {
            // Promote to memory
            this.memoryCache.set(key, diskEntry);

            if (this.config.debug_thinking) {
                console.log(`[SignatureCache] Disk hit for key: ${key.substring(0, 40)}...`);
            }
            return diskEntry.signature;
        }

        if (this.config.debug_thinking) {
            console.log(`[SignatureCache] Cache miss for key: ${key.substring(0, 40)}...`);
        }
        return null;
    }

    /**
     * Check if entry is expired
     */
    isExpired(timestamp, ttlSeconds) {
        const now = Date.now();
        return (now - timestamp) > (ttlSeconds * 1000);
    }

    /**
     * Schedule disk write with debounce
     */
    scheduleDiskWrite() {
        if (this.writeTimer) return;

        const interval = (this.config.write_interval_seconds || 60) * 1000;
        this.writeTimer = setTimeout(async () => {
            await this.flushToDisk();
            this.writeTimer = null;
        }, interval);
    }

    /**
     * Flush cache to disk
     */
    async flushToDisk() {
        try {
            await fs.mkdir(CACHE_DIR, { recursive: true });
            const data = JSON.stringify(Array.from(this.diskCache.entries()));
            await fs.writeFile(CACHE_FILE, data, 'utf8');
            console.log(`[SignatureCache] Flushed ${this.diskCache.size} entries to disk`);
        } catch (error) {
            console.error('[SignatureCache] Failed to write cache to disk:', error.message);
        }
    }

    /**
     * Load cache from disk
     */
    async loadFromDisk() {
        try {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            const entries = JSON.parse(data);
            this.diskCache = new Map(entries);
            console.log(`[SignatureCache] Loaded ${this.diskCache.size} entries from disk`);
        } catch (error) {
            // File doesn't exist or is invalid
            this.diskCache = new Map();
        }
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.memoryCache.clear();
        this.diskCache.clear();
        console.log('[SignatureCache] Cache cleared');
    }

    /**
     * Cleanup expired entries
     */
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        // Cleanup memory
        for (const [key, entry] of this.memoryCache.entries()) {
            if (this.isExpired(entry.timestamp, this.config.memory_ttl_seconds || 3600)) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }

        // Cleanup disk
        for (const [key, entry] of this.diskCache.entries()) {
            if (this.isExpired(entry.timestamp, this.config.disk_ttl_seconds || 172800)) {
                this.diskCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[SignatureCache] Cleaned up ${cleaned} expired entries`);
            this.flushToDisk();
        }
    }

    /**
     * Cleanup - cancel pending writes
     */
    cleanup() {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }
    }
}
