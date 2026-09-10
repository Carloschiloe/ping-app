// PING — VIDEO UPLOAD INTENT 400 (final contract): duration_ms is an
// audio-only field end to end. The public schema explicitly enforces this
// at the API boundary instead of silently accepting a value it doesn't
// apply to a given kind:
// - durationMs absent => valid for any mimeType.
// - durationMs present => mimeType MUST start with 'audio/', or the request
//   is rejected outright (never silently dropped downstream).
// - accepted duration is a finite positive integer within the existing
//   audio limit (14_400_000 ms / 4h) — an integer is REQUIRED, not coerced,
//   because the audio capture boundary (mobile's resolveRecordingDurationMs)
//   already normalizes native fractional milliseconds to a rounded integer
//   before this request is ever built; coercing here would paper over a bug
//   at the wrong layer instead of surfacing it.
import { describe, expect, it } from 'vitest';
import { createUploadIntentSchema } from '../src/schemas/attachment.schema';

const videoBody = {
    conversationId: '11111111-1111-4111-8111-111111111111',
    mimeType: 'video/mp4',
    originalFilename: 'clip.mp4',
    clientUploadId: '22222222-2222-4222-8222-222222222222',
};

const audioBody = {
    ...videoBody,
    mimeType: 'audio/m4a',
    originalFilename: 'voice.m4a',
};

describe('createUploadIntentSchema — durationMs is an audio-only contract', () => {
    it('video intent sin durationMs es aceptado (working case)', async () => {
        const result = await createUploadIntentSchema.parseAsync({ body: videoBody });

        expect(result.body.durationMs).toBeUndefined();
        expect(result.body.mimeType).toBe('video/mp4');
    });

    it('photo intent sin durationMs es aceptado', async () => {
        const result = await createUploadIntentSchema.parseAsync({
            body: { ...videoBody, mimeType: 'image/jpeg', originalFilename: 'photo.jpg' },
        });

        expect(result.body.durationMs).toBeUndefined();
    });

    it('video intent CON durationMs es rechazado explícitamente (nunca almacenado como si fuera audio)', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...videoBody, durationMs: 4200 },
        })).rejects.toThrow();
    });

    it('document/otro mimeType con durationMs también es rechazado', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...videoBody, mimeType: 'application/pdf', originalFilename: 'doc.pdf', durationMs: 1000 },
        })).rejects.toThrow();
    });

    it('audio intent con durationMs entero válido es aceptado', async () => {
        const result = await createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: 4200 },
        });

        expect(result.body.durationMs).toBe(4200);
    });

    it('audio intent con durationMs fraccionario es rechazado (se normaliza en la frontera de captura, no aquí)', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: 4230.7 },
        })).rejects.toThrow();
    });

    it('audio intent con durationMs no positivo es rechazado', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: 0 },
        })).rejects.toThrow();

        await expect(createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: -5 },
        })).rejects.toThrow();
    });

    it('audio intent con durationMs por encima del máximo permitido (14_400_000 ms / 4h) es rechazado', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: 14_400_001 },
        })).rejects.toThrow();
    });

    it('audio intent con durationMs no finito (Infinity) es rechazado', async () => {
        await expect(createUploadIntentSchema.parseAsync({
            body: { ...audioBody, durationMs: Infinity },
        })).rejects.toThrow();
    });

    it('audio intent sin durationMs sigue siendo válido (duración opcional incluso para audio)', async () => {
        const result = await createUploadIntentSchema.parseAsync({ body: audioBody });

        expect(result.body.durationMs).toBeUndefined();
    });
});
