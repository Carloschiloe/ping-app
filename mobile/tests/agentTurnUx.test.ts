import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('expo-localization', () => ({
    getLocales: vi.fn(() => [{ languageTag: 'es-CL', languageCode: 'es', regionCode: 'CL' }]),
}));
vi.mock('expo-file-system', () => ({ File: class MockFile { constructor(public uri: string) {} } }));
vi.mock('../src/api/client', () => {
    class MockApiError extends Error {
        constructor(
            message: string,
            public status: number | null,
            public resultUnknown: boolean,
            public code?: string,
        ) { super(message); }
    }
    return {
        apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
        ApiError: MockApiError,
        API_URL: 'http://localhost:3000/api',
        getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })),
    };
});

import type {
    AgentAuthorizationResult, AgentExecutionResult, AgentTurnInput, AgentTurnPlan, AgentTurnResult,
} from '../src/api/query-modules/agent';
import { buildAgentAuthorizationRequestBody, buildAgentTurnRequestBody, parseAgentTurnResult } from '../src/api/query-modules/agent';
import {
    authorizeThenExecuteAgentPlan, canConfirmAgentPlan, initialAgentTurnUiState,
    reduceAgentTurnUi, type AgentTurnUiState, type PendingAgentPlan,
} from '../src/utils/agentTurnState';

const presentation = {
    headline: 'Enviaré un mensaje a Alejandra',
    summary: 'Enviaré el mensaje mostrado.',
    effectDescription: 'Se enviará exactamente el contenido mostrado.',
    targetLabel: 'Alejandra',
    confirmationLabel: 'Enviar',
    cancelLabel: 'Cancelar',
    stepPresentations: [{
        stepId: 'step-0', toolId: 'send_message', headline: 'Enviar mensaje a Alejandra',
        effectDescription: 'Se enviará: “Llegaré tarde.”', targetLabel: 'Alejandra',
        contentPreview: 'Llegaré tarde.', confirmationLabel: 'Enviar', cancelLabel: 'Cancelar',
        requiresExplicitConfirmation: true, phase: 'immediate' as const,
    }],
    requiresExplicitConfirmation: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    planId: 'plan-1', planDigest: 'a'.repeat(64), objectiveType: 'communicate_message',
};

const turnPlan: AgentTurnPlan = {
    kind: 'plan',
    plan: {
        planId: 'plan-1', status: 'ready_for_authorization', objectiveType: 'communicate_message',
        humanReadableSummary: 'Enviar mensaje.', canExecute: true, planDigest: 'a'.repeat(64),
        steps: [{
            stepId: 'step-0', toolId: 'send_message', operation: 'Enviar mensaje a Alejandra', dependsOn: [],
            expectedEffect: 'Se enviará el mensaje.', sideEffectClass: 'state_change', riskLevel: 'medium',
            confirmationRequirement: 'explicit', conditionDescription: 'Sin precondiciones.',
        }],
    },
    presentation,
};

const source: AgentTurnInput = { input: 'Dile a Alejandra que llegaré tarde.', conversationId: 'conv-1' };
const pending: PendingAgentPlan = { turn: turnPlan, source, sourceText: source.input! };

function turnResultState(result: AgentTurnResult): AgentTurnUiState {
    return reduceAgentTurnUi(
        reduceAgentTurnUi(initialAgentTurnUiState, { type: 'SUBMIT', source, sourceText: source.input! }),
        { type: 'TURN_RESULT', result, source, sourceText: source.input! },
    );
}

function execution(status: AgentExecutionResult['status']): AgentExecutionResult {
    return {
        authorizationId: 'auth-1', status, executedSteps: [], failedSteps: [], waitingSteps: [],
        createdEntityRefs: [], updatedEntityRefs: [], messagesSent: 0,
        requiresFurtherAuthorization: status === 'waiting', humanReadableSummary: status,
    };
}

describe('M-6 mobile state machine', () => {
    it('A) response state', () => {
        const state = turnResultState({ kind: 'response', response: { status: 'answered', answer: 'Tienes uno.', citations: [] } });
        expect(state.phase).toBe('response');
    });

    it('B) plan state preserves exact immutable identity/source', () => {
        const state = turnResultState(turnPlan);
        expect(state.phase).toBe('plan_ready');
        expect(state.pendingPlan?.turn.plan.planDigest).toBe('a'.repeat(64));
        expect(state.pendingPlan?.source).toEqual(source);
        expect(canConfirmAgentPlan(state)).toBe(true);
    });

    it('C) clarification and D) unsupported are first-class non-crash states', () => {
        expect(turnResultState({ kind: 'clarification', questions: [{ field: 'target', question: '¿Cuál Entrenar?' }] }).phase).toBe('clarification');
        expect(turnResultState({ kind: 'unsupported', reason: 'Aún no puedo hacer eso.' }).phase).toBe('unsupported');
    });

    it('E/F) authorize always precedes execute; failed authorize means zero execute calls', async () => {
        const order: string[] = [];
        const authorization: AgentAuthorizationResult = {
            authorizationId: 'auth-1', status: 'authorized', expiresAt: new Date(Date.now() + 60_000).toISOString(),
            authorizedStepIds: ['step-0'], confirmationLevel: 'explicit',
        };
        await authorizeThenExecuteAgentPlan(pending, {
            authorize: async () => { order.push('authorize'); return authorization; },
            execute: async () => { order.push('execute'); return execution('done'); },
        });
        expect(order).toEqual(['authorize', 'execute']);

        const executeSpy = vi.fn(async () => execution('done'));
        await expect(authorizeThenExecuteAgentPlan(pending, {
            authorize: async () => { throw new Error('denied'); }, execute: executeSpy,
        })).rejects.toThrow('denied');
        expect(executeSpy).not.toHaveBeenCalled();
    });

    it('G) repeated CONFIRM events cannot advance twice', () => {
        const ready = turnResultState(turnPlan);
        const first = reduceAgentTurnUi(ready, { type: 'CONFIRM' });
        const second = reduceAgentTurnUi(first, { type: 'CONFIRM' });
        expect(first.phase).toBe('authorizing');
        expect(second).toBe(first);
    });

    it('H/O) cancel or source edit invalidates the pending plan', () => {
        const ready = turnResultState(turnPlan);
        expect(reduceAgentTurnUi(ready, { type: 'CANCEL_PLAN' }).pendingPlan).toBeNull();
        expect(reduceAgentTurnUi(ready, { type: 'SOURCE_EDITED' }).pendingPlan).toBeNull();
    });

    it.each(['done', 'partially_done', 'waiting', 'blocked', 'needs_reauthorization', 'failed'] as const)(
        'execution result preserves canonical %s state', (status) => {
            let state = reduceAgentTurnUi(turnResultState(turnPlan), { type: 'CONFIRM' });
            state = reduceAgentTurnUi(state, { type: 'AUTHORIZED', authorization: {
                authorizationId: 'auth-1', status: 'authorized', expiresAt: 'future', authorizedStepIds: ['step-0'], confirmationLevel: 'explicit',
            } });
            state = reduceAgentTurnUi(state, { type: 'EXECUTION_RESULT', execution: execution(status) });
            expect(state.phase).toBe(status);
        },
    );
});

describe('M-6 mobile API and presentation boundary', () => {
    it('text and final voice transcript use the same /agent/turn request contract', () => {
        expect(buildAgentTurnRequestBody({ input: ' hola ' }).input).toBe('hola');
        expect(buildAgentTurnRequestBody({ voiceInputToken: 'signed-token' })).toEqual({ voiceInputToken: 'signed-token' });
    });

    it('authorization echoes only the signed source, frozen digest, step IDs and explicit confirmation', () => {
        const body = buildAgentAuthorizationRequestBody(source, turnPlan);
        expect(body).toMatchObject({ input: source.input, planDigest: 'a'.repeat(64), stepIds: ['step-0'], confirm: true });
        expect(body).not.toHaveProperty('toolId');
        expect(body).not.toHaveProperty('arguments');
        expect(body).not.toHaveProperty('actorUserId');
    });

    it('rejects a plan whose presentation does not bind the same plan/digest', () => {
        expect(() => parseAgentTurnResult({ ...turnPlan, presentation: { ...presentation, planDigest: 'b'.repeat(64) } })).toThrow('invalid_agent_turn_shape');
    });

    const screen = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf8');
    const planCard = fs.readFileSync(path.join(__dirname, '../src/components/agent/AgentPlanCard.tsx'), 'utf8');

    it('P) Agent Preview submits both text and voice through useAgentTurn, never useAgentRespond', () => {
        expect(screen).toContain('useAgentTurn');
        expect(screen).not.toContain('useAgentRespond');
        expect(screen).toContain('voiceInputToken: matchingVoiceDraft.token');
    });

    it('Q/R) PlanCard renders Core presentation directly and never derives confirmation copy from toolId', () => {
        expect(planCard).toContain('presentation.confirmationLabel');
        expect(planCard).toContain('presentation.stepPresentations.map');
        expect(planCard).not.toMatch(/switch\s*\([^)]*toolId/);
        expect(planCard).not.toMatch(/\.toolId/);
    });

    it('conditional and multi-step meaning use explicit Core fields in a vertical card', () => {
        expect(planCard).toContain("step.phase === 'conditional'");
        expect(planCard).toContain('step.conditionLabel');
        expect(planCard).toContain("flexDirection: 'column-reverse'");
        expect(planCard).toContain('minHeight: 48');
    });
});

