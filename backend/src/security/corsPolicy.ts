import type { Request } from 'express';

function requestHost(req: Pick<Request, 'get'>): string | null {
    const host = req.get('host')?.trim();
    return host || null;
}

export function isSameRequestOrigin(req: Pick<Request, 'get' | 'protocol'>, origin: string): boolean {
    const host = requestHost(req);
    if (!host) return false;

    try {
        const parsedOrigin = new URL(origin);
        return parsedOrigin.protocol === `${req.protocol}:` && parsedOrigin.host === host;
    } catch {
        return false;
    }
}

export function isAllowedRequestOrigin(
    req: Pick<Request, 'get' | 'protocol'>,
    origin: string | undefined,
    allowedOrigins: string[],
): boolean {
    if (!origin || allowedOrigins.includes(origin)) return true;
    return isSameRequestOrigin(req, origin);
}
