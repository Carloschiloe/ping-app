import { afterEach, describe, expect, it, vi } from 'vitest';

describe('optional AI startup', () => {
    const originalApiKey = process.env.OPENAI_API_KEY;

    afterEach(() => {
        if (originalApiKey === undefined) {
            delete process.env.OPENAI_API_KEY;
        } else {
            process.env.OPENAI_API_KEY = originalApiKey;
        }
        vi.resetModules();
    });

    it('imports optional AI services without requiring a key', async () => {
        delete process.env.OPENAI_API_KEY;
        vi.resetModules();

        await expect(Promise.all([
            import('../src/services/transcription.service'),
            import('../src/services/synthesis.service'),
            import('../src/services/call-processing.service'),
        ])).resolves.toHaveLength(3);
    });

    it('rechaza una consulta con 503 si la IA no está configurada, sin fingir una respuesta normal', async () => {
        delete process.env.OPENAI_API_KEY;
        vi.resetModules();

        const { askPing } = await import('../src/services/synthesis.service');
        await expect(askPing('Hola', new Date().toISOString(), { commitments: [] }))
            .rejects.toMatchObject({
                statusCode: 503,
                message: 'Ping AI is not configured',
            });
    });
});
