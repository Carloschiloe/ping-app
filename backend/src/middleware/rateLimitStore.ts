import { createClient } from 'redis';
import { RedisStore } from 'rate-limit-redis';
import type { Store, Options } from 'express-rate-limit';

type RedisClient = ReturnType<typeof createClient>;

let sharedRedisClient: RedisClient | null = null;
let sharedRedisConnectPromise: Promise<void> | null = null;
let lastRedisWarningAt = 0;

class LocalRateLimitStore implements Store {
    readonly localKeys = true;
    readonly prefix = 'local:';
    private readonly hits = new Map<string, { totalHits: number; resetTime: number }>();
    private windowMs = 60_000;

    init(options: Options): void {
        this.windowMs = typeof options.windowMs === 'number' ? options.windowMs : 60_000;
        this.hits.clear();
    }

    async increment(key: string) {
        const now = Date.now();
        const current = this.hits.get(key);
        const entry = !current || current.resetTime <= now
            ? { totalHits: 0, resetTime: now + this.windowMs }
            : current;
        entry.totalHits += 1;
        this.hits.set(key, entry);
        return {
            totalHits: entry.totalHits,
            resetTime: new Date(entry.resetTime),
        };
    }

    async decrement(key: string): Promise<void> {
        const current = this.hits.get(key);
        if (!current) return;
        current.totalHits = Math.max(0, current.totalHits - 1);
    }

    async resetKey(key: string): Promise<void> {
        this.hits.delete(key);
    }
}

function warnRedis(message: string, error?: unknown): void {
    const now = Date.now();
    if (now - lastRedisWarningAt < 30_000) return;
    lastRedisWarningAt = now;
    console.warn('[RateLimit] Redis unavailable; using process-local fallback.', {
        message,
        error: error instanceof Error ? error.message.slice(0, 200) : undefined,
    });
}

function getSharedRedisClient(): RedisClient | null {
    const url = process.env.PING_RATE_LIMIT_REDIS_URL?.trim();
    if (!url) return null;

    if (!sharedRedisClient) {
        sharedRedisClient = createClient({ url });
        sharedRedisClient.on('error', (error) => warnRedis('Redis client error.', error));
    }
    ensureSharedRedisConnection(sharedRedisClient);
    return sharedRedisClient;
}

function ensureSharedRedisConnection(client: RedisClient): void {
    if (client.isReady || client.isOpen || sharedRedisConnectPromise) return;
    sharedRedisConnectPromise = client
        .connect()
        .then(() => undefined)
        .catch((error) => warnRedis('Redis connection failed.', error))
        .finally(() => {
            sharedRedisConnectPromise = null;
        });
}

/**
 * Shared rate-limit storage for Render's multi-instance topology.
 *
 * Redis is only a coordination layer for ephemeral counters: if it is not
 * configured or temporarily unavailable, the process-local store keeps
 * the API available and preserves a conservative per-instance limit. No user
 * data is written to Redis and no request is retried here.
 */
export function createRateLimitStore(prefix: string): Store {
    const fallback = new LocalRateLimitStore();
    const client = getSharedRedisClient();
    const primary = client
        ? new RedisStore({
            prefix: `ping:${prefix}:`,
            sendCommand: async (...args: string[]) => client.sendCommand(args) as Promise<any>,
        })
        : null;

    async function withFallback<T>(operation: () => Promise<T>, fallbackOperation: () => T | Promise<T>): Promise<T> {
        if (client && !client.isReady) ensureSharedRedisConnection(client);
        if (!primary || !client?.isReady) return fallbackOperation();
        try {
            return await operation();
        } catch (error) {
            warnRedis(`Rate-limit operation failed for ${prefix}.`, error);
            return fallbackOperation();
        }
    }

    return {
        // When configured, this is a shared store. During an outage the
        // fallback is local, but the middleware remains available.
        localKeys: !primary,
        prefix: `ping:${prefix}:`,
        init(options: Options) {
            fallback.init(options);
            if (primary) void primary.init(options).catch((error) => warnRedis(`Rate-limit store initialization failed for ${prefix}.`, error));
        },
        increment: (key) => withFallback(
            () => primary!.increment(key),
            () => fallback.increment(key),
        ),
        decrement: (key) => withFallback(
            async () => { await primary!.decrement(key); },
            () => fallback.decrement(key),
        ),
        resetKey: (key) => withFallback(
            async () => { await primary!.resetKey(key); },
            () => fallback.resetKey(key),
        ),
    };
}

export function getRateLimitStoreStatus(): {
    configured: boolean;
    ready: boolean;
    mode: 'redis' | 'memory';
} {
    const configured = Boolean(process.env.PING_RATE_LIMIT_REDIS_URL?.trim());
    const ready = Boolean(sharedRedisClient?.isReady);
    return {
        configured,
        ready,
        mode: ready ? 'redis' : 'memory',
    };
}
