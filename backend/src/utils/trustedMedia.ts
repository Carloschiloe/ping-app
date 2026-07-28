import { writeFile, unlink } from 'fs/promises';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export function validateTrustedStorageUrl(rawUrl: string): URL {
    const configuredSupabaseUrl = process.env.SUPABASE_URL;
    if (!configuredSupabaseUrl) {
        throw new Error('SUPABASE_URL is not configured');
    }

    let trustedOrigin: URL;
    let candidate: URL;
    try {
        trustedOrigin = new URL(configuredSupabaseUrl);
        candidate = new URL(rawUrl);
    } catch {
        throw new Error('Invalid media URL');
    }

    if (candidate.origin !== trustedOrigin.origin) {
        throw new Error('Media URL origin is not allowed');
    }

    if (candidate.username || candidate.password) {
        throw new Error('Media URL credentials are not allowed');
    }

    if (process.env.NODE_ENV === 'production' && candidate.protocol !== 'https:') {
        throw new Error('Media URL must use HTTPS');
    }

    if (!candidate.pathname.startsWith('/storage/v1/object/')) {
        throw new Error('Media URL is not a Supabase Storage object');
    }

    return candidate;
}

export async function downloadTrustedStorageFile(rawUrl: string, targetPath: string): Promise<void> {
    const trustedUrl = validateTrustedStorageUrl(rawUrl);
    const response = await fetch(trustedUrl, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Media download failed (${response.status})`);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_MEDIA_BYTES) {
        throw new Error('Media file is too large');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
        throw new Error('Unexpected media content type');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_MEDIA_BYTES) {
        throw new Error('Media file is too large');
    }

    await writeFile(targetPath, bytes, { flag: 'wx' });
}

export async function removeTemporaryFile(targetPath: string | undefined): Promise<void> {
    if (!targetPath) return;
    await unlink(targetPath).catch(() => undefined);
}
