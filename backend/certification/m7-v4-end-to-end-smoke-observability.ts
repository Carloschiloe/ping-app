import path from 'node:path';

export const SMOKE_ARTIFACT_DIRECTORY_NAME = '.m7-smoke-artifacts';

export function smokeArtifactDirectory(cwd = process.cwd()): string {
    const configuredRoot = process.env.PING_SMOKE_ARTIFACT_ROOT?.trim();
    return path.resolve(configuredRoot || path.join(cwd, SMOKE_ARTIFACT_DIRECTORY_NAME));
}

export function smokeArtifactPath(filename: string, cwd = process.cwd()): string {
    return path.join(smokeArtifactDirectory(cwd), filename);
}

export interface SanitizedSmokeCause {
    name: string | null;
    code: string | null;
    message: string | null;
}

export interface SanitizedSmokeError {
    name: string | null;
    status: number | string | null;
    code: string | null;
    type: string | null;
    message: string | null;
    cause: SanitizedSmokeCause | null;
}

function sanitizeText(value: unknown): string | null {
    if (typeof value !== 'string' || value.length === 0) return null;
    return value
        .slice(0, 1000)
        .replace(/authorization\s*[:=]\s*Bearer\s+[^\s,;]+/gi, 'Authorization=[redacted]')
        .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk|rk|pk|sess)-[A-Za-z0-9_-]+\b/g, '[redacted]')
        .replace(/(OPENAI_API_KEY|api[_-]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, (_match, label: string) => `${label}=[redacted]`);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
    return sanitizeText(record[key]);
}

function causeOf(value: unknown): SanitizedSmokeCause | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return {
        name: stringField(record, 'name'),
        code: stringField(record, 'code'),
        message: sanitizeText(record.message),
    };
}

/** Converts SDK failures to a bounded, secret-free local diagnostic. */
export function sanitizeSmokeError(error: unknown): SanitizedSmokeError {
    if (!error || typeof error !== 'object') {
        return { name: null, status: null, code: null, type: null, message: sanitizeText(error), cause: null };
    }
    const record = error as Record<string, unknown>;
    const status = typeof record.status === 'number' || typeof record.status === 'string'
        ? record.status
        : null;
    return {
        name: stringField(record, 'name'),
        status,
        code: stringField(record, 'code'),
        type: stringField(record, 'type'),
        message: sanitizeText(record.message),
        cause: causeOf(record.cause),
    };
}
