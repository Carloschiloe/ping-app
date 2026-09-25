import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { DispositionDialogueSnapshot } from '../src/types/agentTurnDisposition';
import type { RetrievalCommitment, RetrievalMessage } from '../src/types/retrieval';
import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    createHighFidelityReadOnlyRepositoryForTest,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { adaptSemanticV4ToCore } from '../src/services/agentSemanticV4CoreShadow.service';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const PERSON = '00000000-0000-4000-8000-000000000010';
const PERSON_2 = '00000000-0000-4000-8000-000000000011';
const COMMITMENT = '00000000-0000-4000-8000-000000000020';
const PROPOSAL = '00000000-0000-4000-8000-000000000021';
const MESSAGE = '00000000-0000-4000-8000-000000000030';

function commitment(id: string, title: string, entityType: 'commitment' | 'commitment_proposal', authorizedActorUserIds: string[]): RetrievalCommitment & { authorizedActorUserIds: string[] } {
    return {
        id, entityType, title, authorizedActorUserIds, description: null, status: entityType === 'commitment' ? 'accepted' : 'proposed',
        type: 'personal', priority: null, dueAt: '2026-09-26T15:00:00.000Z', proposedDueAt: null,
        expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId: ACTOR, assignedToUserId: null, counterpartyContactId: null, conversationId: null, messageId: null,
        createdAt: '2026-09-25T12:00:00.000Z', provenance: { sourceType: entityType, sourceId: id },
    };
}

function message(id: string, content: string, authorizedActorUserIds: string[]): RetrievalMessage & { authorizedActorUserIds: string[] } {
    return { id, content, authorizedActorUserIds, conversationId: '00000000-0000-4000-8000-000000000040', senderId: PERSON, isSystem: false, createdAt: '2026-09-25T12:00:00.000Z', provenance: { sourceType: 'message', sourceId: id } };
}

const rows = {
    people: [
        { actorUserId: ACTOR, person: { kind: 'user' as const, id: PERSON, displayName: 'Alejandra' } },
        { actorUserId: ACTOR, person: { kind: 'user' as const, id: PERSON_2, displayName: 'Alejandra' } },
    ],
    commitments: [commitment(COMMITMENT, 'revisar el informe', 'commitment', [ACTOR]), commitment(PROPOSAL, 'coordinar visita', 'commitment_proposal', [ACTOR]), commitment('00000000-0000-4000-8000-000000000022', 'privado', 'commitment', [OTHER])],
    messages: [message(MESSAGE, 'La reunión queda para el viernes', [ACTOR])],
};

function turn(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return {
        version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
        lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer',
        continuationLike: 'no', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {},
        ambiguityFields: [], confidence: 0.9, source: 'llm', temporalFact: undefined,
        readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: null },
        ...overrides,
    };
}

const dialogue: DispositionDialogueSnapshot = { lifecycle: 'collecting', activeDialogue: { objectiveType: 'create_personal_commitment' }, suspendedDialogue: null, version: 2, lastAppliedTurnId: 'turn-2', lastAppliedTurnSequence: 2 };

async function resolve(resolver: AgentSemanticV4HighFidelityReadOnlyResolver, semantic: NormalizedSemanticTurnV4, extra: Record<string, unknown> = {}) {
    const adapted = adaptSemanticV4ToCore(semantic);
    return resolver.resolve({ actorUserId: ACTOR, dialogueScopeKey: 'agent:test', semanticV4: semantic, semanticV2: adapted.semanticV2, dialogue: null, authorizedScope: { timeRange: { from: '2026-09-25T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' } }, ...extra });
}

describe('M-7 high-fidelity V4 read-only Core shadow', () => {
    it('A/C: resolves one person canonically and preserves zero/nonexistent safely', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest({ ...rows, people: [{ actorUserId: ACTOR, person: { kind: 'user', id: PERSON, displayName: 'Tomás' } }] }));
        expect((await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, targetShape: 'person', relationship: { kind: 'person_relationship' } }, entityHints: ['Tomás'], candidateSlotType: 'person' }))).summary).toMatchObject({ status: 'resolved', referenceKind: 'person', candidateCount: 1 });
        expect((await resolve(resolver, turn({ entityHints: ['no existe'] }))).summary.status).toBe('zero_match');
    });

    it('B/N: ambiguity remains explicit and never selects a person', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        const result = await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, targetShape: 'person', relationship: { kind: 'person_relationship' } }, entityHints: ['Alejandra'], candidateSlotType: 'person' }));
        expect(result.summary).toMatchObject({ status: 'ambiguous', referenceKind: 'person', candidateCount: 2 });
        expect((result as any).details).toBeUndefined();
    });

    it('D/E/F: commitment authorization is repository-owned, not V4-owned', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        expect((await resolve(resolver, turn({ entityHints: ['revisar el informe'] }))).details).toEqual({ canonicalId: COMMITMENT, targetKind: 'commitment' });
        expect((await resolve(resolver, turn({ entityHints: ['privado'] }))).summary.status).toBe('zero_match');
        expect((await resolve(resolver, turn({ entityHints: ['ausente'] }))).summary.status).toBe('zero_match');
    });

    it('G/H: proposals and incompatible lifecycle targets remain distinct', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        const proposal = await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, targetShape: 'proposal', relationship: { kind: 'proposal_focus', focus: 'needs_my_response' } }, entityHints: ['coordinar visita'] }));
        expect(proposal.summary).toMatchObject({ status: 'resolved', referenceKind: 'proposal' });
        const incompatible = await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, targetShape: 'proposal', relationship: { kind: 'lifecycle_transition', transition: 'cancelled' } }, entityHints: ['revisar el informe'] }));
        expect(incompatible.summary.status).toBe('zero_match');
    });

    it('I/J/K/L: open objective and pending slot are structural and do not mutate dialogue', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        const before = JSON.stringify(dialogue);
        const adapted = adaptSemanticV4ToCore(turn({ kind: 'slot_answer', objectiveCompleteness: 'unknown', continuationLike: 'yes', independentObjective: 'no', pendingSlotAnswer: 'likely', candidateSlotType: 'date', slots: { date: '2026-09-29' }, readMeaning: null }));
        const result = await resolver.resolve({ actorUserId: ACTOR, dialogueScopeKey: 'agent:test', semanticV4: adapted.semanticV4, semanticV2: adapted.semanticV2, dialogue, timezone: 'America/Santiago' });
        expect(result.pendingSlotResolution?.status).toBe('resolved');
        expect(JSON.stringify(dialogue)).toBe(before);
        const topicChange = await resolve(resolver, turn({ kind: 'write_request', domain: 'messaging', objectiveType: 'send_message', entityHints: ['nuevo tema'], readMeaning: null }), { dialogue });
        expect(topicChange.pendingSlotResolution).toBeUndefined();
    });

    it('M/O: prior structured referent is reauthorized by canonical id, never copied from V4', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        const result = await resolve(resolver, turn({ entityHints: [] }), { priorReferent: { kind: 'commitment', id: COMMITMENT } });
        expect(result.details).toEqual({ canonicalId: COMMITMENT, targetKind: 'commitment' });
        const forged = await resolve(resolver, turn({ entityHints: ['title with fake id ' + OTHER] }), { priorReferent: { kind: 'commitment', id: OTHER } });
        expect(forged.summary.status).toBe('zero_match');
        expect(JSON.stringify(forged)).not.toContain(OTHER);
    });

    it('message referents and result sets keep their own cardinality', async () => {
        const resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(createHighFidelityReadOnlyRepositoryForTest(rows));
        const single = await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, targetShape: 'message', relationship: { kind: 'message_relationship', relationship: 'content' } }, entityHints: ['reunión'] }));
        expect(single.summary).toMatchObject({ status: 'resolved', referenceKind: 'message', candidateCount: 1 });
        const set = await resolve(resolver, turn({ readMeaning: { ...turn().readMeaning!, queryShape: 'collection', explicitCollection: true, targetShape: 'none' } }));
        expect(set.summary.status).toBe('result_set');
    });

    it('P/Q/R/S/T: failures and side-effect boundaries are explicit', async () => {
        const failing = new AgentSemanticV4HighFidelityReadOnlyResolver({
            authorizeConversation: vi.fn(),
            resolvePerson: vi.fn().mockRejectedValue(new Error('read failure')),
            authorizePerson: vi.fn(),
            findCommitments: vi.fn().mockRejectedValue(new Error('read failure')),
            authorizeCommitment: vi.fn(), findMessages: vi.fn(), authorizeMessage: vi.fn(),
        });
        await expect(resolve(failing, turn({ entityHints: ['revisar el informe'] }))).rejects.toThrow('read failure');
        const forbidden = { ...createHighFidelityReadOnlyRepositoryForTest(rows), insert: vi.fn(() => { throw new Error('write forbidden'); }), update: vi.fn(), delete: vi.fn(), executeTool: vi.fn() } as any;
        const result = await resolve(new AgentSemanticV4HighFidelityReadOnlyResolver(forbidden), turn({ entityHints: ['revisar el informe'] }));
        expect(result.summary.status).toBe('resolved');
        expect(forbidden.insert).not.toHaveBeenCalled();
        expect(forbidden.update).not.toHaveBeenCalled();
        expect(forbidden.delete).not.toHaveBeenCalled();
        expect(forbidden.executeTool).not.toHaveBeenCalled();
    });
});
