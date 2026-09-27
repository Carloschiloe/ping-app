import { describe, expect, it } from 'vitest';
import {
    buildSemanticV4Prompt,
    isSemanticV4ProviderPayloadValid,
    parseSemanticV4ModelOutput,
} from '../src/services/canonicalSemanticProducer.service';
import { normalizeSemanticTurnV4 } from '../src/services/agentTurnSemanticV4.service';
import { adaptSemanticV4ToCore } from '../src/services/agentSemanticV4CoreShadow.service';
import { AgentTurnDispositionService } from '../src/services/agentTurnDisposition.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';

const readMeaning = {
    queryShape: 'focused' as const,
    explicitCollection: false,
    targetShape: 'commitment' as const,
    relationship: { kind: 'general_recall' as const },
    temporalRole: 'none' as const,
    commitmentStatus: null,
};

const common = {
    domain: 'commitment' as const,
    objectiveCompleteness: 'incomplete' as const,
    lifecycleCommand: 'none' as const,
    lifecycleTarget: 'unspecified' as const,
    lifecycleEvidence: 'unknown' as const,
    pendingSlotAnswer: 'not_a_slot_answer' as const,
    continuationLike: 'no' as const,
    candidateSlotType: null,
    independentObjective: 'yes' as const,
    objectiveType: 'create_personal_commitment',
    entityHints: ['nuevo objetivo'],
    slots: [{ key: 'title', value: 'nuevo objetivo' }],
    ambiguityFields: [] as string[],
    confidence: 0.95,
    temporalFact: null,
    openObjectiveRelation: 'replaces' as const,
};

function provider(kind: 'read_request' | 'write_request' | 'slot_answer' | 'lifecycle_command' | 'unknown', relation: NormalizedSemanticTurnV4['openObjectiveRelation']) {
    return {
        turn: {
            ...common,
            kind,
            openObjectiveRelation: relation,
            readMeaning: kind === 'read_request' ? readMeaning : null,
            objectiveType: kind === 'slot_answer' ? null : common.objectiveType,
            entityHints: kind === 'slot_answer' ? ['nuevo valor'] : common.entityHints,
            slots: kind === 'slot_answer' ? [{ key: 'title', value: 'nuevo valor' }] : common.slots,
            objectiveCompleteness: kind === 'slot_answer' ? 'unknown' : common.objectiveCompleteness,
            pendingSlotAnswer: kind === 'slot_answer' ? 'likely' : common.pendingSlotAnswer,
            continuationLike: kind === 'slot_answer' ? 'yes' : common.continuationLike,
            independentObjective: kind === 'slot_answer' ? 'no' : common.independentObjective,
            candidateSlotType: kind === 'slot_answer' ? 'title' : null,
        },
    };
}

function v4(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return normalizeSemanticTurnV4({
        version: 4,
        kind: 'write_request',
        domain: 'commitment',
        objectiveCompleteness: 'incomplete',
        lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'no', candidateSlotType: null,
        independentObjective: 'yes', objectiveType: 'create_personal_commitment',
        entityHints: ['nuevo objetivo'], slots: { title: 'nuevo objetivo' }, ambiguityFields: [], confidence: .9,
        source: 'llm', readMeaning: null, openObjectiveRelation: 'replaces', ...overrides,
    });
}

describe('Semantic V4 open-objective relation contract', () => {
    it('enforces the semantic kind/relation compatibility matrix at the provider boundary', () => {
        const matrix: Record<string, string[]> = {
            read_request: ['continues', 'independent', 'ambiguous', 'unrelated'],
            write_request: ['continues', 'corrects', 'replaces', 'independent', 'ambiguous'],
            slot_answer: ['answers_pending_slot', 'continues', 'corrects', 'ambiguous'],
            lifecycle_command: ['continues', 'corrects', 'ambiguous', 'unrelated'],
            unknown: ['ambiguous', 'unrelated'],
        };
        const relations = ['answers_pending_slot', 'continues', 'corrects', 'replaces', 'independent', 'ambiguous', 'unrelated'] as const;
        for (const [kind, allowed] of Object.entries(matrix)) {
            for (const relation of relations) {
                const valid = isSemanticV4ProviderPayloadValid(provider(kind as Parameters<typeof provider>[0], relation));
                expect(valid, `${kind}+${relation}`).toBe(allowed.includes(relation));
            }
        }
    });

    it('represents slot answer, replacement, correction and ambiguity without phrase rules', () => {
        for (const [kind, relation] of [
            ['slot_answer', 'answers_pending_slot'],
            ['write_request', 'replaces'],
        ] as const) {
            const payload = provider(kind, relation);
            expect(isSemanticV4ProviderPayloadValid(payload)).toBe(true);
            const parsed = parseSemanticV4ModelOutput(payload);
            expect(parsed.diagnostics).toEqual({ schemaValid: true, failure: null });
            expect(parsed.semantic.openObjectiveRelation).toBe(relation);
        }
        expect(v4({ openObjectiveRelation: 'corrects' }).openObjectiveRelation).toBe('corrects');
        expect(v4({ openObjectiveRelation: 'ambiguous', independentObjective: 'unknown', continuationLike: 'unknown' }).openObjectiveRelation).toBe('ambiguous');
    });

    it('rejects contradictory relation/kind pairs at the normalized boundary', () => {
        expect(() => v4({ kind: 'slot_answer', openObjectiveRelation: 'replaces' })).toThrow(/Contradictory/);
        expect(() => v4({ kind: 'read_request', readMeaning, openObjectiveRelation: 'answers_pending_slot' })).toThrow(/Contradictory/);
        expect(() => v4({ openObjectiveRelation: 'not-a-relation' as any })).toThrow(/Unsupported/);
    });

    it('reports a provider-invalid contradiction without throwing from the parser', () => {
        const parsed = parseSemanticV4ModelOutput(provider('read_request', 'replaces'));
        expect(parsed.diagnostics).toEqual({ schemaValid: false, failure: 'normalization_error' });
        expect(parsed.semantic.source).toBe('fallback');
    });

    it('does not let a pending slot force a replacement into slot_answer', () => {
        const prompt = buildSemanticV4Prompt({
            text: 'Reemplaza el objetivo abierto por uno nuevo.', modality: 'text', locale: 'es-CL', timezone: 'America/Santiago',
            dialogue: { lifecycle: 'clarifying', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [] },
            semanticVersion: 4,
        });
        expect(prompt).toContain('pending slot is context, not authority');
        expect(prompt).toContain('openObjectiveRelation');
    });

    it('routes a model-declared replacement through Core disposition and clears stale scope', () => {
        const adapted = adaptSemanticV4ToCore(v4({ openObjectiveRelation: 'replaces' }));
        const result = new AgentTurnDispositionService().decide({
            semanticTurn: adapted.dispositionSemantic,
            dialogue: {
                lifecycle: 'clarifying',
                activeDialogue: { objectiveType: 'create_personal_commitment', slots: { time: 'esta semana' } },
                suspendedDialogue: null,
                version: 2,
                lastAppliedTurnId: 'turn-1',
                lastAppliedTurnSequence: 1,
            },
        });
        expect(result.disposition).toBe('new_objective');
        expect(result.reason).toBe('explicit_objective_replacement');
        expect(result.transition.kind).toBe('replace_active');
        expect(result.transition.suspendedDialogue).toBeNull();
        expect(result.transition.activeDialogue).toEqual(expect.objectContaining({ objective: expect.objectContaining({ objectiveType: 'create_personal_commitment' }) }));
    });

    it('keeps historical V4 checkpoints normalizable with a conservative relation', () => {
        expect(v4({ openObjectiveRelation: undefined, independentObjective: 'unknown', continuationLike: 'unknown' }).openObjectiveRelation).toBe('ambiguous');
    });
});
