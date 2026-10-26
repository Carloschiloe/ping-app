import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => ({
    objects: new Map<string, string>(),
    bucketExists: true,
    bucketCreates: 0,
    bucketListFailures: 0,
    bucketListErrorMessage: null as string | null,
    uploadFailures: 0,
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        storage: {
            listBuckets: async () => {
                if (storageState.bucketListFailures > 0) {
                    storageState.bucketListFailures -= 1;
                    return { data: null, error: { message: storageState.bucketListErrorMessage ?? 'temporary storage unavailable' } };
                }
                return {
                    data: storageState.bucketExists ? [{ name: 'm8-live-voice-telemetry' }] : [],
                    error: null,
                };
            },
            createBucket: async () => {
                storageState.bucketCreates += 1;
                return { error: null };
            },
            from: () => ({
                upload: async (path: string, body: Buffer) => {
                    if (storageState.uploadFailures > 0) {
                        storageState.uploadFailures -= 1;
                        return { error: { message: 'temporary storage unavailable' } };
                    }
                    storageState.objects.set(path, Buffer.from(body).toString('utf8'));
                    return { error: null };
                },
                download: async (path: string) => {
                    const value = storageState.objects.get(path);
                    return value === undefined
                        ? { data: null, error: { message: 'object not found' } }
                        : { data: new Blob([value]), error: null };
                },
                list: async (prefix: string) => ({
                    data: [...storageState.objects.keys()]
                        .filter(path => path.startsWith(`${prefix}/`))
                        .map(path => ({ name: path.slice(prefix.length + 1), updated_at: new Date().toISOString() })),
                    error: null,
                }),
                remove: async (paths: string[]) => { paths.forEach(path => storageState.objects.delete(path)); return { error: null }; },
            }),
        },
    },
}));

import {
    clearM8LiveVoiceTelemetryForTests,
    getLatestM8LiveVoiceTelemetryInternal,
    getM8LiveVoiceTelemetryPersistenceStatus,
    recordM8LiveVoiceTelemetry,
} from '../src/services/m8LiveVoice.service';

const actor = '11111111-1111-4111-8111-111111111111';
const voice = '22222222-2222-4222-8222-222222222222';
const device = '33333333-3333-4333-8333-333333333333';
const conversation = '44444444-4444-4444-8444-444444444444';

describe('M8 production telemetry durable storage contract', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'diagnostic-only-test-key';
        process.env.M8_LIVE_VOICE_TELEMETRY_PERSISTENCE = 'true';
        storageState.objects.clear();
        storageState.bucketExists = true;
        storageState.bucketCreates = 0;
        storageState.bucketListFailures = 0;
        storageState.bucketListErrorMessage = null;
        storageState.uploadFailures = 0;
        clearM8LiveVoiceTelemetryForTests();
    });

    it('persists sanitized latest telemetry and recovers it after the process cache is cleared', async () => {
        await recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            conversationId: conversation,
            event: 'transcript_received',
            transcript: 'hola access_token=hidden',
            atMs: 20,
            sideEffects: 0,
        });
        await recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            conversationId: conversation,
            event: 'session_closed',
            atMs: 40,
            sideEffects: 0,
        });

        clearM8LiveVoiceTelemetryForTests();
        const recovered = await getLatestM8LiveVoiceTelemetryInternal();
        expect(recovered).toMatchObject({ voiceSessionId: voice, deviceSessionId: device, closed: true, eventCount: 2, sideEffects: 0 });
        expect(JSON.stringify(recovered)).not.toContain(conversation);
        expect(JSON.stringify(recovered)).not.toContain('hidden');
        expect(storageState.bucketCreates).toBe(0);
    });

    it('recovers bucket verification after a transient storage failure', async () => {
        storageState.bucketListFailures = 1;

        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'session_started',
            atMs: 1,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'session_started',
            atMs: 2,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        expect(storageState.bucketCreates).toBe(0);
        const recovered = await getLatestM8LiveVoiceTelemetryInternal();
        expect(recovered).toMatchObject({ voiceSessionId: voice, eventCount: 2 });
    });

    it('does not provision a missing production bucket from the telemetry request path', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        storageState.bucketExists = false;

        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            conversationId: conversation,
            event: 'session_started',
            transcript: 'conversación privada que no debe aparecer en el diagnóstico',
            atMs: 2,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        expect(storageState.bucketCreates).toBe(0);
        expect(storageState.objects.size).toBe(0);
        expect(getM8LiveVoiceTelemetryPersistenceStatus()).toMatchObject({
            state: 'degraded',
            last_failure_code: 503,
        });
        const warningText = warning.mock.calls.map(args => JSON.stringify(args)).join('\n');
        expect(warningText).toContain('bucket_not_configured:m8-live-voice-telemetry');
        expect(warningText).not.toContain('conversación privada que no debe aparecer');
        expect(warningText).not.toContain(conversation);
        warning.mockRestore();
    });

    it('logs Storage failures with useful sanitized diagnostics', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        storageState.bucketListFailures = 1;
        storageState.bucketListErrorMessage = 'Authorization: Bearer storage-secret access_token=token-secret';

        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            conversationId: conversation,
            event: 'session_started',
            transcript: 'otra conversación privada que no debe aparecer',
            atMs: 2,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        const warningText = warning.mock.calls.map(args => JSON.stringify(args)).join('\n');
        expect(warningText).toContain('Authorization=[redacted]');
        expect(warningText).toContain('access_token=[redacted]');
        expect(warningText).not.toContain('storage-secret');
        expect(warningText).not.toContain('token-secret');
        expect(warningText).not.toContain('otra conversación privada que no debe aparecer');
        expect(warningText).not.toContain(conversation);
        warning.mockRestore();
    });

    it('retries a transient telemetry object write without losing the event', async () => {
        storageState.uploadFailures = 1;

        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'session_started',
            atMs: 3,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        const recovered = await getLatestM8LiveVoiceTelemetryInternal();
        expect(recovered).toMatchObject({ voiceSessionId: voice, eventCount: 1 });
    });

    it('merges in-memory events with the last persisted object after an intermediate outage', async () => {
        await recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'session_started',
            atMs: 10,
            sideEffects: 0,
        });

        // Three failed attempts exhaust the write retry budget for event B.
        // The event remains in the sanitized in-memory ledger while storage
        // still contains event A.
        storageState.uploadFailures = 3;
        await expect(recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'transcript_received',
            transcript: '¿Qué tengo mañana?',
            atMs: 20,
            sideEffects: 0,
        })).resolves.toBeUndefined();

        await recordM8LiveVoiceTelemetry(actor, {
            voiceSessionId: voice,
            deviceSessionId: device,
            event: 'core_disposition',
            coreKind: 'response',
            atMs: 30,
            sideEffects: 0,
        });

        const recovered = await getLatestM8LiveVoiceTelemetryInternal();
        expect(recovered.eventCount).toBe(3);
        expect(recovered.events.map((event: any) => event.atMs)).toEqual([10, 20, 30]);
    });
});
