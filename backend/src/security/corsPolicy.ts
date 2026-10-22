import type { Request } from 'express';

export type AllowedOriginsParseResult = {
    origins: string[];
    invalidCount: number;
};

/**
 * Converts one configured CORS origin to the canonical browser-origin form.
 * Paths, query strings, fragments, credentials and non-HTTP schemes are not
 * valid CORS origins for this API. A trailing slash is harmless and is
 * normalized away by URL.origin.
 */
export function normalizeCorsOrigin(value: string): string | null {
    const candidate = value.trim();
    if (!candidate || candidate === '*') return null;

    try {
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        if (!parsed.hostname || parsed.username || parsed.password) return null;
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
        return parsed.origin;
    } catch {
        return null;
    }
}

export function parseAllowedOrigins(raw: string | undefined): AllowedOriginsParseResult {
    const origins: string[] = [];
    let invalidCount = 0;

    for (const value of (raw || '').split(',')) {
        if (!value.trim()) continue;
        const normalized = normalizeCorsOrigin(value);
        if (!normalized) {
            invalidCount += 1;
            continue;
        }
        if (!origins.includes(normalized)) origins.push(normalized);
    }

    return { origins, invalidCount };
}

export function isStrictCorsEnvironment(nodeEnv: string, environmentName: string): boolean {
    return nodeEnv.trim().toLowerCase() === 'production'
        || environmentName.trim().toLowerCase() === 'production';
}

function requestHost(req: Pick<Request, 'get'>): string | null {
    const host = req.get('host')?.trim();
    return host ? host.toLowerCase() : null;
}

export function isSameRequestOrigin(req: Pick<Request, 'get' | 'protocol'>, origin: string): boolean {
    const host = requestHost(req);
    if (!host) return false;

    try {
        const parsedOrigin = new URL(origin);
        return parsedOrigin.protocol === `${req.protocol.toLowerCase()}:`
            && parsedOrigin.host.toLowerCase() === host;
    } catch {
        return false;
    }
}

export function isAllowedRequestOrigin(
    req: Pick<Request, 'get' | 'protocol'>,
    origin: string | undefined,
    allowedOrigins: string[],
): boolean {
    // Native mobile requests normally omit Origin. CORS does not apply to
    // them, so keep this path open without weakening browser-origin checks.
    if (!origin) return true;

    const normalizedOrigin = normalizeCorsOrigin(origin);
    if (!normalizedOrigin) return false;
    if (allowedOrigins.includes(normalizedOrigin)) return true;
    return isSameRequestOrigin(req, normalizedOrigin);
}
