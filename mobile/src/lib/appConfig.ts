import { apiClient } from '../api/client';

// Canonical app configuration/capabilities client. Backend
// (privateFile.service.ts's MAX_MESSAGE_ATTACHMENT_BYTES) is the single
// authoritative owner of the attachment-size policy; this module only
// fetches and caches that value for preflight UX purposes. It is NEVER the
// source of truth: post-upload backend/Storage verification enforces the
// real limit independently of whatever this client last saw. There is
// deliberately no second, locally-invented numeric maximum anywhere in this
// module — when no value has ever been successfully fetched,
// maxMessageAttachmentBytes is `null` ("unknown"), never a guessed number.
export type AppConfig = {
    limits: {
        maxMessageAttachmentBytes: number | null;
    };
};

const UNKNOWN_CONFIG: AppConfig = { limits: { maxMessageAttachmentBytes: null } };

// Cache freshness contract: a successfully fetched value is served
// immediately (no network call) for CACHE_TTL_MS. Once stale, the NEXT call
// to getAppConfig() triggers a revalidation fetch and awaits it before
// resolving — so "picked up on the next check" means the next check after
// the TTL has elapsed, not truly instant propagation, and never a fetch on
// every render (call sites that only need a fast, non-blocking read should
// use getCachedMaxMessageAttachmentBytes() instead, which never blocks or
// triggers a fetch). A failed revalidation NEVER overwrites the last-known-
// good value — the stale-but-valid cache keeps being served (still subject
// to backend re-verification on actual upload), and only a genuinely empty
// cache with a failed fetch resolves to "unknown".
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedConfig: AppConfig | null = null;
let cachedAt = 0;
let inFlightFetch: Promise<AppConfig> | null = null;

function isValidAppConfig(value: unknown): value is AppConfig {
    const limits = (value as any)?.limits;
    return typeof limits?.maxMessageAttachmentBytes === 'number' && limits.maxMessageAttachmentBytes > 0;
}

function isFresh(): boolean {
    return cachedConfig !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

async function fetchAndCache(): Promise<AppConfig> {
    try {
        const response = await apiClient.get('/config');
        if (!isValidAppConfig(response)) throw new Error('Invalid /config response shape');
        cachedConfig = response;
        cachedAt = Date.now();
        return response;
    } catch (error) {
        console.warn('[AppConfig] Unable to fetch canonical config', {
            message: error instanceof Error ? error.message : 'unknown',
            hasLastKnownGood: cachedConfig !== null,
        });
        // Malformed responses and transient failures never replace a valid
        // last-known-good cache — only extend how long it keeps being
        // served, since there is nothing better to serve instead.
        return cachedConfig ?? UNKNOWN_CONFIG;
    } finally {
        inFlightFetch = null;
    }
}

// Returns the canonical config, revalidating against the backend when the
// cache is empty or stale (see CACHE_TTL_MS above). Never throws: any
// failure resolves to the last-known-good cached value if one exists, or
// to an explicit "unknown" policy (`maxMessageAttachmentBytes: null`)
// otherwise — callers must treat `null` as "cannot validate locally," never
// as "unlimited" or as a reason to invent a fallback number.
export async function getAppConfig(options: { forceRefresh?: boolean } = {}): Promise<AppConfig> {
    if (!options.forceRefresh && isFresh()) return cachedConfig as AppConfig;
    if (inFlightFetch && !options.forceRefresh) return inFlightFetch;

    inFlightFetch = fetchAndCache();
    return inFlightFetch;
}

// Synchronous, non-blocking read for call sites that cannot await and must
// never trigger a network request (e.g. building UI copy before the async
// config resolves). Returns the last successfully cached value regardless
// of freshness, or `null` if nothing has ever been fetched — it does NOT
// revalidate, and does NOT fall back to any locally-invented number.
export function getCachedMaxMessageAttachmentBytes(): number | null {
    return cachedConfig?.limits.maxMessageAttachmentBytes ?? null;
}

export function clearAppConfigCache() {
    cachedConfig = null;
    cachedAt = 0;
    inFlightFetch = null;
}
