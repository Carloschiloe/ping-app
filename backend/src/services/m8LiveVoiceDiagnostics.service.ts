import { createHash } from 'node:crypto';

type DiagnosticValue = string | number | boolean | null | undefined;

function digest(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    return createHash('sha256').update(`ping-m8:${value}`).digest('hex').slice(0, 16);
}

function safeMessage(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
        .replace(/https?:\/\/[^\s]+/gi, '[url redacted]')
        .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, 160);
}

export function traceM8LiveVoiceDiagnostic(
    event: string,
    details: Record<string, DiagnosticValue> = {},
): void {
    if (process.env.PING_ENVIRONMENT !== 'staging') return;

    const safeDetails: Record<string, DiagnosticValue> = {};
    for (const [key, value] of Object.entries(details)) {
        if (/^(authorization|apiKey|accessToken|refreshToken|password|secret|sdp)$/i.test(key)) {
            safeDetails[key] = '[redacted]';
            continue;
        }
        if (key === 'voiceSessionId' || key === 'deviceSessionId' || key === 'sessionId' || key === 'actorUserId') {
            safeDetails[`${key}Hash`] = digest(value);
            continue;
        }
        if (/message/i.test(key)) {
            safeDetails[key] = safeMessage(value);
            continue;
        }
        safeDetails[key] = value;
    }

    console.info('PING_M8_BOOTSTRAP_TRACE', JSON.stringify({ event, ...safeDetails }));
}

export function sanitizeM8LiveVoiceError(error: unknown): Record<string, DiagnosticValue> {
    const value = error as {
        name?: unknown;
        code?: unknown;
        status?: unknown;
        statusCode?: unknown;
        message?: unknown;
        providerErrorType?: unknown;
        providerErrorMessage?: unknown;
    } | null;
    return {
        errorName: typeof value?.name === 'string' ? value.name.slice(0, 60) : 'Error',
        errorCode: typeof value?.code === 'string' || typeof value?.code === 'number' ? String(value.code).slice(0, 60) : undefined,
        httpStatus: typeof value?.status === 'number' ? value.status : typeof value?.statusCode === 'number' ? value.statusCode : undefined,
        errorMessage: safeMessage(value?.message),
        providerErrorType: typeof value?.providerErrorType === 'string' ? value.providerErrorType.slice(0, 60) : undefined,
        providerErrorMessage: safeMessage(value?.providerErrorMessage),
    };
}
