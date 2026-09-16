import { describe, expect, it } from 'vitest';
import { AgentReadQueryPlanner } from '../src/services/agentReadQueryPlanner.service';
import type { NormalizedSemanticTurnV4, SemanticReadQueryShapeV4, SemanticReadTargetShapeV4 } from '../src/types/agentTurnCommit';

const planner = new AgentReadQueryPlanner();
const base = {
    version: 4, kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'not_a_slot_answer', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'yes', objectiveType: 'lookup', entityHints: ['not an id'], slots: {}, ambiguityFields: [], confidence: .9, source: 'deterministic',
    readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'current_state' }, temporalRole: 'none' },
} as const;

function turn(overrides: { queryShape?: SemanticReadQueryShapeV4; targetShape?: SemanticReadTargetShapeV4; relationship?: any; temporalRole?: any; domain?: any } = {}): NormalizedSemanticTurnV4 {
    return { ...base, domain: overrides.domain ?? base.domain, readMeaning: { ...base.readMeaning, ...overrides } } as NormalizedSemanticTurnV4;
}

const commitmentTarget = { status: 'resolved' as const, target: { kind: 'commitment' as const, id: 'c1' } };
const proposalTarget = { status: 'resolved' as const, target: { kind: 'proposal' as const, id: 'p1' } };
const personTarget = { status: 'resolved' as const, target: { kind: 'person' as const, id: 'u1', personKind: 'user' as const } };
const conversationTarget = { status: 'resolved' as const, target: { kind: 'conversation' as const, id: 'conv1', lineage: { conversationId: 'conv1' } } };
const temporalNone = { status: 'not_applicable' as const };

function input(overrides: Partial<Parameters<AgentReadQueryPlanner['plan']>[0]> = {}) {
    return { semanticTurn: turn(), targetResolution: commitmentTarget, temporal: temporalNone, authorizedScope: { sourceTypes: ['commitment'] as const }, ...overrides } as Parameters<AgentReadQueryPlanner['plan']>[0];
}

describe('AgentReadQueryPlanner', () => {
    it.each([
        ['focused', 'focused_lookup'], ['collection', 'exhaustive_list'], ['count', 'count'],
    ] as const)('normalizes %s independently of result count', (queryShape, cardinality) => {
        const result = planner.plan(input({ semanticTurn: turn({ queryShape, targetShape: 'none', relationship: { kind: 'general_recall' } }), targetResolution: { status: 'not_applicable' } }));
        expect(result).toMatchObject({ status: 'planned', query: { cardinality, target: null } });
    });

    it('preserves canonical target and never promotes a semantic hint to identity', () => {
        const result = planner.plan(input());
        expect(result).toMatchObject({ status: 'planned', query: { target: { kind: 'commitment', id: 'c1' } } });
        expect(JSON.stringify(result)).not.toContain('not an id');
    });

    it('preserves exact lifecycle transition as an evidence requirement', () => {
        const result = planner.plan(input({ semanticTurn: turn({ relationship: { kind: 'lifecycle_transition', transition: 'cancelled' }, targetShape: 'commitment' }), targetResolution: commitmentTarget, authorizedScope: { sourceTypes: ['commitment', 'commitment_event'] } }));
        expect(result).toMatchObject({ status: 'planned', query: { relationship: { kind: 'lifecycle_transition', transition: 'cancelled' }, evidenceRequirement: { sourceTypes: ['commitment', 'commitment_event'] } } });
    });

    it('preserves proposal focus without claiming proposal facts', () => {
        const result = planner.plan(input({ semanticTurn: turn({ queryShape: 'collection', targetShape: 'none', relationship: { kind: 'proposal_focus', focus: 'waiting_for_others' } }), targetResolution: { status: 'not_applicable' }, authorizedScope: { sourceTypes: ['commitment_proposal'] } }));
        expect(result).toMatchObject({ status: 'planned', query: { target: null, relationship: { kind: 'proposal_focus', focus: 'waiting_for_others' } } });
    });

    it('supports collection queries for unsupported child target shapes only with required scope', () => {
        const result = planner.plan(input({ semanticTurn: turn({ queryShape: 'collection', targetShape: 'attachment', relationship: { kind: 'attachment_content' }, domain: 'messaging' }), targetResolution: { status: 'unsupported', targetShape: 'attachment', reason: 'no_public_authorized_read_resolver' }, authorizedScope: { conversationId: 'conv1', sourceTypes: ['attachment'] } }));
        expect(result).toMatchObject({ status: 'planned', query: { target: null, authorizedScope: { conversationId: 'conv1' } } });
    });

    it('returns clarification-required for ambiguous or zero-match target resolution', () => {
        for (const targetResolution of [{ status: 'zero_match', targetShape: 'person' }, { status: 'ambiguous', targetShape: 'person', candidates: [{ id: 'u1', label: 'One' }] }] as any[]) {
            expect(planner.plan(input({ semanticTurn: turn({ targetShape: 'person' }), targetResolution }))).toMatchObject({ status: 'clarification_required', reason: 'target_resolution' });
        }
    });

    it('does not turn temporal ambiguity or nonexistent local time into a query', () => {
        for (const temporal of [{ status: 'ambiguous', reason: 'dst_fold', civil: {} }, { status: 'nonexistent_local_time', civil: {}, timezone: 'America/Santiago' }] as any[]) {
            expect(planner.plan(input({ semanticTurn: turn({ temporalRole: 'filter_range' }), temporal }))).toMatchObject({ status: 'clarification_required', reason: 'temporal_context' });
        }
    });

    it('rejects invalid relationship/target combinations and missing scope', () => {
        expect(planner.plan(input({ semanticTurn: turn({ targetShape: 'person', relationship: { kind: 'lifecycle_transition', transition: 'resolved' } }), targetResolution: personTarget }))).toMatchObject({ status: 'invalid' });
        expect(planner.plan(input({ authorizedScope: {} }))).toMatchObject({ status: 'unsupported', reason: 'authorized_read_scope_missing' });
    });

    it('supports person and authorized conversation targets without resolving them again', () => {
        const personResult = planner.plan(input({ semanticTurn: turn({ targetShape: 'person', relationship: { kind: 'person_relationship' } }), targetResolution: personTarget, authorizedScope: { personId: 'u1', sourceTypes: ['person'] } }));
        expect(personResult).toMatchObject({ status: 'planned', query: { target: { id: 'u1' } } });
        const conversationResult = planner.plan(input({ semanticTurn: turn({ targetShape: 'conversation', relationship: { kind: 'message_relationship', relationship: 'conversation_context' }, domain: 'messaging' }), targetResolution: conversationTarget, authorizedScope: { conversationId: 'conv1', sourceTypes: ['message'] } }));
        expect(conversationResult).toMatchObject({ status: 'planned', query: { target: { id: 'conv1' } } });
    });

    it('composes a resolved Temporal Core value without reparsing it', () => {
        const temporal = { status: 'resolved' as const, value: { kind: 'civil_date' as const, year: 2026, month: 9, day: 20 } };
        expect(planner.plan(input({ semanticTurn: turn({ temporalRole: 'filter_range' }), temporal }))).toMatchObject({ status: 'planned', query: { temporal: { role: 'filter_range', value: temporal.value } } });
    });
});
