import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => ({
    objects: new Map<string, string>(),
    bucketCreates: 0,
    bucketCreateFailures: 0,
    uploadFailures: 0,
}));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        storage: {
            createBucket: async () => {
                storageState.bucketCreates += 1;
                if (storageState.bucketCreateFailures > 0) {
                    storageState.bucketCreateFailures -= 1;
                    return { error: { message: 'temporary storage unavailable' } };
                }
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
        storageState.bucketCreates = 0;
        storageState.bucketCreateFailures = 0;
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
        expect(storageState.bucketCreates).toBe(2);
    });

    it('recovers bucket initialization after a transient storage failure', async () => {
        storageState.bucketCreateFailures = 1;

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

        expect(storageState.bucketCreates).toBe(2);
        const recovered = await getLatestM8LiveVoiceTelemetryInternal();
        expect(recovered).toMatchObject({ voiceSessionId: voice, eventCount: 2 });
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
});
