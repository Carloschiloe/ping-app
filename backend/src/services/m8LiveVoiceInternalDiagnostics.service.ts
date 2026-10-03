import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError';

const MAX_CLOCK_SKEW_MS = 60_000;
const PROOF_PREFIX = 'm8-live-telemetry/latest:';

function internalKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
}

export function createM8LiveVoiceLatestProof(timestamp: string, key = internalKey()): string {
    if (!key) throw new AppError('Live voice diagnostics are not configured', 404);
    return createHmac('sha256', key).update(`${PROOF_PREFIX}${timestamp}`).digest('hex');
}

export function assertInternalM8LiveVoiceDiagnostics(timestamp: unknown, signature: unknown, now = Date.now()): void {
    if (process.env.PING_ENVIRONMENT !== 'staging' || process.env.M8_LIVE_VOICE_ENABLED !== 'true') {
        throw new AppError('Live voice diagnostics unavailable', 404);
    }
    if (typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp)) {
        throw new AppError('Live voice diagnostics unauthorized', 401);
    }
    const timestampMs = Number(timestamp);
    if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) {
        throw new AppError('Live voice diagnostics unauthorized', 401);
    }
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) {
        throw new AppError('Live voice diagnostics unauthorized', 401);
    }
    const expected = Buffer.from(createM8LiveVoiceLatestProof(timestamp), 'hex');
    const received = Buffer.from(signature, 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new AppError('Live voice diagnostics unauthorized', 401);
    }
}

export const M8_LIVE_VOICE_DIAGNOSTIC_TIMESTAMP_HEADER = 'x-ping-diagnostic-timestamp';
export const M8_LIVE_VOICE_DIAGNOSTIC_SIGNATURE_HEADER = 'x-ping-diagnostic-signature';
