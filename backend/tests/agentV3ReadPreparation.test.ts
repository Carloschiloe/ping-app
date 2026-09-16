import { describe, expect, it, vi } from 'vitest';
import { prepareV3Read } from '../src/services/agentV3ReadPreparation.service';
import type { NormalizedSemanticTurnV3 } from '../src/types/agentTurnCommit';

const semantic = { version: 3, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'commitment_query', entityHints: [], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic' } as NormalizedSemanticTurnV3;
const result = { query: null, scope: { actorUserId: 'actor', conversationId: null, personId: 'person', contactId: null }, people: [], commitments: [], events: [], messages: [], transcriptions: [], attachments: [], provenance: [] } as any;
const person = { resolved: { kind: 'user' as const, id: 'person', displayName: 'Canonical Person' }, ambiguous: false, candidates: [] };
const temporal = { status: 'not_applicable' as const };

function input(overrides: Partial<Parameters<typeof prepareV3Read>[0]> = {}) {
    return { actorUserId: 'actor', dialogueScopeKey: 'agent:mobile_text', semanticTurn: semantic, disposition: 'ordinary_read' as const, person, temporal, scope: { personId: 'person', types: ['commitment'] as const }, ...overrides };
}

describe('M-7 V3-native read preparation', () => {
    it('maps approved structured scope to authorized retrieval and preserves result provenance', async () => {
        const retrieve = vi.fn(async () => result);
        const prepared = await prepareV3Read(input(), retrieve);
        expect(prepared.status).toBe('prepared');
        expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'actor', personId: 'person', types: ['commitment'] }));
        expect((prepared as any).result).toBe(result);
    });
    it('canonical person identity dominates the retrieval request', async () => {
        const retrieve = vi.fn(async () => result);
        await prepareV3Read(input({ person, scope: { types: ['commitment'] } }), retrieve);
        expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ personId: 'person' }));
        expect(retrieve).not.toHaveBeenCalledWith(expect.objectContaining({ personId: 'wrong' }));
    });
    it('does not retrieve for ambiguous or zero-match person resolution', async () => {
        const retrieve = vi.fn(async () => result);
        expect((await prepareV3Read(input({ person: { resolved: null, ambiguous: true, candidates: [] } }), retrieve)).status).toBe('insufficient');
        const zero = await prepareV3Read(input({ person: { resolved: null, ambiguous: false, candidates: [] } }), retrieve);
        expect(zero).toMatchObject({ status: 'insufficient', reason: 'person_resolution', clarification: { condition: 'zero_match', options: [] } });
        expect(retrieve).not.toHaveBeenCalled();
    });
    it('does not guess through ambiguous, nonexistent, or insufficient temporal results', async () => {
        const retrieve = vi.fn(async () => result);
        for (const temporal of [{ status: 'ambiguous', reason: 'dst_fold', civil: {} }, { status: 'nonexistent_local_time', civil: {}, timezone: 'America/Santiago' }, { status: 'insufficient', reason: 'timezone_required' }] as any[]) {
            expect((await prepareV3Read(input({ temporal }), retrieve)).status).toBe('insufficient');
        }
        expect(retrieve).not.toHaveBeenCalled();
    });
    it('consumes date-only temporal results without inventing an instant', async () => {
        const retrieve = vi.fn(async () => result);
        expect((await prepareV3Read(input({ temporal: { status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 9, day: 20 } }, scope: { personId: 'person', types: ['commitment'], timeRange: { from: '2026-09-20T00:00:00.000Z', to: '2026-09-21T00:00:00.000Z' } } }), retrieve)).status).toBe('prepared');
        expect((await prepareV3Read(input({ temporal: { status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 9, day: 20 } } }), retrieve)).status).toBe('insufficient');
    });
    it('does not reinterpret semantic meaning or disposition', async () => {
        const retrieve = vi.fn(async () => result);
        expect((await prepareV3Read(input({ disposition: 'ordinary_write' }), retrieve)).status).toBe('not_applicable');
        expect((await prepareV3Read(input({ semanticTurn: { ...semantic, kind: 'unknown' } }), retrieve)).status).toBe('unsupported');
        expect(retrieve).not.toHaveBeenCalled();
    });
    it('returns typed insufficiency instead of broadening an absent scope', async () => {
        const retrieve = vi.fn(async () => result);
        expect((await prepareV3Read(input({ scope: {} }), retrieve)).status).toBe('insufficient');
        expect(retrieve).not.toHaveBeenCalled();
    });
});
