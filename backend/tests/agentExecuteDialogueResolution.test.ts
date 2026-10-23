import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock, historyEnabledMock, persistHistoryMock } = vi.hoisted(() => ({
    executeMock: vi.fn(),
    historyEnabledMock: vi.fn(() => false),
    persistHistoryMock: vi.fn(),
}));

vi.mock('../src/services/agentExecution.service', () => ({
    executeAuthorization: executeMock,
}));
vi.mock('../src/services/agentConversationTurn.service', () => ({
    isAgentConversationTurnPersistenceEnabled: historyEnabledMock,
    persistAgentExecutionConversationEvent: persistHistoryMock,
}));

import { execute } from '../src/controllers/agentExecute.controller';
import {
    AgentDialogueStateService,
    buildDialogueScopeKey,
    clearAgentDialogueStateForTests,
} from '../src/services/agentDialogueState.service';

const ACTOR = 'actor-execute-test';
const AUTHORIZATION_ID = '00000000-0000-0000-0000-000000000001';

function request() {
    return {
        user: { id: ACTOR },
        body: { authorizationId: AUTHORIZATION_ID },
    } as any;
}

function response() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as any;
}

function openPendingMobilePlan(): void {
    const service = new AgentDialogueStateService();
    const dialogueScopeKey = buildDialogueScopeKey({ surface: 'mobile_text' });
    service.openObjective({
        actorUserId: ACTOR,
        dialogueScopeKey,
        objective: {
            objectiveType: 'create_commitment',
            targetEntities: { entityHints: [], personHints: [] },
            slots: { title: 'Comprar materiales' },
            missingSlots: [],
            ambiguity: null,
            sourceUtterance: 'agenda comprar materiales mañana',
        } as any,
        turnId: 'turn-1',
        turnSequence: 1,
    });
    service.markReadyForAuthorization({
        actorUserId: ACTOR,
        dialogueScopeKey,
        planDigest: 'a'.repeat(64),
        turnId: 'turn-1',
        turnSequence: 2,
    });
    service.markAuthorized({
        actorUserId: ACTOR,
        dialogueScopeKey,
        authorizationId: AUTHORIZATION_ID,
        turnId: 'turn-1',
        turnSequence: 2,
    });
}

describe('POST /agent/execute dialogue cleanup', () => {
    beforeEach(() => {
        clearAgentDialogueStateForTests();
        vi.clearAllMocks();
        executeMock.mockResolvedValue({
            status: 'done',
            executedSteps: [{ status: 'succeeded', verified: true }],
            humanReadableSummary: 'Compromiso creado y verificado.',
        });
    });

    it('resolves the pending mobile objective after a verified execution', async () => {
        openPendingMobilePlan();
        const res = response();

        await execute(request(), res);

        const scope = buildDialogueScopeKey({ surface: 'mobile_text' });
        expect(new AgentDialogueStateService().getSnapshot(ACTOR, scope)).toMatchObject({
            lifecycle: 'resolved',
            currentPlanDigestRef: null,
            currentAuthorizationIdRef: null,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('does not resolve the dialogue when execution is not verified', async () => {
        executeMock.mockResolvedValue({
            status: 'failed',
            executedSteps: [{ status: 'failed_terminal', verified: false }],
            humanReadableSummary: 'No se pudo completar.',
        });
        openPendingMobilePlan();

        await execute(request(), response());

        const scope = buildDialogueScopeKey({ surface: 'mobile_text' });
        expect(new AgentDialogueStateService().getSnapshot(ACTOR, scope)).toMatchObject({
            lifecycle: 'plan_pending_authorization',
        });
    });
});
