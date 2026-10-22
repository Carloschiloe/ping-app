type CacheEntry<T> = {
    value: T;
    expiresAt: number;
    lastAccessAt: number;
};

/**
 * Small process-local cache for short-lived, user-scoped read models.
 *
 * It intentionally has no stale-while-revalidate behavior: an expired entry
 * is removed before it can be returned. Callers must include every security
 * scope that affects the value in the key.
 */
export class TtlCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();

    constructor(
        private readonly ttlMs: number,
        private readonly maxEntries = 256,
        private readonly now: () => number = Date.now,
    ) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttlMs must be positive');
        if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new Error('maxEntries must be positive');
    }

    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        const now = this.now();
        if (entry.expiresAt <= now) {
            this.entries.delete(key);
            return undefined;
        }

        entry.lastAccessAt = now;
        return entry.value;
    }

    set(key: string, value: T): void {
        const now = this.now();
        this.entries.set(key, {
            value,
            expiresAt: now + this.ttlMs,
            lastAccessAt: now,
        });

        while (this.entries.size > this.maxEntries) {
            let oldestKey: string | undefined;
            let oldestAccess = Number.POSITIVE_INFINITY;
            for (const [candidateKey, entry] of this.entries) {
                if (entry.lastAccessAt < oldestAccess) {
                    oldestKey = candidateKey;
                    oldestAccess = entry.lastAccessAt;
                }
            }
            if (oldestKey === undefined) break;
            this.entries.delete(oldestKey);
        }
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }

    get size(): number {
        return this.entries.size;
    }
}
