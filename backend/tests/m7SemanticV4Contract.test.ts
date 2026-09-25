import { describe, expect, it } from 'vitest';
import {
    parseSemanticV4ModelOutput,
    SEMANTIC_V4_PROVIDER_SCHEMA,
    SEMANTIC_V4_PROVIDER_SCHEMA_HASH,
} from '../src/services/canonicalSemanticProducer.service';

function walk(value: unknown, visit: (node: Record<string, any>) => void): void {
    if (Array.isArray(value)) { value.forEach((item) => walk(item, visit)); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, any>;
    visit(record);
    Object.values(record).forEach((child) => walk(child, visit));
}

const base = {
    kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
    lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
    pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'no', candidateSlotType: null,
    independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: [],
    ambiguityFields: [], confidence: 0.8, temporalFact: null,
    readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null },
};

describe('Semantic V4 provider contract', () => {
    it('is strict structured-output JSON Schema with no oneOf', () => {
        expect(SEMANTIC_V4_PROVIDER_SCHEMA.type).toBe('object');
        expect(SEMANTIC_V4_PROVIDER_SCHEMA.additionalProperties).toBe(false);
        expect(SEMANTIC_V4_PROVIDER_SCHEMA_HASH).toMatch(/^[a-f0-9]{64}$/);
        walk(SEMANTIC_V4_PROVIDER_SCHEMA, (node) => {
            expect(node).not.toHaveProperty('oneOf');
            if (node.type === 'object' && node.properties) {
                expect(node.additionalProperties).toBe(false);
                expect(node.required).toEqual(Object.keys(node.properties));
            }
        });
    });

    it('keeps temporal discriminators distinct and parses every variant through runtime Zod', () => {
        const temporal = SEMANTIC_V4_PROVIDER_SCHEMA.properties.temporalFact;
        const kinds: string[] = [];
        walk(temporal, (node) => {
            if (node.properties?.kind?.const) kinds.push(node.properties.kind.const);
        });
        expect(kinds).toEqual(expect.arrayContaining([
            'absolute_date', 'absolute_datetime', 'relative_date',
            'relative_target_offset', 'relative_duration', 'weekday', 'time_only',
        ]));
        expect(new Set(kinds).size).toBe(7);
        const variants = [
            { kind: 'absolute_date', precision: 'date', year: 2026, month: 9, day: 24 },
            { kind: 'absolute_datetime', precision: 'minute', year: 2026, month: 9, day: 24, hour: 11, minute: 0, second: null, meridiem: '24h' },
            { kind: 'relative_date', precision: 'date', amount: 2, unit: 'days' },
            { kind: 'relative_target_offset', precision: 'elapsed', amount: 3, unit: 'hours' },
            { kind: 'relative_duration', precision: 'duration', amount: 45, unit: 'minutes' },
            { kind: 'weekday', precision: 'date', weekday: 5, relation: 'next' },
            { kind: 'time_only', precision: 'minute', hour: 11, minute: 0, second: null, meridiem: '24h', ambiguity: 'none' },
        ];
        for (const temporalFact of variants) {
            const result = parseSemanticV4ModelOutput({ ...base, temporalFact });
            expect(result.diagnostics.schemaValid, temporalFact.kind).toBe(true);
            expect(result.semantic.temporalFact?.kind).toBe(temporalFact.kind);
        }
    });
});
