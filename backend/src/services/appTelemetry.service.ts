import { createHash } from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { redactSensitiveText } from '../utils/safeError';

// What the admin panel learns from the app and the server: which phones the
// app is installed on, and what failed. Never the text of messages,
// commitments or anything a person wrote.

export type Platform = 'android' | 'ios' | 'web' | 'other';

export async function recordInstall(userId: string, input: {
    installId: string;
    platform: Platform;
    appVersion?: string | null;
    osVersion?: string | null;
}): Promise<void> {
    const { error } = await supabaseAdmin.from('app_installs').upsert({
        install_id: input.installId,
        user_id: userId,
        platform: input.platform,
        app_version: input.appVersion ?? null,
        os_version: input.osVersion ?? null,
        last_seen: new Date().toISOString(),
    }, { onConflict: 'install_id' });
    if (error) throw error;
}

// Ids, numbers and emails make each failure look unique; without them the
// same failure groups together.
export function errorFingerprint(source: string, title: string, location?: string | null): string {
    const normalize = (value: string) => value
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
        .replace(/\S+@\S+/g, ':email')
        .replace(/\d+/g, '#')
        .toLowerCase();
    return createHash('sha256')
        .update(`${source}|${normalize(title)}|${normalize(location ?? '')}`)
        .digest('hex')
        .slice(0, 32);
}

export async function recordError(input: {
    source: 'server' | 'app';
    title: string;
    detail?: string | null;
    location?: string | null;
    appVersion?: string | null;
    platform?: string | null;
    userId?: string | null;
}): Promise<void> {
    const title = redactSensitiveText(input.title, 200) || 'Error sin descripción';
    const location = input.location ? redactSensitiveText(input.location, 200) : null;
    const { error } = await supabaseAdmin.from('app_errors').insert({
        source: input.source,
        fingerprint: errorFingerprint(input.source, title, location),
        title,
        detail: input.detail ? redactSensitiveText(input.detail, 2000) : null,
        location,
        app_version: input.appVersion ? String(input.appVersion).slice(0, 40) : null,
        platform: input.platform ? String(input.platform).slice(0, 20) : null,
        user_id: input.userId ?? null,
    });
    if (error) throw error;
}

// The route a request matched, with ids taken out: "/api/conversations/:id".
export function requestLocation(method: string, path: string): string {
    const cleanPath = path
        .split('?')[0]
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
        .replace(/\/\d+(?=\/|$)/g, '/:n');
    return `${method.toUpperCase()} ${cleanPath}`.slice(0, 200);
}

// Called from the error handler for server failures. It must never throw or
// slow down the answer, and stays quiet in tests.
export function recordServerError(error: unknown, method: string, path: string, userId?: string | null): void {
    if (process.env.NODE_ENV === 'test') return;
    const err = error as { name?: string; message?: string; stack?: string };
    const title = `${err?.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err?.message || 'Error interno'}`;
    void recordError({
        source: 'server',
        title,
        detail: err?.stack?.split('\n').slice(0, 6).join('\n') ?? null,
        location: requestLocation(method, path),
        userId: userId ?? null,
    }).catch(() => undefined);
}

// Many routes answer their own failures with a 500 instead of passing them to
// the error handler. This records those too, by route, once per request.
export function captureFailedResponses(req: { method: string; originalUrl: string; user?: { id: string } }, res: { statusCode: number; locals: Record<string, unknown>; on: (event: 'finish', listener: () => void) => unknown }, next: () => void): void {
    res.on('finish', () => {
        if (res.statusCode < 500 || res.locals.errorRecorded) return;
        recordServerError(new Error(`El servidor respondió con error ${res.statusCode}`), req.method, req.originalUrl, req.user?.id);
    });
    next();
}
