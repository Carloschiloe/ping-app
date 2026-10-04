import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTurnPlan, AgentTurnResult } from '../src/types/agentTurn';

const { durableMock, authorizeMock, executeMock, durableEnabledMock } = vi.hoisted(() => ({
    durableMock: vi.fn(),
    authorizeMock: vi.fn(),
    executeMock: vi.fn(),
    durableEnabledMock: vi.fn(() => true),
}));

vi.mock('../src/services/agentTurnDurableBoundary.service', () => ({ runDurableAgentTurn: durableMock }));
vi.mock('../src/services/agentAuthorization.service', () => ({ authorizePlan: authorizeMock }));
vi.mock('../src/services/agentExecution.service', () => ({ executeAuthorization: executeMock }));
vi.mock('../src/services/agentDurableConfig.service', () => ({
    isCanonicalDurableAgentRuntimeEnabled: durableEnabledMock,
}));
vi.mock('../src/services/agentTurn.service', () => ({ runAgentTurn: vi.fn() }));

import { runCanonicalAgentTurn } from '../src/services/agentConversationRuntime.service';

const plan: AgentTurnPlan = {
    kind: 'plan',
    confirmationState: 'received',
    plan: {
        planId: 'plan-1', status: 'ready_for_authorization', objectiveType: 'create_commitment',
        humanReadableSummary: 'crear compromiso', steps: [{
            stepId: 'step-1', toolId: 'create_commitment', operation: 'create', dependsOn: [],
            expectedEffect: 'create', sideEffectClass: 'write', riskLevel: 'low',
            confirmationRequirement: 'explicit', conditionDescription: 'now',
        }], canExecute: true, planDigest: 'a'.repeat(64),
    },
    presentation: {
        headline: 'Crear', summary: 'Crear', effectDescription: 'Crear', confirmationLabel: 'Crear',
        cancelLabel: 'Cancelar', stepPresentations: [], requiresExplicitConfirmation: true,
        expiresAt: '2099-01-01T00:00:00.000Z', planId: 'plan-1', planDigest: 'a'.repeat(64),
        objectiveType: 'create_commitment',
    },
};

describe('canonical conversation runtime', () => {
    const dialogueService = {
        getSnapshot: vi.fn(() => ({ lastTurnSequence: 7 })),
        markResolved: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        durableEnabledMock.mockReturnValue(true);
        durableMock.mockImplementation(async (_input, _options, _idempotencyKey, _dependencies, postProcess) => {
            if (!postProcess) return plan;
            return postProcess({
                result: plan,
                dialogueService: dialogueService as any,
                actorUserId: 'actor-1',
                dialogueScopeKey: 'scope-1',
                turnId: 'turn-1',
                turnSequence: 1,
            });
        });
        authorizeMock.mockResolvedValue({ ok: true, authorization: { id: 'auth-1' } });
        executeMock.mockResolvedValue({
            status: 'done', humanReadableSummary: 'Compromiso creado y verificado.',
            executedSteps: [{ status: 'succeeded', verified: true }],
        });
    });

    it('owns confirmation, authorization and execution on the server runtime', async () => {
        const result = await runCanonicalAgentTurn({
            actorUserId: 'actor-1', input: 'sí, dale', channel: 'voice',
        }, {}, 'turn-1');

        expect(authorizeMock).toHaveBeenCalledWith(expect.objectContaining({
            planDigest: 'a'.repeat(64), requestedStepIds: ['step-1'], confirm: true,
        }));
        expect(executeMock).toHaveBeenCalledWith({
            authorizationId: 'auth-1', actorUserId: 'actor-1', traceId: undefined,
        });
        expect(result).toMatchObject({
            kind: 'response', response: { status: 'answered', answer: 'Compromiso creado y verificado.' },
        });
        expect(dialogueService.markResolved).toHaveBeenCalledWith(expect.objectContaining({
            actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', turnSequence: 8,
        }));
    });

    it('does not authorize a proposal that still requires confirmation', async () => {
        durableMock.mockResolvedValue({ ...plan, confirmationState: 'required' });
        const result = await runCanonicalAgentTurn({
            actorUserId: 'actor-1', input: 'agenda algo', channel: 'voice',
        }, {}, 'turn-2');

        expect(result).toMatchObject({ kind: 'plan', confirmationState: 'required' });
        expect(authorizeMock).not.toHaveBeenCalled();
        expect(executeMock).not.toHaveBeenCalled();
    });

    it('never presents success when execution is not verified', async () => {
        executeMock.mockResolvedValue({
            status: 'failed', humanReadableSummary: 'No se pudo completar.',
            executedSteps: [{ status: 'failed_terminal', verified: false }],
        });
        const result = await runCanonicalAgentTurn({
            actorUserId: 'actor-1', input: 'sí', channel: 'voice',
        }, {}, 'turn-3');

        expect(result).toMatchObject({ kind: 'response', response: { status: 'capability_gap' } });
        expect((result as Extract<AgentTurnResult, { kind: 'response' }>).response.answer).toContain('No se pudo');
    });
});
