import { describe, expect, it } from 'vitest';
import {
    buildSemanticChatCompletionParams,
    SEMANTIC_V4_PROVIDER_SCHEMA_HASH,
} from '../src/services/canonicalSemanticProducer.service';
import { M7_FRONTIER_CASES } from './fixtures/m7SemanticFrontierCases';

const request = {
    text: '¿Qué me queda por hacer esta semana?',
    modality: 'text' as const,
    locale: 'es-CL',
    timezone: 'America/Santiago',
    dialogue: null,
    semanticVersion: 4 as const,
};

function withoutModelAndCompatibilityParams(params: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...params };
    delete copy.temperature;
    delete copy.max_tokens;
    delete copy.max_completion_tokens;
    delete copy.model;
    return copy;
}

describe('Semantic V4 model compatibility policy', () => {
    it('A: keeps temperature for gpt-4o-mini', () => {
        const params = buildSemanticChatCompletionParams('gpt-4o-mini', request);
        expect(params.temperature).toBe(0.1);
        expect(params.max_tokens).toBe(450);
        expect(Object.prototype.hasOwnProperty.call(params, 'max_completion_tokens')).toBe(false);
    });

    it('B: omits temperature for gpt-5.6-sol reasoning defaults', () => {
        delete process.env.M7_BLIND_MAX_COMPLETION_TOKENS;
        const params = buildSemanticChatCompletionParams('gpt-5.6-sol', request);
        expect(Object.prototype.hasOwnProperty.call(params, 'temperature')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(params, 'max_tokens')).toBe(false);
        expect(params.max_completion_tokens).toBe(450);
    });

    it('B2: blind evaluation can raise only the GPT-5 completion budget', () => {
        process.env.M7_BLIND_MAX_COMPLETION_TOKENS = '1024';
        const sol = buildSemanticChatCompletionParams('gpt-5.6-sol', request);
        const mini = buildSemanticChatCompletionParams('gpt-4o-mini', request);
        expect(sol.max_completion_tokens).toBe(1024);
        expect(mini.max_tokens).toBe(450);
        expect(Object.prototype.hasOwnProperty.call(mini, 'max_completion_tokens')).toBe(false);
        delete process.env.M7_BLIND_MAX_COMPLETION_TOKENS;
    });

    it('C-G: model selection changes only the compatibility parameter', () => {
        const mini = buildSemanticChatCompletionParams('gpt-4o-mini', request);
        const sol = buildSemanticChatCompletionParams('gpt-5.6-sol', request);
        expect(withoutModelAndCompatibilityParams(mini)).toEqual(withoutModelAndCompatibilityParams(sol));
        expect(mini.messages).toEqual(sol.messages);
        expect(mini.response_format).toEqual(sol.response_format);
        expect((sol.response_format as any).type).toBe('json_schema');
        expect((sol.response_format as any).json_schema.strict).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(mini, 'tools')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(sol, 'tools')).toBe(false);
        expect(SEMANTIC_V4_PROVIDER_SCHEMA_HASH).toBe('eb4b1943a694e7ede930b3739f03cd671c1ae4a7000fd31999577077a1fccaed');
        expect(M7_FRONTIER_CASES).toHaveLength(30);
    });
});
