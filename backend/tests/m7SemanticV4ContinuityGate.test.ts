import { describe, expect, it } from 'vitest';
import { CanonicalSemanticProducer } from '../src/services/canonicalSemanticProducer.service';
import { AgentDialogueStateService, createInMemoryDialogueStateRepository } from '../src/services/agentDialogueState.service';
import type { AgentObjective } from '../src/types/agentPlan';
import { M7_SEMANTIC_V4_CONTINUITY_CASES } from './fixtures/m7SemanticV4ContinuityGateCases';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-25T15:00:00.000Z');

function objective(title: string, objectiveType: AgentObjective['objectiveType'] = 'create_personal_commitment'): AgentObjective {
    return {
        objectiveType,
        targetEntities: { personHints: [], entityHints: [title] },
        constraints: { decisionHint: null, draftOnly: false, responsibleHint: null },
        desiredOutcome: title,
        timeConstraints: { rawHint: null },
        actor: ACTOR,
        sourceUtterance: title,
        confidence: 0.95,
        ambiguities: [],
        source: 'llm',
    };
}

describe('M-7 Semantic V4 continuity gate battery', () => {
    it('contains a frozen, independent set of ten continuity scenarios', () => {
        expect(M7_SEMANTIC_V4_CONTINUITY_CASES).toHaveLength(10);
        expect(M7_SEMANTIC_V4_CONTINUITY_CASES.filter((c) => c.turns.length === 1)).toHaveLength(4);
        expect(M7_SEMANTIC_V4_CONTINUITY_CASES.filter((c) => c.turns.length === 2)).toHaveLength(6);
        const utterances = M7_SEMANTIC_V4_CONTINUITY_CASES.flatMap((c) => c.turns.map((t) => t.utterance));
        expect(new Set(utterances).size).toBe(utterances.length);
        expect(utterances.every((utterance) => utterance.trim().length >= 10)).toBe(true);
    });

    it('normalizes every V4 semantic turn before Core state resolution, without a provider call', async () => {
        const producer = new CanonicalSemanticProducer({
            modelName: 'continuity-offline-fixture',
            interpret: async () => { throw new Error('provider must not be called'); },
        });
        for (const scenario of M7_SEMANTIC_V4_CONTINUITY_CASES) {
            for (const turn of scenario.turns) {
                const result = await producer.produceV4WithDiagnostics({
                    text: turn.utterance, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago',
                    authoritativeSemanticV4: turn.semantic,
                });
                expect(result.semantic.version).toBe(4);
                expect(result.diagnostics.schemaValid).toBe(true);
                expect(result.diagnostics.normalizationSuccess).toBe(true);
                expect(result.diagnostics.providerRequestSucceeded).toBe(false);
            }
        }
    });

    it('preserves the Core continuity contracts for unique referents, plans, corrections and topic changes', () => {
        const service = new AgentDialogueStateService({ repository: createInMemoryDialogueStateRepository(), now: () => NOW });
        const scope = 'continuity-gate-conversation';
        service.setReadContext({
            actorUserId: ACTOR, dialogueScopeKey: scope, turnId: 'read-1', turnSequence: 1,
            context: { kind: 'commitment_query', timeRange: null, sourceTurnId: 'read-1', commitmentReferents: [{ rawText: 'revisión del generador', entityType: 'commitment', canonicalId: '00000000-0000-4000-8000-000000000017' }], statuses: ['pending'] },
        });
        expect(service.getSnapshot(ACTOR, scope)?.lastReadContext?.commitmentReferents).toHaveLength(1);

        service.openObjective({ actorUserId: ACTOR, dialogueScopeKey: scope, objective: objective('revisar el estanque'), turnId: 'write-1', turnSequence: 2 });
        service.markReadyForAuthorization({ actorUserId: ACTOR, dialogueScopeKey: scope, planDigest: 'digest-continuity-gate', turnId: 'write-1', turnSequence: 3 });
        expect(service.getSnapshot(ACTOR, scope)?.lifecycle).toBe('plan_pending_authorization');

        service.applyCorrection({ actorUserId: ACTOR, dialogueScopeKey: scope, slotName: 'date', previousValue: null, newValue: 'martes', reason: 'user_correction', turnId: 'write-2', turnSequence: 4 });
        expect(service.getSnapshot(ACTOR, scope)).toMatchObject({ lifecycle: 'collecting', currentPlanDigestRef: null });

        service.reset({ actorUserId: ACTOR, dialogueScopeKey: scope });
        expect(service.getSnapshot(ACTOR, scope)?.lastReadContext).toBeNull();
    });

    it('isolates independent scopes while retaining two-turn context in one scope', () => {
        const service = new AgentDialogueStateService({ repository: createInMemoryDialogueStateRepository(), now: () => NOW });
        service.setReadContext({ actorUserId: ACTOR, dialogueScopeKey: 'scope-a', turnId: 'a-1', turnSequence: 1, context: { kind: 'commitment_query', timeRange: null, sourceTurnId: 'a-1', commitmentReferents: [{ rawText: 'generador', entityType: 'commitment', canonicalId: '00000000-0000-4000-8000-000000000017' }], statuses: ['pending'] } });
        service.setReadContext({ actorUserId: ACTOR, dialogueScopeKey: 'scope-b', turnId: 'b-1', turnSequence: 1, context: { kind: 'commitment_query', timeRange: null, sourceTurnId: 'b-1', commitmentReferents: [{ rawText: 'estanque', entityType: 'commitment', canonicalId: '00000000-0000-4000-8000-000000000028' }], statuses: ['pending'] } });
        expect(service.getSnapshot(ACTOR, 'scope-a')?.lastReadContext?.commitmentReferents?.[0]?.canonicalId).toBe('00000000-0000-4000-8000-000000000017');
        expect(service.getSnapshot(ACTOR, 'scope-b')?.lastReadContext?.commitmentReferents?.[0]?.canonicalId).toBe('00000000-0000-4000-8000-000000000028');
    });
});
