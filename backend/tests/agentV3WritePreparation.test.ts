import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareV3Write } from '../src/services/agentV3WritePreparation.service';

const runAgentPlanningMock = vi.hoisted(() => vi.fn());
vi.mock('../src/services/agentPlanOrchestrator.service', () => ({ runAgentPlanning: runAgentPlanningMock }));

const baseTurn = {
    version: 3 as const, kind: 'write_request' as const, domain: 'commitment' as const,
    objectiveCompleteness: 'complete' as const, lifecycleCommand: 'none' as const,
    lifecycleTarget: 'unspecified' as const, lifecycleEvidence: 'unknown' as const,
    pendingSlotAnswer: 'not_a_slot_answer' as const, continuationLike: 'no' as const,
    candidateSlotType: null, independentObjective: 'yes' as const,
    objectiveType: 'create_personal_commitment', entityHints: [],
    slots: { title: 'Revisar contrato' }, ambiguityFields: [], confidence: 0.98,
    source: 'deterministic' as const,
};

describe('prepareV3Write', () => {
    beforeEach(() => runAgentPlanningMock.mockReset());

    it('passes one already-normalized objective to the existing planner boundary', async () => {
        runAgentPlanningMock.mockResolvedValue({ status: 'ready_for_authorization', steps: [], canExecute: false });
        const temporal = { status: 'resolved' as const, value: { kind: 'civil_datetime' as const, year: 2026, month: 9, day: 20, hour: 9, minute: 0, second: 0, timezone: 'America/Santiago', instant: '2026-09-20T12:00:00.000Z' } };
        const result = await prepareV3Write({ actorUserId: 'actor-1', semanticTurn: baseTurn, disposition: 'ordinary_write', temporal });
        expect(result.status).toBe('prepared');
        expect(runAgentPlanningMock).toHaveBeenCalledTimes(1);
        const [plannerInput, options] = runAgentPlanningMock.mock.calls[0];
        expect(options.resolvedObjective.sourceUtterance).toBe('');
        expect(plannerInput.input).toBe('');
        expect(plannerInput.canonicalFacts).toMatchObject({ canonicalOnly: true, temporal });
    });

    it('does not guess incomplete canonical facts', async () => {
        const result = await prepareV3Write({ actorUserId: 'actor-1', semanticTurn: baseTurn, disposition: 'ordinary_write', temporal: { status: 'insufficient', reason: 'timezone_required' } });
        expect(result).toMatchObject({ status: 'insufficient', reason: 'temporal', clarification: { field: 'temporal', condition: 'missing', temporal: { status: 'insufficient', reason: 'timezone_required' } } });
        expect(runAgentPlanningMock).not.toHaveBeenCalled();
    });

    it('keeps communication outside this boundary until typed content provenance exists', async () => {
        const result = await prepareV3Write({ actorUserId: 'actor-1', semanticTurn: { ...baseTurn, objectiveType: 'communicate_message' }, disposition: 'ordinary_write', temporal: { status: 'not_applicable' } });
        expect(result).toEqual({ status: 'unsupported', reason: 'communication_content' });
        expect(runAgentPlanningMock).not.toHaveBeenCalled();
    });

    it('maps planner missing information to structured clarification without carrying question prose', async () => {
        runAgentPlanningMock.mockResolvedValue({ status: 'needs_clarification', unresolvedInputs: [{ field: 'title', question: 'Texto de presentación no persistible.' }] });
        const result = await prepareV3Write({ actorUserId: 'actor-1', semanticTurn: { ...baseTurn, slots: {} }, disposition: 'ordinary_write', temporal: { status: 'resolved', value: { kind: 'civil_date', year: 2026, month: 9, day: 20 } } });
        expect(result).toMatchObject({ status: 'insufficient', reason: 'title', clarification: { field: 'title', condition: 'missing', options: [] } });
        expect(JSON.stringify(result)).not.toContain('Texto de presentación no persistible.');
    });
});
