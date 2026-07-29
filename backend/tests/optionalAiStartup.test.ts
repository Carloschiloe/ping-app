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
});
