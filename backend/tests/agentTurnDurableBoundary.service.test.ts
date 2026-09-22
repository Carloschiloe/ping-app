import { describe, expect, it, vi } from 'vitest';
import type { AgentDialogueState } from '../src/types/agentDialogueState';
import type { AgentTurnAdmission } from '../src/types/agentTurnAdmission';
import type { AgentTurnResult } from '../src/types/agentTurn';
import type { AgentTurnAtomicApplication } from '../src/types/agentTurnCommit';
import { surfaceSupports } from '../src/types/agentInput';
import {
    durableDialogueScopeKey,
    isDurableGeneralAgentTurnEnabled,
    runDurableAgentTurn,
    type AgentTurnDurableBoundaryDeps,
} from '../src/services/agentTurnDurableBoundary.service';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const scope = conversationId;
const result: AgentTurnResult = { kind: 'unsupported', reason: 'test' };

function admission(overrides: Partial<AgentTurnAdmission> = {}): AgentTurnAdmission {
    return {
        turnId: 'turn-1',
        actorUserId,
        dialogueScopeKey: scope,
        clientTurnKey: 'client-turn-1',
        requestFingerprint: 'a'.repeat(64),
        turnSequence: 1,
        status: 'accepted',
        failureClass: null,
        resultRef: null,
        createdAt: '2026-09-21T12:00:00.000Z',
        updatedAt: '2026-09-21T12:00:00.000Z',
        completedAt: null,
        expiresAt: '2026-09-21T12:15:00.000Z',
        idempotentReplay: false,
        routingMode: 'legacy',
        ...overrides,
    };
}

function dialogueState(overrides: Partial<AgentDialogueState> = {}): AgentDialogueState {
    return {
        actorUserId,
        dialogueScopeKey: scope,
        lifecycle: 'collecting',
        openObjective: null,
        ambiguities: [],
        pendingClarification: null,
        corrections: {},
        referents: [],
        currentPlanDigestRef: null,
        currentAuthorizationIdRef: null,
        version: 3,
        lastTurnSequence: 1,
        createdAt: '2026-09-21T12:00:00.000Z',
        updatedAt: '2026-09-21T12:00:00.000Z',
        expiresAt: '2099-09-21T12:10:00.000Z',
        ...overrides,
    };
}

function checkpointFor(state: AgentDialogueState, version: number) {
    return {
        status: 'found' as const,
        expiresAt: state.expiresAt,
        snapshot: {
            lifecycle: state.lifecycle,
            activeDialogue: { kind: 'agent_dialogue_state_v1', state },
            suspendedDialogue: null,
            version,
            lastAppliedTurnId: 'previous-turn',
            lastAppliedTurnSequence: state.lastTurnSequence,
        },
    };
}

function application(replay: AgentTurnResult = result): AgentTurnAtomicApplication {
    return {
        checkpoint: {} as AgentTurnAtomicApplication['checkpoint'],
        replay: replay as AgentTurnAtomicApplication['replay'],
        replayed: false,
    };
}

function baseDependencies(overrides: Partial<AgentTurnDurableBoundaryDeps> = {}): AgentTurnDurableBoundaryDeps {
    const admitted = admission();
    return {
        admission: {
            admit: vi.fn(async () => admitted),
            claimForProcessing: vi.fn(async () => ({ kind: 'claimed' as const, admission: { ...admitted, status: 'processing' as const } })),
            complete: vi.fn(async (value) => ({ ...value, status: 'completed' as const })),
            fail: vi.fn(async (value) => ({ ...value, status: 'failed' as const })),
        },
        checkpoint: {
            loadDialogueCheckpoint: vi.fn(async () => ({ status: 'not_found' as const })),
        },
        commit: {
            applyTurn: vi.fn(async () => application()),
            reconcileApplication: vi.fn(async () => ({
                status: 'not_applied' as const,
                turnId: admitted.turnId,
                actorUserId,
                dialogueScopeKey: scope,
                turnSequence: admitted.turnSequence,
                admissionStatus: 'processing',
                failureClass: null,
                resultRef: null,
                lastAppliedTurnId: null,
                lastAppliedTurnSequence: 0,
            })),
        },
        runTurn: vi.fn(async () => result),
        ...overrides,
    };
}

const input = { actorUserId, input: 'hola', conversationId };

describe('general Agent Turn durable boundary', () => {
    it('uses one canonical scope contract across conversation and future surfaces', () => {
        expect(durableDialogueScopeKey({ actorUserId, input: 'hola', conversationId, channel: 'tablet' })).toBe(conversationId);
        expect(durableDialogueScopeKey({ actorUserId, input: 'hola', channel: 'tablet' })).toBe('agent:tablet');
        expect(durableDialogueScopeKey({ actorUserId, voiceInputToken: 'signed-voice-token' })).toBe('agent:mobile');
        expect(durableDialogueScopeKey({ actorUserId, input: 'hola', channel: 'unknown-future-surface' })).toBe('agent:mobile');
    });

    it('derives the tablet scope from a valid signed tablet voice token', async () => {
        const previousKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = 'test-only-voice-token-signing-key';
        const { issueVoiceInputToken } = await import('../src/services/agentInputEnvelope.service');
        const { createAgentSession, clearAgentSessionsForTests } = await import('../src/services/agentSession.service');
        const now = new Date('2026-09-21T12:00:00.000Z');
        clearAgentSessionsForTests();
        const session = createAgentSession({
            actorUserId,
            deviceSessionId: 'tablet-device-1',
            surface: 'tablet',
            signals: [],
            referents: [],
            now,
        });
        try {
            const { token } = issueVoiceInputToken({
                inputId: 'tablet-voice-input-1',
                actorUserId,
                surface: 'tablet',
                modality: 'voice',
                content: 'hola desde la tablet',
                audioRef: 'audio-1',
                transcriptRef: 'transcript-1',
                conversationId: null,
                agentSessionId: session.sessionId,
                deviceSessionId: 'tablet-device-1',
                locale: 'es-CL',
                timeZone: 'America/Santiago',
                capturedAt: now.toISOString(),
                explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
                provenance: { traceId: 'trace-1', transcriptStatus: 'final', provider: 'test', confidence: 0.9 },
            }, now);

            expect(durableDialogueScopeKey({ actorUserId, voiceInputToken: token }, now)).toBe('agent:tablet');
        } finally {
            clearAgentSessionsForTests();
            if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
            else process.env.ENCRYPTION_KEY = previousKey;
        }
    });

    it('derives the conversation scope from a valid voice token, matching Core', async () => {
        const previousKey = process.env.ENCRYPTION_KEY;
        process.env.ENCRYPTION_KEY = 'test-only-voice-token-signing-key';
        const { issueVoiceInputToken } = await import('../src/services/agentInputEnvelope.service');
        const { createAgentSession, clearAgentSessionsForTests } = await import('../src/services/agentSession.service');
        const now = new Date('2026-09-21T12:00:00.000Z');
        clearAgentSessionsForTests();
        const session = createAgentSession({
            actorUserId,
            deviceSessionId: 'mobile-device-1',
            surface: 'mobile_voice',
            signals: [],
            referents: [],
            now,
        });
        try {
            const { token } = issueVoiceInputToken({
                inputId: 'mobile-voice-input-1',
                actorUserId,
                surface: 'mobile_voice',
                modality: 'voice',
                content: 'recuérdame verificar el audio bueno mañana a las doce',
                audioRef: 'audio-2',
                transcriptRef: 'transcript-2',
                conversationId,
                agentSessionId: session.sessionId,
                deviceSessionId: 'mobile-device-1',
                locale: 'es-CL',
                timeZone: 'America/Santiago',
                capturedAt: now.toISOString(),
                explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
                provenance: { traceId: 'trace-2', transcriptStatus: 'final', provider: 'test', confidence: 0.9 },
            }, now);

            expect(durableDialogueScopeKey({ actorUserId, voiceInputToken: token }, now)).toBe(conversationId);
        } finally {
            clearAgentSessionsForTests();
            if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
            else process.env.ENCRYPTION_KEY = previousKey;
        }
    });

    it('keeps surface capabilities server-owned and does not grant authorization', () => {
        expect(surfaceSupports('mobile_text', 'text_input')).toBe(true);
        expect(surfaceSupports('mobile_text', 'voice_input')).toBe(false);
        expect(surfaceSupports('tablet', 'voice_input')).toBe(true);
        expect(surfaceSupports('future', 'voice_input')).toBe(false);
        expect(surfaceSupports('tablet', 'conversation_scope')).toBe(true);
    });

    it('fails closed when the durable feature gate is enabled without an idempotency key', async () => {
        const previousEnvironment = process.env.PING_ENVIRONMENT;
        const previousFlag = process.env.PING_ENABLE_DURABLE_AGENT_TURN;
        const previousDatabaseUrl = process.env.PING_M7_DATABASE_URL;
        process.env.PING_ENVIRONMENT = 'staging';
        process.env.PING_ENABLE_DURABLE_AGENT_TURN = 'true';
        process.env.PING_M7_DATABASE_URL = 'postgresql://local.invalid/ping';
        expect(isDurableGeneralAgentTurnEnabled()).toBe(true);
        delete process.env.PING_M7_DATABASE_URL;
        expect(isDurableGeneralAgentTurnEnabled()).toBe(false);
        if (previousEnvironment === undefined) delete process.env.PING_ENVIRONMENT;
        else process.env.PING_ENVIRONMENT = previousEnvironment;
        if (previousFlag === undefined) delete process.env.PING_ENABLE_DURABLE_AGENT_TURN;
        else process.env.PING_ENABLE_DURABLE_AGENT_TURN = previousFlag;
        if (previousDatabaseUrl === undefined) delete process.env.PING_M7_DATABASE_URL;
        else process.env.PING_M7_DATABASE_URL = previousDatabaseUrl;
    });

    it('normalizes the idempotency key before admission and rejects blank keys', async () => {
        const deps = baseDependencies();
        await runDurableAgentTurn(input, {}, '  stable-key  ', deps);
        expect(deps.admission.admit).toHaveBeenCalledWith(expect.objectContaining({ clientTurnKey: 'stable-key' }));

        const invalidDeps = baseDependencies();
        await expect(runDurableAgentTurn(input, {}, '   ', invalidDeps)).rejects.toMatchObject({ statusCode: 400 });
        expect(invalidDeps.admission.admit).not.toHaveBeenCalled();
    });

    it('returns a completed replay without invoking the Core again', async () => {
        const replayAdmission = admission({
            status: 'completed',
            resultRef: result as unknown as Record<string, unknown>,
            completedAt: '2026-09-21T12:00:01.000Z',
            idempotentReplay: true,
        });
        const runTurn = vi.fn();
        const deps = baseDependencies({
            admission: {
                admit: vi.fn(async () => replayAdmission),
                claimForProcessing: vi.fn(async () => ({ kind: 'completed_replay' as const, admission: replayAdmission })),
                complete: vi.fn(),
                fail: vi.fn(),
            },
            runTurn,
        });

        const output = await runDurableAgentTurn(input, {}, 'client-turn-1', deps);

        expect(output).toEqual(result);
        expect(runTurn).not.toHaveBeenCalled();
        expect(deps.checkpoint.loadDialogueCheckpoint).not.toHaveBeenCalled();
    });

    it('restores the dialogue checkpoint and atomically persists the turn result', async () => {
        const restored = dialogueState();
        const deps = baseDependencies();
        vi.mocked(deps.checkpoint.loadDialogueCheckpoint).mockResolvedValue(checkpointFor(restored, 7));
        deps.runTurn = vi.fn(async (_input, options) => {
            expect(options.dialogueService?.getSnapshot(actorUserId, scope)).toEqual(restored);
            return result;
        });

        const output = await runDurableAgentTurn(input, {}, 'client-turn-1', deps);

        expect(output).toEqual(result);
        expect(deps.commit.applyTurn).toHaveBeenCalledWith(expect.objectContaining({
            expectedDialogueVersion: 7,
            turnSequence: 1,
            activeDialogue: expect.objectContaining({ kind: 'agent_dialogue_state_v1' }),
        }));
        expect(deps.admission.complete).not.toHaveBeenCalled();
    });

    it('marks an uncertain application retryable after reconciliation says it was not applied', async () => {
        const deps = baseDependencies();
        const restored = dialogueState();
        vi.mocked(deps.checkpoint.loadDialogueCheckpoint).mockResolvedValue(checkpointFor(restored, 7));
        vi.mocked(deps.commit.applyTurn).mockRejectedValue(new Error('temporary database failure'));

        await expect(runDurableAgentTurn(input, {}, 'client-turn-1', deps)).rejects.toThrow('temporary database failure');
        expect(deps.commit.reconcileApplication).toHaveBeenCalledTimes(1);
        expect(deps.admission.fail).toHaveBeenCalledTimes(1);
        expect(deps.admission.fail).toHaveBeenCalledWith(expect.objectContaining({ turnId: 'turn-1' }), 'retryable');
    });
});
