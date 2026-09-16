import { describe, expect, it, vi } from 'vitest';
import { AgentReadTargetResolutionService } from '../src/services/agentReadTargetResolution.service';
import type { NormalizedSemanticTurnV4, SemanticReadTargetShapeV4 } from '../src/types/agentTurnCommit';

const base = {
    version: 4,
    kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: [], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic',
    readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'current_state' }, temporalRole: 'none' },
} as const;

function semantic(targetShape: SemanticReadTargetShapeV4): NormalizedSemanticTurnV4 {
    return { ...base, readMeaning: { ...base.readMeaning, targetShape } } as NormalizedSemanticTurnV4;
}

const commitment = { id: 'c1', entityType: 'commitment' } as any;
const proposal = { id: 'p1', entityType: 'commitment_proposal' } as any;
const person = { resolved: { kind: 'user' as const, id: 'u1', displayName: 'Canonical User' }, ambiguous: false, candidates: [] };

describe('AgentReadTargetResolutionService', () => {
    it('uses only the already-resolved canonical commitment', async () => {
        const result = await new AgentReadTargetResolutionService().resolve({ actorUserId: 'actor', semanticTurn: semantic('commitment'), person: null, targetEntity: commitment, authorizedScope: {} });
        expect(result).toEqual({ status: 'resolved', target: { kind: 'commitment', id: 'c1' } });
    });

    it('preserves proposal identity only when Core supplied a proposal', async () => {
        const result = await new AgentReadTargetResolutionService().resolve({ actorUserId: 'actor', semanticTurn: semantic('proposal'), person: null, targetEntity: proposal, authorizedScope: {} });
        expect(result).toEqual({ status: 'resolved', target: { kind: 'proposal', id: 'p1' } });
        await expect(new AgentReadTargetResolutionService().resolve({ actorUserId: 'actor', semanticTurn: semantic('proposal'), person: null, targetEntity: commitment, authorizedScope: {} })).resolves.toMatchObject({ status: 'invalid' });
    });

    it('preserves person resolution states without exposing person records', async () => {
        const service = new AgentReadTargetResolutionService();
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('person'), person, authorizedScope: {} })).resolves.toEqual({ status: 'resolved', target: { kind: 'person', id: 'u1', personKind: 'user' } });
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('person'), person: { resolved: null, ambiguous: false, candidates: [] }, authorizedScope: {} })).resolves.toEqual({ status: 'zero_match', targetShape: 'person' });
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('person'), person: { resolved: null, ambiguous: true, candidates: [{ kind: 'user', id: 'u1', displayName: 'One', email: 'secret@example.com' }] }, authorizedScope: {} })).resolves.toEqual({ status: 'ambiguous', targetShape: 'person', candidates: [{ id: 'u1', label: 'One' }] });
    });

    it('validates an authorized conversation already present in scope', async () => {
        const validate = vi.fn().mockResolvedValue(true);
        const result = await new AgentReadTargetResolutionService({ validate }).resolve({ actorUserId: 'actor', semanticTurn: semantic('conversation'), person: null, authorizedScope: { conversationId: 'conv1' } });
        expect(validate).toHaveBeenCalledWith('actor', 'conv1');
        expect(result).toEqual({ status: 'resolved', target: { kind: 'conversation', id: 'conv1', lineage: { conversationId: 'conv1' } } });
    });

    it('does not discover arbitrary conversations or resolve unsupported child targets', async () => {
        const validate = vi.fn();
        const service = new AgentReadTargetResolutionService({ validate });
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('conversation'), person: null, authorizedScope: {} })).resolves.toMatchObject({ status: 'unsupported' });
        for (const targetShape of ['message', 'attachment', 'transcription', 'topic'] as SemanticReadTargetShapeV4[]) {
            await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic(targetShape), person: null, authorizedScope: {} })).resolves.toMatchObject({ status: 'unsupported' });
        }
        expect(validate).not.toHaveBeenCalled();
    });

    it('does not turn absent or mismatched canonical facts into guessed identities', async () => {
        const service = new AgentReadTargetResolutionService();
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('commitment'), person: null, authorizedScope: {} })).resolves.toMatchObject({ status: 'invalid' });
        await expect(service.resolve({ actorUserId: 'actor', semanticTurn: semantic('none'), person: null, targetEntity: commitment, authorizedScope: {} })).resolves.toEqual({ status: 'not_applicable' });
    });
});
