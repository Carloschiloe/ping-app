import { describe, expect, it } from 'vitest';
import {
    AGENT_INTENT_VALUES,
    agentInterpretationPayloadJsonSchema,
    agentInterpretationPayloadSchema,
} from '../src/schemas/agentInterpretation.schema';

type SchemaNode = Record<string, any>;

const TEMPORAL_KINDS = new Set([
    'calendar_day',
    'calendar_week',
    'relative_days',
    'upcoming_horizon',
]);

function walkSchema(node: unknown, visit: (node: SchemaNode) => void): void {
    if (Array.isArray(node)) {
        node.forEach((child) => walkSchema(child, visit));
        return;
    }
    if (!node || typeof node !== 'object') return;
    visit(node as SchemaNode);
    Object.values(node as SchemaNode).forEach((child) => walkSchema(child, visit));
}

function basePayload(): Record<string, unknown> {
    return {
        intent: 'commitment_query',
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        temporalIntent: null,
        priorReferenceIntent: null,
        followUpAttribute: null,
        temporalComparison: null,
        urgencyComparison: null,
        requestedSources: [],
        commitmentFilterHints: { status: null, statusBasis: null },
        attachmentKindHints: [],
        ambiguityHints: [],
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest: false,
    };
}

describe('M-7 OpenAI Structured Outputs contract', () => {
    it('has a strict object root and no unsupported union/default metadata', () => {
        const schema = agentInterpretationPayloadJsonSchema as SchemaNode;
        expect(schema.type).toBe('object');
        const unsupported: string[] = [];
        walkSchema(schema, (node) => {
            for (const key of ['oneOf', '$schema', 'default']) {
                if (Object.prototype.hasOwnProperty.call(node, key)) unsupported.push(key);
            }
        });
        expect(unsupported).toEqual([]);
    });

    it('requires every property and closes every provider object', () => {
        const schema = agentInterpretationPayloadJsonSchema as SchemaNode;
        const violations: string[] = [];
        walkSchema(schema, (node) => {
            if (node.type !== 'object') return;
            const properties = node.properties as SchemaNode | undefined;
            if (!properties) violations.push('object without properties');
            if (node.additionalProperties !== false) violations.push('object not closed');
            if (JSON.stringify(node.required) !== JSON.stringify(Object.keys(properties ?? {}))) {
                violations.push('object required does not cover all properties');
            }
        });
        expect(violations).toEqual([]);
    });

    it('preserves all temporal variants with unique kind discriminators', () => {
        const schema = agentInterpretationPayloadJsonSchema as SchemaNode;
        const temporal = schema.properties.temporalIntent as SchemaNode;
        const discriminated = temporal.anyOf.find((branch: SchemaNode) => Array.isArray(branch.anyOf));
        expect(discriminated).toBeDefined();
        const branches = discriminated.anyOf as SchemaNode[];
        const kinds = branches.map((branch) => branch.properties.kind.enum);
        expect(new Set(kinds.map((values) => values[0]))).toEqual(TEMPORAL_KINDS);
        expect(kinds.every((values) => Array.isArray(values) && values.length === 1)).toBe(true);
        expect(branches.every((branch) => branch.additionalProperties === false)).toBe(true);
    });

    it('accepts every temporal variant through the original Zod runtime schema', () => {
        const variants = [
            { kind: 'calendar_day', offsetDays: 0, futureOnly: false },
            { kind: 'calendar_week', offsetWeeks: 1, futureOnly: true },
            { kind: 'relative_days', daysAhead: 3, futureOnly: true },
            { kind: 'upcoming_horizon', daysAhead: null, futureOnly: true },
        ];
        for (const temporalIntent of variants) {
            const parsed = agentInterpretationPayloadSchema.safeParse({ ...basePayload(), temporalIntent });
            expect(parsed.success, JSON.stringify(temporalIntent)).toBe(true);
        }
    });

    it('keeps the runtime intent enum bounded to the product contract', () => {
        const schema = agentInterpretationPayloadJsonSchema as SchemaNode;
        expect(schema.properties.intent.enum).toEqual([...AGENT_INTENT_VALUES]);
    });
});
