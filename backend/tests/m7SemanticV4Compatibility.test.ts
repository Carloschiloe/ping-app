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
        const params = buildSemanticChatCompletionParams('gpt-5.6-sol', request);
        expect(Object.prototype.hasOwnProperty.call(params, 'temperature')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(params, 'max_tokens')).toBe(false);
        expect(params.max_completion_tokens).toBe(450);
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
        expect(SEMANTIC_V4_PROVIDER_SCHEMA_HASH).toBe('46798b4549448ae061062ce0c1b7f0580cba26fe899de746efe49745f23fc643');
        expect(M7_FRONTIER_CASES).toHaveLength(30);
    });
});
