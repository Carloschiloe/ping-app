import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { safeErrorLog } from '../utils/safeError';

// Messages, photos and audio sent before files became private still carry a
// public chat-media address. The bucket is private now, so every API answer
// swaps those addresses for short-lived signed ones before it leaves the
// server. Nothing is rewritten in the database.

const BUCKET = 'chat-media';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const SIGNED_TTL_SECONDS = 6 * 60 * 60;
// Reuse a signed address while it has more than this left, so the same old
// photo keeps one address (and one cached copy on the phone) for hours.
const REUSE_MARGIN_MS = 60 * 60 * 1000;
const MAX_CACHE = 2000;

const cache = new Map<string, { url: string; expiresAt: number }>();

function publicUrlPattern(): RegExp | null {
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    if (!base) return null;
    const escaped = `${base}${PUBLIC_MARKER}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escaped}([^"\\s?#\\\\]+)`, 'g');
}

async function signedUrlsFor(paths: string[]): Promise<Map<string, string>> {
    const now = Date.now();
    const result = new Map<string, string>();
    const missing: string[] = [];
    for (const path of paths) {
        const hit = cache.get(path);
        if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) result.set(path, hit.url);
        else missing.push(path);
    }
    if (missing.length) {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL_SECONDS);
        if (error) throw error;
        if (cache.size > MAX_CACHE) cache.clear();
        for (const item of data || []) {
            if (!item.path || !item.signedUrl) continue;
            cache.set(item.path, { url: item.signedUrl, expiresAt: now + SIGNED_TTL_SECONDS * 1000 });
            result.set(item.path, item.signedUrl);
        }
    }
    return result;
}

export async function signLegacyMediaUrls(body: unknown): Promise<unknown> {
    const pattern = publicUrlPattern();
    if (!pattern || body === undefined) return body;
    const text = JSON.stringify(body);
    if (!text || !text.includes(PUBLIC_MARKER)) return body;

    const byUrl = new Map<string, string>();
    for (const match of text.matchAll(pattern)) {
        try {
            byUrl.set(match[0], decodeURIComponent(match[1]));
        } catch {
            // A malformed address is left as it is.
        }
    }
    if (!byUrl.size) return body;

    const signed = await signedUrlsFor(Array.from(new Set(byUrl.values())));
    const rewritten = text.replace(pattern, (url) => {
        const path = byUrl.get(url);
        return (path && signed.get(path)) || url;
    });
    return JSON.parse(rewritten);
}

export function legacyMediaUrls(_req: Request, res: Response, next: NextFunction): void {
    const send = res.json.bind(res);
    res.json = ((body: unknown) => {
        signLegacyMediaUrls(body)
            .then((signedBody) => send(signedBody))
            .catch((error) => {
                console.error('[LegacyMedia] signing failed:', safeErrorLog(error));
                send(body);
            });
        return res;
    }) as Response['json'];
    next();
}
