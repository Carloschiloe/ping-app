import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ inserted: [] as any[] }));

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: { from: () => ({ insert: async (row: unknown) => { mocks.inserted.push(row); return { error: null }; } }) },
}));

import { costFor, meteredFetch, priceFor, recordAiUsage, runAsUser, usageFromReply } from '../src/services/aiUsage.service';
import { agoraCost, alertLevelFor, daysInMonth, monthStart, projectMonth } from '../src/admin/costs.service';

describe('what each OpenAI use costs', () => {
    it('finds the price of dated model names', () => {
        expect(priceFor('gpt-4o-mini-2024-07-18')).toEqual(priceFor('gpt-4o-mini'));
        expect(priceFor('gpt-4o-2024-08-06')).toEqual(priceFor('gpt-4o'));
        expect(priceFor('gpt-4o-transcribe')).not.toEqual(priceFor('gpt-4o'));
        expect(priceFor('unknown-model')).toBeNull();
    });

    it('prices text, cached text, audio and minutes', () => {
        // 1M input at 0.20 + 1M cached at 0.02 + 1M output at 1.20
        expect(costFor('gpt-5.6-luna', { inputTokens: 2_000_000, cachedInputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.42, 6);
        expect(costFor('gpt-realtime-2.1', { audioInputTokens: 1_000_000, audioOutputTokens: 1_000_000 })).toBeCloseTo(96, 6);
        expect(costFor('whisper-1', { audioSeconds: 120 })).toBeCloseTo(0.012, 6);
        expect(costFor('unknown-model', { inputTokens: 1_000_000 })).toBe(0);
    });

    it('reads the usage of every kind of reply', () => {
        expect(usageFromReply({ usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } } }))
            .toEqual({ inputTokens: 10, cachedInputTokens: 4, outputTokens: 5 });
        expect(usageFromReply({ usage: { input_tokens: 30, output_tokens: 7, input_tokens_details: { cached_tokens: 3 } } }))
            .toEqual({ inputTokens: 30, cachedInputTokens: 3, audioInputTokens: 0, outputTokens: 7 });
        expect(usageFromReply({ usage: { input_tokens: 50, output_tokens: 9, input_token_details: { audio_tokens: 40, text_tokens: 10 } } }))
            .toEqual({ inputTokens: 10, cachedInputTokens: 0, audioInputTokens: 40, outputTokens: 9 });
        expect(usageFromReply({ text: 'hola', duration: 12.5 })).toEqual({ audioSeconds: 12.5 });
        expect(usageFromReply({ data: [] })).toBeNull();
    });

    it('passes the reply through untouched and notes whose request it was', async () => {
        const body = { model: 'gpt-4o-mini-2024-07-18', usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [] };
        const base = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
        const records: any[] = [];
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        mocks.inserted.length = 0;
        try {
            const fetcher = meteredFetch('resumen_chat', 'gpt-4o-mini', base as any);
            const res = await runAsUser('user-9', () => fetcher('https://api.openai.com/v1/chat/completions'));
            expect(await res.json()).toEqual(body);
            await vi.waitFor(() => expect(mocks.inserted.length).toBe(1));
            records.push(...mocks.inserted);
        } finally {
            process.env.NODE_ENV = original;
        }
        expect(records[0]).toMatchObject({ user_id: 'user-9', feature: 'resumen_chat', model: 'gpt-4o-mini-2024-07-18', input_tokens: 100, output_tokens: 20 });
        expect(records[0].cost_usd).toBeCloseTo((100 * 0.15 + 20 * 0.6) / 1_000_000, 9);
    });

    it('writes nothing while testing', () => {
        mocks.inserted.length = 0;
        recordAiUsage({ feature: 'asistente', model: 'gpt-5.6-luna', usage: { inputTokens: 1 } });
        expect(mocks.inserted).toHaveLength(0);
    });
});

describe('the month', () => {
    const now = new Date('2026-11-16T15:00:00Z');

    it('starts at midnight in Chile', () => {
        expect(monthStart(now).toISOString()).toBe('2026-11-01T03:00:00.000Z');
        expect(daysInMonth(now)).toBe(30);
    });

    it('projects the rest of the month from what was spent so far', () => {
        const projected = projectMonth(3, now);
        expect(projected).toBeGreaterThan(5.5);
        expect(projected).toBeLessThan(6);
    });

    it('warns once at 80 % and once at 100 % of the budget', () => {
        expect(alertLevelFor(null)).toBeNull();
        expect(alertLevelFor(0.5)).toBeNull();
        expect(alertLevelFor(0.85)).toBe(80);
        expect(alertLevelFor(1.2)).toBe(100);
    });
});

describe('call minutes', () => {
    it('uses the 10,000 free minutes first', () => {
        expect(agoraCost({ audio: 600_000, hd: 0, fullHd: 0, twoK: 0, fourK: 0 })).toEqual({ audioMinutes: 10_000, videoMinutes: 0, estimatedUsd: 0 });
        const over = agoraCost({ audio: 600_000, hd: 120_000, fullHd: 0, twoK: 0, fourK: 0 });
        expect(over.videoMinutes).toBe(2_000);
        expect(over.estimatedUsd).toBeCloseTo(2 * 3.99, 6);
    });
});
